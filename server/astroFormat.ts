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

const ASPECT_ANGLES: Record<string, number> = {
  Conjunction: 0, Sextile: 60, Square: 90, Trine: 120, Opposition: 180,
};

export interface TransitAspect {
  transit: string; aspect: string; natal: string; orb: number;
}

/**
 * Transit-to-natal aspects computed locally (Kairos cross_aspects is broken).
 * For each transiting planet vs each natal planet, the angular separation is
 * matched against the major aspect angles within `orbDeg`. Returns tightest-first.
 */
export function computeTransitAspects(
  natalPositions: Record<string, number>,
  transitPlanets: any,
  orbDeg = 3,
): TransitAspect[] {
  const hits: TransitAspect[] = [];
  if (!transitPlanets || typeof transitPlanets !== "object") return hits;
  for (const t of PLANET_ORDER) {
    const tlon = transitPlanets[t]?.longitude;
    if (typeof tlon !== "number") continue;
    for (const n of PLANET_ORDER) {
      const nlon = natalPositions[n];
      if (typeof nlon !== "number") continue;
      let sep = Math.abs(tlon - nlon) % 360;
      if (sep > 180) sep = 360 - sep;
      for (const [name, ang] of Object.entries(ASPECT_ANGLES)) {
        const orb = Math.abs(sep - ang);
        if (orb <= orbDeg) {
          hits.push({ transit: t, aspect: name, natal: n, orb: Number(orb.toFixed(1)) });
        }
      }
    }
  }
  hits.sort((a, b) => a.orb - b.orb);
  return hits;
}

/** 1-2 line whole-chart grounding shared across all cards in a reading. */
export function summarizeChartLean(natal: any, overlay: any): string {
  const raw = natal?._raw?.planets;
  if (!raw) return "CHART SNAPSHOT: unavailable.";
  const sun = raw.Sun, moon = raw.Moon;
  const rising = natal?.houses?.whole_sign?.[0]?.sign;
  const head = `CHART SNAPSHOT: Sun ${sun?.sign ?? "?"}, Moon ${moon?.sign ?? "?"}` +
    (rising ? `, ${rising} rising` : "") + ".";
  const tp = overlay?.transit?.planets || {};
  const retro = PLANET_ORDER.filter((n) => tp[n]?.retrograde);
  const note = retro.length ? `Today: ${retro.join(", ")} retrograde.` : "";
  return note ? `${head}\n${note}` : head;
}

export function summarizeTransit(
  overlay: any,
  natalPositions: Record<string, number> = {},
): string {
  const planets = overlay?.transit?.planets;
  if (!planets || typeof planets !== "object" || Object.keys(planets).length === 0) {
    return "Today's transit data unavailable.";
  }

  const positions: string[] = [];
  const retro: string[] = [];
  for (const name of PLANET_ORDER) {
    const p = planets[name];
    if (!p || !p.sign || typeof p.sign_degree !== "number") continue;
    positions.push(`${name} in ${p.sign} ${Math.round(p.sign_degree)}°`);
    if (p.retrograde) retro.push(name);
  }

  const out: string[] = [
    "TODAY'S SKY (mundane transits):",
    positions.join(", ") + ".",
  ];
  if (retro.length) out.push(`Retrograde: ${retro.join(", ")}.`);

  const pats = overlay?.deep_analysis?.patterns?.patterns;
  if (Array.isArray(pats) && pats.length) {
    const names = pats
      .map((p: any) => (p.pattern ? `${p.pattern} (${(p.planets || []).join(", ")})` : null))
      .filter(Boolean)
      .slice(0, 4);
    if (names.length) out.push(`Notable transit patterns: ${names.join("; ")}.`);
  }

  const aspects = computeTransitAspects(natalPositions, planets);
  if (aspects.length) {
    const hits = aspects
      .slice(0, 10)
      .map((a) => `transiting ${a.transit} ${a.aspect} natal ${a.natal} (${a.orb.toFixed(1)}°)`);
    out.push(`Transit-to-natal aspects: ${hits.join("; ")}.`);
  }

  return out.join("\n");
}
