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
 *  No-op if the Reading node doesn't exist (MATCH skips the write). */
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
