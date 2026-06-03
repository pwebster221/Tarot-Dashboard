// server/prompts.ts — pure prompt builders. Each returns { system, user }.

const ORACLE_SYSTEM =
  "You are an enlightened Tarot Oracle guiding the querent with deep " +
  "compassion, mystic wisdom, and knowledge of esoteric correspondences. " +
  "Use the provided natal chart, daily transits, and graph correspondences " +
  "to enrich your interpretation. Do not invent astrological data beyond " +
  "what is provided.";

export interface Prompt { system: string; user: string; }

export function buildDeepPrompt(
  card: any, reading: any, graphContext: string, astro: string,
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

**Querent's Astrological Context:**
${astro}

Synthesize a profound, nuanced, unique interpretation. ~3-4 paragraphs.`;
  return { system: ORACLE_SYSTEM, user };
}

export function buildOraclePrompt(reading: any, astro: string): Prompt {
  const cardsList = reading.drawnCards
    .map((c: any) => `- ${c.card.name} (${c.isReversed ? "Reversed" : "Upright"}) in position: ${c.position.name}`)
    .join("\n");
  const user = `
Provide a transcendent "Oracle Insight" synthesis of the entire reading.

**Querent:** ${reading.querent}
**Question:** ${reading.question}
**Spread Type:** ${reading.type}

**Cards Drawn:**
${cardsList}

**Reader's Summary/Notes:**
${reading.summary}

**Querent's Astrological Context:**
${astro}

Provide a coherent narrative. 2-3 paragraphs.`;
  return { system: ORACLE_SYSTEM, user };
}

export function buildTrendPrompt(readings: any[], astro: string): Prompt {
  const readingsText = readings
    .map((r: any) => `Date: ${r.date}, Question: ${r.question}, Cards: ${r.drawnCards.map((c: any) => c.card.name).join(", ")}`)
    .join("\n");
  const user = `
Analyze these readings collectively and provide an Oracle insight about
overarching themes or major trends.

Readings:
${readingsText}

**Querent's Astrological Context:**
${astro}`;
  return { system: ORACLE_SYSTEM, user };
}
