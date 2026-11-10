// server/dossierStructure.ts — the deck's derived structure, computed from the decan index.
// Pure: no graph, no chart. Decan d runs 0..35 from Aries I. Canon sources are the Canon
// Ledger rulings of 2026-11-07 (seven-card DNA, the minor's sentence in minds, the Aces and
// Pages stations, the Pip Walk trio steps) and the Linear ESO-343, ESO-360 and ESO-369.

export const SIGNS = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio",
  "Sagittarius", "Capricorn", "Aquarius", "Pisces"];
const ELEMENTS = ["Fire", "Earth", "Air", "Water"];
const MODES = ["Cardinal", "Fixed", "Mutable"];
const SUITS = ["Wands", "Pentacles", "Swords", "Chalices"];                // by element
const RANK_WORD = ["", "", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];
const ROMAN = ["I", "II", "III"];
const SIGN_LORD = ["Mars", "Venus", "Mercury", "Moon", "Sun", "Mercury", "Venus", "Mars",
  "Jupiter", "Saturn", "Saturn", "Jupiter"];
const CHALDEAN = ["Mars", "Sun", "Venus", "Mercury", "Moon", "Saturn", "Jupiter"];
/** Triplicity-ascent lords, by element, in cardinal, fixed, mutable order. */
const ASCENT: Record<string, string[]> = {
  Fire: ["Mars", "Sun", "Jupiter"], Earth: ["Saturn", "Venus", "Mercury"],
  Air: ["Venus", "Saturn", "Mercury"], Water: ["Moon", "Mars", "Jupiter"],
};
/** One mind per sign (kit of record: TwelveMinds/kit/minds.json). */
const SIGN_MIND = ["Mars Ultor", "Inanna", "Hermes", "Isis", "Helios", "Artemis", "Aphrodite",
  "Ereshkigal", "Jupiter Optimus Maximus", "Saturn Africanus", "Hecate", "Amun"];
/** A lord's day and night domiciles, as sign indices. */
const DOMICILES: Record<string, [number, number]> = {
  Mars: [0, 7], Venus: [6, 1], Mercury: [2, 5], Jupiter: [8, 11], Saturn: [10, 9],
  Sun: [4, 4], Moon: [3, 3],
};
const SILHOUETTE: Record<number, string> = { 8: "Pluto", 11: "Uranus", 12: "Neptune" };

export const SIGN_MAJORS = ["The Emperor", "The Hierophant", "The Lovers", "The Chariot",
  "Strength", "The Hermit", "Justice", "Death", "Temperance", "The Devil", "The Star", "The Moon"];
export const PLANET_MAJORS: Record<string, string> = {
  Mars: "The Tower", Sun: "The Sun", Venus: "The Empress", Mercury: "The Magician",
  Moon: "The High Priestess", Saturn: "The World", Jupiter: "Wheel of Fortune",
};
export const MODAL_LORDS = ["The Fool", "The Hanged Man", "Judgement"];    // by mode
const MODAL_PLANET = ["Uranus", "Neptune", "Pluto"];

/** The twelve senior-court seats on the ring; seat i spans decans 3i-1, 3i, 3i+1. */
export const SENIOR_COURTS = ["Queen of Wands", "Knight of Pentacles", "King of Swords",
  "Queen of Chalices", "Knight of Wands", "King of Pentacles", "Queen of Swords",
  "Knight of Chalices", "King of Wands", "Queen of Pentacles", "Knight of Swords",
  "King of Chalices"];
export const STATIONS = ["Operator", "Substance", "Result"];

/** The wheel's blocking (ESO-369 §1). A season is three signs from a cardinal. */
export interface Season {
  name: string; quarter: string; cross: string; queen: string; father: string; children: string;
  scout: string; fixedSign: string;
}
export const SEASONS: Season[] = [
  { name: "spring", quarter: "Ostara", cross: "Beltane", queen: "Wands", father: "Chalices",
    children: "Pentacles", scout: "Swords", fixedSign: "Taurus" },
  { name: "summer", quarter: "Midsummer", cross: "the Lion's Gate", queen: "Chalices",
    father: "Swords", children: "Wands", scout: "Pentacles", fixedSign: "Leo" },
  { name: "autumn", quarter: "Mabon", cross: "Samhain", queen: "Swords", father: "Pentacles",
    children: "Chalices", scout: "Wands", fixedSign: "Scorpio" },
  { name: "winter", quarter: "Midwinter", cross: "Candlemas", queen: "Pentacles", father: "Wands",
    children: "Swords", scout: "Chalices", fixedSign: "Aquarius" },
];

const mod = (n: number, m: number) => ((n % m) + m) % m;

export const signOf = (d: number) => Math.floor(d / 3);
export const elementOf = (sign: number) => ELEMENTS[sign % 4];
export const modeOf = (sign: number) => MODES[sign % 3];
export const decanName = (d: number) => `${SIGNS[signOf(d)]} ${ROMAN[d % 3]}`;
export const pipName = (d: number) => `${RANK_WORD[d % 9 + 2]} of ${SUITS[signOf(d) % 4]}`;
export const traveler = (d: number) => CHALDEAN[d % 7];
export const eternal = (d: number) => {
  const s = signOf(d);
  return ASCENT[elementOf(s)][(s % 3 + d % 3) % 3];
};
export const presiding = (d: number) => SIGN_LORD[signOf(d)];

/** Lords take the mind of the sign stood in (fire and air day, earth and water night). */
export function mindOf(lord: string, standingSign: number): string {
  return SIGN_MIND[DOMICILES[lord][standingSign % 2]];
}

export const seatOf = (d: number) => mod(Math.floor((d + 1) / 3), 12);
export const seatDecans = (seat: number) => [mod(3 * seat - 1, 36), 3 * seat, 3 * seat + 1];
export const seasonOf = (d: number) => SEASONS[Math.floor(d / 9)];

/** Index by display name: every pip, and the name the client may send it under. */
const PIPS = new Map(Array.from({ length: 36 }, (_, d) => [pipName(d), d]));
export const decanOfPip = (name: string) => PIPS.get(name);

export function dna(d: number): string[] {
  const s = signOf(d);
  return [pipName(d), `Ace of ${SUITS[s % 4]}`, `Page of ${seasonOf(d).children}`,
    SENIOR_COURTS[seatOf(d)], SIGN_MAJORS[s], PLANET_MAJORS[eternal(d)], MODAL_LORDS[s % 3]];
}

export interface Home { house: number; mind: string; silhouette?: string }
/** The house a sign falls in from `rising`, read as the mind of that house's natural sign. */
export function homeOf(house: number): Home {
  const silhouette = SILHOUETTE[house];
  return { house, mind: SIGN_MIND[house - 1], ...(silhouette ? { silhouette } : {}) };
}
export const wholeSignHouse = (d: number, risingSign: number) =>
  mod(signOf(d) - risingSign, 12) + 1;
export const wholeDecanHouse = (d: number, risingDecan: number) =>
  Math.floor(mod(d - risingDecan, 36) / 3) + 1;

export interface Sentence { traveler: string; shrine: string; temple: string; text: string }
export function sentence(d: number, home?: Home): Sentence {
  const s = signOf(d);
  const shrine = mindOf(eternal(d), s);
  const temple = SIGN_MIND[s];
  const trav = mindOf(traveler(d), s);
  const text = `${trav} prays at the shrine of ${shrine} in the temple of ${temple}`;
  return { traveler: trav, shrine, temple, text: home ? `${text}, as relayed by ${home.mind}` : text };
}

export interface Dodec { sign: string; element: string; mode: string; lord: string }
/** The four dodecatemoria of a decan, one of each element. ESO-307: by formula, not the graph. */
export function dodecs(d: number): Dodec[] {
  const start = signOf(d) + 4 * (d % 3);
  return [0, 1, 2, 3].map((i) => {
    const s = (start + i) % 12;
    return { sign: SIGNS[s], element: elementOf(s), mode: modeOf(s), lord: SIGN_LORD[s] };
  });
}

const CENTERS: Record<string, string> = { Wands: "gut", Chalices: "heart", Swords: "head" };
const PHASES = ["becoming", "being", "returning"];
const FLOORS = ["Capricorn, Earth cold", "Taurus, Earth dry", "Virgo, Earth solid"];

export interface Walk {
  stage: string; floorQuality: string; center?: string; step?: string; trio?: string[];
  leaves?: string; reaches: string;
}
const floor = (n: number) => `${RANK_WORD[n]} of Pentacles`;
/** ESO-343 plus the 11-07 trio ruling. Pentacles are the landings, the self, not a center. */
export function walk(d: number): Walk {
  const rank = d % 9 + 2;
  const suit = SUITS[signOf(d) % 4];
  const stage = Math.floor((rank - 2) / 3);
  const base = { stage: `Stage ${ROMAN[stage]}, ${PHASES[stage]}`, floorQuality: FLOORS[stage] };
  if (suit === "Pentacles") {
    return { ...base, reaches: floor(rank), ...(rank > 2 ? { leaves: floor(rank - 1) } : {}) };
  }
  const first = 2 + stage * 3;
  const land = first + ["Wands", "Chalices", "Swords"].indexOf(suit);
  return {
    ...base, center: CENTERS[suit], step: PHASES[(rank - 2) % 3],
    trio: [first, first + 1, first + 2].map((n) => `${RANK_WORD[n]} of ${suit}`),
    ...(land > 2 ? { leaves: floor(land - 1) } : {}), reaches: floor(land),
  };
}

/** Nine decans as three signs in reading order, for an Ace or a Page. */
export function aceSigns(suit: string): number[] {
  const element = SUITS.indexOf(suit);
  return [0, 1, 2].map((m) => SIGNS.findIndex((_, s) => s % 4 === element && s % 3 === m));
}
export function pageSigns(suit: string): number[] {
  const start = SEASONS.findIndex((s) => s.children === suit) * 3;
  return [start, start + 1, start + 2];
}

export interface Relation { peer: string; kind: string }
/** Each senior court sees 7 of 11 peers (Codex, The Decanate Register). */
export function courtRelations(seat: number): Relation[] {
  const name = (offset: number) => SENIOR_COURTS[mod(seat + offset, 12)];
  const suit = SENIOR_COURTS[seat].split(" of ")[1];
  const empowers = SENIOR_COURTS.filter((c, i) => i !== seat && c.endsWith(`of ${suit}`));
  return [
    { peer: name(6), kind: "complements" },
    ...empowers.map((peer) => ({ peer, kind: "empowers" })),
    { peer: name(3), kind: "challenges" }, { peer: name(-3), kind: "challenges" },
    { peer: name(-1), kind: "succeeds" }, { peer: name(1), kind: "precedes" },
  ];
}

export interface MajorRegister { kind: "sign" | "planet" | "modal"; label: string; decans: number[]; byLord?: string[] }
const ALL = Array.from({ length: 36 }, (_, d) => d);
/** A Major's committee. The modal lords hold their modality's twelve decans by the Room lord
 *  of each element, per the Codex and the DNA ruling, not the graph's PRESIDES_OVER diagonal. */
export function majorRegister(name: string): MajorRegister | null {
  const sign = SIGN_MAJORS.indexOf(name);
  if (sign >= 0) {
    return { kind: "sign", label: `Sign Major of ${SIGNS[sign]}`, decans: [0, 1, 2].map((k) => sign * 3 + k) };
  }
  const planet = Object.keys(PLANET_MAJORS).find((p) => PLANET_MAJORS[p] === name);
  if (planet) {
    return { kind: "planet", label: `Planet Major of ${planet === "Sun" || planet === "Moon" ? `the ${planet}` : planet}`,
      decans: ALL.filter((d) => eternal(d) === planet) };
  }
  const mode = MODAL_LORDS.indexOf(name);
  if (mode < 0) return null;
  return {
    kind: "modal", label: `Modal Lord of the ${MODES[mode]} mode (${MODAL_PLANET[mode]})`,
    decans: ALL.filter((d) => signOf(d) % 3 === mode),
    byLord: ELEMENTS.map((e) => `${e} by ${ASCENT[e][mode]}`),
  };
}
