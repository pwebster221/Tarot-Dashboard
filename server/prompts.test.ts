import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDeepPrompt, buildOraclePrompt, buildTrendPrompt, isAtomicSpread, oracleSky, readingMoment } from "./prompts.ts";
import { buildDossier, type RisingPoint } from "./dossier.ts";

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

test("buildOraclePrompt and buildTrendPrompt inject astro context", () => {
  assert.match(buildOraclePrompt(reading, ASTRO).user, /TODAY'S SKY/);
  assert.match(buildTrendPrompt([reading], ASTRO).user, /TODAY'S SKY/);
});

test("buildOraclePrompt injects per-card graph meanings + specific-in-spread", () => {
  const u = buildOraclePrompt(reading, ASTRO, "", "", { "The Star": "STAR-DECAN-MEANING" }).user;
  assert.match(u, /STAR-DECAN-MEANING/);
  assert.match(u, /In this spread: renewal/); // card.specificMeaning
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

const drawn = (name: string, extra: any = {}) => ({
  position: { name: "Heart", description: "the emotional core" },
  card: { name, generalMeaning: "OLD-MEANING" }, isReversed: false, specificMeaning: "", ...extra,
});
const GEMINI: RisingPoint = { sign: 2, decan: 7 };

test("each arcana gets its own charge over its own ranks", () => {
  const prompt = (name: string) =>
    buildDeepPrompt(drawn(name), reading, buildDossier(name, GEMINI));
  assert.match(prompt("Three of Chalices").system, /This is a Minor/);
  assert.match(prompt("Queen of Chalices").system, /This is a Majestic/);
  assert.match(prompt("The Tower").system, /This is a Major/);
  assert.match(prompt("Three of Chalices").user, /\[Rank 1\] The sentence/);
  assert.match(prompt("Queen of Chalices").user, /\[Rank 1\] Wheel role/);
  assert.match(prompt("The Tower").user, /\[Rank 1\] Committee/);
});

test("the deep prompt forbids the chart and carries none", () => {
  const { system, user } = buildDeepPrompt(drawn("The Tower"), reading, buildDossier("The Tower"));
  assert.match(system, /does not consult the querent's natal chart or the current sky/);
  assert.doesNotMatch(system, /Use the provided natal chart/);
  assert.doesNotMatch(user, /Astrological Context|TODAY'S SKY|NATAL CHART/);
});

test("the Minor charge keeps cognitive functions out", () => {
  assert.match(buildDeepPrompt(drawn("Three of Chalices"), reading, buildDossier("Three of Chalices")).system,
    /Cognitive functions belong to the Majestic/);
});

test("traditional meaning comes after the dossier's derived ranks in the prompt", () => {
  const dossier = buildDossier("The Tower", undefined, { composition: "COMPOSED", traditional: "OLD-MEANING" });
  const { user } = buildDeepPrompt(drawn("The Tower"), reading, dossier);
  assert.ok(user.indexOf("Committee") < user.indexOf("COMPOSED"));
  assert.ok(user.indexOf("COMPOSED") < user.indexOf("OLD-MEANING"));
});

test("persona stays additive and the Mani section appears only when present", () => {
  const dossier = buildDossier("The Tower");
  const withKit = buildDeepPrompt(drawn("The Tower"), reading, dossier, { persona: "PERSONA-TEXT", mani: "MANI-STACK" });
  assert.match(withKit.system, /This is a Major[\s\S]*PERSONA-TEXT/);
  assert.match(withKit.user, /Mani Cognitive Perspective/);
  assert.doesNotMatch(buildDeepPrompt(drawn("The Tower"), reading, dossier).user, /Mani Cognitive Perspective/);
});

test("the reader's position note reaches the prompt", () => {
  const dossier = buildDossier("The Tower");
  assert.match(buildDeepPrompt(drawn("The Tower", { specificMeaning: "renewal" }), reading, dossier).user, /renewal/);
});

test("a card outside the 78 still reads, with no arcana charge", () => {
  const { system, user } = buildDeepPrompt(drawn("The Cartographer"), reading, null);
  assert.doesNotMatch(system, /This is a (Minor|Majestic|Major)/);
  assert.match(user, /OLD-MEANING/);
});

const gateCard = { card: { name: "Three of Chalices", generalMeaning: "TRAD" }, position: { name: "P", description: "D" }, isReversed: false };
const gateReading = { querent: "Q", question: "Why?" };

test("gate: the opening carries ranks 1 to 3 and nothing lower", () => {
  const d = buildDossier("Three of Chalices", undefined, { traditional: "TRAD-TEXT" })!;
  const { gate } = buildDeepPrompt(gateCard, gateReading, d);
  assert.match(gate!.opening, /\[Rank 3\]/);
  assert.doesNotMatch(gate!.opening, /\[Rank 4\]/);
  assert.doesNotMatch(gate!.opening, /TRAD-TEXT/);
});

test("gate: the remainder carries the lower ranks, the company and the ask", () => {
  const d = buildDossier("Three of Chalices", undefined, { traditional: "TRAD-TEXT" })!;
  const { gate } = buildDeepPrompt(gateCard, gateReading, d, { company: "COMPANY-BLOCK" });
  assert.match(gate!.remainder, /\[Rank 4\]/);
  assert.match(gate!.remainder, /TRAD-TEXT/);
  assert.match(gate!.remainder, /COMPANY-BLOCK/);
  assert.match(gate!.remainder, /at least one call/);
  assert.doesNotMatch(gate!.remainder, /\[Rank 3\]/);
});

test("gate: the ungated prompt still holds the whole dossier and the company", () => {
  const d = buildDossier("Three of Chalices")!;
  const { user } = buildDeepPrompt(gateCard, gateReading, d, { company: "COMPANY-BLOCK" });
  assert.match(user, /\[Rank 1\]/);
  assert.match(user, /\[Rank 4\]/);
  assert.match(user, /COMPANY-BLOCK/);
});

test("the Oracle with no chart gets no astrology section and is told not to bring one", () => {
  const p = buildOraclePrompt(reading, "");
  assert.doesNotMatch(p.user, /Astrological Context/);
  assert.match(p.system, /Do not bring in the querent's natal chart/);
});

test("only the Seven Card New Moon Planetary Spread keeps the chart for the Oracle", () => {
  const seven = Array(7).fill({});
  assert.equal(isAtomicSpread({ type: "seven_card_new_moon_planetary_spread", drawnCards: seven }), true);
  assert.equal(isAtomicSpread({ type: "seven_card_new_moon_planetary_spread", drawnCards: [{}] }), false);
  // The other seven-card spread, and a name that merely says "atomic", do not qualify.
  assert.equal(isAtomicSpread({ type: "progression_cycle", drawnCards: seven }), false);
  assert.equal(isAtomicSpread({ type: "Atomic Seven", drawnCards: seven }), false);
});

test("the Oracle's system prompt does not say whose sky the transits are", () => {
  // The trend Oracle shares it and gets today's sky; the block's own label says which sky it is.
  const t = buildTrendPrompt([], "TODAY'S SKY", "");
  assert.doesNotMatch(t.system, /for the reading|daily transits/);
  assert.match(t.system, /labelled with the moment/);
});

test("an undated atomic reading gets a stated gap, never today's sky", () => {
  const seven = Array(7).fill({});
  const atomic = { type: "seven_card_new_moon_planetary_spread", drawnCards: seven };
  assert.deepEqual(oracleSky({ ...atomic, date: "2026-10-21" }), { kind: "at", at: "2026-10-21T12:00:00.000Z" });
  const gap = oracleSky({ ...atomic, date: "21/10/2026" });
  assert.equal(gap.kind, "undated");
  assert.match((gap as any).note, /Do not substitute today's sky/);
  assert.deepEqual(oracleSky({ type: "three_card", drawnCards: [{}, {}, {}], date: "2026-10-21" }), { kind: "none" });
});

test("the reading's own moment sets the sky, not today", () => {
  assert.equal(readingMoment({ date: "2026-10-21T23:15:00.000Z" }), "2026-10-21T23:15:00.000Z");
  assert.equal(readingMoment({ date: "2026-10-21" }), "2026-10-21T12:00:00.000Z");
  // A timestamp with no zone is read as UTC, whatever zone the server runs in.
  assert.equal(readingMoment({ date: "2026-10-21T18:30:00" }), "2026-10-21T18:30:00.000Z");
  assert.equal(readingMoment({ date: "2026-10-21 18:30:00" }), "2026-10-21T18:30:00.000Z");
  assert.equal(readingMoment({ date: "not a date" }), undefined);
  assert.equal(readingMoment({}), undefined);
});

test("a card outside the 78 is not labeled with an arcana", () => {
  const custom = { card: { name: "The Gardener", generalMeaning: "TRAD" }, position: { name: "P", description: "D" }, isReversed: false };
  const p = buildDeepPrompt(custom, gateReading, null);
  assert.match(p.user, /\*\*Card:\*\* The Gardener\n/);
  assert.doesNotMatch(p.user, /\(Minor\)/);
  assert.equal(p.gate, undefined);
});
