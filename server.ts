import "dotenv/config";
import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import Anthropic from "@anthropic-ai/sdk";
import multer from "multer";
import { EventSource } from "eventsource";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

(global as any).EventSource = EventSource;

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

  // Initialize MCP Servers
  const mcpClients = new Map<string, Client>();
  const mcpTools = new Map<string, any>();

  const servers = [
    "https://kaimcp.dubtown-server.us/mcp",
    "https://mani.dubtown-server.us/mcp",
    "https://neo4j.dubtown-server.us/mcp/mcp"
  ];
  
  for (const url of servers) {
    try {
      console.log(`[MCP] Connecting to ${url}...`);
      const transport = new StreamableHTTPClientTransport(new URL(url));
      const client = new Client(
        { name: "arcanum-dashboard", version: "1.0.0" },
        { capabilities: {} }
      );
      await client.connect(transport);
      const toolsResult = await client.listTools();
      mcpClients.set(url, client);
      for (const tool of toolsResult.tools) {
        mcpTools.set(tool.name, { client, tool });
      }
      console.log(`[MCP] Connected to ${url}. Loaded ${toolsResult.tools.length} tools.`);
    } catch (err: any) {
      console.error(`[MCP] Failed to connect to ${url}:`, err.message);
    }
  }

  // JSON middleware
  app.use(express.json());

  // API routes
  app.get("/api/readings", async (req, res) => {
    try {
      const apiUrl = `https://readings.dubtown-server.us/readings?${new URLSearchParams(req.query as any).toString()}`;
      console.log(`[Proxy] Fetching: ${apiUrl}`);
      
      const apiKey = process.env.DUBTOWN_API_KEY;
      if (!apiKey) {
        console.error("[Proxy] DUBTOWN_API_KEY is not set");
        return res.status(503).json({ error: "Readings backend not configured" });
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

      const apiKey = process.env.DUBTOWN_API_KEY;
      if (!apiKey) {
        console.error("[Proxy] DUBTOWN_API_KEY is not set");
        return res.status(503).json({ error: "Readings backend not configured" });
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
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error("ANTHROPIC_API_KEY is not set");
    return new Anthropic({ apiKey: key });
  };

  async function runAgent(prompt: string, systemPrompt: string) {
    const ai = getAI();
    const tools = Array.from(mcpTools.values()).map(t => ({
      name: t.tool.name,
      description: t.tool.description,
      input_schema: t.tool.inputSchema
    }));

    let messages: any[] = [{ role: "user", content: prompt }];
    let iterations = 0;
    
    while (iterations < 10) {
      iterations++;
      console.log(`[AI] Running iteration ${iterations}...`);
      
      const response = await ai.messages.create({
        model: "claude-opus-4-7",
        max_tokens: 2048,
        system: systemPrompt,
        messages,
        tools: tools.length > 0 ? tools : undefined
      });

      messages.push({
        role: "assistant",
        content: response.content
      });

      if (response.stop_reason === "tool_use") {
        const toolResults = [];
        for (const block of response.content) {
          if (block.type === "tool_use") {
            const toolName = block.name;
            const toolArgs = block.input;
            console.log(`[MCP] AI requested tool ${toolName}...`);
            try {
              const mcpTool = mcpTools.get(toolName);
              if (!mcpTool) throw new Error(`Unknown tool: ${toolName}`);
              
              const result = await mcpTool.client.callTool({
                name: toolName,
                arguments: toolArgs as any
              });
              
              const resultText = result.content.map((c: any) => c.text).join("\\n");
              
              toolResults.push({
                type: "tool_result",
                tool_use_id: block.id,
                content: resultText
              });
            } catch (err: any) {
              console.error(`[MCP] Error calling tool ${toolName}:`, err.message);
              toolResults.push({
                type: "tool_result",
                tool_use_id: block.id,
                content: `Error calling tool: ${err.message}`,
                is_error: true
              });
            }
          }
        }
        
        messages.push({
          role: "user",
          content: toolResults
        });
      } else {
        const textBlock = response.content.find((b: any) => b.type === "text");
        return textBlock ? (textBlock as any).text : "";
      }
    }
    throw new Error("Agent exceeded maximum iterations");
  }

  app.post("/api/ai/deep-interpretation", async (req, res) => {
    try {
      const { card, reading, graphContext } = req.body;

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
      const system = "You are an enlightened Tarot Oracle guiding the querent with deep compassion, mystic wisdom, and deep knowledge of esoteric correspondences. Leverage your available MCP tools (Esoteric Repository, Mani Protocol, Kairos Chart System) to enrich the interpretation with cognitive parameters, astrological transits, and esoteric nuances.";
      const responseText = await runAgent(prompt, system);
      res.json({ result: responseText });
    } catch (err: any) {
      console.error("[AI Server Error] Deep Interpretation:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/ai/oracle-insight", async (req, res) => {
    try {
      const { reading } = req.body;

      const cardsList = reading.drawnCards.map((c: any) => `- ${c.card.name} (${c.isReversed ? 'Reversed' : 'Upright'}) in position: ${c.position.name}`).join('\\n');
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
      const system = "You are an enlightened Tarot Oracle guiding the querent with deep compassion and mystic wisdom. You have access to MCP tools from the Esoteric Repository, Mani Protocol, and Kairos Chart System. Use them if they provide valuable esoteric context, transit alignments, or cognitive dimensions for this specific reading.";
      const responseText = await runAgent(prompt, system);
      res.json({ result: responseText });
    } catch (err: any) {
      console.error("[AI Server Error] Oracle Insight:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/ai/trend-insight", async (req, res) => {
    try {
      const { readings } = req.body;

      const readingsText = readings.map((r: any) => `Date: ${r.date}, Question: ${r.question}, Cards: ${r.drawnCards.map((c: any) => c.card.name).join(', ')}`).join('\\n');
      const prompt = `Analyze these readings collectively and provide an Oracle insight about overarching themes or major trends.
Readings:
${readingsText}
`;
      const system = "You are an enlightened Tarot Oracle capable of seeing deep synchronicity and overarching life trends. You can use your MCP tools to consult graph databases, astrology transits, or cognitive scoring for deeper pattern recognition.";
      const responseText = await runAgent(prompt, system);
      res.json({ result: responseText });
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
