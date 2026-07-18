import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDeepPrompt, buildOraclePrompt, buildTrendPrompt } from "./prompts.ts";

const card = {
  position: { name: "Heart", description: "the emotional core" },
  card: { name: "The Star", suit: null, arcana: "Major", generalMeaning: "hope" },
  isReversed: false,
  specificMeaning: "renewal",
};
const reading = {
  querent: "Paul",
  question: "What now?",
  type: "Weekly",
  summary: "a turning point",
  drawnCards: [card],
};
const ASTRO = "NATAL CHART...\nTODAY'S SKY...";

test("buildDeepPrompt injects card, reading, graph + astro context", () => {
  const { system, user } = buildDeepPrompt(card, reading, "GRAPHCTX", ASTRO);
  assert.match(system, /Tarot Oracle/);
  assert.match(user, /The Star/);
  assert.match(user, /GRAPHCTX/);
  assert.match(user, /TODAY'S SKY/);
});

test("buildOraclePrompt and buildTrendPrompt inject astro context", () => {
  assert.match(buildOraclePrompt(reading, ASTRO).user, /TODAY'S SKY/);
  assert.match(buildTrendPrompt([reading], ASTRO).user, /TODAY'S SKY/);
});

test("buildDeepPrompt injects the Mani perspective when provided, omits it when empty", () => {
  const withMani = buildDeepPrompt(card, reading, "G", ASTRO, "MANI-STACK-DOC").user;
  assert.match(withMani, /Mani Cognitive Perspective/);
  assert.match(withMani, /MANI-STACK-DOC/);
  const without = buildDeepPrompt(card, reading, "G", ASTRO).user;
  assert.doesNotMatch(without, /Mani Cognitive Perspective/);
});

test("buildOraclePrompt and buildTrendPrompt inject the Mani perspective when provided", () => {
  assert.match(buildOraclePrompt(reading, ASTRO, "MANI-ORACLE").user, /MANI-ORACLE/);
  assert.match(buildTrendPrompt([reading], ASTRO, "MANI-TREND").user, /MANI-TREND/);
});

test("buildOraclePrompt and buildTrendPrompt inject the Spread Detail when provided", () => {
  const o = buildOraclePrompt(reading, ASTRO, "", "SPREAD-DETAIL-TEXT").user;
  assert.match(o, /Spread Detail/);
  assert.match(o, /SPREAD-DETAIL-TEXT/);
  assert.match(buildTrendPrompt([reading], ASTRO, "", "TREND-SPREAD-DETAIL").user, /TREND-SPREAD-DETAIL/);
});
