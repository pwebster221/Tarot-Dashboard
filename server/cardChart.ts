import { cardAnchor, SIGN_RULER } from "./correspondences.ts";
import { computeTransitAspects, extractNatalPositions } from "./astroFormat.ts";

export interface PlacementRef {
  body: string; sign: string; house: number;
  dignity?: string; scheme: string;
}

const SCHEME_PRIORITY: Record<string, number> = {
  sign_major: 0, planet_major: 0, decan_pip: 1,
  court_stretch: 2, page_season: 2, ace_element: 2,
};

/** Invert esoteric placements into cardName → PlacementRef[]. */
export function buildCardPlacementIndex(natal: any): Record<string, PlacementRef[]> {
  const placements = natal?.deep_analysis?.esoteric?.placements;
  const index: Record<string, PlacementRef[]> = {};
  if (!Array.isArray(placements)) return index;

  const add = (card: string | undefined, p: any, scheme: string) => {
    if (!card) return;
    (index[card] ||= []).push({
      body: p.body, sign: p.sign, house: p.house,
      dignity: p.dignity?.statuses?.[0], scheme,
    });
  };

  for (const p of placements) {
    const c = p.cards || {};
    add(c.sign_major, p, "sign_major");
    add(c.planet_major, p, "planet_major");
    add(c.decan_pip?.card, p, "decan_pip");
    add(c.court_stretch, p, "court_stretch");
    add(c.page_season, p, "page_season");
    add(c.ace_element, p, "ace_element");
  }

  for (const card of Object.keys(index)) {
    index[card].sort((a, b) =>
      (SCHEME_PRIORITY[a.scheme] ?? 9) - (SCHEME_PRIORITY[b.scheme] ?? 9));
  }
  return index;
}

function natalBodyLine(natal: any, body: string): string | null {
  const p = natal?._raw?.planets?.[body];
  if (!p) return null;
  const rx = p.rx ? " Rx" : "";
  return `natal ${body} in ${p.sign} ${p.deg}° (H${p.house_w})${rx}`;
}

function aspectsForBody(overlay: any, natalPositions: Record<string, number>, body: string): string[] {
  const all = computeTransitAspects(natalPositions, overlay?.transit?.planets);
  return all
    .filter((a) => a.natal === body || a.transit === body)
    .slice(0, 5)
    .map((a) => `transiting ${a.transit} ${a.aspect} natal ${a.natal} (${a.orb.toFixed(1)}°)`);
}

/** Compact, card-specific astrological focus text. */
export function resolveCardFocus(
  cardName: string, natal: any, index: Record<string, PlacementRef[]>, overlay: any,
): string {
  const positions = extractNatalPositions(natal);
  const refs = index[cardName] || [];

  const bodies: string[] = [];
  const lines: string[] = [];
  for (const r of refs.slice(0, 2)) {
    const line = natalBodyLine(natal, r.body);
    if (line && !bodies.includes(r.body)) {
      bodies.push(r.body);
      const dignity = r.dignity ? ` [${r.dignity}]` : "";
      lines.push(`${cardName} resonates with your ${line}${dignity} (via ${r.scheme.replace("_", " ")}).`);
    }
  }

  if (!bodies.length) {
    const anchor = cardAnchor(cardName);
    const body = anchor.planet || (anchor.sign ? SIGN_RULER[anchor.sign] : undefined);
    if (body) {
      const line = natalBodyLine(natal, body);
      if (line) {
        bodies.push(body);
        const via = anchor.planet ? `ruled by ${body}` : `${anchor.sign} (ruler ${body})`;
        lines.push(`${cardName} (${via}) draws on your ${line}.`);
      }
    } else if (anchor.element) {
      lines.push(`${cardName} carries ${anchor.element} energy; no direct natal placement.`);
    }
  }

  const asp: string[] = [];
  for (const b of bodies) asp.push(...aspectsForBody(overlay, positions, b));
  const uniqAsp = [...new Set(asp)].slice(0, 6);
  if (uniqAsp.length) lines.push(`Active now: ${uniqAsp.join("; ")}.`);

  return lines.length ? "THIS CARD'S ASTROLOGICAL FOCUS:\n" + lines.join("\n") : "";
}
