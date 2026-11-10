// server/dossier.ts — one ranked dossier per card, built in code, with a builder per arcana.
// A section's rank is its authority: the prompts keep this order, traditional meaning is
// always last, and a source the card lacks is left out rather than filled.
import fs from "fs";
import {
  aceSigns, courtRelations, decanName, decanOfPip, dna, dodecs, eternal, homeOf,
  majorRegister, pageSigns, pipName, presiding, SEASONS, seasonOf, seatDecans, seatOf, sentence,
  SENIOR_COURTS, signOf, SIGNS, STATIONS, traveler, walk, wholeDecanHouse, wholeSignHouse,
  type Home,
} from "./dossierStructure.ts";

/** Bump when a dossier's content or order changes: it keys the interpretation cache. */
export const DOSSIER_VERSION = "2026-11-10";

export type Arcana = "Minor" | "Majestic" | "Major";
export interface DossierSection { rank: number; title: string; source: string; lines: string[] }
export interface HouseValues { wholeSign: number; wholeDecan: number | null }
export interface Dossier {
  version: string; card: string; arcana: Arcana; sections: DossierSection[];
  /** Both Home counts are kept and one is shown, so the choice stays a setting. */
  house?: HouseValues;
}
/** The querent's rising point: all a card may know of the chart by default. */
export interface RisingPoint { sign: number; decan: number | null }
/** Text that arrives from outside the deck's structure. */
export interface DossierText { composition?: string; correspondences?: string; traditional?: string }

interface GraphCard {
  name: string; type: string; number: number; gridSeat: string | null; treePath: string | null;
  letter: string | null; mbti: string | null; stack: string[];
}
interface Voice { card: string; form: string; name: string; text: string }
interface NumberNode { value: number; name: string; title: string; description: string; factorization: string | null; status: string }
interface DossierData { cards: GraphCard[]; voices: Voice[]; numbers: NumberNode[] }

let _data: DossierData | null = null;
function data(): DossierData {
  return _data ||= JSON.parse(fs.readFileSync(new URL("./dossierData.json", import.meta.url), "utf8"));
}

const SUIT_ORDER = ["Wands", "Chalices", "Swords", "Pentacles"];           // tarot order, ESO-369
const SUIT_ELEMENT: Record<string, string> = { Wands: "fire", Chalices: "water", Swords: "air", Pentacles: "earth" };
const suitAt = (suit: string, step: number) => SUIT_ORDER[(SUIT_ORDER.indexOf(suit) + step + 4) % 4];
const seasonWhere = (key: "queen" | "father" | "children" | "scout", suit: string) =>
  SEASONS.find((s) => s[key] === suit)!;
const decanWithPip = (d: number) => `${decanName(d)} (${pipName(d)})`;

/** Paul's own readings of the pips under a seat (ESO-360, the Pip Overlay evidence). */
const SEAT_READINGS: Record<string, string> = {
  "King of Chalices": "the same stealing away from different perspectives, ending with the wish",
  "Knight of Swords": "the brother clutching what is left, the defeat on the darkest night, the crossing",
  "Queen of Chalices": "10 of Swords to the new dawn at the two",
  "Queen of Swords": "10 of Pentacles bounty, 2 of Swords held breath, 3 of Swords heartbreak, the sacrifice at Mabon",
  "Knight of Chalices": "vigil over the father, refusal, the sweet reunion of Samhain's stillness",
  "King of Wands": "the 8 of Wands, who must fly to the Queen",
};

/** The Majestic Symphony (ESO-369 §9a): twelve parts, one per sign from Pisces. */
const SYMPHONY: Record<string, string> = {
  "King of Chalices": "Part 1, Pisces: transmutes the Ace of Swords to the Queen of Swords. Charon.",
  "Queen of Wands": "Part 2, Aries: redeems the King of Chalices with the Ace of Wands. The Phoenix.",
  "Knight of Pentacles": "Part 3, Taurus: chases the Page of Pentacles to the Ace of Pentacles. Persephone.",
  "King of Swords": "Part 4, Gemini: transmutes the Ace of Pentacles to the Queen of Pentacles. Midas.",
  "Queen of Chalices": "Part 5, Cancer: forgives the King of Swords with the Ace of Chalices. The Grail.",
  "Knight of Wands": "Part 6, Leo: accompanies the Page of Wands to the Ace of Wands. Ishtar.",
  "King of Pentacles": "Part 7, Virgo: transmutes the Ace of Wands to the Queen of Wands. Ishtar's Husband.",
  "Queen of Swords": "Part 8, Libra: sacrifices the King of Pentacles with the Ace of Swords. The Athame.",
  "Knight of Chalices": "Part 9, Scorpio: drags the Page of Chalices to the Ace of Chalices. Ophelia.",
  "King of Wands": "Part 10, Sagittarius: transmutes the Ace of Chalices to the Queen of Chalices. Jack of the Lanterns.",
  "Queen of Pentacles": "Part 11, Capricorn: tempts the King of Wands with the Ace of Pentacles. The Apple.",
  "Knight of Swords": "Part 12, Aquarius: bears the Page of Swords to the Ace of Swords. Pandora.",
};

/** Layer two (Codex, The Atomic Structure): whom a Major is a perspective on, and how. */
const MUTUAL = [["The Chariot", "Strength"], ["The Emperor", "Death"], ["The Devil", "The Star"],
  ["The Hierophant", "The Moon"], ["Justice", "Temperance"], ["The High Priestess", "The Sun"],
  ["The Empress", "Wheel of Fortune"]];
const ROTATED: Record<string, string> = { "The Lovers": "The Devil", "The Hermit": "The Star", "The Magician": "The World" };
const SELF_PORTRAITS: Record<string, string> = {
  "The Tower": "Saturn's mirror, between the Devil and the Star: Devil, Tower, Star is Saturn looking at himself through Mars.",
  "The World": "The card that never looks away from itself.",
};
const SUMS: Record<string, string[]> = {
  "The Devil": ["Mercury's signs sum onto it: 6 + 9.", "The lights' signs sum onto it: 7 + 8."],
  "The Tower": ["Venus's signs sum onto it: 5 + 11."],
  "The Star": ["Mars's signs sum onto it: 4 + 13."],
};

/** Normalize a client name onto the deck's: the app says Cups, canon says Chalices. */
export function canonicalCardName(name: string): string {
  return (name || "").trim().replace(/\bCups\b/, "Chalices");
}

function textSections(start: number, text: DossierText): DossierSection[] {
  const out: DossierSection[] = [];
  const add = (title: string, source: string, body?: string) => {
    if (body && body.trim()) out.push({ rank: start + out.length, title, source, lines: [body.trim()] });
  };
  add("Composition", "Archetype node", text.composition);
  add("Correspondences", "Repository lookup by the client", text.correspondences);
  add("Traditional meaning", "traditional, the lowest-ranked source", text.traditional);
  return out;
}

function homeLines(d: number, home: Home): string[] {
  const lines = [`Home: house ${home.house}, relayed by ${home.mind}, the mind of that house's natural sign.`];
  if (home.silhouette) lines.push(`${home.silhouette} stands as the modern silhouette of this house.`);
  const lord = presiding(d);
  const temple = lord === "Sun" || lord === "Moon" ? `the ${lord}` : lord;
  lines.push(`Whose temple it is, the parallel view: the Temple of ${temple}, and from this querent's chart, of ${home.mind}.`);
  return lines;
}

function minor(card: string, d: number, rising: RisingPoint | undefined, text: DossierText): Dossier {
  const s = signOf(d);
  const house: HouseValues | undefined = rising && {
    wholeSign: wholeSignHouse(d, rising.sign),
    wholeDecan: rising.decan == null ? null : wholeDecanHouse(d, rising.decan),
  };
  const home = house ? homeOf(house.wholeSign) : undefined;
  const said = sentence(d, home);
  const w = walk(d);
  const shrine = dodecs(d);
  const seat = seatOf(d);
  const court = SENIOR_COURTS[seat];
  const span = seatDecans(seat);
  const season = seasonOf(d);
  const seatReading = SEAT_READINGS[court];
  const sections: DossierSection[] = [
    { rank: 1, title: "The sentence", source: "Canon Ledger, 2026-11-07", lines: [
      `${decanName(d)}: ${said.text}.`,
      `Traveler: ${traveler(d)}, as ${said.traveler}. Eternal: ${eternal(d)}, as ${said.shrine}. Presiding: ${presiding(d)}, as ${said.temple}.`,
      ...(home ? homeLines(d, home) : []),
    ] },
    { rank: 2, title: "Seven-card DNA", source: "Canon Ledger, 2026-11-07, computed from the decan", lines: [dna(d).join(", ")] },
    { rank: 3, title: "Pip Walk", source: "ESO-343 and the 2026-11-07 trio ruling; position only, no step or landing is named", lines: w.center
      ? [`${w.stage}, on ${w.floorQuality} floors. Center: ${w.center}, in the ${w.step} step of the trio ${w.trio!.join(", ")}.`,
        w.leaves ? `This trio leaves the ${w.leaves} and reaches the ${w.reaches}.` : `This trio is the walk's first, and reaches the ${w.reaches}.`]
      : [`A landing, not a center: the self, on the ${w.floorQuality} floor of ${w.stage}.`,
        w.leaves ? `The walk reaches this floor from the ${w.leaves}.` : "The walk's first floor."] },
    { rank: 4, title: "Dodecatemoria", source: "formula; the shrine's four energies, and the elemental signature of the twelve minds. No cognitive functions at the decan layer", lines: [
      `The shrine of ${said.shrine} is built from the energies of ${shrine.map((x) => `${x.sign} (${x.mode.toLowerCase()} ${x.element.toLowerCase()})`).join(", ")}.`,
    ] },
    { rank: 5, title: "Wheel and court story", source: "ESO-360 Pip Overlay; ESO-369", lines: [
      `Season: ${season.name}, under ${SIGNS[s]}.`,
      `The seat above this pip: ${court}, whose story runs ${span.map(pipName).join(", ")}. This pip is its ${STATIONS[span.indexOf(d)]}.`,
      ...(seatReading ? [`The reader's own line on this seat: ${seatReading}.`] : []),
    ] },
    ...textSections(6, text),
  ];
  return { version: DOSSIER_VERSION, card, arcana: "Minor", sections, ...(house ? { house } : {}) };
}

function wheelRole(rank: string, suit: string, card: string): string[] {
  if (rank === "Queen") {
    const own = seasonWhere("queen", suit);
    return [`Opens ${own.name} at ${own.quarter}, the mother, cardinal ${SUIT_ELEMENT[suit]}.`,
      `Bears the Page and Knight of ${own.children}, her predecessor sister's soul children, and spends the Ace of ${suit} as Birther.`,
      `Her seat passes by grief to the Queen of ${suitAt(suit, 1)}.`];
  }
  if (rank === "Knight") {
    const own = seasonWhere("children", suit);
    return [`Born at ${own.quarter} of the Queen of ${own.queen}, standing in ${own.fixedSign}.`,
      `Kinged at ${own.cross} into the King of ${suitAt(suit, -1)}, crowned in his father's bones.`];
  }
  if (rank === "King") {
    const kinged = seasonWhere("children", suitAt(suit, 1));
    const fathers = seasonWhere("father", suit);
    return [`Kinged at ${kinged.cross} from the Knight of ${kinged.children}; the mutable road is his, scouting ${kinged.name}.`,
      `Takes up the Ace of ${kinged.children} as Reaper, only her, and bears his sister to her mother.`,
      `Fathers at ${fathers.quarter} and dies at ${fathers.cross}, at his son's crowning.`];
  }
  if (rank === "Page") {
    const own = seasonWhere("children", suit);
    return [`Maiden: born at ${own.quarter} of the Queen of ${own.queen}, throned in ${own.fixedSign}.`,
      `Crone: sacrificed at ${own.cross} into the Ace of ${suit} as Reaper.`,
      `Mother: the Ace of ${suitAt(suit, 2)} as Birther; reborn as the Page of ${suitAt(suit, 1)}.`];
  }
  const reaper = seasonWhere("children", suit);
  const birther = seasonWhere("queen", suit);
  return [`${card} is whole as an object in the Minor and split as a function here.`,
    `Reaper: taken up at ${reaper.cross} by the King of ${suitAt(suit, -1)}. Birther: spent at ${birther.quarter} in the Queen of ${suit}'s hands.`];
}

function committee(signs: number[]): string[] {
  return signs.map((s, i) => `${STATIONS[i]}: ${SIGNS[s]}, ${[0, 1, 2].map((k) => pipName(s * 3 + k)).join(", ")}.`);
}

function majestic(card: string, rank: string, suit: string, graph: GraphCard, text: DossierText): Dossier {
  const seat = SENIOR_COURTS.indexOf(card);
  const voices = data().voices.filter((v) => v.card === card);
  const family = SENIOR_COURTS.filter((c) => c !== card && c.endsWith(`of ${suit}`));
  const seasonal = seat >= 0 ? SENIOR_COURTS.filter((c, i) => i !== seat && seasonOf(seatDecans(i)[1]) === seasonOf(seatDecans(seat)[1])) : [];
  const decans = seat >= 0
    ? seatDecans(seat).map((d, i) => `${STATIONS[i]}: ${decanWithPip(d)}.`)
    : committee(rank === "Ace" ? aceSigns(suit) : pageSigns(suit));
  const peers = seat >= 0 ? courtRelations(seat) : [];
  const sections: DossierSection[] = [
    { rank: 1, title: "Wheel role", source: "ESO-369, the Court Wheel; first-person voices from the graph", lines: [
      ...wheelRole(rank, suit, card),
      ...(SYMPHONY[card] ? [`Symphony. ${SYMPHONY[card]}`] : []),
      ...voices.map((v) => `Voice (${v.name}): ${v.text}`),
    ] },
    { rank: 2, title: "Cognition", source: "Repository graph, cited, never derived from the span", lines: [
      `${graph.mbti}: ${graph.stack.join(" ")}.`,
      ...(seasonal.length ? [`Seasonal family: ${seasonal.join(", ")}.`] : []),
      `Suit family: ${family.join(", ")}.`,
    ] },
    { rank: 3, title: "Decans", source: seat >= 0 ? "Decan span" : "Canon Ledger, 2026-11-07: nine decans, Operator, Substance and Result over three signs", lines: decans },
    ...(peers.length ? [{ rank: 4, title: "Relations", source: "Codex, The Decanate Register: sees 7 of 11 peers", lines: peers.map((p) => `${p.kind} ${p.peer}`) }] : []),
    ...textSections(5, text),
  ];
  return { version: DOSSIER_VERSION, card, arcana: "Majestic", sections };
}

function layerLines(card: string, n: number): string[] {
  const lines = ["Layer one: the card reads itself. Neither layer outranks the other."];
  const pair = MUTUAL.find((p) => p.includes(card));
  if (SELF_PORTRAITS[card]) lines.push(`Layer two lands on itself: a self-portrait. ${SELF_PORTRAITS[card]}`);
  else if (pair) lines.push(`Layer two: a perspective on ${pair[0] === card ? pair[1] : pair[0]}.`);
  else if (ROTATED[card]) lines.push(`Layer two: a perspective on ${ROTATED[card]}, one way, by rotation.`);
  else lines.push("A Modal Lord reads for itself only.");
  for (const [from, to] of Object.entries(ROTATED)) {
    if (to === card && from !== card) lines.push(`${from} also reads this card, one way, by rotation.`);
  }
  const mirror = data().cards.find((c) => c.type === "major" && c.number === 21 - n);
  if (mirror) lines.push(`Across the Majors' fold, ${n} mirrors ${21 - n}, ${mirror.name}.`);
  return lines;
}

function major(card: string, graph: GraphCard, text: DossierText): Dossier {
  const reg = majorRegister(card)!;
  const num = data().numbers.find((n) => n.value === graph.number);
  const members = reg.decans.map(decanWithPip).join(", ");
  const sections: DossierSection[] = [
    { rank: 1, title: "Committee", source: "Codex, The Atomic Structure: the decans that compose it", lines: [
      `${reg.decans.length} decans: ${members}.`,
    ] },
    { rank: 2, title: "Two layers", source: "Codex, The Atomic Structure", lines: layerLines(card, graph.number) },
    { rank: 3, title: "Grammar and Tree", source: "Repository graph; Generative Principle numbers carry their own status", lines: [
      ...(num ? [`${graph.number}, ${num.title}${num.factorization ? ` (${num.factorization})` : ""}; status ${num.status}: ${num.description}`] : []),
      ...(SUMS[card] || []),
      ...(graph.treePath ? [`Tree: ${graph.treePath}${graph.letter ? `, the letter ${graph.letter}` : ""}.`] : []),
      ...(graph.gridSeat ? [`Grid seat: ${graph.gridSeat}.`] : []),
    ] },
    { rank: 4, title: "Register role", source: "Codex, The Atomic Structure", lines: [
      reg.byLord ? `${reg.label}, holding its twelve decans by representative: ${reg.byLord.join(", ")}.` : `${reg.label}.`,
    ] },
    ...textSections(5, text),
  ];
  return { version: DOSSIER_VERSION, card, arcana: "Major", sections };
}

/** Build a card's dossier, or null for a name outside the 78. */
export function buildDossier(name: string, rising?: RisingPoint, text: DossierText = {}): Dossier | null {
  const card = canonicalCardName(name);
  const d = decanOfPip(card);
  if (d !== undefined) return minor(card, d, rising, text);
  const graph = data().cards.find((c) => c.name === card);
  if (!graph) return null;
  if (graph.type === "major") return major(card, graph, text);
  const [rank, suit] = card.split(" of ");
  return majestic(card, rank, suit, graph, text);
}

/** The decans a card owns, with the station each sits at where the card has stations. */
export interface CardDecan { decan: number; station?: string }
export function cardDecans(name: string): CardDecan[] | null {
  const card = canonicalCardName(name);
  const d = decanOfPip(card);
  if (d !== undefined) return [{ decan: d }];
  const graph = data().cards.find((c) => c.name === card);
  if (!graph) return null;
  if (graph.type === "major") return majorRegister(card)!.decans.map((decan) => ({ decan }));
  const seat = SENIOR_COURTS.indexOf(card);
  if (seat >= 0) return seatDecans(seat).map((decan, i) => ({ decan, station: STATIONS[i] }));
  const [rank, suit] = card.split(" of ");
  const signs = rank === "Ace" ? aceSigns(suit) : pageSigns(suit);
  return signs.flatMap((s, i) => [0, 1, 2].map((k) => ({ decan: s * 3 + k, station: STATIONS[i] })));
}

/** The ranked text a prompt carries. */
export function renderDossier(dossier: Dossier): string {
  return dossier.sections
    .map((s) => `[Rank ${s.rank}] ${s.title} (${s.source})\n${s.lines.map((l) => `- ${l}`).join("\n")}`)
    .join("\n\n");
}

