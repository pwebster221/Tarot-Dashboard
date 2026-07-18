import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { runReasoningAgent, toAnthropicTools } from "./agent.ts";
import { _setClient } from "./llm.ts";

afterEach(() => { _setClient(null); });

/** Fake Anthropic client returning a fixed sequence of messages.create responses. */
function fakeClient(responses: any[]) {
  const calls: any[] = [];
  let i = 0;
  const create = async (params: any) => { calls.push(params); return responses[Math.min(i++, responses.length - 1)]; };
  return { client: { messages: { create }, beta: { messages: { create } } }, calls };
}

test("toAnthropicTools maps MCP tool defs to Anthropic tool schema", () => {
  const out = toAnthropicTools([{ name: "reason_orient", description: "d", inputSchema: { type: "object", properties: { q: { type: "string" } } } }]);
  assert.equal(out[0].name, "reason_orient");
  assert.equal(out[0].description, "d");
  assert.equal(out[0].input_schema.properties.q.type, "string");
});

test("agent dispatches a tool call then returns final text", async () => {
  const { client, calls } = fakeClient([
    { stop_reason: "tool_use", content: [{ type: "tool_use", id: "tu1", name: "reason_get_correspondence", input: { a: "The Sun" } }] },
    { stop_reason: "end_turn", content: [{ type: "text", text: "FINAL" }] },
  ]);
  _setClient(client);
  const ran: string[] = [];
  const runner = { async run(name: string) { ran.push(name); return "path: Sun<->The Sun"; } };
  const tools = toAnthropicTools([{ name: "reason_get_correspondence", inputSchema: {} }]);
  const out = await runReasoningAgent("sys", "usr", tools, runner, 4);
  assert.equal(out, "FINAL");
  assert.deepEqual(ran, ["reason_get_correspondence"]);
  // 2nd request carries the tool_result back as a user message.
  const trMsg = calls[1].messages.find((m: any) => Array.isArray(m.content) && m.content[0]?.type === "tool_result");
  assert.equal(trMsg.content[0].tool_use_id, "tu1");
  assert.equal(trMsg.content[0].content, "path: Sun<->The Sun");
});

test("agent returns text directly when there is no tool use", async () => {
  const { client } = fakeClient([{ stop_reason: "end_turn", content: [{ type: "text", text: "DIRECT" }] }]);
  _setClient(client);
  const out = await runReasoningAgent("s", "u", [], { async run() { return ""; } }, 4);
  assert.equal(out, "DIRECT");
});

test("agent throws on refusal", async () => {
  const { client } = fakeClient([{ stop_reason: "refusal", content: [] }]);
  _setClient(client);
  await assert.rejects(() => runReasoningAgent("s", "u", [], { async run() { return ""; } }, 4), /declined/);
});

test("runner throw becomes a tool-result error string, not a crash", async () => {
  const { client, calls } = fakeClient([
    { stop_reason: "tool_use", content: [{ type: "tool_use", id: "tu1", name: "boom", input: {} }] },
    { stop_reason: "end_turn", content: [{ type: "text", text: "RECOVERED" }] },
  ]);
  _setClient(client);
  const runner = { async run() { throw new Error("tool blew up"); } };
  const out = await runReasoningAgent("s", "u", toAnthropicTools([{ name: "boom", inputSchema: {} }]), runner, 4);
  assert.equal(out, "RECOVERED");
  const trMsg = calls[1].messages.find((m: any) => Array.isArray(m.content) && m.content[0]?.type === "tool_result");
  assert.match(trMsg.content[0].content, /tool error: tool blew up/);
});

test("agent caps total tool calls and forces a final answer", async () => {
  const calls: any[] = [];
  const create = async (params: any) => {
    calls.push(params);
    if (params.tools) return { stop_reason: "tool_use", content: [{ type: "tool_use", id: "t" + calls.length, name: "loop", input: {} }] };
    return { stop_reason: "end_turn", content: [{ type: "text", text: "DONE" }] };
  };
  _setClient({ messages: { create }, beta: { messages: { create } } });
  let runs = 0;
  const runner = { async run() { runs++; return "ok"; } };
  const out = await runReasoningAgent("s", "u", toAnthropicTools([{ name: "loop", inputSchema: {} }]), runner, 10, 2);
  assert.equal(out, "DONE");
  assert.equal(runs, 2);                              // never dispatched more than the cap
  assert.equal(calls[calls.length - 1].tools, undefined); // forced pass sends no tools
});

test("hitting maxIters triggers a final no-tools forced-answer pass", async () => {
  const calls: any[] = [];
  const create = async (params: any) => {
    calls.push(params);
    if (params.tools) return { stop_reason: "tool_use", content: [{ type: "tool_use", id: "t" + calls.length, name: "loop", input: {} }] };
    return { stop_reason: "end_turn", content: [{ type: "text", text: "FORCED" }] };
  };
  _setClient({ messages: { create }, beta: { messages: { create } } });
  const out = await runReasoningAgent("s", "u", toAnthropicTools([{ name: "loop", inputSchema: {} }]), { async run() { return "ok"; } }, 2);
  assert.equal(out, "FORCED");
  assert.equal(calls.length, 3);            // 2 loop iters + 1 forced pass
  assert.equal(calls[2].tools, undefined);  // forced pass sends no tools
});
