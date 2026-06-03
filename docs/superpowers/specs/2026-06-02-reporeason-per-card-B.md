# B — reporeason Per-Card Reasoning — Combined Spec + Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. TDD, checkbox steps. Tests via `node --test server/*.test.ts`. **Depends on A** (per-card curated context) being shipped first.

**Goal:** Let `alder-1-0` actively reason through each card's repository correspondences during `deep-interpretation`, using the live `reporeason` MCP engine, *on top of* A's curated per-card frame.

**Status:** Design approved 2026-06-02. Ships after A. Gated behind `ENABLE_REPOREASON` (off by default) so it can be toggled for cost.

---

## 1. Why

A gives each card a deterministic, focused context. B adds *reasoning*: alder-1-0 can call reporeason to traverse the knowledge graph for the specific card ↔ the querent's linked placement, surfacing connections we didn't pre-assemble. alder-1-0 is fine-tuned for tool-calling, and we deliberately kept the MCP scaffolding dormant — re-enabling is a scoped addition, not a rebuild.

## 2. Decisions (from brainstorm)

1. **Scope:** per-card `deep-interpretation` (chosen over synthesis-only). `oracle`/`trend` unchanged for now.
2. **Layering:** B runs on top of A — A's `getCardContext` output is the base prompt; reporeason adds depth.
3. **Cost control:** gated by `ENABLE_REPOREASON`; bounded iteration cap (4); **server-side per-card cache** keyed `cardId+position+day`.
4. **Safety:** flag off / reporeason unreachable / loop error → fall back to A's single-shot `callLiteLLM`. Never hard-fail.

## 3. reporeason tool surface (verified via MCP handshake)

`reason_start_session`, `reason_finalize_session`, `reason_orient` (identify active symbols + pathways), `reason_traverse` (graph traversal), `reason_synthesize` (dialectical synthesis), `reason_identify_symbols`, `reason_get_correspondence` (path between two symbols), `reason_get_elemental_balance`. We expose **all** tools to the model and let it choose; the system prompt nudges it toward the lightweight utilities (`reason_identify_symbols`, `reason_get_correspondence`) for a single-card focus.

## 4. Architecture

```
deep-interpretation(card)
  astro = await getCardContext(cardName)              [from A]
  {system,user} = buildDeepPrompt(card, reading, graphContext, astro)
  if ENABLE_REPOREASON && reporeasonReady() && not cached:
      result = runReasoningAgent(system+toolHint, user, reporeasonTools(), reporeasonRunner(), 4)
               ↳ on error → callLiteLLM(system,user)   [fallback]
      cache[cardId+position+day] = result
  else:
      result = callLiteLLM(system,user)                [A behavior]
```

### Components
- **`server/agent.ts`** *(new, pure-ish)* — `runReasoningAgent(system, user, tools, runner, maxIters)`: OpenAI-function-calling loop against LiteLLM; dispatches `tool_calls` via an injected `ToolRunner`; caps iterations; final no-tools synthesis pass on cap. Injected runner = unit-testable without network beyond a mocked `fetch`. Also exports pure `toOpenAITools(mcpTools)`.
- **`server/reporeason.ts`** *(new)* — connects the reporeason MCP client at boot **only when `ENABLE_REPOREASON==='true'`** (reuses `@modelcontextprotocol/sdk`, still a dependency). Exposes `initReporeason()`, `reporeasonReady()`, `reporeasonTools()`, `reporeasonRunner()`.
- **`server.ts`** — `initReporeason()` in `startServer`; deep-interpretation branches to the agent loop when ready; server-side per-card cache `Map`.
- **`.env` / `.env.example`** — `ENABLE_REPOREASON=false`, `REPOREASON_URL=https://reporeason.dubtown-server.us/mcp`.

---

## 5. Plan (TDD)

### Task B1: Reasoning agent loop (`agent.ts`)

**Files:** create `server/agent.ts`, `server/agent.test.ts`.

- [ ] **Step 1 — failing test** (`server/agent.test.ts`):

```ts
import { test, mock, afterEach } from "node:test";
import assert from "node:assert/strict";
import { runReasoningAgent, toOpenAITools } from "./agent.ts";

afterEach(() => { mock.restoreAll(); delete process.env.LITELLM_BASE; delete process.env.LITELLM_API_KEY; });

function env() { process.env.LITELLM_BASE = "http://t/v1"; process.env.LITELLM_API_KEY = "k"; }

test("toOpenAITools maps MCP tool defs to OpenAI function schema", () => {
  const out = toOpenAITools([{ name: "reason_orient", description: "d", inputSchema: { type: "object", properties: { q: { type: "string" } } } }]);
  assert.equal(out[0].type, "function");
  assert.equal(out[0].function.name, "reason_orient");
  assert.equal(out[0].function.parameters.properties.q.type, "string");
});

test("agent dispatches a tool call then returns final content", async () => {
  env();
  let phase = 0;
  mock.method(globalThis, "fetch", async () => {
    phase++;
    if (phase === 1) {
      return new Response(JSON.stringify({ choices: [{ message: { role: "assistant", content: null,
        tool_calls: [{ id: "c1", type: "function", function: { name: "reason_get_correspondence", arguments: "{\"a\":\"The Sun\",\"b\":\"Sun\"}" } }] } }] }), { status: 200 });
    }
    return new Response(JSON.stringify({ choices: [{ message: { role: "assistant", content: "FINAL" } }] }), { status: 200 });
  });
  const calls: string[] = [];
  const runner = { async run(name: string) { calls.push(name); return "path: Sun↔The Sun"; } };
  const tools = toOpenAITools([{ name: "reason_get_correspondence", description: "", inputSchema: { type: "object", properties: {} } }]);
  const out = await runReasoningAgent("sys", "usr", tools, runner, 4);
  assert.equal(out, "FINAL");
  assert.deepEqual(calls, ["reason_get_correspondence"]);
});

test("agent returns content directly when no tool calls", async () => {
  env();
  mock.method(globalThis, "fetch", async () =>
    new Response(JSON.stringify({ choices: [{ message: { role: "assistant", content: "DIRECT" } }] }), { status: 200 }));
  const out = await runReasoningAgent("s", "u", [], { async run() { return ""; } }, 4);
  assert.equal(out, "DIRECT");
});

test("agent throws on non-200", async () => {
  env();
  mock.method(globalThis, "fetch", async () => new Response("boom", { status: 500 }));
  await assert.rejects(() => runReasoningAgent("s", "u", [], { async run() { return ""; } }, 4), /LiteLLM 500/);
});
```

- [ ] **Step 2 — run, expect fail. Step 3 — implement** `server/agent.ts`:

```ts
// server/agent.ts — bounded OpenAI function-calling loop against LiteLLM,
// dispatching tool calls through an injected runner (e.g. reporeason MCP).
export interface OAITool { type: "function"; function: { name: string; description: string; parameters: any }; }
export interface ToolRunner { run(name: string, args: any): Promise<string>; }

export function toOpenAITools(mcpTools: any[]): OAITool[] {
  return (mcpTools || []).map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description ?? "",
      parameters: t.inputSchema ?? t.parameters ?? { type: "object", properties: {} },
    },
  }));
}

async function chat(body: any): Promise<any> {
  const base = process.env.LITELLM_BASE, key = process.env.LITELLM_API_KEY;
  if (!base || !key) throw new Error("LITELLM_BASE and LITELLM_API_KEY must be set");
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: "alder-1-0", max_tokens: 2048, ...body }),
  });
  if (!res.ok) throw new Error(`LiteLLM ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function runReasoningAgent(
  system: string, user: string, tools: OAITool[], runner: ToolRunner, maxIters = 4,
): Promise<string> {
  const messages: any[] = [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
  for (let i = 0; i < maxIters; i++) {
    const data = await chat({ messages, tools: tools.length ? tools : undefined });
    const msg = data?.choices?.[0]?.message;
    if (!msg) return "";
    messages.push(msg);
    const calls = msg.tool_calls;
    if (!calls || !calls.length) return msg.content ?? "";
    for (const call of calls) {
      let result: string;
      try {
        const args = JSON.parse(call.function?.arguments || "{}");
        result = await runner.run(call.function.name, args);
      } catch (err: any) {
        result = `tool error: ${err.message}`;
      }
      messages.push({ role: "tool", tool_call_id: call.id, content: result });
    }
  }
  // Cap reached: force a final answer with no tools.
  const data = await chat({ messages: [...messages, { role: "user", content: "Provide your final interpretation now, no more tools." }] });
  return data?.choices?.[0]?.message?.content ?? "";
}
```

- [ ] **Step 4 — run, expect pass. Step 5 — commit** `feat(arcanum): bounded reasoning agent loop for LiteLLM tool-calling`.

### Task B2: reporeason client (`reporeason.ts`)

**Files:** create `server/reporeason.ts`, `server/reporeason.test.ts`. Unit-test only the pure mapping + the not-ready guard (the live MCP connection is covered by deploy verification).

- [ ] **Step 1 — failing test** (`server/reporeason.test.ts`):

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { reporeasonReady } from "./reporeason.ts";

test("reporeasonReady is false before init", () => {
  assert.equal(reporeasonReady(), false);
});
```

- [ ] **Step 2 — run, expect fail. Step 3 — implement** `server/reporeason.ts`:

```ts
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
```

- [ ] **Step 4 — run, expect pass. Step 5 — commit** `feat(arcanum): optional reporeason MCP client (gated)`.

### Task B3: Wire deep-interpretation + per-card cache + boot

**Files:** `server.ts`.

- [ ] **Step 1** — imports: `runReasoningAgent` from `./server/agent.ts`; `initReporeason`, `reporeasonReady`, `reporeasonTools`, `reporeasonRunner` from `./server/reporeason.ts`.
- [ ] **Step 2** — in `startServer`, after the dormant MCP block, add `await initReporeason();`.
- [ ] **Step 3** — add a module-level `const _cardInsightCache = new Map<string, string>();` and rewrite the deep-interpretation handler:

```ts
  app.post("/api/ai/deep-interpretation", async (req, res) => {
    try {
      const { card, reading, graphContext } = req.body;
      const cardName = card?.card?.name;
      const today = new Date().toISOString().slice(0, 10);
      const cacheKey = `${card?.card?.id}-${card?.position?.name}-${today}`;
      const astro = await getCardContext(cardName);
      const { system, user } = buildDeepPrompt(card, reading, graphContext, astro);

      let result: string;
      if (process.env.ENABLE_REPOREASON === "true" && reporeasonReady() && !_cardInsightCache.has(cacheKey)) {
        const sys = system +
          "\n\nYou may call the reporeason tools to investigate this card's symbolic correspondences " +
          "against the querent's chart placements before answering. Prefer reason_identify_symbols and " +
          "reason_get_correspondence for a focused, single-card inquiry. Then give the interpretation.";
        try {
          result = await runReasoningAgent(sys, user, reporeasonTools(), reporeasonRunner(), 4);
          _cardInsightCache.set(cacheKey, result);
        } catch (err) {
          console.error("[AI] reporeason agent failed; falling back to single-shot:", err);
          result = await callLiteLLM(system, user);
        }
      } else if (_cardInsightCache.has(cacheKey)) {
        result = _cardInsightCache.get(cacheKey)!;
      } else {
        result = await callLiteLLM(system, user);
      }
      res.json({ result });
    } catch (err: any) {
      console.error("[AI Server Error] Deep Interpretation:", err);
      res.status(500).json({ error: err.message });
    }
  });
```

- [ ] **Step 4** — `npm run lint` → exit 0. **Step 5 — commit** `feat(arcanum): per-card reporeason reasoning in deep-interpretation (gated)`.

### Task B4: Config

**Files:** `.env`, `.env.example`.

- [ ] Add to `.env.example`: `ENABLE_REPOREASON=false` and `REPOREASON_URL=https://reporeason.dubtown-server.us/mcp`.
- [ ] On CT 501 `.env`: add the same; set `ENABLE_REPOREASON=true` to activate. Commit `.env.example` only.

### Task B5: Deploy + live verification
- [ ] Deploy branch to CT 501; with `ENABLE_REPOREASON=false`, restart and confirm deep-interpretation still works (A behavior) — log shows `[reporeason] disabled`.
- [ ] Flip `ENABLE_REPOREASON=true`, restart; log shows `[reporeason] connected; N tools`.
- [ ] Smoke a deep-interpretation; confirm 200, the result reflects reasoning depth, and the server log shows reporeason tool dispatch. Confirm a repeat call for the same card hits the cache (no second loop).
- [ ] Kill-switch check: point `REPOREASON_URL` at a bad host, restart → connect fails gracefully, deep-interpretation falls back to single-shot (still 200).

## 6. Verification
- All unit suites green; `tsc --noEmit` clean.
- With flag off: identical to A. With flag on: tool dispatch visible, per-card cache works, graceful fallback when reporeason is down.

## 7. Cost note
Each uncached per-card interpretation with reasoning = up to 5 LiteLLM calls (4 tool iterations + final) + reporeason traversals. The `ENABLE_REPOREASON` flag and the per-card cache are the cost governors. Start enabled in a low-traffic window; watch LiteLLM usage before broad rollout.
