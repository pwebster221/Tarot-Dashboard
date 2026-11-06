import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  ALLOWED_REASON_TOOLS, REASONING_HINT, _setConnector, ensureReporeason, reporeasonReady,
  reporeasonRunner, reporeasonTools,
} from "./reporeason.ts";

const V3 = ["reason_explore", "reason_exploration", "reason_verify", "reason_identify_symbols"];
const named = (names: string[]) => names.map((name) => ({ name, inputSchema: {} }));

beforeEach(() => {
  _setConnector(null);
  delete process.env.ENABLE_REPOREASON;
});

test("reporeasonReady is false before init", () => {
  assert.equal(reporeasonReady(), false);
});

test("the allow-list is the v3 surface: nothing retired, nothing missing", () => {
  assert.deepEqual([...ALLOWED_REASON_TOOLS].sort(), [...V3].sort());
});

test("the hint names only tools that exist and keeps the frame out of the reading", () => {
  assert.doesNotMatch(REASONING_HINT, /reason_(get_correspondence|get_elemental_balance|orient|traverse|synthesize)/);
  for (const name of V3) assert.match(REASONING_HINT, new RegExp(name));
  assert.match(REASONING_HINT, /never (name|mention)/i);
});

test("ensureReporeason picks up the server's current tools on a live session", async () => {
  process.env.ENABLE_REPOREASON = "true";
  let tools = ["reason_orient"];
  _setConnector(async () => ({
    listTools: async () => ({ tools: named(tools) }),
    callTool: async () => ({ content: [] }),
  }));
  await ensureReporeason();
  assert.deepEqual(reporeasonTools().map((t) => t.name), ["reason_orient"]);
  tools = V3;
  await ensureReporeason();
  assert.deepEqual(reporeasonTools().map((t) => t.name), V3);
});

test("a session killed by a redeploy reconnects, for tool listing and for calls", async () => {
  process.env.ENABLE_REPOREASON = "true";
  let connects = 0;
  const dead = {
    listTools: async () => { throw new Error("Session not found"); },
    callTool: async () => { throw new Error("Session not found"); },
  };
  const live = {
    listTools: async () => ({ tools: named(V3) }),
    callTool: async () => ({ content: [{ type: "text", text: "FRAME" }] }),
  };
  _setConnector(async () => (++connects === 1 ? { ...dead, listTools: live.listTools } : live));
  await ensureReporeason();                   // first connect: lists, then the session dies
  assert.equal(await reporeasonRunner().run("reason_exploration", { exploration_id: "exp:1" }), "FRAME");
  assert.equal(connects, 2);

  let alive = true;
  const dying = { ...live, listTools: async () => { if (alive) return { tools: named(V3) }; throw new Error("Session not found"); } };
  _setConnector(async () => (++connects === 3 ? dying : live));
  await ensureReporeason();                   // session up
  alive = false;
  await ensureReporeason();                   // listing fails on it: reconnect
  assert.equal(connects, 4);
  assert.equal(reporeasonReady(), true);
  assert.deepEqual(reporeasonTools().map((t) => t.name), V3);
});

for (const tool of ["reason_explore", "reason_verify"]) {
  test(`a lost response never replays ${tool}, which writes, but still reconnects`, async () => {
    process.env.ENABLE_REPOREASON = "true";
    let connects = 0, sends = 0;
    const lost = {
      listTools: async () => ({ tools: named(V3) }),
      callTool: async () => { sends++; throw new Error("socket hang up"); },
    };
    const live = { ...lost, callTool: async () => { sends++; return { content: [{ type: "text", text: "OK" }] }; } };
    _setConnector(async () => (++connects === 1 ? lost : live));
    await ensureReporeason();
    await assert.rejects(() => reporeasonRunner().run(tool, {}), /socket hang up/);
    assert.equal(sends, 1);                    // the possibly-landed write is not repeated
    assert.equal(connects, 2);
    assert.equal(await reporeasonRunner().run(tool, {}), "OK");  // the next call has a session
  });
}

test("the hint says how to verify a claim that joins two symbols", () => {
  assert.match(REASONING_HINT, /compound/);
  assert.match(REASONING_HINT, /cmp:/);
});

test("a connection lost at startup recovers on a later request", async () => {
  process.env.ENABLE_REPOREASON = "true";
  let up = false;
  _setConnector(async () => {
    if (!up) throw new Error("ECONNREFUSED");
    return { listTools: async () => ({ tools: named(V3) }), callTool: async () => ({ content: [] }) };
  });
  await ensureReporeason();
  assert.equal(reporeasonReady(), false);
  up = true;
  await ensureReporeason();
  assert.equal(reporeasonReady(), true);
});

test("an MCP tool error reaches the agent as a failure, not as data", async () => {
  process.env.ENABLE_REPOREASON = "true";
  _setConnector(async () => ({
    listTools: async () => ({ tools: named(V3) }),
    callTool: async () => ({ isError: true, content: [{ type: "text", text: "Unknown tool" }] }),
  }));
  await ensureReporeason();
  await assert.rejects(() => reporeasonRunner().run("reason_orient", {}), /Unknown tool/);
});

test("ensureReporeason does nothing when the flag is off", async () => {
  let connects = 0;
  _setConnector(async () => { connects++; throw new Error("no"); });
  await ensureReporeason();
  assert.equal(connects, 0);
});
