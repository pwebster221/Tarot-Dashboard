import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { GoogleGenAI } from "@google/genai";
import multer from "multer";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const uploadDir = path.join(process.cwd(), 'public', 'cards');
if (!fs.existsSync(uploadDir)) {
  try {
    fs.mkdirSync(uploadDir, { recursive: true });
  } catch (err) {
    console.warn("Could not create public/cards directory. If this is a read-only environment, file uploads may fail.", err);
  }
}

// Set up Map to keep name mapping logic
function normalizeCardName(name: string) {
  let normalized = name.toLowerCase();
  normalized = normalized.replace(/^\d+\s*-\s*/, '');
  if (normalized.startsWith('the ')) {
    normalized = normalized.substring(4);
  }
  return normalized.replace(/ /g, '_');
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir)
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    const baseName = path.basename(file.originalname, ext);
    const normalized = normalizeCardName(baseName);
    cb(null, normalized + ext.toLowerCase());
  }
});

const upload = multer({ storage: storage });

async function startServer() {
  const app = express();
  const PORT = 3000;

  // JSON middleware
  app.use(express.json());

  // API routes
  app.get("/api/readings", async (req, res) => {
    try {
      const apiUrl = `https://readings.dubtown-server.us/readings?${new URLSearchParams(req.query as any).toString()}`;
      console.log(`[Proxy] Fetching: ${apiUrl}`);
      
      const apiKey = process.env.DUBTOWN_API_KEY || "991350812581ca5d21a55873de5585cccf0f7dce7e6a71858a1f83a5ed4a7c33";
      if (!process.env.DUBTOWN_API_KEY) {
        console.warn("[Proxy] DUBTOWN_API_KEY environment variable is not set. Using fallback key.");
      }

      const response = await fetch(apiUrl, {
        headers: {
          'Authorization': `Bearer ${apiKey}`
        }
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[Proxy] External API error (${response.status}): ${errorText}`);
        return res.status(response.status).json({ error: "External API error", detail: errorText });
      }

      const data = await response.json();
      const count = data.items ? data.items.length : (Array.isArray(data) ? data.length : 'unknown');
      console.log(`[Proxy] Successfully fetched ${count} items from /readings`);
      res.json(data);
    } catch (error) {
      console.error("[Proxy] Critical error fetching readings:", error);
      res.status(500).json({ error: "Internal server error during proxy request" });
    }
  });

  app.get("/api/readings/:id", async (req, res) => {
    try {
      const apiUrl = `https://readings.dubtown-server.us/readings/${req.params.id}`;
      console.log(`[Proxy] Fetching detail: ${apiUrl}`);
      
      const apiKey = process.env.DUBTOWN_API_KEY || "991350812581ca5d21a55873de5585cccf0f7dce7e6a71858a1f83a5ed4a7c33";
      const response = await fetch(apiUrl, {
        headers: {
          'Authorization': `Bearer ${apiKey}`
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[Proxy] External API error (${response.status}): ${errorText}`);
        return res.status(response.status).json({ error: "External API error", detail: errorText });
      }

      const data = await response.json();
      res.json(data);
    } catch (error) {
      console.error("[Proxy] Critical error fetching reading detail:", error);
      res.status(500).json({ error: "Internal server error during proxy request" });
    }
  });

  // Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.post("/api/upload-cards", upload.array('cards', 100), (req, res) => {
    try {
      if (!req.files || (req.files as Express.Multer.File[]).length === 0) {
        return res.status(400).json({ error: "No files uploaded." });
      }
      res.json({ success: true, count: (req.files as Express.Multer.File[]).length, message: "Cards uploaded and normalized successfully." });
    } catch(err: any) {
      console.error("Upload error", err);
      res.status(500).json({ error: "Upload failed." });
    }
  });

  // AI Generation endpoints
  const getAI = () => {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      console.warn("GEMINI_API_KEY is not set. AI functions will fail unless the environment provides an implicit key.");
    }
    // Correct constructor per skill
    return new GoogleGenAI({ apiKey: key || "undefined" });
  };

  app.post("/api/ai/deep-interpretation", async (req, res) => {
    try {
      const { card, reading, graphContext } = req.body;
      const ai = getAI();

      const prompt = `
Provide a "Deep Interpretation" for the following card drawn in a reading.

**Querent:** ${reading.querent}
**Question:** ${reading.question}
**Position in Spread:** ${card.position.name} - ${card.position.description}

**Card:** ${card.card.name} (Suit: ${card.card.suit || 'N/A'}, Arcana: ${card.card.arcana})
**Orientation:** ${card.isReversed ? 'Reversed' : 'Upright'}
**General Meaning:** ${card.card.generalMeaning}
**Specific Interpretation in Spread:** ${card.specificMeaning}

**Sacred Journey Graph Database Context:**
${graphContext}

Please synthesize a profound, nuanced, and unique interpretation. Keep it around 3-4 paragraphs.
`;
      // Correct method per skill
      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: prompt,
        config: {
          systemInstruction: "You are an enlightened Tarot Oracle guiding the querent with deep compassion, mystic wisdom, and deep knowledge of esoteric correspondences."
        }
      });
      res.json({ result: response.text });
    } catch (err: any) {
      console.error("[AI Server Error] Deep Interpretation:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/ai/oracle-insight", async (req, res) => {
    try {
      const { reading } = req.body;
      const ai = getAI();

      const cardsList = reading.drawnCards.map((c: any) => `- ${c.card.name} (${c.isReversed ? 'Reversed' : 'Upright'}) in position: ${c.position.name}`).join('\n');
      const prompt = `
Provide a transcendent "Oracle Insight" synthesis of the entire reading.

**Querent:** ${reading.querent}
**Question:** ${reading.question}
**Spread Type:** ${reading.type}

**Cards Drawn:**
${cardsList}

**Reader's Summary/Notes:**
${reading.summary}

Provide a coherent narrative. 2-3 paragraphs.
`;
      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: prompt,
        config: {
          systemInstruction: "You are an enlightened Tarot Oracle guiding the querent with deep compassion and mystic wisdom."
        }
      });
      res.json({ result: response.text });
    } catch (err: any) {
      console.error("[AI Server Error] Oracle Insight:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/ai/trend-insight", async (req, res) => {
    try {
      const { readings } = req.body;
      const ai = getAI();

      const readingsText = readings.map((r: any) => `Date: ${r.date}, Question: ${r.question}, Cards: ${r.drawnCards.map((c: any) => c.card.name).join(', ')}`).join('\n');
      const prompt = `Analyze these readings collectively and provide an Oracle insight about overarching themes or major trends.
Readings:
${readingsText}
`;
      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: prompt,
        config: {
          systemInstruction: "You are an enlightened Tarot Oracle capable of seeing deep synchronicity and overarching life trends."
        }
      });
      res.json({ result: response.text });
    } catch (err: any) {
      console.error("[AI Server Error] Trend Insight:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // Proxy endpoint for Graph DB / MCP Server for AI Context
  app.post("/api/graph/context", async (req, res) => {
    try {
      const { query, cardName } = req.body;
      const searchTarget = query || cardName;
      console.log(`[Graph Proxy] Requesting context for: ${searchTarget}`);
      
      const apiUrl = 'https://neo4j.dubtown-server.us/search';
      
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          query: `correspondences for ${searchTarget}`
        })
      });

      if (!response.ok) {
        throw new Error(`Graph server returned ${response.status}`);
      }

      const data = await response.json();
      
      // Structure the response to provide the text payload to AI
      let contextText = "No direct correspondences found.";
      if (data && data.search_results && data.search_results.length > 0) {
        contextText = data.search_results.map((res: any) => `${res.title}\n${res.body}`).join('\n\n');
      }

      res.json({
        result: {
          context: contextText
        }
      });
    } catch (error) {
      console.error("[Graph Proxy] Error fetching graph context:", error);
      res.json({
        result: {
          context: `Graph context for ${req.body.cardName || 'the card'} is currently unavailable. Proceed analyzing based on standard esoteric traditions.`
        }
      });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV === "development" || (!process.env.NODE_ENV && process.env.VITE_DEV_SERVER === "true")) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { 
        middlewareMode: true
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.use(express.static(path.join(process.cwd(), "public")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
