// server/reporeason.ts — optional reporeason MCP connection (gated by ENABLE_REPOREASON).
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { EventSource } from "eventsource";
import { toAnthropicTools, type ToolRunner } from "./agent.ts";

(global as any).EventSource = EventSource;

// reporeason v3's whole surface. There is no session lifecycle any more: a frame is
// addressed by the exploration_id reason_explore returns.
export const ALLOWED_REASON_TOOLS = new Set([
  "reason_explore", "reason_exploration", "reason_verify", "reason_identify_symbols",
]);

// Reads, safe to replay after a lost response. reason_explore stores a frame and proposes a
// pointer, and reason_verify appends to the frame's log, so replaying either writes twice.
const REPLAYABLE_TOOLS = new Set(["reason_exploration", "reason_identify_symbols"]);

// reason_verify matches each citation's ref exactly against the stored frame, and a claim
// without citations is ungrounded, so the hint says to copy refs verbatim. The frame is
// model-facing by Paul's ruling: it informs the reasoning and is never its subject.
export const GATED_REASONING_NOTE =
  "\n\nThe reporeason tools open only after you have read the first three ranks. Once they " +
  "open, make at least one call before you write. The reading stands on the dossier: the frame " +
  "adds insight and is not its ground.";

export const REASONING_HINT =
  "\n\nYou may use the reporeason tools to ground this reading. The engine stores and " +
  "checks; YOU interpret, and it never interprets for you. reason_identify_symbols(text) " +
  "finds the symbols in play. reason_explore(symbol) takes one symbol, or a compound such " +
  "as 'Pluto square Venus', and returns a stored frame: the path to its archetype, the " +
  "beats that archetype claimed (anchors), who else claimed them by planetary court, the " +
  "nearest beats (kin) and the land; refusals, zeros and empties in it are results, not " +
  "gaps. Explore only the one or two symbols this card turns on: you have 8 tool calls. " +
  "reason_verify checks one exploration id, so when a claim joins two symbols, explore " +
  "them once as a compound and verify its cmp: id. " +
  "reason_exploration(exploration_id, section) reads a section in full. Before answering, " +
  "call reason_verify(exploration_id, interpretation, claims), where each claim is " +
  "{assertion, cites: [{kind, ref}]}, kind is one of beat, archetype, card, court, pair, " +
  "path or kin, and ref is copied exactly from the frame. If permission comes back " +
  "'revise', fix or drop what is ungrounded. Think through the frame and let it deepen " +
  "your reading; never name the tools, frames, beats, ids or scores in your answer. All " +
  "the data you need is already in this prompt or the frame: never ask the user for " +
  "more input, and always deliver the interpretation yourself.";

/** The part of the MCP client this module uses (the seam tests fake). */
export interface ReasonClient {
  listTools(): Promise<{ tools: any[] }>;
  callTool(req: { name: string; arguments: any }): Promise<any>;
}
type Connector = () => Promise<ReasonClient>;

let _client: ReasonClient | null = null;
let _tools: any[] = [];

const connectMcp: Connector = async () => {
  const url = process.env.REPOREASON_URL || "https://reporeason.dubtown-server.us/mcp";
  // reporeason takes a static service token (REPOREASON_TOKEN) as a Bearer header.
  const token = process.env.REPOREASON_TOKEN;
  const transport = new StreamableHTTPClientTransport(
    new URL(url),
    token ? { requestInit: { headers: { Authorization: `Bearer ${token}` } } } : undefined,
  );
  const c = new Client({ name: "arcanum-dashboard", version: "1.0.0" }, { capabilities: {} });
  await c.connect(transport);
  return c as unknown as ReasonClient;
};
let _connect: Connector = connectMcp;

/** Test seam: swap the connector and clear the connection. null restores the real one. */
export function _setConnector(fn: Connector | null): void {
  _connect = fn ?? connectMcp;
  _client = null;
  _tools = [];
}

async function connect(): Promise<void> {
  try {
    const c = await _connect();
    _tools = (await c.listTools()).tools;
    _client = c;
    console.log(`[reporeason] connected; ${_tools.length} tools available.`);
  } catch (err) {
    console.error("[reporeason] connect failed; per-card reasoning disabled:", err);
    _client = null; _tools = [];
  }
}

export async function initReporeason(): Promise<void> {
  if (process.env.ENABLE_REPOREASON !== "true") {
    console.log("[reporeason] disabled (ENABLE_REPOREASON != 'true').");
    return;
  }
  await connect();
}

/**
 * Bring the connection up to date before a reasoning run. Sessions live in the server, so
 * a redeploy kills ours, and the tool list changes with the server; a connection that
 * failed earlier gets another chance here rather than needing a dashboard restart.
 */
export async function ensureReporeason(): Promise<void> {
  if (process.env.ENABLE_REPOREASON !== "true") return;
  if (_client) {
    try {
      _tools = (await _client.listTools()).tools;
      return;
    } catch (err) {
      console.warn("[reporeason] session lost; reconnecting:", err);
      _client = null; _tools = [];
    }
  }
  await connect();
}

export function reporeasonReady(): boolean { return !!_client && _tools.length > 0; }
export function reporeasonTools() { return toAnthropicTools(_tools); }
export function reporeasonRunner(): ToolRunner {
  return {
    async run(name: string, args: any): Promise<string> {
      if (!_client) throw new Error("reporeason not connected");
      let r: any;
      try {
        r = await _client.callTool({ name, arguments: args });
      } catch (err) {
        // A transport failure: the session may have died mid-run, and the call may still
        // have landed. Reconnect for the next call, but replay only what writes nothing.
        console.warn(`[reporeason] ${name} failed; reconnecting:`, err);
        await connect();
        if (!_client || !REPLAYABLE_TOOLS.has(name)) throw err;
        r = await _client.callTool({ name, arguments: args });
      }
      const text = (r.content || []).map((c: any) => c.text).filter(Boolean).join("\n");
      if (r.isError) throw new Error(text || `${name} failed`);
      return text;
    },
  };
}
