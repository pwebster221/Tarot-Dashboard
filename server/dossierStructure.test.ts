import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import {
  aceSigns, courtRelations, decanName, decanOfPip, dna, dodecs, elementOf, eternal, homeOf,
  majorRegister, pageSigns, pipName, presiding, seatDecans, seatOf, sentence, signOf, SENIOR_COURTS,
  SIGNS, traveler, walk, wholeDecanHouse, wholeSignHouse,
} from "./dossierStructure.ts";

const ALL = Array.from({ length: 36 }, (_, d) => d);
const CANCER_II = decanOfPip("Three of Chalices")!;
const GEMINI = SIGNS.indexOf("Gemini");
const GEMINI_II = 7;

test("the decan formulas reproduce the 36-decan register", () => {
  const rows = fs.readFileSync(new URL("./__fixtures__/decans.csv", import.meta.url), "utf8")
    .trim().split("\n").slice(1).map((r) => r.split(","));
  assert.equal(rows.length, 36);
  rows.forEach((r, d) => {
    assert.equal(decanName(d), r[0].split(" (")[0]);
    assert.equal(traveler(d), r[1].split(" ")[0], `${r[0]} traveler`);
    assert.equal(eternal(d), r[2].split(" ")[0], `${r[0]} eternal`);
    assert.equal(presiding(d), r[3].split(" ")[0], `${r[0]} presiding`);
  });
});

test("Cancer II is the Three of Chalices", () => {
  assert.equal(decanName(CANCER_II), "Cancer II");
  assert.equal(new Set(ALL.map(pipName)).size, 36);
});

test("worked DNA: Three of Chalices", () => {
  assert.deepEqual(dna(CANCER_II), ["Three of Chalices", "Ace of Chalices", "Page of Wands",
    "Queen of Chalices", "The Chariot", "The Tower", "The Fool"]);
});

test("the six non-pip DNA cards are unique across the 36", () => {
  assert.equal(new Set(ALL.map((d) => dna(d).slice(1).join("|"))).size, 36);
});

test("worked sentence: Three of Chalices from a Gemini rising", () => {
  const home = homeOf(wholeSignHouse(CANCER_II, GEMINI));
  assert.deepEqual(home, { house: 2, mind: "Inanna" });
  assert.equal(sentence(CANCER_II, home).text,
    "Artemis prays at the shrine of Ereshkigal in the temple of Isis, as relayed by Inanna");
});

test("the sentence's ordered trio is unique for all 36, and every mind travels and is visited", () => {
  const trios = ALL.map((d) => sentence(d));
  assert.equal(new Set(trios.map((t) => `${t.traveler}|${t.shrine}|${t.temple}`)).size, 36);
  assert.equal(new Set(trios.map((t) => t.traveler)).size, 12);
  assert.equal(new Set(trios.map((t) => t.shrine)).size, 12);
});

test("Home: the silhouette shows in the 8th, 11th and 12th, and Aries is Hecate from Gemini", () => {
  assert.deepEqual(homeOf(wholeSignHouse(0, GEMINI)), { house: 11, mind: "Hecate", silhouette: "Uranus" });
  assert.equal(homeOf(8).silhouette, "Pluto");
  assert.equal(homeOf(12).silhouette, "Neptune");
  assert.equal(homeOf(2).silhouette, undefined);
});

test("whole-sign and whole-decan Home differ on each sign's first decan, 12 of 36", () => {
  const differ = ALL.filter((d) => wholeSignHouse(d, GEMINI) !== wholeDecanHouse(d, GEMINI_II));
  assert.equal(differ.length, 12);
  assert.ok(differ.every((d) => d % 3 === 0));
});

test("worked dodecs: the shrine in Cancer II, and every shrine holds all four elements", () => {
  assert.deepEqual(dodecs(CANCER_II).map((x) => x.sign), ["Scorpio", "Sagittarius", "Capricorn", "Aquarius"]);
  for (const d of ALL) {
    const set = dodecs(d);
    assert.equal(new Set(set.map((x) => x.element)).size, 4);
    const own = set.find((x) => x.element === elementOf(signOf(d)))!;
    assert.equal(own.lord, eternal(d), `${decanName(d)}: the own-element dodec's lord is the shrine's`);
  }
});

test("worked walk: heart, Stage I, the being step, landing on the 3 of Pentacles", () => {
  assert.deepEqual(walk(CANCER_II), {
    stage: "Stage I, becoming", floorQuality: "Capricorn, Earth cold", center: "heart", step: "being",
    trio: ["Two of Chalices", "Three of Chalices", "Four of Chalices"],
    leaves: "Two of Pentacles", reaches: "Three of Pentacles",
  });
});

test("the walk keeps Pentacles as landings, and the last Swords trio lands on the Ten", () => {
  const landing = walk(decanOfPip("Six of Pentacles")!);
  assert.equal(landing.center, undefined);
  assert.equal(landing.reaches, "Six of Pentacles");
  assert.equal(landing.stage, "Stage II, being");
  assert.equal(walk(decanOfPip("Two of Wands")!).leaves, undefined);
  assert.equal(walk(decanOfPip("Ten of Swords")!).reaches, "Ten of Pentacles");
  assert.equal(walk(decanOfPip("Ten of Swords")!).step, "returning");
});

test("court seats: the Queen of Chalices spans Gemini III to Cancer II", () => {
  const seat = SENIOR_COURTS.indexOf("Queen of Chalices");
  assert.deepEqual(seatDecans(seat).map(pipName), ["Ten of Swords", "Two of Chalices", "Three of Chalices"]);
  assert.equal(seatOf(CANCER_II), seat);
  assert.deepEqual(seatDecans(0).map(decanName), ["Pisces III", "Aries I", "Aries II"]);
  for (const d of ALL) assert.ok(seatDecans(seatOf(d)).includes(d));
});

test("Aces read cardinal, fixed, mutable; Pages read in sign order", () => {
  assert.deepEqual(aceSigns("Chalices").map((s) => SIGNS[s]), ["Cancer", "Scorpio", "Pisces"]);
  assert.deepEqual(aceSigns("Pentacles").map((s) => SIGNS[s]), ["Capricorn", "Taurus", "Virgo"]);
  assert.deepEqual(pageSigns("Wands").map((s) => SIGNS[s]), ["Cancer", "Leo", "Virgo"]);
  assert.deepEqual(pageSigns("Swords").map((s) => SIGNS[s]), ["Capricorn", "Aquarius", "Pisces"]);
});

test("each senior court sees exactly 7 of 11 peers, by the Codex's relations", () => {
  SENIOR_COURTS.forEach((court, seat) => {
    const peers = courtRelations(seat);
    assert.equal(new Set(peers.map((p) => p.peer)).size, 7, court);
    assert.ok(!peers.some((p) => p.peer === court));
  });
  const queen = courtRelations(SENIOR_COURTS.indexOf("Queen of Chalices"));
  assert.equal(queen.find((p) => p.kind === "complements")!.peer, "Queen of Pentacles");
});

test("The Tower's committee is the six Mars decans", () => {
  const r = majorRegister("The Tower")!;
  assert.deepEqual(r.decans.map(decanName),
    ["Aries I", "Cancer II", "Leo III", "Scorpio I", "Sagittarius II", "Pisces III"]);
});

test("every Major has a register, and committee sizes follow the Codex", () => {
  assert.equal(majorRegister("The Chariot")!.decans.length, 3);
  assert.equal(majorRegister("The Sun")!.decans.length, 3);
  assert.equal(majorRegister("The Empress")!.decans.length, 6);
  const fool = majorRegister("The Fool")!;
  assert.equal(fool.decans.length, 12);
  assert.ok(fool.decans.includes(CANCER_II), "Cancer II is cardinal, so the Fool holds it");
  assert.deepEqual(fool.byLord, ["Fire by Mars", "Earth by Saturn", "Air by Venus", "Water by Moon"]);
  assert.equal(majorRegister("Ace of Wands"), null);
});
