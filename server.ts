import "dotenv/config";
import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { createHash } from "node:crypto";
import multer from "multer";
import { callLiteLLM } from "./server/llm.ts";
import { getAstroContext, getCardContext } from "./server/astroContext.ts";
import { buildDeepPrompt, buildOraclePrompt, buildTrendPrompt } from "./server/prompts.ts";
import { runReasoningAgent } from "./server/agent.ts";
import { initReporeason, reporeasonReady, reporeasonTools, reporeasonRunner } from "./server/reporeason.ts";
// MCP scaffolding — kept dormant; used only when ENABLE_MCP=true (see startServer).
import { EventSource } from "eventsource";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

(global as any).EventSource = EventSource;

function clampStr(v: unknown, max = 2000): string {
  return typeof v === "string" ? v.slice(0, max) : (v == null ? "" : String(v).slice(0, max));
}

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
  const mcpClients = new Map<string, Client>(); // retained for ENABLE_MCP re-enable / shutdown; not read by interpretation
  const mcpTools = new Map<string, any>();

  const servers = [
    "https://kaimcp.dubtown-server.us/mcp",
    "https://mani.dubtown-server.us/mcp",
    "https://neo4j.dubtown-server.us/mcp/mcp"
  ];
  
  if (process.env.ENABLE_MCP === "true") {
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
  } else {
    console.log("[MCP] Dormant (ENABLE_MCP != 'true'); interpretation uses pre-fetched context.");
  }

  await initReporeason();

  const _cardInsightCache = new Map<string, string>();
  const CARD_CACHE_MAX = 500;
  const cacheInsight = (key: string, val: string) => {
    if (_cardInsightCache.size >= CARD_CACHE_MAX) {
      const oldest = _cardInsightCache.keys().next().value;
      if (oldest !== undefined) _cardInsightCache.delete(oldest);
    }
    _cardInsightCache.set(key, val);
  };

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
  app.post("/api/ai/deep-interpretation", async (req, res) => {
    try {
      const { card, reading, graphContext } = req.body;
      const cardName = card?.card?.name;
      const today = new Date().toISOString().slice(0, 10);
      // Client opt-in (dashboard "Extra reasoning" toggle). Absent → false, so
      // non-UI callers default to the cheap single-shot path.
      const wantReasoning = req.body.extraReasoning === true;

      if (reading) {
        reading.question = clampStr(reading.question, 1000);
        reading.querent = clampStr(reading.querent, 200);
        reading.summary = clampStr(reading.summary, 2000);
      }
      if (card) card.specificMeaning = clampStr(card.specificMeaning, 1000);
      const safeGraph = clampStr(graphContext, 4000);

      // Reasoning vs single-shot produce different results — key the cache on the mode too.
      const promptHash = createHash("sha256")
        .update(JSON.stringify({ card, reading, graphContext: safeGraph, wantReasoning }))
        .digest("hex").slice(0, 32);
      const cacheKey = `${promptHash}-${today}`;

      const astro = await getCardContext(cardName);
      const { system, user } = buildDeepPrompt(card, reading, safeGraph, astro);

      let result: string;
      if (_cardInsightCache.has(cacheKey)) {
        result = _cardInsightCache.get(cacheKey)!;
      } else if (wantReasoning && process.env.ENABLE_REPOREASON === "true" && reporeasonReady()) {
        const sys = system +
          "\n\nYou may call the reporeason tools to investigate this card's symbolic correspondences " +
          "against the querent's chart placements before answering. Prefer reason_identify_symbols and " +
          "reason_get_correspondence for a focused, single-card inquiry. Then give the interpretation.";
        try {
          const ALLOWED_TOOLS = new Set([
            "reason_identify_symbols", "reason_get_correspondence",
            "reason_get_elemental_balance", "reason_orient",
            "reason_traverse", "reason_synthesize",
          ]);
          const tools = reporeasonTools().filter((t) => ALLOWED_TOOLS.has(t.function.name));
          result = await runReasoningAgent(sys, user, tools, reporeasonRunner(), 4);
          cacheInsight(cacheKey, result);
        } catch (err) {
          console.error("[AI] reporeason agent failed; falling back to single-shot:", err);
          result = await callLiteLLM(system, user);
        }
      } else {
        result = await callLiteLLM(system, user);
      }
      res.json({ result });
    } catch (err: any) {
      console.error("[AI Server Error] Deep Interpretation:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/ai/oracle-insight", async (req, res) => {
    try {
      const { reading } = req.body;
      const astro = await getAstroContext();
      const { system, user } = buildOraclePrompt(reading, astro);
      const result = await callLiteLLM(system, user);
      res.json({ result });
    } catch (err: any) {
      console.error("[AI Server Error] Oracle Insight:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/ai/trend-insight", async (req, res) => {
    try {
      const { readings } = req.body;
      const astro = await getAstroContext();
      const { system, user } = buildTrendPrompt(readings, astro);
      const result = await callLiteLLM(system, user);
      res.json({ result });
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
