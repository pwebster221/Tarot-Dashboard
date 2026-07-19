import { Reading, DrawnCard } from "../types";
// We no longer import GoogleGenAI here to keep the client light and secure

export async function fetchGraphContext(cardName: string): Promise<string> {
  try {
    const res = await fetch("/api/graph/context", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardName })
    });
    if (!res.ok) return "No graph context available.";
    const data = await res.json();
    if (data.result && data.result.context) {
      return data.result.context;
    }
    return JSON.stringify(data);
  } catch (err) {
    console.error("Failed to fetch graph context", err);
    return "No graph context available.";
  }
}

/** Canonical card meaning from the Esoteric Repository. Returns null on miss/error
 *  so callers can fall back to local metadata. */
export async function fetchCardMeaning(cardName: string): Promise<string | null> {
  try {
    const res = await fetch(`/api/graph/card-meaning?name=${encodeURIComponent(cardName)}`, {
      credentials: 'include',
    });
    if (!res.ok) return null;
    const data = await res.json() as { meaning: string | null; keywords: string[] };
    if (data.meaning && data.meaning.trim()) return data.meaning.trim();
    if (data.keywords && data.keywords.length) return data.keywords.join(', ');
    return null;
  } catch (err) {
    console.error('Failed to fetch card meaning', err);
    return null;
  }
}

export interface DeepInterpretationResult { result: string; summary: string; }

export async function generateDeepInterpretation(card: DrawnCard, reading: Reading, extraReasoning: boolean = false): Promise<DeepInterpretationResult> {
  try {
    const graphContext = await fetchGraphContext(card.card.name);

    const response = await fetch("/api/ai/deep-interpretation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ card, reading, graphContext, extraReasoning })
    });

    if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Unknown server error' }));
        throw new Error(err.error || 'Failed to generate interpretation');
    }

    const data = await response.json();
    return { result: data.result || "Insight could not be generated.", summary: data.summary || "" };
  } catch (error) {
    console.error("AI Generation Error", error);
    throw new Error(error instanceof Error ? error.message : "Failed to generate interpretation.");
  }
}

export async function generateOracleInsight(reading: Reading, extraReasoning: boolean = false): Promise<string> {
  try {
    const response = await fetch("/api/ai/oracle-insight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reading, extraReasoning })
    });
    
    if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Unknown server error' }));
        throw new Error(err.error || 'Failed to generate insight');
    }

    const data = await response.json();
    return data.result || "Insight could not be generated.";
  } catch (error) {
    console.error("AI Generation Error", error);
    throw new Error(error instanceof Error ? error.message : "Failed to generate insight.");
  }
}

export async function generateTrendInsight(readings: Reading[], extraReasoning: boolean = false): Promise<string> {
  try {
    const response = await fetch("/api/ai/trend-insight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ readings, extraReasoning })
    });
    
    if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Unknown server error' }));
        throw new Error(err.error || 'Failed to generate trend insight');
    }

    const data = await response.json();
    return data.result || "Insight could not be generated.";
  } catch (error) {
    console.error("AI Generation Error", error);
    throw new Error(error instanceof Error ? error.message : "Failed to generate trend insight.");
  }
}
