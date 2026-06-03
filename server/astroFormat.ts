// server/astroFormat.ts — pure text extractors for Kairos chart payloads.

export const PLANET_ORDER = [
  "Sun", "Moon", "Mercury", "Venus", "Mars",
  "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto",
];

export const MAJOR_ASPECTS = new Set([
  "Conjunction", "Opposition", "Square", "Trine", "Sextile",
]);

export function summarizeNatal(natal: any): string {
  const raw = natal?._raw?.planets;
  if (!raw || typeof raw !== "object" || Object.keys(raw).length === 0) {
    return "Natal chart data unavailable.";
  }

  const lines: string[] = [];
  for (const name of PLANET_ORDER) {
    const p = raw[name];
    if (!p) continue;
    const rx = p.rx ? " Rx" : "";
    const house = p.house_w != null ? ` (H${p.house_w})` : "";
    lines.push(`${name} in ${p.sign} ${p.deg}°${house}${rx}`);
  }

  if (lines.length === 0) return "Natal chart data unavailable.";

  const rising = natal?.houses?.whole_sign?.[0]?.sign;
  const risingLine = rising ? `Rising (whole-sign): ${rising}. ` : "";

  const aspects = Array.isArray(natal?._raw?.aspects) ? natal._raw.aspects : [];
  const majors = aspects
    .filter((a: any) => MAJOR_ASPECTS.has(a.name) && typeof a.orb === "number" && a.orb <= 3)
    .slice(0, 8)
    .map((a: any) => `${a.p1} ${a.name} ${a.p2} (${a.orb.toFixed(1)}°)`);
  const aspectLine = majors.length
    ? `Major natal aspects: ${majors.join("; ")}.`
    : "Major natal aspects: none within 3°.";

  return [
    "NATAL CHART (whole-sign houses):",
    risingLine + lines.join(", ") + ".",
    aspectLine,
  ].join("\n");
}

/** Natal planet longitudes (degrees 0-360) keyed by planet, for aspect math. */
export function extractNatalPositions(natal: any): Record<string, number> {
  const raw = natal?._raw?.planets;
  const out: Record<string, number> = {};
  if (raw && typeof raw === "object") {
    for (const name of PLANET_ORDER) {
      const p = raw[name];
      if (p && typeof p.lon === "number") out[name] = p.lon;
    }
  }
  return out;
}
