import { test, mock, afterEach } from "node:test";
import assert from "node:assert/strict";
import { callLiteLLM } from "./llm.ts";

afterEach(() => {
  mock.restoreAll();
  delete process.env.LITELLM_BASE;
  delete process.env.LITELLM_API_KEY;
});

test("callLiteLLM posts OpenAI-shaped body to LiteLLM and returns content", async () => {
  process.env.LITELLM_BASE = "http://litellm.test/v1";
  process.env.LITELLM_API_KEY = "sk-test";

  const fetchMock = mock.method(globalThis, "fetch", async (url: any, init: any) => {
    assert.equal(url, "http://litellm.test/v1/chat/completions");
    const body = JSON.parse(init.body);
    assert.equal(body.model, "alder-1-0");
    assert.equal(body.messages[0].role, "system");
    assert.equal(body.messages[1].role, "user");
    assert.equal(body.max_tokens, 2048);
    assert.equal(body.messages[0].content, "sys");
    assert.equal(body.messages[1].content, "usr");
    assert.equal(init.headers.Authorization, "Bearer sk-test");
    return new Response(
      JSON.stringify({ choices: [{ message: { content: "ORACLE REPLY" } }] }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  });

  const out = await callLiteLLM("sys", "usr");
  assert.equal(out, "ORACLE REPLY");
  assert.equal(fetchMock.mock.callCount(), 1);
});

test("callLiteLLM throws with status + body on non-200", async () => {
  process.env.LITELLM_BASE = "http://litellm.test/v1";
  process.env.LITELLM_API_KEY = "sk-test";
  mock.method(globalThis, "fetch", async () =>
    new Response("boom", { status: 502 }));
  await assert.rejects(() => callLiteLLM("s", "u"), /LiteLLM 502: boom/);
});

test("callLiteLLM throws when env vars are missing", async () => {
  delete process.env.LITELLM_BASE;
  delete process.env.LITELLM_API_KEY;
  await assert.rejects(() => callLiteLLM("s", "u"), /LITELLM_BASE and LITELLM_API_KEY must be set/);
});
