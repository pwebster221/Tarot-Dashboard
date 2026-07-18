// server/llm.ts — single-shot completions against Claude Fable 5 via the
// Anthropic SDK. Interpretations previously ran on the local LiteLLM model
// `alder-1-0`; they now run on Claude Fable 5 with a server-side refusal
// fallback to Opus 4.8. This module also owns the shared Anthropic client that
// the reasoning loop (server/agent.ts) reuses.
import Anthropic from "@anthropic-ai/sdk";

export const FABLE_MODEL = "claude-fable-5";
export const FALLBACK_MODEL = "claude-opus-4-8";
export const MAX_TOKENS = 8192;
// Interpretations are creative synthesis, not hard multi-step reasoning; medium
// effort is the quality/latency sweet spot for the interpretation UX.
export const EFFORT = "medium";

let _client: Anthropic | null = null;

/** Test hook: inject a stub client (bypasses ANTHROPIC_API_KEY + real network). */
export function _setClient(c: any): void {
  _client = c;
}

/** Lazily-constructed shared Anthropic client. Reads ANTHROPIC_API_KEY from env. */
export function client(): Anthropic {
  if (!_client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY must be set");
    }
    _client = new Anthropic();
  }
  return _client;
}

/** Concatenate the text blocks of an Anthropic message `content` array. */
export function textOf(content: any[]): string {
  return (content || [])
    .filter((b) => b?.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}

/**
 * One single-shot Claude Fable 5 completion. Ships the server-side refusal
 * fallback (Fable → Opus 4.8) by default; a fully-refused chain throws so
 * callers can degrade gracefully. Fable's thinking is always on and never
 * configured here (an explicit `thinking` config is rejected); depth is tuned
 * with `output_config.effort`.
 */
export async function callFable(system: string, user: string): Promise<string> {
  const resp: any = await client().beta.messages.create({
    model: FABLE_MODEL,
    max_tokens: MAX_TOKENS,
    output_config: { effort: EFFORT },
    betas: ["server-side-fallback-2026-06-01"],
    fallbacks: [{ model: FALLBACK_MODEL }],
    system,
    messages: [{ role: "user", content: user }],
  } as any);
  if (resp.stop_reason === "refusal") {
    throw new Error("Claude declined this request (fallback chain exhausted)");
  }
  return textOf(resp.content);
}
