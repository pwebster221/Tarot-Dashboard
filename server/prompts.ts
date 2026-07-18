// server/prompts.ts — pure prompt builders. Each returns { system, user }.

const ORACLE_SYSTEM =
  "You are an enlightened Tarot Oracle guiding the querent with deep " +
  "compassion, mystic wisdom, and knowledge of esoteric correspondences. " +
  "Use the provided natal chart, daily transits, and graph correspondences " +
  "to enrich your interpretation. Do not invent astrological data beyond " +
  "what is provided.";

export interface Prompt { system: string; user: string; }

export function buildDeepPrompt(
  card: any, reading: any, graphContext: string, astro: string, mani = "",
): Prompt {
  const user = `
Provide a "Deep Interpretation" for the following card drawn in a reading.

**Querent:** ${reading.querent}
**Question:** ${reading.question}
**Position in Spread:** ${card.position.name} - ${card.position.description}

**Card:** ${card.card.name} (Suit: ${card.card.suit || "N/A"}, Arcana: ${card.card.arcana})
**Orientation:** ${card.isReversed ? "Reversed" : "Upright"}
**General Meaning:** ${card.card.generalMeaning}
**Specific Interpretation in Spread:** ${card.specificMeaning}

**Esoteric Repository Correspondences:**
${graphContext}

**Astrological Context (this card):**
${astro}
${maniSection(mani)}
Synthesize a profound, nuanced, unique interpretation. ~3-4 paragraphs.`;
  return { system: ORACLE_SYSTEM, user };
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

export function buildOraclePrompt(reading: any, astro: string, mani = "", spreadDetail = ""): Prompt {
  const cardsList = reading.drawnCards
    .map((c: any) => `- ${c.card.name} (${c.isReversed ? "Reversed" : "Upright"}) in position: ${c.position.name}`)
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

**Querent's Astrological Context:**
${astro}
${maniSection(mani)}
Provide a coherent narrative. 2-3 paragraphs.`;
  return { system: ORACLE_SYSTEM, user };
}

export function buildTrendPrompt(readings: any[], astro: string, mani = "", spreadDetails = ""): Prompt {
  const readingsText = readings
    .map((r: any) => `Date: ${r.date}, Question: ${r.question}, Cards: ${r.drawnCards.map((c: any) => c.card.name).join(", ")}`)
    .join("\n");
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
