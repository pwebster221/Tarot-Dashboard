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

export async function generateDeepInterpretation(card: DrawnCard, reading: Reading): Promise<string> {
  try {
    const graphContext = await fetchGraphContext(card.card.name);

    const response = await fetch("/api/ai/deep-interpretation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ card, reading, graphContext })
    });
    
    if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Unknown server error' }));
        throw new Error(err.error || 'Failed to generate interpretation');
    }

    const data = await response.json();
    return data.result || "Insight could not be generated.";
  } catch (error) {
    console.error("AI Generation Error", error);
    throw new Error(error instanceof Error ? error.message : "Failed to generate interpretation.");
  }
}

export async function generateOracleInsight(reading: Reading): Promise<string> {
  try {
    const response = await fetch("/api/ai/oracle-insight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reading })
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

export async function generateTrendInsight(readings: Reading[]): Promise<string> {
  try {
    const response = await fetch("/api/ai/trend-insight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ readings })
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
