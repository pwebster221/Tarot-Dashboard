import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { callFable, _setClient, textOf, FABLE_MODEL, FALLBACK_MODEL } from "./llm.ts";

afterEach(() => { _setClient(null); });

test("textOf joins only text blocks and trims", () => {
  const out = textOf([
    { type: "text", text: "  A" },
    { type: "thinking", thinking: "hidden" },
    { type: "text", text: "B  " },
  ]);
  assert.equal(out, "AB");
});

test("callFable sends a Fable request with refusal fallback, no thinking config", async () => {
  let captured: any = null;
  _setClient({
    beta: { messages: { create: async (params: any) => {
      captured = params;
      return { stop_reason: "end_turn", content: [{ type: "text", text: "ORACLE REPLY" }] };
    } } },
  });

  const out = await callFable("sys", "usr");
  assert.equal(out, "ORACLE REPLY");
  assert.equal(captured.model, FABLE_MODEL);
  assert.deepEqual(captured.fallbacks, [{ model: FALLBACK_MODEL }]);
  assert.deepEqual(captured.betas, ["server-side-fallback-2026-06-01"]);
  assert.equal(captured.system, "sys");
  assert.equal(captured.messages[0].role, "user");
  assert.equal(captured.messages[0].content, "usr");
  assert.equal(captured.thinking, undefined); // Fable thinking is always on; never configured
});

test("callFable throws when the fallback chain is fully refused", async () => {
  _setClient({ beta: { messages: { create: async () => ({ stop_reason: "refusal", content: [] }) } } });
  await assert.rejects(() => callFable("s", "u"), /declined/);
});

test("callFable throws when ANTHROPIC_API_KEY is unset", async () => {
  _setClient(null);
  const saved = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  try {
    await assert.rejects(() => callFable("s", "u"), /ANTHROPIC_API_KEY must be set/);
  } finally {
    if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved;
  }
});
