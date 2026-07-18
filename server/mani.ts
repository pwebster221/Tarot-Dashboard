// server/mani.ts — optional Mani ("keystone") reasoning enrichment, gated by
// ENABLE_MANI. Per interpretation, one `attune` call compiles a cognitive-stack
// document that is injected into the interpretation prompt as an additional
// attuned perspective. Best-effort: any failure yields "" and never blocks the
// interpretation. Connect failure degrades to disabled (logged), never throws.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { EventSource } from "eventsource";

(global as any).EventSource = EventSource;

let _client: Client | null = null;

export async function initMani(): Promise<void> {
  if (process.env.ENABLE_MANI !== "true") {
    console.log("[mani] disabled (ENABLE_MANI != 'true').");
    return;
  }
  const url = process.env.MANI_URL || "https://mani.dubtown-server.us/mcp";
  try {
    const transport = new StreamableHTTPClientTransport(new URL(url));
    const c = new Client({ name: "arcanum-dashboard", version: "1.0.0" }, { capabilities: {} });
    await c.connect(transport);
    await c.listTools(); // sanity: confirm the attune/reset_field surface is reachable
    _client = c;
    console.log("[mani] connected; attune enrichment enabled.");
  } catch (err) {
    console.error("[mani] connect failed; interpretation enrichment disabled:", err);
    _client = null;
  }
}

export function maniReady(): boolean { return !!_client; }

/**
 * Mani cognitive profile for a card, by tier (documented attunement mapping):
 * Majors → arendt, Court/Majestic → jung, Minor pips by suit
 * (Wands → qiu_jin, Chalices → kahlo, Swords/Pentacles → newton). Default jung.
 */
export function profileForCard(card: any): string {
  const arcana = String(card?.card?.arcana || "").toLowerCase();
  if (arcana.includes("major")) return "arendt";
  const name = String(card?.card?.name || "").toLowerCase();
  if (/\b(page|knight|queen|king)\b/.test(name)) return "jung";
  const suit = String(card?.card?.suit || "").toLowerCase();
  if (suit.includes("wand")) return "qiu_jin";
  if (suit.includes("chalice") || suit.includes("cup")) return "kahlo";
  if (suit.includes("sword") || suit.includes("pentacle") || suit.includes("disk") || suit.includes("coin")) return "newton";
  return "jung";
}

/**
 * Run one `attune` call and return its cognitive-stack document. Empty string
 * on any failure — enrichment is best-effort and never blocks interpretation.
 * A stable `conversationId` per interpretation target keeps field state isolated
 * (and lets repeated generations deepen the same field).
 */
export async function maniAttune(query: string, profile: string, conversationId: string): Promise<string> {
  if (!_client) return "";
  try {
    const r: any = await _client.callTool({
      name: "attune",
      arguments: {
        params: {
          query: (query || "").slice(0, 8000),
          profile,
          conversation_id: conversationId.slice(0, 120),
        },
      },
    });
    return (r?.content || []).map((c: any) => c?.text).filter(Boolean).join("\n").trim();
  } catch (err) {
    console.error("[mani] attune failed:", err);
    return "";
  }
}
