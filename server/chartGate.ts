// server/chartGate.ts — what a card may know of the chart. By default nothing: readings run on
// the key, not the placements. The exceptions are a body standing in one of the card's own decans
// (D1 occupancy, the D6 lighting rule) and a minor's Home lord, which the dossier carries itself.
import { cardDecans } from "./dossier.ts";
import { decanName, SIGNS } from "./dossierStructure.ts";

export type ChartSource = "natal" | "transit";
export interface Occupant { body: string; source: ChartSource; decan: number; sign: string; station?: string }
interface Placed { body: string; source: ChartSource; lon: number }

/** The mean nodes duplicate the true nodes, and the true node is the house default. */
const isDuplicateMeasure = (body: string) => body.startsWith("Mean ");
const decanAt = (lon: number) => Math.floor((((lon % 360) + 360) % 360) / 10);
const signAt = (lon: number) => SIGNS[Math.floor(decanAt(lon) / 3)];

function placements(overlay: any): Placed[] {
  const natal = Object.entries(overlay?.natal?._raw?.planets ?? {})
    .map(([body, p]: [string, any]) => ({ body, source: "natal" as const, lon: p?.lon }));
  const transit = Object.entries(overlay?.transit?.planets ?? {})
    .map(([body, p]: [string, any]) => ({ body, source: "transit" as const, lon: p?.longitude }));
  return [...natal, ...transit].filter((p) => typeof p.lon === "number" && !isDuplicateMeasure(p.body));
}

/** The natal bodies and live transits standing in this card's own decans. */
export function occupantsOf(cardName: string, overlay: any): Occupant[] {
  const own = cardDecans(cardName);
  if (!own) return [];
  const byDecan = new Map(own.map((d) => [d.decan, d]));
  const out: Occupant[] = [];
  for (const p of placements(overlay)) {
    const hit = byDecan.get(decanAt(p.lon));
    if (hit) out.push({ body: p.body, source: p.source, decan: hit.decan, sign: signAt(p.lon), ...(hit.station ? { station: hit.station } : {}) });
  }
  return out;
}

/** The chart slice a prompt carries. A card with no company gets nothing, not a statement of absence. */
export function renderCompany(occupants: Occupant[]): string {
  if (!occupants.length) return "";
  const lines = occupants.map((o) => {
    const who = o.source === "natal" ? `Natal ${o.body}` : `Transiting ${o.body}`;
    return `- ${who} stands in ${decanName(o.decan)}${o.station ? `, at the ${o.station} station` : ""}.`;
  });
  return `\n**Company in this card's own decans (read each through the card, never as a chart fact in its own right):**\n${lines.join("\n")}\n`;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const ANGLES = /\byour\s+(ascendant|rising sign|midheaven|descendant)\b/gi;

/**
 * Chart statements in a reading that the gate did not allow. A planet's name alone is never flagged,
 * since the dossier's lords are planets: only a phrase that places it in this querent's chart or
 * today's sky counts, and "Saturn in Capricorn" counts only when the chart really has it there.
 */
export function flagChartBodies(text: string, overlay: any, allowed: Occupant[]): string[] {
  const placed = placements(overlay);
  const known = [...new Set(["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto",
    ...placed.map((p) => p.body)])];
  const isAllowed = (body: string, source: ChartSource) =>
    allowed.some((o) => o.source === source && o.body.toLowerCase() === body.toLowerCase());
  const flags = new Set<string>();
  const names = known.map(escape).join("|");

  for (const m of text.matchAll(new RegExp(`\\b(natal|your|transiting|today's|current)\\s+(?:the\\s+)?(${names})\\b`, "gi"))) {
    const source: ChartSource = /^(natal|your)$/i.test(m[1]) ? "natal" : "transit";
    if (!isAllowed(m[2], source)) flags.add(m[0]);
  }
  for (const m of text.matchAll(new RegExp(`\\b(${names})\\s+(?:is\\s+)?(?:in|through)\\s+(?:your\\s+)?(${SIGNS.join("|")})\\b`, "gi"))) {
    const here = placed.filter((p) => p.body.toLowerCase() === m[1].toLowerCase() && signAt(p.lon).toLowerCase() === m[2].toLowerCase());
    if (here.length && !here.some((p) => isAllowed(p.body, p.source))) flags.add(m[0]);
  }
  for (const m of text.matchAll(new RegExp(`\\b(${names})\\s+(?:is\\s+)?in\\s+(?:your|the)\\s+(?:\\w+)\\s+house\\b`, "gi"))) {
    flags.add(m[0]);   // the gate supplies decans only, so a house is never given, even for an occupant
  }
  for (const m of text.matchAll(ANGLES)) flags.add(m[0]);
  return [...flags];
}

export interface GateResult { text: string; flagged: string[]; rewritten: boolean }

/** One deterministic check and one retry. A reading still flagged after the retry is returned as it stands, with its flags. */
export async function enforceChartGate(
  text: string, flag: (t: string) => string[], rewrite: (flags: string[]) => Promise<string>,
): Promise<GateResult> {
  const first = flag(text);
  if (!first.length) return { text, flagged: [], rewritten: false };
  try {
    const next = await rewrite(first);
    return { text: next, flagged: flag(next), rewritten: true };
  } catch (err) {
    console.error("[chart gate] rewrite failed; keeping the flagged reading:", err);
    return { text, flagged: first, rewritten: false };
  }
}

/** The retry's instruction, listing exactly what the check caught. */
export function rewriteRequest(user: string, draft: string, flags: string[]): string {
  return `${user}\n\nYour draft follows. It states chart facts this card may not use: ${flags.join("; ")}. ` +
    `Rewrite it without them, changing nothing else that does not depend on them.\n\n--- DRAFT ---\n${draft}`;
}
