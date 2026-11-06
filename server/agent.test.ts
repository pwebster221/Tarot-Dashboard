import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { runGroundedAgent, runReasoningAgent, toAnthropicTools } from "./agent.ts";
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
  const out = toAnthropicTools([{ name: "reason_explore", description: "d", inputSchema: { type: "object", properties: { q: { type: "string" } } } }]);
  assert.equal(out[0].name, "reason_explore");
  assert.equal(out[0].description, "d");
  assert.equal(out[0].input_schema.properties.q.type, "string");
});

test("agent dispatches a tool call then returns final text", async () => {
  const { client, calls } = fakeClient([
    { stop_reason: "tool_use", content: [{ type: "tool_use", id: "tu1", name: "reason_identify_symbols", input: { a: "The Sun" } }] },
    { stop_reason: "end_turn", content: [{ type: "text", text: "FINAL" }] },
  ]);
  _setClient(client);
  const ran: string[] = [];
  const runner = { async run(name: string) { ran.push(name); return "path: Sun<->The Sun"; } };
  const tools = toAnthropicTools([{ name: "reason_identify_symbols", inputSchema: {} }]);
  const out = await runReasoningAgent("sys", "usr", tools, runner, 4);
  assert.equal(out, "FINAL");
  assert.deepEqual(ran, ["reason_identify_symbols"]);
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

const GRANTED = JSON.stringify({ permission: "granted", grounding: 1 });
const REVISE = JSON.stringify({ permission: "revise", grounding: 0.2 });
const useTool = (id: string, name: string) => ({ stop_reason: "tool_use", content: [{ type: "tool_use", id, name, input: {} }] });
const finalText = (text: string) => ({ stop_reason: "end_turn", content: [{ type: "text", text }] });
const TOOLS = toAnthropicTools([{ name: "reason_explore", inputSchema: {} }, { name: "reason_verify", inputSchema: {} }]);
const replies = (byName: Record<string, string>) => ({
  async run(name: string) { if (name in byName) return byName[name]; throw new Error("session gone"); },
});

test("a run is grounded once reason_verify grants permission", async () => {
  const { client } = fakeClient([useTool("a", "reason_explore"), useTool("b", "reason_verify"), finalText("READING")]);
  _setClient(client);
  assert.deepEqual(
    await runGroundedAgent("s", "u", TOOLS, replies({ reason_explore: "frame", reason_verify: GRANTED })),
    { text: "READING", grounded: true },
  );
});

test("a granted verify still counts after an earlier revise", async () => {
  const { client } = fakeClient([useTool("a", "reason_verify"), useTool("b", "reason_verify"), finalText("READING")]);
  _setClient(client);
  let n = 0;
  const runner = { async run() { return n++ === 0 ? REVISE : GRANTED; } };
  assert.equal((await runGroundedAgent("s", "u", TOOLS, runner)).grounded, true);
});

const verifyOf = (id: string, exploration_id: string) => ({
  stop_reason: "tool_use", content: [{ type: "tool_use", id, name: "reason_verify", input: { exploration_id } }],
});
const sequence = (...results: string[]) => {
  let n = 0;
  return { async run() { const r = results[n++]; if (r === "THROW") throw new Error("lost"); return r; } };
};
const groundedAfter = async (ids: string[], results: string[]) => {
  const { client } = fakeClient([...ids.map((id, i) => verifyOf(`v${i}`, id)), finalText("READING")]);
  _setClient(client);
  return (await runGroundedAgent("s", "u", TOOLS, sequence(...results))).grounded;
};

test("a later revise on the same frame clears an earlier grant", async () => {
  assert.equal(await groundedAfter(["exp:1", "exp:1"], [GRANTED, REVISE]), false);
});

test("a later failed verify on the same frame clears an earlier grant", async () => {
  assert.equal(await groundedAfter(["exp:1", "exp:1"], [GRANTED, "THROW"]), false);
});

test("every frame verified must end granted", async () => {
  assert.equal(await groundedAfter(["exp:1", "exp:2"], [REVISE, GRANTED]), false);
  assert.equal(await groundedAfter(["exp:1", "exp:2"], [GRANTED, REVISE]), false);
  assert.equal(await groundedAfter(["exp:1", "exp:2"], [GRANTED, GRANTED]), true);
});

for (const [why, second] of [["the same frame", "exp:1"], ["a new frame", "exp:2"]]) {
  test(`a verify on ${why} skipped by the tool budget clears grounding`, async () => {
    const { client } = fakeClient([
      { stop_reason: "tool_use", content: [...verifyOf("v1", "exp:1").content, ...verifyOf("v2", second).content] },
      finalText("READING"),
    ]);
    _setClient(client);
    const out = await runGroundedAgent("s", "u", TOOLS, sequence(GRANTED, GRANTED), 4, 1);
    assert.equal(out.grounded, false);
  });
}

const ungrounded: [string, any[], Record<string, string>][] = [
  ["no tool was called", [finalText("READING")], {}],
  ["it explored but never verified", [useTool("a", "reason_explore"), finalText("READING")], { reason_explore: "frame" }],
  ["verify said revise", [useTool("a", "reason_verify"), finalText("READING")], { reason_verify: REVISE }],
  ["verify failed", [useTool("a", "reason_explore"), useTool("b", "reason_verify"), finalText("READING")], { reason_explore: "frame" }],
  ["verify returned something unparseable", [useTool("a", "reason_verify"), finalText("READING")], { reason_verify: "granted?" }],
];
for (const [why, responses, byName] of ungrounded) {
  test(`the answer is kept but not grounded when ${why}`, async () => {
    const { client } = fakeClient(responses);
    _setClient(client);
    assert.deepEqual(await runGroundedAgent("s", "u", TOOLS, replies(byName)), { text: "READING", grounded: false });
  });
}

test("no permitted tools means no reasoning path, not an unaided run", async () => {
  await assert.rejects(() => runGroundedAgent("s", "u", [], { async run() { return ""; } }), /no reasoning tools/);
});
