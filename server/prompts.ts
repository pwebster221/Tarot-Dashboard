// server/prompts.ts — pure prompt builders. Each returns { system, user }.

import { DOSSIER_VERSION, renderDossier, type Arcana, type Dossier, type DossierText } from "./dossier.ts";

const ORACLE_SYSTEM =
  "You are an enlightened Tarot Oracle guiding the querent with deep " +
  "compassion, mystic wisdom, and knowledge of esoteric correspondences. " +
  "Use the provided natal chart, the transits (each block labelled with the moment it shows), and graph correspondences " +
  "to enrich your interpretation. Do not invent astrological data beyond " +
  "what is provided.";

const ORACLE_SYSTEM_NO_CHART =
  "You are an enlightened Tarot Oracle guiding the querent with deep compassion, mystic " +
  "wisdom, and knowledge of esoteric correspondences. Synthesize from the card reads you are " +
  "given. Do not bring in the querent's natal chart or the current sky.";

/** With `gate`, a reasoning run reads the opening ranks before the tools open. */
export interface Prompt { system: string; user: string; gate?: { opening: string; remainder: string } }
/** Who speaks: set by the kit, separate from what the dossier says. `company` is the chart gate's slice. */
export interface CardKit { mani?: string; persona?: string; company?: string }

/**
 * The seven-card atomic spread (Canon: planets in reversed Chaldean order, each letter read from
 * the transit chart) keeps its ruled transit source; every other Oracle reads the cards. Matched
 * by its stored id, which renaming the spread does not change. Shown as "Seven Card Atomic
 * Planetary Spread" since 2026-11-11.
 */
export const ATOMIC_SPREAD_TYPE = "seven_card_new_moon_planetary_spread";
export function isAtomicSpread(reading: any): boolean {
  return reading?.type === ATOMIC_SPREAD_TYPE && reading?.drawnCards?.length === 7;
}

/** What sky the reading Oracle gets: none, the reading's own moment, or a stated gap. Never today's. */
export type OracleSky = { kind: "none" } | { kind: "at"; at: string } | { kind: "undated"; note: string };
export const UNDATED_SKY_NOTE =
  "The reading has no usable date, so the sky at the reading is unavailable. Do not substitute today's sky.";
export function oracleSky(reading: any): OracleSky {
  if (!isAtomicSpread(reading)) return { kind: "none" };
  const at = readingMoment(reading);
  return at ? { kind: "at", at } : { kind: "undated", note: UNDATED_SKY_NOTE };
}

/** The moment whose sky the reading was cast under, or undefined when its date is missing or unreadable. */
export function readingMoment(reading: any): string | undefined {
  const raw = String(reading?.date ?? "").trim();
  if (!raw) return undefined;
  // A bare date is read at noon UTC; a timestamp with no zone is read as UTC, not server-local.
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T12:00:00Z`
    : /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(raw) ? `${raw.replace(" ", "T")}Z`
    : raw;
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? undefined : at.toISOString();
}

const READER_SYSTEM =
  "You read one tarot card drawn in a reading. Its dossier is derived structure, listed in " +
  "rank order, and rank is authority: build the interpretation from the top down, let lower " +
  "ranks color it, and treat traditional meaning as the last word, never the first. Interpret " +
  "only what the dossier and the reading give you. Where the dossier is silent, be silent: " +
  "supply no correspondence, placement or transit of your own. This card does not consult the " +
  "querent's natal chart or the current sky, apart from a Home line the dossier itself carries " +
  "and any company listed as standing in this card's own decans. " +
  "Speak to the querent's question in plain prose; do not recite the dossier or its ranks.";

const MINOR_CHARGE =
  "This is a Minor: one decan, one event. The sentence is the reading: say what happens when " +
  "this Traveler's mind prays at this shrine in this temple, and how the Home relays it. The " +
  "DNA is the company it keeps. The walk places the self: read a step only by the floor it " +
  "leaves and the floor it reaches, and do not name a landing or a step, since neither is " +
  "ruled. The dodecatemoria are the energies the shrine is built from. Cognitive functions " +
  "belong to the Majestic: assign none here.";

const MAJESTIC_CHARGE =
  "This is a Majestic: a person on the wheel, not a place. Speak from the role and its " +
  "voice, and let the cognition say how this person meets the question. The stack is cited, " +
  "never derived from the decans. The decans are stations in this person's story, Operator, " +
  "Substance and Result. Where an Ace has two forms, read the one the question calls for.";

const MAJOR_CHARGE =
  "This is a Major: a station, a committee of decans. The response is their common thread: " +
  "find what these decans share, and do not list them. Hold both layers, since neither " +
  "outranks the other. The number's grammar and the Tree say how this station stands in the " +
  "sequence; weigh a number by its stated status.";

/** The ranks read before repo-reason may be used. */
const GATE_RANK = 3;

const CHARGES: Record<Arcana, string> = { Minor: MINOR_CHARGE, Majestic: MAJESTIC_CHARGE, Major: MAJOR_CHARGE };

/** The shared frame. What differs by arcana is the charge and the dossier's ranks. */
function arcanaPrompt(card: any, reading: any, dossier: Dossier, kit: CardKit, known = true): Prompt {
  const base = `${READER_SYSTEM}\n\n${CHARGES[dossier.arcana]}`;
  const persona = kit.persona?.trim();
  const system = persona
    ? `${base}\n\n--- PERSONA (embody this card while interpreting) ---\n${persona}`
    : base;
  const specific = (card.specificMeaning || "").trim();
  const header = `
Provide a "Deep Interpretation" for the following card drawn in a reading.

**Querent:** ${reading.querent}
**Question:** ${reading.question}
**Position in Spread:** ${card.position.name} - ${card.position.description}
**Card:** ${known ? `${dossier.card} (${dossier.arcana})` : dossier.card}
**Orientation:** ${card.isReversed ? "Reversed" : "Upright"}
${specific ? `**Reader's note for this position:** ${specific}\n` : ""}`;
  const after = `${kit.company || ""}${maniSection(kit.mani || "")}`;
  const ask = "Synthesize a profound, nuanced, unique interpretation. ~3-4 paragraphs.";
  const user = `${header}
**The card's dossier, in rank order:**

${renderDossier(dossier)}
${after}
${ask}`;
  const rest = dossier.sections.filter((s) => s.rank > GATE_RANK);
  const opening = `${header}
**The card's dossier, ranks 1 to ${GATE_RANK}:**

${renderDossier({ ...dossier, sections: dossier.sections.filter((s) => s.rank <= GATE_RANK) })}

Read these first and note briefly what they establish. Do not write the interpretation yet.`;
  const remainder = `${rest.length ? `**The rest of the dossier, in rank order:**\n\n${renderDossier({ ...dossier, sections: rest })}\n` : ""}${after}
The reasoning tools are open now. Make at least one call before you write.

${ask}`;
  return { system, user, gate: { opening, remainder } };
}

/** Route a drawn card to its arcana's prompt. A name outside the 78 has no structure to read,
 *  so it gets the plain reader with only the text it arrived with. */
export function buildDeepPrompt(card: any, reading: any, dossier: Dossier | null, kit: CardKit = {}, text: DossierText = {}): Prompt {
  if (dossier) return arcanaPrompt(card, reading, dossier, kit);
  const fallback: Dossier = {
    version: DOSSIER_VERSION, card: card.card.name, arcana: "Minor",
    sections: [{ rank: 1, title: "Meaning", source: "as given", lines: [text.traditional || card.card.generalMeaning || ""] }],
  };
  const { user } = arcanaPrompt(card, reading, fallback, kit, false);
  return { system: READER_SYSTEM, user };
}

/** Optional Mani cognitive-stack perspective, injected only when present. */
function maniSection(mani: string): string {
  return mani && mani.trim()
    ? `\n**Mani Cognitive Perspective (attuned reasoning stack):**\n${mani}\n`
    : "";
}

/** Optional per-spread "Spread Detail" (the spread's authored description),
 *  injected only when present. */
function spreadSection(spreadDetail: string): string {
  return spreadDetail && spreadDetail.trim()
    ? `\n**Spread Detail (how to read this spread):**\n${spreadDetail}\n`
    : "";
}

export function buildOraclePrompt(
  reading: any, astro: string, mani = "", spreadDetail = "",
  cardMeanings: Record<string, string> = {},
): Prompt {
  const cardsList = reading.drawnCards
    .map((c: any) => {
      const head = `- ${c.card.name} (${c.isReversed ? "Reversed" : "Upright"}) in position: ${c.position.name}`;
      const meaning = cardMeanings[c.card?.name];
      const specific = (c.specificMeaning || "").trim();
      const summary = (c.summary || "").trim();
      const extras = [
        meaning ? `\n    · Meaning: ${meaning}` : "",
        specific ? `\n    · In this spread: ${specific}` : "",
        summary ? `\n    · Interpretation summary: ${summary}` : "",
      ].join("");
      return head + extras;
    })
    .join("\n");
  const user = `
Provide a transcendent "Oracle Insight" synthesis of the entire reading.

**Querent:** ${reading.querent}
**Question:** ${reading.question}
**Spread Type:** ${reading.type}
${spreadSection(spreadDetail)}
**Cards Drawn:**
${cardsList}

**Reader's Summary/Notes:**
${reading.summary}

${astro ? `**Querent's Astrological Context:**\n${astro}\n` : ""}${maniSection(mani)}
Provide a coherent narrative. 2-3 paragraphs.`;
  return { system: astro ? ORACLE_SYSTEM : ORACLE_SYSTEM_NO_CHART, user };
}

/** Prompt to summarize a single card's Deep interpretation independently — a
 *  concise essence used as context for the whole-spread Oracle synthesis. */
export function buildSummaryPrompt(cardName: string, position: string, interpretation: string): Prompt {
  const system =
    "You distill a tarot card interpretation into its essence. Return 1-2 sentences " +
    "capturing what this card, in this position, is saying in this reading. No preamble, " +
    "no restating the card name — just the essence.";
  const user =
    `Card: ${cardName} (position: ${position})\n\nInterpretation:\n${interpretation}\n\n` +
    "Summarize the above in 1-2 sentences.";
  return { system, user };
}

/** One reading for the trend Oracle: its spread by display name, then each card in its position. */
function trendReading(r: any, spreadNames: Record<string, string>): string {
  const spread = spreadNames[r?.type] || r?.type || "unknown spread";
  const cards = (r?.drawnCards || []).map((c: any) => {
    const card = `${c?.card?.name} (${c?.isReversed ? "Reversed" : "Upright"})`;
    return `    ${c?.position?.name ? `${c.position.name}: ` : ""}${card}`;
  });
  return [`- Date: ${r?.date}, Spread: ${spread}, Question: ${r?.question}`, ...cards].join("\n");
}

export function buildTrendPrompt(
  readings: any[], astro: string, mani = "", spreadDetails = "", spreadNames: Record<string, string> = {},
): Prompt {
  const readingsText = readings.map((r: any) => trendReading(r, spreadNames)).join("\n");
  const user = `
Analyze these readings collectively and provide an Oracle insight about
overarching themes or major trends.

Readings:
${readingsText}
${spreadSection(spreadDetails)}
**Querent's Astrological Context:**
${astro}
${maniSection(mani)}`;
  return { system: ORACLE_SYSTEM, user };
}
