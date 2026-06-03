// server/reporeason.ts — optional reporeason MCP connection (gated by ENABLE_REPOREASON).
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { EventSource } from "eventsource";
import { toOpenAITools, type ToolRunner } from "./agent.ts";

(global as any).EventSource = EventSource;

let _client: Client | null = null;
let _tools: any[] = [];

export async function initReporeason(): Promise<void> {
  if (process.env.ENABLE_REPOREASON !== "true") {
    console.log("[reporeason] disabled (ENABLE_REPOREASON != 'true').");
    return;
  }
  const url = process.env.REPOREASON_URL || "https://reporeason.dubtown-server.us/mcp";
  try {
    const transport = new StreamableHTTPClientTransport(new URL(url));
    const c = new Client({ name: "arcanum-dashboard", version: "1.0.0" }, { capabilities: {} });
    await c.connect(transport);
    _tools = (await c.listTools()).tools;
    _client = c;
    console.log(`[reporeason] connected; ${_tools.length} tools available.`);
  } catch (err) {
    console.error("[reporeason] connect failed; per-card reasoning disabled:", err);
    _client = null; _tools = [];
  }
}

export function reporeasonReady(): boolean { return !!_client && _tools.length > 0; }
export function reporeasonTools() { return toOpenAITools(_tools); }
export function reporeasonRunner(): ToolRunner {
  return {
    async run(name: string, args: any): Promise<string> {
      if (!_client) throw new Error("reporeason not connected");
      const r: any = await _client.callTool({ name, arguments: args });
      return (r.content || []).map((c: any) => c.text).filter(Boolean).join("\n");
    },
  };
}
