import { test } from "node:test";
import assert from "node:assert/strict";
import { reporeasonReady } from "./reporeason.ts";

test("reporeasonReady is false before init", () => {
  assert.equal(reporeasonReady(), false);
});
