# A — Per-Card Curated Astro Context — Combined Spec + Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. TDD, checkbox steps. Work in a clone of the `arcanum-dashboard` repo; run tests with `node --test server/*.test.ts` (Node 22+, zero deps).

**Goal:** Stop every card in a reading from receiving the same astro context. Give each card's deep interpretation a *lean shared chart summary* + a *focused slice* tied to that card's own symbolism (its linked placement in the querent's chart + that body's live transits).

**Status:** Design approved 2026-06-02. Ships before B. No new Kairos calls (reuses the cached `transit/full` natal, which already carries the esoteric placement→card scheme).

---

## 1. Problem

Today `deep-interpretation` injects the same `getAstroContext()` block (full natal + full transits + all transit-to-natal aspects) into every card's prompt. The shared block dominates; the model recycles the same chart talking points card after card. Differentiation must come from *per-card* context.

## 2. Decisions (from brainstorm)

1. **Context mix:** lean 1–2 line shared chart summary **+** per-card focused slice (not full block, not pure-slice).
2. **Bridge source:** invert `natal.deep_analysis.esoteric.placements[]` (already in the cached `transit/full` `.natal`) → `cardName → placement(s)`. Authoritative, per-querent, no new fetch.
3. **Unmapped cards:** fall back to the card's ruling planet/sign (static Golden Dawn table) → that body's natal placement.
4. **Scope:** `deep-interpretation` only. `oracle-insight` / `trend-insight` keep the existing whole-reading `getAstroContext()`.

## 3. Architecture

```
deep-interpretation(card)
  → getCardContext(cardName)
       → ensure natal cached (existing astroContext natal cache)
       → placementIndex = buildCardPlacementIndex(natal)         [cached per process]
       → leanSummary = summarizeChartLean(natal, transit)        [cached per day]
       → focus = resolveCardFocus(cardName, natal, placementIndex, transitAspects)
       → return `${leanSummary}\n\n${focus}`
  → buildDeepPrompt(card, reading, graphContext, cardContext)
  → callLiteLLM
```

### Components

- **`server/correspondences.ts`** *(new, pure data)* — static Golden Dawn attributions used only for the unmapped-card fallback: `MAJOR_CORRESPONDENCE` (22), `buildPipCorrespondence()` (40 pips from decans), `COURT_ELEMENT` (16), `SIGN_RULER`. Exposes `cardAnchor(cardName) → { planet?, sign?, element? }`.
- **`server/cardChart.ts`** *(new, pure)* — `buildCardPlacementIndex(natal)` and `resolveCardFocus(...)`.
- **`server/astroFormat.ts`** *(extend)* — `summarizeChartLean(natal, transit)` and `formatPlacementFocus(...)`.
- **`server/astroContext.ts`** *(extend)* — `getCardContext(cardName, fetcher?, today?)` + a process-life `_placementIndexCache` and per-day lean-summary cache; `_resetCaches()` clears them too.
- **`server/prompts.ts`** *(extend)* — `buildDeepPrompt` already takes an `astro` string; it keeps that signature — server.ts just passes the per-card context instead of the global one. (No prompt-builder change needed beyond a heading rename to "This Card's Astrological Focus".)
- **`server.ts`** — deep-interpretation calls `getCardContext(card.card.name)`.

### Caching & errors
- Placement index: built once per process (static per querent), stored next to the natal cache.
- Lean summary: per calendar day (depends on transit).
- Degradation order in `resolveCardFocus`: direct placement hit → ruling-planet fallback → element-only note → empty focus. `getCardContext` never throws; on natal failure it returns the existing "unavailable" lean text.

### Data shapes (from the live API, verified)
`natal.deep_analysis.esoteric.placements[]` = `{ body, sign, house, dignity:{statuses,score}, weight, cards:{ decan_pip:{card,planet,sign}, court_stretch, page_season, ace_element, sign_major, planet_major } }`.

Inversion rules (card → placement) per placement `p`:
- `p.cards.sign_major` → p (the card for p's sign)
- `p.cards.planet_major` → p (the card for p's body-as-planet)
- `p.cards.decan_pip.card` → p (the pip for p's decan)
- `p.cards.court_stretch`, `page_season`, `ace_element` → p (secondary; lower priority)

A card may map to several placements (e.g. "The Devil" → every Capricorn placement). Keep all; order by `|dignity.score|` desc then by scheme priority (sign_major/planet_major/decan_pip > stretches).

---

## 4. Plan (TDD)

### Task A1: Correspondences table (`correspondences.ts`)

**Files:** create `server/correspondences.ts`, `server/correspondences.test.ts`.

- [ ] **Step 1 — failing test** (`server/correspondences.test.ts`):

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { cardAnchor, SIGN_RULER } from "./correspondences.ts";

test("major cards resolve to planet or sign", () => {
  assert.deepEqual(cardAnchor("The Sun"), { planet: "Sun" });
  assert.deepEqual(cardAnchor("The Hermit"), { sign: "Virgo" });
  assert.equal(cardAnchor("The Tower").planet, "Mars");
});

test("pip cards resolve to their decan planet + sign", () => {
  // 2 of Wands = Aries decan 1 = Mars in Aries
  assert.deepEqual(cardAnchor("Two of Wands"), { planet: "Mars", sign: "Aries" });
  // 5 of Cups = Scorpio decan 1 = Mars in Scorpio
  assert.equal(cardAnchor("Five of Cups").sign, "Scorpio");
});

test("court cards resolve to suit element only", () => {
  assert.deepEqual(cardAnchor("Queen of Wands"), { element: "Fire" });
});

test("sign rulers are traditional", () => {
  assert.equal(SIGN_RULER["Capricorn"], "Saturn");
  assert.equal(SIGN_RULER["Virgo"], "Mercury");
});
```

- [ ] **Step 2 — run, expect fail.** `node --test server/correspondences.test.ts`
- [ ] **Step 3 — implement** `server/correspondences.ts`:

```ts
// Static Golden Dawn attributions. Used ONLY as the fallback anchor when a
// drawn card has no direct placement in the querent's chart.
export type Element = "Fire" | "Earth" | "Air" | "Water";
export interface CardAnchor { planet?: string; sign?: string; element?: Element; }

export const SIGN_RULER: Record<string, string> = {
  Aries: "Mars", Taurus: "Venus", Gemini: "Mercury", Cancer: "Moon",
  Leo: "Sun", Virgo: "Mercury", Libra: "Venus", Scorpio: "Mars",
  Sagittarius: "Jupiter", Capricorn: "Saturn", Aquarius: "Saturn", Pisces: "Jupiter",
};

const MAJOR: Record<string, CardAnchor> = {
  "The Fool": { planet: "Uranus", element: "Air" },
  "The Magician": { planet: "Mercury" },
  "The High Priestess": { planet: "Moon" },
  "The Empress": { planet: "Venus" },
  "The Emperor": { sign: "Aries" },
  "The Hierophant": { sign: "Taurus" },
  "The Lovers": { sign: "Gemini" },
  "The Chariot": { sign: "Cancer" },
  "Strength": { sign: "Leo" },
  "The Hermit": { sign: "Virgo" },
  "Wheel of Fortune": { planet: "Jupiter" },
  "Justice": { sign: "Libra" },
  "The Hanged Man": { planet: "Neptune", element: "Water" },
  "Death": { sign: "Scorpio" },
  "Temperance": { sign: "Sagittarius" },
  "The Devil": { sign: "Capricorn" },
  "The Tower": { planet: "Mars" },
  "The Star": { sign: "Aquarius" },
  "The Moon": { sign: "Pisces" },
  "The Sun": { planet: "Sun" },
  "Judgement": { planet: "Pluto", element: "Fire" },
  "The World": { planet: "Saturn" },
};

// Decan model: 36 decans of 10°, Chaldean planet order starting Mars@Aries-1.
const CHALDEAN = ["Mars", "Sun", "Venus", "Mercury", "Moon", "Saturn", "Jupiter"];
const ZODIAC = ["Aries","Taurus","Gemini","Cancer","Leo","Virgo","Libra",
  "Scorpio","Sagittarius","Capricorn","Aquarius","Pisces"];
// Suit → element → its [cardinal, fixed, mutable] signs (pips 2-4 / 5-7 / 8-10).
const SUIT_ELEMENT: Record<string, Element> = {
  Wands: "Fire", Cups: "Water", Swords: "Air", Pentacles: "Earth",
};
const ELEMENT_SIGNS: Record<Element, string[]> = {
  Fire: ["Aries", "Leo", "Sagittarius"],
  Water: ["Cancer", "Scorpio", "Pisces"],
  Air: ["Libra", "Aquarius", "Gemini"],
  Earth: ["Capricorn", "Taurus", "Virgo"],
};
const RANK_NUM: Record<string, number> = {
  Two: 2, Three: 3, Four: 4, Five: 5, Six: 6, Seven: 7, Eight: 8, Nine: 9, Ten: 10,
};

function decanPlanet(sign: string, decanInSign: number): string {
  // Absolute decan index across the zodiac (0..35), Chaldean order from Aries-1.
  const idx = ZODIAC.indexOf(sign) * 3 + decanInSign; // decanInSign 0..2
  return CHALDEAN[idx % 7];
}

/** Pip (2-10) → {planet, sign} via Golden Dawn decans. */
export function buildPipCorrespondence(): Record<string, CardAnchor> {
  const out: Record<string, CardAnchor> = {};
  for (const [suit, element] of Object.entries(SUIT_ELEMENT)) {
    const signs = ELEMENT_SIGNS[element];
    for (const [rank, n] of Object.entries(RANK_NUM)) {
      const block = Math.floor((n - 2) / 3);   // 0 cardinal,1 fixed,2 mutable
      const decanInSign = (n - 2) % 3;          // 0..2
      const sign = signs[block];
      out[`${rank} of ${suit}`] = { planet: decanPlanet(sign, decanInSign), sign };
    }
  }
  return out;
}

const PIP = buildPipCorrespondence();
const COURT_RANKS = ["Page", "Knight", "Queen", "King"];

export function cardAnchor(cardName: string): CardAnchor {
  if (MAJOR[cardName]) return MAJOR[cardName];
  if (PIP[cardName]) return PIP[cardName];
  const court = COURT_RANKS.find((r) => cardName.startsWith(r + " of "));
  if (court) {
    const suit = cardName.split(" of ")[1];
    const el = SUIT_ELEMENT[suit];
    if (el) return { element: el };
  }
  return {};
}
```

- [ ] **Step 4 — run, expect pass.** **Step 5 — commit** `feat(arcanum): card→astro correspondence table for fallback anchoring`.

### Task A2: Placement index + card focus (`cardChart.ts`)

**Files:** create `server/cardChart.ts`, `server/cardChart.test.ts`. Reuse the committed `server/__fixtures__/transit_full.json` (its `.natal` carries the esoteric placements). Reuse `computeTransitAspects`/`extractNatalPositions` from `astroFormat.ts` and `cardAnchor`/`SIGN_RULER` from `correspondences.ts`.

- [ ] **Step 1 — failing test** (`server/cardChart.test.ts`):

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { buildCardPlacementIndex, resolveCardFocus } from "./cardChart.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const overlay = JSON.parse(fs.readFileSync(path.join(__dirname, "__fixtures__/transit_full.json"), "utf8"));
const natal = overlay.natal;

test("index maps a sign_major card to every placement in that sign", () => {
  const idx = buildCardPlacementIndex(natal);
  // The Devil = Capricorn; Paul has Sun & Moon (and more) in Capricorn.
  const devil = idx["The Devil"] || [];
  const bodies = devil.map((p) => p.body);
  assert.ok(bodies.includes("Sun"));
  assert.ok(bodies.includes("Moon"));
});

test("index maps a planet_major card to that body", () => {
  const idx = buildCardPlacementIndex(natal);
  const sun = idx["The Sun"] || [];
  assert.ok(sun.some((p) => p.body === "Sun"));
});

test("resolveCardFocus uses a direct placement when present", () => {
  const idx = buildCardPlacementIndex(natal);
  const txt = resolveCardFocus("The Devil", natal, idx, overlay);
  assert.match(txt, /Capricorn/);
  assert.match(txt, /natal/i);
});

test("resolveCardFocus falls back to ruling planet for unmapped cards", () => {
  const idx = buildCardPlacementIndex(natal);
  // The Hermit = Virgo; if no Virgo placement, fall back to Virgo's ruler Mercury.
  const txt = resolveCardFocus("The Hermit", natal, idx, overlay);
  assert.match(txt, /Mercury|Virgo/);
  assert.ok(txt.length > 0);
});
```

- [ ] **Step 2 — run, expect fail.**
- [ ] **Step 3 — implement** `server/cardChart.ts`:

```ts
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

  // Direct hit: use the linked placement bodies.
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

  // Fallback: ruling planet / sign ruler.
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

  // Transit activity on the linked bodies.
  const positions2 = positions;
  const asp: string[] = [];
  for (const b of bodies) asp.push(...aspectsForBody(overlay, positions2, b));
  const uniqAsp = [...new Set(asp)].slice(0, 6);
  if (uniqAsp.length) lines.push(`Active now: ${uniqAsp.join("; ")}.`);

  return lines.length
    ? "THIS CARD'S ASTROLOGICAL FOCUS:\n" + lines.join("\n")
    : "";
}
```

- [ ] **Step 4 — run, expect pass.** **Step 5 — commit** `feat(arcanum): card↔placement index + per-card astro focus`.

### Task A3: Lean chart summary (`astroFormat.ts`)

**Files:** extend `server/astroFormat.ts` + `server/astroFormat.test.ts`.

- [ ] **Step 1 — failing test** (append):

```ts
import { summarizeChartLean } from "./astroFormat.ts";
test("summarizeChartLean is one short block with sun sign + a transit note", () => {
  const text = summarizeChartLean(overlay.natal, overlay);
  assert.match(text, /CHART SNAPSHOT/);
  assert.match(text, /Capricorn/);     // sun sign
  assert.ok(text.split("\n").length <= 3);
});
```
(Extend the existing import line to include `summarizeChartLean`.)

- [ ] **Step 2 — run, expect fail. Step 3 — implement** (append to `astroFormat.ts`):

```ts
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
```

- [ ] **Step 4 — run, expect pass. Step 5 — commit** `feat(arcanum): lean shared chart summary`.

### Task A4: getCardContext orchestration (`astroContext.ts`)

**Files:** extend `server/astroContext.ts` + `server/astroContext.test.ts`. Add a process-life placement-index cache and a per-day lean-summary cache; clear both in `_resetCaches`.

- [ ] **Step 1 — failing test** (append; reuses the existing `makeFetcher`/`beforeEach`):

```ts
import { getCardContext } from "./astroContext.ts";

test("getCardContext composes lean summary + card focus", async () => {
  const { f } = makeFetcher();
  const text = await getCardContext("The Devil", f, "2026-06-02");
  assert.match(text, /CHART SNAPSHOT/);
  assert.match(text, /ASTROLOGICAL FOCUS/);
  assert.match(text, /Capricorn/);
});

test("getCardContext fetches one overlay per day, shared across cards", async () => {
  const { f, calls } = makeFetcher();
  await getCardContext("The Devil", f, "2026-06-02");
  await getCardContext("The Star", f, "2026-06-02");   // same day → no refetch
  assert.equal(calls.transit, 1);   // overlay (transit/full) fetched once
  assert.equal(calls.natal, 0);     // natal comes from the overlay's .natal
  await getCardContext("The Sun", f, "2026-06-03");     // new day → refetch
  assert.equal(calls.transit, 2);
});
```

- [ ] **Step 2 — run, expect fail. Step 3 — implement.** Add to `astroContext.ts`:

```ts
import { buildCardPlacementIndex, resolveCardFocus, type PlacementRef } from "./cardChart.ts";
import { summarizeChartLean } from "./astroFormat.ts";

// Per-day raw overlay (transit/full contains BOTH .natal and .transit), plus
// the per-querent placement index (static) and per-day lean summary.
let _overlayCache: { date: string; data: any } | null = null;
let _indexCache: Record<string, PlacementRef[]> | null = null;
let _leanCache: { date: string; text: string } | null = null;
```
Extend `_resetCaches()` to also null `_overlayCache`, `_indexCache`, `_leanCache`. Then add:

```ts
async function getOverlay(f: KairosFetcher, today: string): Promise<any | null> {
  if (_overlayCache && _overlayCache.date === today) return _overlayCache.data;
  try {
    const data = await f.transitFull({
      birth_data: birthData(), anonymous: true,
      observer_latitude: observer().lat, observer_longitude: observer().lon,
    });
    _overlayCache = { date: today, data };
    return data;
  } catch (err) {
    console.error("[astroContext] card-context overlay fetch failed:", err);
    return null;
  }
}

export async function getCardContext(
  cardName: string,
  f: KairosFetcher = defaultKairosFetcher(),
  today: string = new Date().toISOString().slice(0, 10),
): Promise<string> {
  const overlay = await getOverlay(f, today);
  const natal = overlay?.natal;
  if (!natal) return "CHART SNAPSHOT: unavailable.";

  if (!_indexCache) _indexCache = buildCardPlacementIndex(natal);   // static per querent
  if (!_leanCache || _leanCache.date !== today) {
    _leanCache = { date: today, text: summarizeChartLean(natal, overlay) };
  }
  const focus = resolveCardFocus(cardName, natal, _indexCache, overlay);
  return focus ? `${_leanCache.text}\n\n${focus}` : _leanCache.text;
}
```

**Note:** `getCardContext` is self-contained — it gets natal *and* transit from one cached `transit/full` overlay per day, so it never calls `natalFull`. It does not touch the existing `_natalCache`/`_transitCache` (those still serve `getAstroContext` for oracle/trend). This means oracle/trend and deep each fetch their own daily `transit/full`; acceptable (both cached per day). A future cleanup could unify both on `getOverlay` — out of scope here.

- [ ] **Step 4 — run full suite, expect pass. Step 5 — commit** `feat(arcanum): getCardContext per-card context orchestration`.

### Task A5: Wire deep-interpretation + prompt heading

**Files:** `server.ts`, `server/prompts.ts`.

- [ ] **Step 1** — in `server/prompts.ts` `buildDeepPrompt`, rename the heading `**Querent's Astrological Context:**` to `**This Card's Astrological Focus:**` (the param stays `astro`). Update the prompts test assertion accordingly if it matches the old heading.
- [ ] **Step 2** — in `server.ts` deep-interpretation handler, replace `const astro = await getAstroContext();` with `const astro = await getCardContext(card?.card?.name);` and import `getCardContext`. Leave oracle/trend on `getAstroContext()`.
- [ ] **Step 3** — `npm run lint` (on a host with node_modules) → exit 0.
- [ ] **Step 4 — commit** `feat(arcanum): deep-interpretation uses per-card curated context`.

### Task A6: Deploy + live verification
- [ ] Deploy branch to CT 501, restart `arcanum-dashboard`.
- [ ] Direct check: a tiny script printing `getCardContext("The Hermit")` vs `getCardContext("The Sun")` — confirm the two focus blocks differ (different bodies/aspects).
- [ ] Smoke `deep-interpretation` for two different cards in one reading; confirm the interpretations reference different placements.

## 5. Verification
- All unit suites green (`node --test server/*.test.ts`).
- `tsc --noEmit` clean.
- Live: two cards in one reading yield distinct astro focus + distinct interpretations.

## 6. Out of scope (→ Doc B)
Live repository reasoning by alder-1-0 (reporeason tool loop). A produces the curated frame B will reason over.
