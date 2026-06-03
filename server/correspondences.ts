// Static Golden Dawn attributions. Used ONLY as the fallback anchor when a
// drawn card has no direct placement in the querent's chart.
export type Element = "Fire" | "Earth" | "Air" | "Water";
export interface CardAnchor { planet?: string; sign?: string; element?: Element; }

export const SIGN_RULER: Record<string, string> = {
  Aries: "Mars", Taurus: "Venus", Gemini: "Mercury", Cancer: "Moon",
  Leo: "Sun", Virgo: "Mercury", Libra: "Venus", Scorpio: "Mars",
  Sagittarius: "Jupiter", Capricorn: "Saturn", Aquarius: "Saturn", Pisces: "Jupiter",
};

const MAJOR: Record<string, CardAnchor> = {
  "The Fool": { planet: "Uranus", element: "Air" },
  "The Magician": { planet: "Mercury" },
  "The High Priestess": { planet: "Moon" },
  "The Empress": { planet: "Venus" },
  "The Emperor": { sign: "Aries" },
  "The Hierophant": { sign: "Taurus" },
  "The Lovers": { sign: "Gemini" },
  "The Chariot": { sign: "Cancer" },
  "Strength": { sign: "Leo" },
  "The Hermit": { sign: "Virgo" },
  "Wheel of Fortune": { planet: "Jupiter" },
  "Justice": { sign: "Libra" },
  "The Hanged Man": { planet: "Neptune", element: "Water" },
  "Death": { sign: "Scorpio" },
  "Temperance": { sign: "Sagittarius" },
  "The Devil": { sign: "Capricorn" },
  "The Tower": { planet: "Mars" },
  "The Star": { sign: "Aquarius" },
  "The Moon": { sign: "Pisces" },
  "The Sun": { planet: "Sun" },
  "Judgement": { planet: "Pluto", element: "Fire" },
  "The World": { planet: "Saturn" },
};

// Decan model: 36 decans of 10°, Chaldean planet order starting Mars@Aries-1.
const CHALDEAN = ["Mars", "Sun", "Venus", "Mercury", "Moon", "Saturn", "Jupiter"];
const ZODIAC = ["Aries","Taurus","Gemini","Cancer","Leo","Virgo","Libra",
  "Scorpio","Sagittarius","Capricorn","Aquarius","Pisces"];
const SUIT_ELEMENT: Record<string, Element> = {
  Wands: "Fire", Cups: "Water", Swords: "Air", Pentacles: "Earth",
};
const ELEMENT_SIGNS: Record<Element, string[]> = {
  Fire: ["Aries", "Leo", "Sagittarius"],
  Water: ["Cancer", "Scorpio", "Pisces"],
  Air: ["Libra", "Aquarius", "Gemini"],
  Earth: ["Capricorn", "Taurus", "Virgo"],
};
const RANK_NUM: Record<string, number> = {
  Two: 2, Three: 3, Four: 4, Five: 5, Six: 6, Seven: 7, Eight: 8, Nine: 9, Ten: 10,
};

function decanPlanet(sign: string, decanInSign: number): string {
  const idx = ZODIAC.indexOf(sign) * 3 + decanInSign; // decanInSign 0..2
  return CHALDEAN[idx % 7];
}

/** Pip (2-10) → {planet, sign} via Golden Dawn decans. */
export function buildPipCorrespondence(): Record<string, CardAnchor> {
  const out: Record<string, CardAnchor> = {};
  for (const [suit, element] of Object.entries(SUIT_ELEMENT)) {
    const signs = ELEMENT_SIGNS[element];
    for (const [rank, n] of Object.entries(RANK_NUM)) {
      const block = Math.floor((n - 2) / 3);   // 0 cardinal,1 fixed,2 mutable
      const decanInSign = (n - 2) % 3;          // 0..2
      const sign = signs[block];
      out[`${rank} of ${suit}`] = { planet: decanPlanet(sign, decanInSign), sign };
    }
  }
  return out;
}

const PIP = buildPipCorrespondence();
const COURT_RANKS = ["Page", "Knight", "Queen", "King"];

export function cardAnchor(cardName: string): CardAnchor {
  if (!cardName) return {};
  if (MAJOR[cardName]) return MAJOR[cardName];
  if (PIP[cardName]) return PIP[cardName];
  const court = COURT_RANKS.find((r) => cardName.startsWith(r + " of "));
  if (court) {
    const suit = cardName.split(" of ")[1];
    const el = SUIT_ELEMENT[suit];
    if (el) return { element: el };
  }
  return {};
}
