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
  const runner = { async run(name: string) { calls.push(name); return "path: Sun<->The Sun"; } };
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

test("runner throw becomes a tool-result error string, not a crash", async () => {
  env();
  let phase = 0;
  const seen: any[] = [];
  mock.method(globalThis, "fetch", async (_url: any, init: any) => {
    phase++;
    seen.push(JSON.parse(init.body));
    if (phase === 1) {
      return new Response(JSON.stringify({ choices: [{ message: { role: "assistant", content: null,
        tool_calls: [{ id: "c1", type: "function", function: { name: "boom", arguments: "{}" } }] } }] }), { status: 200 });
    }
    return new Response(JSON.stringify({ choices: [{ message: { role: "assistant", content: "RECOVERED" } }] }), { status: 200 });
  });
  const runner = { async run() { throw new Error("tool blew up"); } };
  const out = await runReasoningAgent("s", "u", toOpenAITools([{ name: "boom", inputSchema: {} }]), runner, 4);
  assert.equal(out, "RECOVERED");
  // 2nd request must contain a tool message carrying the error text.
  const toolMsg = seen[1].messages.find((m: any) => m.role === "tool");
  assert.match(toolMsg.content, /tool error: tool blew up/);
});

test("agent caps total tool calls and forces a final answer", async () => {
  process.env.LITELLM_BASE = "http://t/v1"; process.env.LITELLM_API_KEY = "k";
  let phase = 0;
  mock.method(globalThis, "fetch", async (_u: any, init: any) => {
    phase++;
    const body = JSON.parse(init.body);
    if (body.tools) {
      return new Response(JSON.stringify({ choices: [{ message: { role: "assistant", content: null,
        tool_calls: [{ id: "c" + phase, type: "function", function: { name: "loop", arguments: "{}" } }] } }] }), { status: 200 });
    }
    return new Response(JSON.stringify({ choices: [{ message: { role: "assistant", content: "DONE" } }] }), { status: 200 });
  });
  let runs = 0;
  const runner = { async run() { runs++; return "ok"; } };
  const out = await runReasoningAgent("s", "u", toOpenAITools([{ name: "loop", inputSchema: {} }]), runner, 10, 2);
  assert.equal(out, "DONE");
  assert.equal(runs, 2);   // never dispatched more than the cap
});

test("hitting maxIters triggers a final no-tools forced-answer pass", async () => {
  env();
  let phase = 0;
  let lastBody: any = null;
  mock.method(globalThis, "fetch", async (_url: any, init: any) => {
    phase++;
    lastBody = JSON.parse(init.body);
    // Always return a tool call so the loop never exits early.
    if (phase <= 2) {
      return new Response(JSON.stringify({ choices: [{ message: { role: "assistant", content: null,
        tool_calls: [{ id: "c" + phase, type: "function", function: { name: "loop", arguments: "{}" } }] } }] }), { status: 200 });
    }
    return new Response(JSON.stringify({ choices: [{ message: { role: "assistant", content: "FORCED" } }] }), { status: 200 });
  });
  const runner = { async run() { return "ok"; } };
  const out = await runReasoningAgent("s", "u", toOpenAITools([{ name: "loop", inputSchema: {} }]), runner, 2);
  assert.equal(out, "FORCED");
  assert.equal(phase, 3);                       // 2 loop iters + 1 forced pass
  assert.equal(lastBody.tools, undefined);      // forced pass sends no tools
});
