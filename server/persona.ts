// server/persona.ts — loads the vendored Persona skills (Major/Majestic/Minor)
// and resolves a card to its persona markdown. The skills are the SoT in the
// PathsofRevSkills GitHub repo; server/personas/ is a vendored snapshot + index
// (rebuild via scripts/sync-personas — see repo). Persona text is appended to
// the per-card Deep-interpretation system prompt so the model reads AS that card.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PERSONA_DIR = path.join(__dirname, "personas");

let _index: Record<string, string> | null = null;
const _cache = new Map<string, string>();

function loadIndex(): Record<string, string> {
  if (_index) return _index;
  try {
    _index = JSON.parse(fs.readFileSync(path.join(PERSONA_DIR, "index.json"), "utf8"));
  } catch (err) {
    console.error("[persona] index load failed; persona injection disabled:", err);
    _index = {};
  }
  return _index!;
}

/** Return the persona SKILL.md markdown for a card by display name, or "" if
 *  none is mapped / readable. Case-insensitive on the card name. */
export function getPersonaForCard(cardName: string): string {
  if (!cardName) return "";
  if (_cache.has(cardName)) return _cache.get(cardName)!;
  const index = loadIndex();
  // Exact, then case-insensitive match.
  let file = index[cardName];
  if (!file) {
    const lc = cardName.toLowerCase();
    const hit = Object.keys(index).find((k) => k.toLowerCase() === lc);
    if (hit) file = index[hit];
  }
  let text = "";
  if (file) {
    try {
      text = fs.readFileSync(path.join(PERSONA_DIR, file), "utf8").trim();
    } catch (err) {
      console.error(`[persona] read failed for ${cardName} (${file}):`, err);
    }
  }
  _cache.set(cardName, text);
  return text;
}
