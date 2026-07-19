import neo4j, { Driver } from "neo4j-driver";

// ── Cypher constants — exported so tests can assert their shape ──────────────

export const NOTE_UPSERT_CYPHER = `
  MERGE (u:User {sub: $sub})
  WITH u
  MATCH (r:Reading {id: $readingId})
  MERGE (u)-[n:NOTED]->(r)
  SET n.text = $text, n.updated_at = datetime()
`;

export const NOTE_DELETE_CYPHER = `
  MATCH (:User {sub: $sub})-[n:NOTED]->(:Reading {id: $readingId})
  DELETE n
`;

export const SAVE_INSIGHT_CYPHER = `
  MERGE (u:User {sub: $sub})
  WITH u
  MATCH (r:Reading {id: $readingId})
  MERGE (u)-[s:SAVED_INSIGHT {card_id: $cardId}]->(r)
  SET s.text = $text, s.saved_at = datetime()
`;

export const UNSAVE_INSIGHT_CYPHER = `
  MATCH (:User {sub: $sub})-[s:SAVED_INSIGHT {card_id: $cardId}]->(:Reading {id: $readingId})
  DELETE s
`;

export const GET_ANNOTATIONS_CYPHER = `
  MATCH (u:User {sub: $sub})
  OPTIONAL MATCH (u)-[n:NOTED]->(:Reading {id: $readingId})
  OPTIONAL MATCH (u)-[s:SAVED_INSIGHT]->(:Reading {id: $readingId})
  RETURN n.text AS note, collect(s {.card_id, .text}) AS savedInsights
`;

export const GET_TREND_CYPHER = `
  MATCH (u:User {sub: $sub})
  RETURN u.trend_insight AS text, toString(u.trend_insight_at) AS at
`;

export const SET_TREND_CYPHER = `
  MERGE (u:User {sub: $sub})
  SET u.trend_insight = $text, u.trend_insight_at = datetime()
`;

// Canonical card meaning from the Esoteric Repository (same Neo4j instance).
// The decan-derived meaning lives on the :Archetype node (composition_* fields,
// 100% coverage), reached via (:Archetype)-[:BASED_ON]->(:TarotCard). We lead
// with essential_nature + decan_synthesis; the :TarotCard correspondence fields
// (guidance_narrative/keywords/one_word) are a fallback when no Archetype is found.
export const GET_CARD_MEANING_CYPHER = `
  MATCH (c:TarotCard)
  WHERE toLower(c.name) = toLower($name)
  OPTIONAL MATCH (a:Archetype)-[:BASED_ON]->(c)
  RETURN a.composition_essential_nature AS essential,
         a.composition_decan_synthesis AS decanSynthesis,
         a.composition_portrait AS portrait,
         c.guidance_narrative AS guidance, c.keywords AS keywords, c.one_word AS oneWord
  LIMIT 1
`;

// ── Spreads (:Spread) — authored spread definitions; description is the
//    "Spread Detail" folded into Oracle/Trend interpretations. Structure
//    (position_count / position_names) is locked once readings exist. ──
export const GET_SPREADS_CYPHER = `
  MATCH (sp:Spread)
  OPTIONAL MATCH (r:Reading) WHERE r.spread_type = sp.spread_type
  WITH sp, count(r) AS readingCount
  RETURN sp.spread_type AS spreadType, sp.name AS name, sp.short_name AS shortName,
         sp.position_count AS positionCount, sp.position_names AS positionNames,
         sp.description AS description, readingCount
  ORDER BY sp.position_count, sp.name
`;

export const GET_SPREAD_DESCRIPTION_CYPHER = `
  MATCH (sp:Spread {spread_type: $spreadType})
  RETURN sp.name AS name, sp.description AS description LIMIT 1
`;

// name + description are always editable; structure only when unlocked.
export const UPDATE_SPREAD_META_CYPHER = `
  MATCH (sp:Spread {spread_type: $spreadType})
  SET sp.name = $name, sp.description = $description, sp.updated_at = datetime()
`;

export const UPDATE_SPREAD_STRUCTURE_CYPHER = `
  MATCH (sp:Spread {spread_type: $spreadType})
  SET sp.position_count = $positionCount, sp.position_names = $positionNames,
      sp.form_slots_json = $formSlotsJson
`;

export const CREATE_SPREAD_CYPHER = `
  MERGE (sp:Spread {spread_type: $spreadType})
  ON CREATE SET sp.name = $name, sp.short_name = $name,
    sp.position_count = $positionCount, sp.position_names = $positionNames,
    sp.description = $description, sp.form_slots_json = $formSlotsJson,
    sp.interpretation_keys = $interpretationKeys, sp.created_at = datetime()
  RETURN sp.created_at IS NOT NULL AS created
`;

/** Build intake-form slots (FormCardSlot[]) from position names. A named
 *  position is fixed; a blank one becomes a free-text label input. */
export function formSlotsFromNames(positionNames: string[]): string {
  return JSON.stringify(
    positionNames.map((pn, i) => ({
      order: i + 1,
      position: pn && pn.trim() ? pn.trim() : null,
      side: null,
      card: null,
      label: null,
      hasLabelInput: !(pn && pn.trim()),
    })),
  );
}

export const GET_USER_STATE_CYPHER = `
  MATCH (u:User {sub: $sub})
  RETURN coalesce(u.onboarded, false) AS onboarded,
         coalesce(u.lens, 'archetypal') AS lens,
         u.display_name AS displayName
`;

export const COMPLETE_ONBOARDING_CYPHER = `
  MERGE (u:User {sub: $sub})
  SET u.onboarded = true,
      u.onboarded_at = datetime(),
      u.lens = $lens,
      u.display_name = coalesce($displayName, u.display_name),
      u.birth_date = coalesce($birthDate, u.birth_date),
      u.birth_time = coalesce($birthTime, u.birth_time),
      u.birth_place = coalesce($birthPlace, u.birth_place)
  RETURN coalesce(u.onboarded, false) AS onboarded, u.lens AS lens
`;

// ── Lazy driver — NOT opened at import time ──────────────────────────────────

let _driver: Driver | null = null;
function getDriver(): Driver {
  if (!_driver) {
    const uri = process.env.NEO4J_READINGS_URI as string;
    const user = (process.env.NEO4J_READINGS_USER ?? "neo4j") as string;
    const password = (process.env.NEO4J_READINGS_PASSWORD ?? "") as string;
    _driver = neo4j.driver(uri, neo4j.auth.basic(user, password));
  }
  return _driver;
}

// ── Public API ───────────────────────────────────────────────────────────────

/** Create or replace the note a user left on a reading.
 *  The User MERGE always fires; only the NOTED relationship write is skipped when the Reading node doesn't exist. */
export async function upsertNote(
  sub: string,
  readingId: string,
  text: string,
): Promise<void> {
  const session = getDriver().session();
  try {
    await session.run(NOTE_UPSERT_CYPHER, { sub, readingId, text });
  } finally {
    await session.close();
  }
}

/** Remove the NOTED relationship for a user+reading (no-op if absent). */
export async function deleteNote(
  sub: string,
  readingId: string,
): Promise<void> {
  const session = getDriver().session();
  try {
    await session.run(NOTE_DELETE_CYPHER, { sub, readingId });
  } finally {
    await session.close();
  }
}

/** Save (or update) a per-card insight for a user+reading. */
export async function saveInsight(
  sub: string,
  readingId: string,
  cardId: string,
  text: string,
): Promise<void> {
  const session = getDriver().session();
  try {
    await session.run(SAVE_INSIGHT_CYPHER, { sub, readingId, cardId, text });
  } finally {
    await session.close();
  }
}

/** Remove a saved per-card insight (no-op if absent). */
export async function unsaveInsight(
  sub: string,
  readingId: string,
  cardId: string,
): Promise<void> {
  const session = getDriver().session();
  try {
    await session.run(UNSAVE_INSIGHT_CYPHER, { sub, readingId, cardId });
  } finally {
    await session.close();
  }
}

/** Return the user's note and all saved per-card insights for a reading. */
export async function getAnnotations(
  sub: string,
  readingId: string,
): Promise<{ note: string | null; savedInsights: Array<{ card_id: string; text: string }> }> {
  const session = getDriver().session();
  try {
    const result = await session.run(GET_ANNOTATIONS_CYPHER, { sub, readingId });
    if (result.records.length === 0) {
      return { note: null, savedInsights: [] };
    }
    const record = result.records[0];
    const note = record.get("note") as string | null;
    const rawInsights = record.get("savedInsights") as Array<{ card_id: string | null; text: string | null }>;
    // collect() over an OPTIONAL MATCH can yield entries with null card_id; filter them out
    const savedInsights = rawInsights
      .filter((s) => s.card_id != null)
      .map((s) => ({ card_id: s.card_id as string, text: (s.text ?? "") }));
    return { note, savedInsights };
  } finally {
    await session.close();
  }
}

/** Return the current trend insight text (and timestamp) for a user. */
export async function getTrendInsight(
  sub: string,
): Promise<{ text: string | null; at: string | null }> {
  const session = getDriver().session();
  try {
    const result = await session.run(GET_TREND_CYPHER, { sub });
    if (result.records.length === 0) {
      return { text: null, at: null };
    }
    const record = result.records[0];
    return {
      text: record.get("text") as string | null,
      at: record.get("at") as string | null,
    };
  } finally {
    await session.close();
  }
}

/** Persist (or overwrite) the trend insight for a user. */
export async function setTrendInsight(
  sub: string,
  text: string,
): Promise<void> {
  const session = getDriver().session();
  try {
    await session.run(SET_TREND_CYPHER, { sub, text });
  } finally {
    await session.close();
  }
}

/** keywords is stored as a string ("a, b, c") on some cards and a list on
 *  others — normalize to a string array. */
function normalizeKeywords(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter((k): k is string => typeof k === "string" && k.trim() !== "");
  if (typeof raw === "string") return raw.split(",").map((s) => s.trim()).filter(Boolean);
  return [];
}

/** Canonical card meaning from the Esoteric Repository (:TarotCard). Composes a
 *  display meaning from the richest available field (guidance_narrative → keywords
 *  → one_word). Returns null when the card isn't found so callers can fall back
 *  to local metadata. */
export async function getCardMeaning(
  name: string,
): Promise<{ meaning: string | null; keywords: string[] } | null> {
  if (!name) return null;
  const session = getDriver().session();
  try {
    const result = await session.run(GET_CARD_MEANING_CYPHER, { name });
    if (result.records.length === 0) return null;
    const r = result.records[0];
    const keywords = normalizeKeywords(r.get("keywords"));
    // Preferred: the decan-derived Archetype composition (essential nature + how
    // the specific decans synthesize).
    const essential = ((r.get("essential") as string | null) ?? "").trim();
    const decanSynthesis = ((r.get("decanSynthesis") as string | null) ?? "").trim();
    // Majors/courts carry essential_nature + decan_synthesis; minors carry
    // composition_portrait (the 1:1 decan passthrough). Prefer the former, else portrait.
    const composed = [essential, decanSynthesis].filter(Boolean).join("\n\n")
      || ((r.get("portrait") as string | null) ?? "").trim();
    // Fallback: :TarotCard correspondence fields.
    const guidance = ((r.get("guidance") as string | null) ?? "").trim();
    const oneWord = ((r.get("oneWord") as string | null) ?? "").trim();
    const meaning = composed || guidance || (keywords.length ? keywords.join(", ") : (oneWord || null));
    return { meaning, keywords };
  } finally {
    await session.close();
  }
}

// ── Spreads ──────────────────────────────────────────────────────────────────

export interface SpreadRow {
  spreadType: string;
  name: string | null;
  shortName: string | null;
  positionCount: number;
  positionNames: string[];
  description: string | null;
  readingCount: number;
  locked: boolean; // structure (positionCount/positionNames) is fixed once readings exist
}

export interface SpreadUpdate {
  name: string;
  description: string;
  positionCount?: number;
  positionNames?: string[];
}

function toNum(v: unknown): number {
  const anyV = v as { toNumber?: () => number };
  if (v == null) return 0;
  return typeof anyV?.toNumber === "function" ? anyV.toNumber() : Number(v);
}

/** All spread definitions with a `locked` flag (true once any reading uses the spread). */
export async function getSpreads(): Promise<SpreadRow[]> {
  const session = getDriver().session();
  try {
    const result = await session.run(GET_SPREADS_CYPHER);
    return result.records.map((r) => {
      const readingCount = toNum(r.get("readingCount"));
      const rawNames = r.get("positionNames");
      return {
        spreadType: r.get("spreadType") as string,
        name: (r.get("name") as string | null) ?? null,
        shortName: (r.get("shortName") as string | null) ?? null,
        positionCount: toNum(r.get("positionCount")),
        positionNames: Array.isArray(rawNames)
          ? rawNames.filter((n): n is string => typeof n === "string")
          : [],
        description: (r.get("description") as string | null) ?? null,
        readingCount,
        locked: readingCount > 0,
      };
    });
  } finally {
    await session.close();
  }
}

/** Spread name + description for a spread_type (for Oracle/Trend prompt injection). */
export async function getSpreadDescription(
  spreadType: string,
): Promise<{ name: string | null; description: string | null } | null> {
  if (!spreadType) return null;
  const session = getDriver().session();
  try {
    const result = await session.run(GET_SPREAD_DESCRIPTION_CYPHER, { spreadType });
    if (result.records.length === 0) return null;
    const r = result.records[0];
    return {
      name: (r.get("name") as string | null) ?? null,
      description: (r.get("description") as string | null) ?? null,
    };
  } finally {
    await session.close();
  }
}

/** Update a spread. name+description always; structure only when `applyStructure`
 *  (the caller must first verify the spread is unlocked). Returns false if not found. */
export async function updateSpread(
  spreadType: string,
  u: SpreadUpdate,
  applyStructure: boolean,
): Promise<void> {
  const session = getDriver().session();
  try {
    await session.run(UPDATE_SPREAD_META_CYPHER, {
      spreadType,
      name: u.name,
      description: u.description,
    });
    if (applyStructure && u.positionCount != null && u.positionNames != null) {
      await session.run(UPDATE_SPREAD_STRUCTURE_CYPHER, {
        spreadType,
        positionCount: neo4j.int(u.positionCount),
        positionNames: u.positionNames,
        formSlotsJson: formSlotsFromNames(u.positionNames),
      });
    }
  } finally {
    await session.close();
  }
}

/** Create a new spread. Returns false if the spread_type already exists. */
export async function createSpread(
  spreadType: string,
  u: Required<SpreadUpdate>,
): Promise<boolean> {
  if (await getSpreadDescription(spreadType)) return false; // already exists
  const session = getDriver().session();
  try {
    await session.run(CREATE_SPREAD_CYPHER, {
      spreadType,
      name: u.name,
      description: u.description,
      positionCount: neo4j.int(u.positionCount),
      positionNames: u.positionNames,
      formSlotsJson: formSlotsFromNames(u.positionNames),
      interpretationKeys: ["main"],
    });
    return true;
  } finally {
    await session.close();
  }
}

// ── Onboarding state ─────────────────────────────────────────────────────────

export interface UserState {
  onboarded: boolean;
  lens: "archetypal" | "mystical";
  displayName: string | null;
}

/** Read a user's onboarding state. Missing node → sensible defaults (not onboarded). */
export async function getUserState(sub: string): Promise<UserState> {
  const session = getDriver().session();
  try {
    const result = await session.run(GET_USER_STATE_CYPHER, { sub });
    if (result.records.length === 0) {
      return { onboarded: false, lens: "archetypal", displayName: null };
    }
    const r = result.records[0];
    const lens = r.get("lens") === "mystical" ? "mystical" : "archetypal";
    return {
      onboarded: Boolean(r.get("onboarded")),
      lens,
      displayName: (r.get("displayName") as string | null) ?? null,
    };
  } finally {
    await session.close();
  }
}

export interface OnboardingInput {
  lens: "archetypal" | "mystical";
  displayName?: string | null;
  birthDate?: string | null;
  birthTime?: string | null;
  birthPlace?: string | null;
}

/** Mark a user onboarded and persist their chosen lens + collected profile.
 *  Empty strings are normalized to null so `coalesce` keeps any prior value. */
export async function completeOnboarding(sub: string, input: OnboardingInput): Promise<void> {
  const blankToNull = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);
  const session = getDriver().session();
  try {
    await session.run(COMPLETE_ONBOARDING_CYPHER, {
      sub,
      lens: input.lens === "mystical" ? "mystical" : "archetypal",
      displayName: blankToNull(input.displayName),
      birthDate: blankToNull(input.birthDate),
      birthTime: blankToNull(input.birthTime),
      birthPlace: blankToNull(input.birthPlace),
    });
  } finally {
    await session.close();
  }
}
