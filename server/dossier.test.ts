import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDossier, canonicalCardName, renderDossier, type Dossier } from "./dossier.ts";
import { pipName, SENIOR_COURTS } from "./dossierStructure.ts";
import fs from "fs";

const GEMINI = { sign: 2, decan: 7 };
const FULL = { composition: "COMPOSED", correspondences: "GRAPHCTX", traditional: "OLD-MEANING" };
const deck: string[] = JSON.parse(fs.readFileSync(new URL("./dossierData.json", import.meta.url), "utf8"))
  .cards.map((c: any) => c.name);
const titles = (d: Dossier) => d.sections.map((s) => s.title);
const section = (d: Dossier, title: string) => d.sections.find((s) => s.title === title)!.lines.join("\n");

test("every card in the deck builds, in its arcana's numbers", () => {
  const built = deck.map((n) => buildDossier(n, GEMINI, FULL)!);
  const count = (a: string) => built.filter((d) => d.arcana === a).length;
  assert.deepEqual([count("Minor"), count("Majestic"), count("Major")], [36, 20, 22]);
});

test("ranks ascend and traditional meaning is last, for all 78", () => {
  for (const name of deck) {
    const d = buildDossier(name, GEMINI, FULL)!;
    d.sections.forEach((s, i) => { if (i) assert.ok(s.rank > d.sections[i - 1].rank, name); });
    assert.equal(d.sections.at(-1)!.title, "Traditional meaning", name);
    assert.deepEqual(titles(d).slice(-3), ["Composition", "Correspondences", "Traditional meaning"], name);
  }
});

test("a source the card lacks is left out, not filled", () => {
  const d = buildDossier("The Tower")!;
  assert.ok(!titles(d).includes("Traditional meaning"));
  assert.ok(!titles(d).includes("Composition"));
  assert.equal(buildDossier("Queen of Chalices")!.sections.at(-1)!.title, "Relations");
});

test("the app's Cups names resolve to canon's Chalices", () => {
  assert.equal(canonicalCardName("Three of Cups"), "Three of Chalices");
  assert.equal(buildDossier("Three of Cups")!.card, "Three of Chalices");
  assert.equal(buildDossier("Ace of Cups")!.arcana, "Majestic");
  assert.equal(buildDossier("Page of Cups")!.arcana, "Majestic");
});

test("a name outside the 78 has no dossier", () => {
  assert.equal(buildDossier("The Cartographer"), null);
  assert.equal(buildDossier(""), null);
});

test("worked Minor: Three of Chalices", () => {
  const d = buildDossier("Three of Chalices", GEMINI, FULL)!;
  assert.deepEqual(titles(d).slice(0, 5),
    ["The sentence", "Seven-card DNA", "Pip Walk", "Dodecatemoria", "Wheel and court story"]);
  assert.match(section(d, "The sentence"), /Artemis prays at the shrine of Ereshkigal in the temple of Isis, as relayed by Inanna/);
  assert.match(section(d, "Seven-card DNA"), /Three of Chalices, Ace of Chalices, Page of Wands, Queen of Chalices, The Chariot, The Tower, The Fool/);
  assert.match(section(d, "Pip Walk"), /Stage I, becoming.*heart.*being step/);
  assert.match(section(d, "Pip Walk"), /reaches the Three of Pentacles/);
  assert.match(section(d, "Dodecatemoria"), /Scorpio \(fixed water\), Sagittarius \(mutable fire\), Capricorn \(cardinal earth\), Aquarius \(fixed air\)/);
  assert.match(section(d, "Wheel and court story"), /Season: summer/);
  assert.match(section(d, "Wheel and court story"), /Queen of Chalices, whose story runs Ten of Swords, Two of Chalices, Three of Chalices\. This pip is its Result/);
  assert.deepEqual(d.house, { wholeSign: 2, wholeDecan: 2 });
});

test("a Minor keeps both Home values and shows only whole sign", () => {
  const d = buildDossier("Two of Wands", { sign: 2, decan: 7 })!;
  assert.deepEqual(d.house, { wholeSign: 11, wholeDecan: 10 });
  assert.match(section(d, "The sentence"), /house 11/);
  assert.doesNotMatch(section(d, "The sentence"), /house 10/);
  assert.match(section(d, "The sentence"), /Uranus stands as the modern silhouette/);
  assert.match(section(d, "The sentence"), /the Temple of Mars, and from this querent's chart, of Hecate/);
});

test("the lights keep their article in the temple's name", () => {
  assert.match(section(buildDossier("Three of Chalices", GEMINI)!, "The sentence"), /the Temple of the Moon/);
  assert.match(section(buildDossier("Five of Wands", GEMINI)!, "The sentence"), /the Temple of the Sun/);
});

test("with no rising, a Minor still reads, without a Home", () => {
  const d = buildDossier("Three of Chalices")!;
  assert.doesNotMatch(section(d, "The sentence"), /relayed|Home/);
  assert.equal(d.house, undefined);
});

test("no Minor carries a cognitive function or MBTI type", () => {
  for (let d = 0; d < 36; d++) {
    const text = renderDossier(buildDossier(pipName(d), GEMINI)!);
    assert.doesNotMatch(text, /\b(Fi|Fe|Ti|Te|Si|Se|Ni|Ne)\b|\b[IE][NS][FT][JP]\b/, pipName(d));
  }
});

test("worked Majestic: Queen of Chalices", () => {
  const d = buildDossier("Queen of Chalices")!;
  assert.deepEqual(titles(d), ["Wheel role", "Cognition", "Decans", "Relations"]);
  assert.match(section(d, "Wheel role"), /Opens summer at Midsummer/);
  assert.match(section(d, "Wheel role"), /Part 5, Cancer: forgives the King of Swords with the Ace of Chalices\. The Grail/);
  assert.match(section(d, "Wheel role"), /Voice \(Queen of Chalices: the solstice\)/);
  assert.match(section(d, "Cognition"), /ISFP: Fi Se Ni Te/);
  assert.match(section(d, "Decans"), /Operator: Gemini III \(Ten of Swords\)[\s\S]*Substance: Cancer I \(Two of Chalices\)[\s\S]*Result: Cancer II \(Three of Chalices\)/);
});

test("wheel law: Knights, Kings and Pages read as ESO-369 tabulates them", () => {
  assert.match(section(buildDossier("Knight of Pentacles")!, "Wheel role"), /Kinged at Beltane into the King of Swords/);
  assert.match(section(buildDossier("Knight of Wands")!, "Wheel role"), /Kinged at the Lion's Gate into the King of Pentacles/);
  assert.match(section(buildDossier("Knight of Chalices")!, "Wheel role"), /Kinged at Samhain into the King of Wands/);
  assert.match(section(buildDossier("Knight of Swords")!, "Wheel role"), /Kinged at Candlemas into the King of Chalices/);
  const swords = section(buildDossier("King of Swords")!, "Wheel role");
  assert.match(swords, /Kinged at Beltane from the Knight of Pentacles/);
  assert.match(swords, /Fathers at Midsummer and dies at the Lion's Gate/);
  const pents = section(buildDossier("King of Pentacles")!, "Wheel role");
  assert.match(pents, /Kinged at the Lion's Gate from the Knight of Wands/);
  assert.match(pents, /Takes up the Ace of Wands as Reaper/);
  assert.match(pents, /Fathers at Mabon and dies at Samhain/);
  const page = section(buildDossier("Page of Wands")!, "Wheel role");
  assert.match(page, /sacrificed at the Lion's Gate into the Ace of Wands/);
  assert.match(page, /the Ace of Swords as Birther; reborn as the Page of Chalices/);
});

test("Aces carry both forms and nine decans over cardinal, fixed, mutable", () => {
  const d = buildDossier("Ace of Chalices")!;
  assert.deepEqual(titles(d), ["Wheel role", "Cognition", "Decans"]);
  assert.match(section(d, "Wheel role"), /whole as an object in the Minor/);
  assert.match(section(d, "Wheel role"), /as Reaper/);
  assert.match(section(d, "Wheel role"), /as Birther/);
  assert.match(section(d, "Wheel role"), /taken up at Samhain by the King of Wands/);
  assert.match(section(d, "Decans"), /Operator: Cancer[\s\S]*Substance: Scorpio[\s\S]*Result: Pisces/);
});

test("Pages read their season's signs in order", () => {
  assert.match(section(buildDossier("Page of Wands")!, "Decans"), /Operator: Cancer[\s\S]*Substance: Leo[\s\S]*Result: Virgo/);
});

test("no Majestic dossier says Lammas where canon says the Lion's Gate", () => {
  for (const name of deck) assert.doesNotMatch(renderDossier(buildDossier(name)!), /Lammas|Lughnasadh/, name);
});

test("senior courts see 7 peers; Aces and Pages have no relations section", () => {
  for (const c of SENIOR_COURTS) {
    assert.equal(buildDossier(c)!.sections.find((s) => s.title === "Relations")!.lines.length, 7, c);
  }
  assert.ok(!titles(buildDossier("Page of Swords")!).includes("Relations"));
});

test("worked Major: The Tower", () => {
  const d = buildDossier("The Tower")!;
  assert.deepEqual(titles(d), ["Committee", "Two layers", "Grammar and Tree", "Register role"]);
  assert.match(section(d, "Committee"), /6 decans: Aries I \(Two of Wands\), Cancer II \(Three of Chalices\)/);
  assert.match(section(d, "Two layers"), /lands on itself: a self-portrait/);
  assert.match(section(d, "Two layers"), /between the Devil and the Star/);
  assert.match(section(d, "Grammar and Tree"), /16, Square of Four/);
  assert.match(section(d, "Grammar and Tree"), /5 \+ 11/);
  assert.match(section(d, "Grammar and Tree"), /Grid seat: Da'ath/);
  assert.match(section(d, "Register role"), /Planet Major of Mars/);
});

test("layer two follows the Codex's arrows", () => {
  assert.match(section(buildDossier("The Chariot")!, "Two layers"), /a perspective on Strength/);
  assert.match(section(buildDossier("Strength")!, "Two layers"), /a perspective on The Chariot/);
  assert.match(section(buildDossier("The Lovers")!, "Two layers"), /a perspective on The Devil, one way, by rotation/);
  assert.match(section(buildDossier("The Devil")!, "Two layers"), /The Lovers also reads this card/);
  assert.match(section(buildDossier("The Star")!, "Two layers"), /The Hermit also reads this card/);
  assert.match(section(buildDossier("The World")!, "Two layers"), /The Magician also reads this card/);
  assert.match(section(buildDossier("The Fool")!, "Two layers"), /reads for itself only/);
  assert.match(section(buildDossier("The Fool")!, "Register role"), /Modal Lord of the Cardinal mode \(Uranus\)[\s\S]*Fire by Mars/);
});

test("a dossier carries nothing from the chart but Home", () => {
  for (const name of deck) {
    assert.doesNotMatch(renderDossier(buildDossier(name, GEMINI)!), /\b(natal|transit|retrograde|Ascendant)\b/i, name);
  }
});
