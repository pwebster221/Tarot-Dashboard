# Arcanum Interpretation → alder-1-0 via LiteLLM — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route all three Arcanum Dashboard interpretation endpoints through the local LiteLLM `alder-1-0` model, replacing Claude, with deterministic pre-fetched personalized astrological context instead of a live MCP tool loop.

**Architecture:** All changes on CT 501 (`/opt/arcanum-dashboard`). `server.ts` is decomposed into focused modules under `server/`: `llm.ts` (LiteLLM call), `astroFormat.ts` (pure natal/transit text extractors), `prompts.ts` (pure prompt builders), `astroContext.ts` (Kairos fetch + caching orchestration). `server.ts` becomes thin wiring. The MCP scaffolding stays but is gated dormant behind `ENABLE_MCP`. Frontend untouched.

**Tech Stack:** Node 22.22 (native TS type-stripping, built-in `node:test` runner — no new deps), Express, `fetch`. Kairos API at `raw-charts.dubtown-server.us`, LiteLLM at `10.20.0.153:4000`.

---

## Environment Notes (read before starting)

- All commands run **inside CT 501**. From the Proxmox host: `pct exec 501 -- bash -lc '<cmd>'`, or `pct enter 501` then `cd /opt/arcanum-dashboard`. The repo root is `/opt/arcanum-dashboard`.
- Node runs TypeScript directly (`node server.ts`) via native type-stripping — **no build step** for the server. Local TS imports use explicit `.ts` extensions (tsconfig has `allowImportingTsExtensions: true`).
- Tests run with the **built-in runner**: `node --test server/<file>.test.ts`. No vitest/jest.
- Lint/typecheck: `npm run lint` (`tsc --noEmit`).
- Service: `systemctl restart arcanum-dashboard` ; logs: `journalctl -u arcanum-dashboard -n 50 --no-pager`. App listens on port 3000.
- **Known limitation (worked around here):** Kairos `transit/full` returns top-level `cross_aspects: []` regardless of orb width or datetime (verified). We do NOT use it. Instead we compute transit-to-natal aspects locally from natal longitudes (cached) vs current transit longitudes — verified to find 13 aspects within 3° in the fixture. File a separate Kairos follow-up for the broken field, but it does not block this work.

## File Structure

- Create: `server/llm.ts` — `callLiteLLM(system, user)` → string.
- Create: `server/astroFormat.ts` — `summarizeNatal(natal)`, `extractNatalPositions(natal)`, `computeTransitAspects(natalPositions, transitPlanets, orb)`, `summarizeTransit(overlay, natalPositions)` (all pure).
- Create: `server/prompts.ts` — `buildDeepPrompt`, `buildOraclePrompt`, `buildTrendPrompt` (pure).
- Create: `server/astroContext.ts` — birth/observer from env, Kairos fetchers, caching, `getAstroContext()`.
- Create: `server/__fixtures__/transit_full.json` — real captured Kairos response for tests.
- Create: `server/astroFormat.test.ts`, `server/prompts.test.ts`, `server/llm.test.ts`, `server/astroContext.test.ts`.
- Modify: `server.ts` — wire new modules into the 3 handlers; gate MCP behind `ENABLE_MCP`; remove Anthropic interpretation code.
- Modify: `package.json` — add `"test"` script.
- Modify: `.env`, `.env.example` — LiteLLM + Kairos + birth/observer vars; drop `ANTHROPIC_API_KEY`/`GEMINI_API_KEY`.

---

### Task 1: Scaffolding — test script + real fixture

**Files:**
- Modify: `package.json` (scripts)
- Create: `server/__fixtures__/transit_full.json`

- [ ] **Step 1: Add the test script**

In `package.json`, add to `"scripts"` (keep existing entries):

```json
    "test": "node --test server/*.test.ts",
```

- [ ] **Step 2: Capture a real Kairos fixture**

Run (inside CT 501, repo root):

```bash
mkdir -p server/__fixtures__
curl -s --max-time 90 -X POST "https://raw-charts.dubtown-server.us/api/v1/transit/full" \
  -H "Content-Type: application/json" \
  -d '{"birth_data":{"name":"Paul Webster","date":"1989-01-06","time":"15:10","latitude":40.7128,"longitude":-74.0060,"city":"New York","tz_offset":-5.0},"anonymous":true,"observer_latitude":40.7128,"observer_longitude":-74.0060}' \
  -o server/__fixtures__/transit_full.json
```

Verify: `python3 -c "import json;d=json.load(open('server/__fixtures__/transit_full.json'));print(sorted(d.keys()))"`
Expected: `['chart_id', 'cross_aspects', 'deep_analysis', 'errors', 'meta', 'natal', 'persistence', 'privacy_notice', 'tiers', 'transit']`

- [ ] **Step 3: Commit**

```bash
git add package.json server/__fixtures__/transit_full.json
git commit -m "chore(arcanum): add node:test script + Kairos transit_full fixture"
```

---

### Task 2: Natal extractor (`summarizeNatal`)

The fixture's `natal.planets` is empty `{}`; planet data lives in `natal._raw.planets` (dict keyed by planet name, fields: `sign`, `deg`, `house_w` = whole-sign house, `rx` = retrograde). Whole-sign rising is `natal.houses.whole_sign[0].sign`. Major aspects are in `natal._raw.aspects` (`{p1,p2,name,orb,kind}`).

**Files:**
- Create: `server/astroFormat.ts`
- Test: `server/astroFormat.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { summarizeNatal } from "./astroFormat.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const overlay = JSON.parse(
  fs.readFileSync(path.join(__dirname, "__fixtures__/transit_full.json"), "utf8")
);

test("summarizeNatal includes header, Sun placement, and whole-sign houses", () => {
  const text = summarizeNatal(overlay.natal);
  assert.match(text, /NATAL CHART/);
  assert.match(text, /Sun[^\n]*Capricorn/);   // Paul's Sun is Capricorn
  assert.match(text, /H8/);                     // Sun whole-sign house = 8
});

test("summarizeNatal degrades gracefully on empty input", () => {
  assert.equal(summarizeNatal(null), "Natal chart data unavailable.");
  assert.equal(summarizeNatal({}), "Natal chart data unavailable.");
});

test("extractNatalPositions returns longitudes for the major planets", () => {
  const pos = extractNatalPositions(overlay.natal);
  assert.equal(typeof pos.Sun, "number");
  assert.ok(Object.keys(pos).length >= 8);
});
```

Update the import line at the top of this test file to include the new export:

```ts
import { summarizeNatal, extractNatalPositions } from "./astroFormat.ts";
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test server/astroFormat.test.ts`
Expected: FAIL — cannot find module `./astroFormat.ts` / `summarizeNatal is not a function`.

- [ ] **Step 3: Write minimal implementation**

```ts
// server/astroFormat.ts — pure text extractors for Kairos chart payloads.

const PLANET_ORDER = [
  "Sun", "Moon", "Mercury", "Venus", "Mars",
  "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto",
];

const MAJOR_ASPECTS = new Set([
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

  const rising = natal?.houses?.whole_sign?.[0]?.sign;
  const risingLine = rising ? `Rising (whole-sign): ${rising}. ` : "";

  const aspects = Array.isArray(natal?._raw?.aspects) ? natal._raw.aspects : [];
  const majors = aspects
    .filter((a: any) => MAJOR_ASPECTS.has(a.name) && a.orb <= 3)
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test server/astroFormat.test.ts`
Expected: PASS (2 natal tests pass).

- [ ] **Step 5: Commit**

```bash
git add server/astroFormat.ts server/astroFormat.test.ts
git commit -m "feat(arcanum): add summarizeNatal extractor"
```

---

### Task 3: Transit extractor (`summarizeTransit`)

`overlay.transit.planets` is a dict keyed by planet name (`sign`, `sign_degree`, `retrograde`). Transit patterns are at `overlay.deep_analysis.patterns.patterns` (list of `{pattern, planets}`). `overlay.cross_aspects` is currently always `[]` — include only if non-empty.

**Files:**
- Modify: `server/astroFormat.ts`
- Modify: `server/astroFormat.test.ts`

- [ ] **Step 1: Add the failing test**

Append to `server/astroFormat.test.ts` (and extend the top import to
`import { summarizeNatal, extractNatalPositions, summarizeTransit, computeTransitAspects } from "./astroFormat.ts";`):

```ts
test("summarizeTransit includes today's sky and patterns; no aspects without natal", () => {
  const text = summarizeTransit(overlay);   // no natal positions passed
  assert.match(text, /TODAY'S SKY/);
  assert.match(text, /Sun[^\n]*Gemini/);    // Sun transiting Gemini on 2026-06-02
  assert.doesNotMatch(text, /Transit-to-natal/);
});

test("computeTransitAspects finds major aspects within orb, sorted tightest-first", () => {
  const pos = extractNatalPositions(overlay.natal);
  const a = computeTransitAspects(pos, overlay.transit.planets, 3);
  assert.ok(a.length >= 5);                  // fixture has 13 within 3°
  assert.ok(a[0].orb <= a[a.length - 1].orb);
  // transiting Pluto is exactly conjunct natal Mercury in the fixture (0.0°)
  assert.ok(a.some((h) => h.transit === "Pluto" && h.aspect === "Conjunction" && h.natal === "Mercury"));
});

test("summarizeTransit appends locally-computed transit-to-natal aspects", () => {
  const pos = extractNatalPositions(overlay.natal);
  const text = summarizeTransit(overlay, pos);
  assert.match(text, /Transit-to-natal aspects:/);
  assert.match(text, /transiting Pluto Conjunction natal Mercury/);
});

test("summarizeTransit degrades gracefully", () => {
  assert.equal(summarizeTransit(null), "Today's transit data unavailable.");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test server/astroFormat.test.ts`
Expected: FAIL — `summarizeTransit is not a function`.

- [ ] **Step 3: Add the implementation**

Append to `server/astroFormat.ts`:

```ts
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
    if (!p) continue;
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
      .map((p: any) => `${p.pattern} (${(p.planets || []).join(", ")})`)
      .slice(0, 4);
    out.push(`Notable transit patterns: ${names.join("; ")}.`);
  }

  const aspects = computeTransitAspects(natalPositions, planets);
  if (aspects.length) {
    const hits = aspects
      .slice(0, 10)
      .map((a) => `transiting ${a.transit} ${a.aspect} natal ${a.natal} (${a.orb}°)`);
    out.push(`Transit-to-natal aspects: ${hits.join("; ")}.`);
  }

  return out.join("\n");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test server/astroFormat.test.ts`
Expected: PASS (all 5 tests).

- [ ] **Step 5: Commit**

```bash
git add server/astroFormat.ts server/astroFormat.test.ts
git commit -m "feat(arcanum): add summarizeTransit extractor"
```

---

### Task 4: Prompt builders (`prompts.ts`)

Pure functions returning `{ system, user }`. Port the existing prompt wording from `server.ts` and inject the astro context block. The frontend still sends the same payloads (`card`, `reading`, `graphContext`, `readings`).

**Files:**
- Create: `server/prompts.ts`
- Test: `server/prompts.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDeepPrompt, buildOraclePrompt, buildTrendPrompt } from "./prompts.ts";

const card = {
  position: { name: "Heart", description: "the emotional core" },
  card: { name: "The Star", suit: null, arcana: "Major", generalMeaning: "hope" },
  isReversed: false,
  specificMeaning: "renewal",
};
const reading = {
  querent: "Paul",
  question: "What now?",
  type: "Weekly",
  summary: "a turning point",
  drawnCards: [card],
};
const ASTRO = "NATAL CHART...\nTODAY'S SKY...";

test("buildDeepPrompt injects card, reading, graph + astro context", () => {
  const { system, user } = buildDeepPrompt(card, reading, "GRAPHCTX", ASTRO);
  assert.match(system, /Tarot Oracle/);
  assert.match(user, /The Star/);
  assert.match(user, /GRAPHCTX/);
  assert.match(user, /TODAY'S SKY/);
});

test("buildOraclePrompt and buildTrendPrompt inject astro context", () => {
  assert.match(buildOraclePrompt(reading, ASTRO).user, /TODAY'S SKY/);
  assert.match(buildTrendPrompt([reading], ASTRO).user, /TODAY'S SKY/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test server/prompts.test.ts`
Expected: FAIL — module/functions not found.

- [ ] **Step 3: Write the implementation**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test server/prompts.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add server/prompts.ts server/prompts.test.ts
git commit -m "feat(arcanum): add pure prompt builders with astro context injection"
```

---

### Task 5: LiteLLM call (`llm.ts`)

**Files:**
- Create: `server/llm.ts`
- Test: `server/llm.test.ts`

- [ ] **Step 1: Write the failing test (mocks global fetch)**

```ts
import { test, mock, afterEach } from "node:test";
import assert from "node:assert/strict";
import { callLiteLLM } from "./llm.ts";

afterEach(() => mock.restoreAll());

test("callLiteLLM posts OpenAI-shaped body to LiteLLM and returns content", async () => {
  process.env.LITELLM_BASE = "http://litellm.test/v1";
  process.env.LITELLM_API_KEY = "sk-test";

  const fetchMock = mock.method(globalThis, "fetch", async (url: any, init: any) => {
    assert.equal(url, "http://litellm.test/v1/chat/completions");
    const body = JSON.parse(init.body);
    assert.equal(body.model, "alder-1-0");
    assert.equal(body.messages[0].role, "system");
    assert.equal(body.messages[1].role, "user");
    assert.equal(init.headers.Authorization, "Bearer sk-test");
    return new Response(
      JSON.stringify({ choices: [{ message: { content: "ORACLE REPLY" } }] }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  });

  const out = await callLiteLLM("sys", "usr");
  assert.equal(out, "ORACLE REPLY");
  assert.equal(fetchMock.mock.callCount(), 1);
});

test("callLiteLLM throws with status + body on non-200", async () => {
  process.env.LITELLM_BASE = "http://litellm.test/v1";
  process.env.LITELLM_API_KEY = "sk-test";
  mock.method(globalThis, "fetch", async () =>
    new Response("boom", { status: 502 }));
  await assert.rejects(() => callLiteLLM("s", "u"), /LiteLLM 502: boom/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test server/llm.test.ts`
Expected: FAIL — module/function not found.

- [ ] **Step 3: Write the implementation**

```ts
// server/llm.ts — single-shot completion against the LiteLLM OpenAI-compatible API.

export async function callLiteLLM(system: string, user: string): Promise<string> {
  const base = process.env.LITELLM_BASE;
  const key = process.env.LITELLM_API_KEY;
  if (!base || !key) {
    throw new Error("LITELLM_BASE and LITELLM_API_KEY must be set");
  }

  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: "alder-1-0",
      max_tokens: 2048,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LiteLLM ${res.status}: ${text}`);
  }

  const data: any = await res.json();
  return data?.choices?.[0]?.message?.content ?? "";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test server/llm.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add server/llm.ts server/llm.test.ts
git commit -m "feat(arcanum): add callLiteLLM single-shot completion helper"
```

---

### Task 6: Astro context orchestration + caching (`astroContext.ts`)

Reads birth/observer from env, calls Kairos via an **injectable fetcher** (so it is unit-testable without network), caches natal long-term and transit per-day.

**Files:**
- Create: `server/astroContext.ts`
- Test: `server/astroContext.test.ts`

- [ ] **Step 1: Write the failing test (fake fetcher, asserts caching)**

```ts
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { getAstroContext, _resetCaches, type KairosFetcher } from "./astroContext.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const overlay = JSON.parse(
  fs.readFileSync(path.join(__dirname, "__fixtures__/transit_full.json"), "utf8"),
);

function makeFetcher() {
  const calls = { natal: 0, transit: 0 };
  const f: KairosFetcher = {
    async natalFull() { calls.natal++; return overlay.natal; },
    async transitFull() { calls.transit++; return overlay; },
  };
  return { f, calls };
}

beforeEach(() => {
  _resetCaches();
  process.env.BIRTH_NAME = "Paul Webster";
  process.env.BIRTH_DATE = "1989-01-06";
  process.env.BIRTH_TIME = "15:10";
  process.env.BIRTH_LATITUDE = "40.7128";
  process.env.BIRTH_LONGITUDE = "-74.0060";
  process.env.BIRTH_TZ_OFFSET = "-5.0";
  process.env.CURRENT_LATITUDE = "40.7128";
  process.env.CURRENT_LONGITUDE = "-74.0060";
});

test("getAstroContext composes natal + transit text", async () => {
  const { f } = makeFetcher();
  const text = await getAstroContext(f, "2026-06-02");
  assert.match(text, /NATAL CHART/);
  assert.match(text, /TODAY'S SKY/);
});

test("natal cached forever; transit cached per day", async () => {
  const { f, calls } = makeFetcher();
  await getAstroContext(f, "2026-06-02");
  await getAstroContext(f, "2026-06-02");      // same day -> no refetch
  assert.equal(calls.natal, 1);
  assert.equal(calls.transit, 1);
  await getAstroContext(f, "2026-06-03");      // new day -> transit refetch only
  assert.equal(calls.natal, 1);
  assert.equal(calls.transit, 2);
});

test("getAstroContext degrades when a fetcher throws", async () => {
  const f: KairosFetcher = {
    async natalFull() { throw new Error("down"); },
    async transitFull() { throw new Error("down"); },
  };
  const text = await getAstroContext(f, "2026-06-02");
  assert.match(text, /unavailable/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test server/astroContext.test.ts`
Expected: FAIL — module/exports not found.

- [ ] **Step 3: Write the implementation**

```ts
// server/astroContext.ts — birth/observer config, Kairos fetch, caching, composition.
import { summarizeNatal, summarizeTransit, extractNatalPositions } from "./astroFormat.ts";

export interface KairosFetcher {
  natalFull(body: any): Promise<any>;
  transitFull(body: any): Promise<any>;
}

let _natalCache: { text: string; positions: Record<string, number> } | null = null;
let _transitCache: { date: string; text: string } | null = null;

/** Test helper: clear in-memory caches. */
export function _resetCaches(): void {
  _natalCache = null;
  _transitCache = null;
}

function birthData() {
  return {
    name: process.env.BIRTH_NAME,
    date: process.env.BIRTH_DATE,
    time: process.env.BIRTH_TIME,
    latitude: Number(process.env.BIRTH_LATITUDE),
    longitude: Number(process.env.BIRTH_LONGITUDE),
    city: process.env.BIRTH_CITY,
    tz_offset: process.env.BIRTH_TZ_OFFSET != null
      ? Number(process.env.BIRTH_TZ_OFFSET) : undefined,
  };
}

function observer() {
  return {
    lat: Number(process.env.CURRENT_LATITUDE),
    lon: Number(process.env.CURRENT_LONGITUDE),
  };
}

const KAIROS_BASE = () => process.env.KAIROS_BASE || "https://raw-charts.dubtown-server.us";

export function defaultKairosFetcher(): KairosFetcher {
  return {
    async natalFull(body) {
      const r = await fetch(`${KAIROS_BASE()}/api/v1/natal/full`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(`Kairos natal ${r.status}`);
      return r.json();
    },
    async transitFull(body) {
      const r = await fetch(`${KAIROS_BASE()}/api/v1/transit/full`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(`Kairos transit ${r.status}`);
      return r.json();
    },
  };
}

async function natalSummary(
  f: KairosFetcher,
): Promise<{ text: string; positions: Record<string, number> }> {
  if (_natalCache) return _natalCache;
  try {
    const data = await f.natalFull({
      birth_data: birthData(),
      anonymous: true,
      house_system: "whole_sign",
    });
    _natalCache = {
      text: summarizeNatal(data),
      positions: extractNatalPositions(data),
    };
  } catch {
    return { text: "Natal chart data unavailable.", positions: {} };
  }
  return _natalCache;
}

async function transitSummary(
  f: KairosFetcher,
  today: string,
  natalPositions: Record<string, number>,
): Promise<string> {
  if (_transitCache && _transitCache.date === today) return _transitCache.text;
  try {
    const obs = observer();
    const data = await f.transitFull({
      birth_data: birthData(),
      anonymous: true,
      observer_latitude: obs.lat,
      observer_longitude: obs.lon,
    });
    const text = summarizeTransit(data, natalPositions);
    _transitCache = { date: today, text };
    return text;
  } catch {
    return "Today's transit data unavailable.";
  }
}

export async function getAstroContext(
  f: KairosFetcher = defaultKairosFetcher(),
  today: string = new Date().toISOString().slice(0, 10),
): Promise<string> {
  // Natal resolves first: its positions feed the transit-to-natal aspect math.
  const natal = await natalSummary(f);
  const transit = await transitSummary(f, today, natal.positions);
  return `${natal.text}\n\n${transit}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test server/astroContext.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Run the whole suite + commit**

Run: `node --test server/*.test.ts`
Expected: PASS (all files).

```bash
git add server/astroContext.ts server/astroContext.test.ts
git commit -m "feat(arcanum): add astro context orchestration with natal/daily caching"
```

---

### Task 7: Wire modules into `server.ts` (remove Anthropic, gate MCP)

**Files:**
- Modify: `server.ts`

- [ ] **Step 1: Replace the Anthropic import**

Remove this line:

```ts
import Anthropic from "@anthropic-ai/sdk";
```

Add near the other imports (after the MCP imports):

```ts
import { callLiteLLM } from "./server/llm.ts";
import { getAstroContext } from "./server/astroContext.ts";
import { buildDeepPrompt, buildOraclePrompt, buildTrendPrompt } from "./server/prompts.ts";
```

- [ ] **Step 2: Gate the MCP connection loop (dormant by default)**

Wrap the existing `for (const url of servers) { ... }` block so it only runs when explicitly enabled. Replace the loop's surrounding with:

```ts
  if (process.env.ENABLE_MCP === "true") {
    for (const url of servers) {
      // ... existing connect/listTools body unchanged ...
    }
  } else {
    console.log("[MCP] Dormant (ENABLE_MCP != 'true'); interpretation uses pre-fetched context.");
  }
```

(Keep the `mcpClients`/`mcpTools`/`servers` declarations as-is — scaffolding stays.)

- [ ] **Step 3: Delete the Anthropic agent code**

Remove the entire `const getAI = () => { ... };` block and the entire `async function runAgent(prompt, systemPrompt) { ... }` function. They are no longer referenced.

- [ ] **Step 4: Rewrite the three AI endpoints**

Replace the three `app.post("/api/ai/...")` handlers with:

```ts
  app.post("/api/ai/deep-interpretation", async (req, res) => {
    try {
      const { card, reading, graphContext } = req.body;
      const astro = await getAstroContext();
      const { system, user } = buildDeepPrompt(card, reading, graphContext, astro);
      const result = await callLiteLLM(system, user);
      res.json({ result });
    } catch (err: any) {
      console.error("[AI Server Error] Deep Interpretation:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/ai/oracle-insight", async (req, res) => {
    try {
      const { reading } = req.body;
      const astro = await getAstroContext();
      const { system, user } = buildOraclePrompt(reading, astro);
      const result = await callLiteLLM(system, user);
      res.json({ result });
    } catch (err: any) {
      console.error("[AI Server Error] Oracle Insight:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/ai/trend-insight", async (req, res) => {
    try {
      const { readings } = req.body;
      const astro = await getAstroContext();
      const { system, user } = buildTrendPrompt(readings, astro);
      const result = await callLiteLLM(system, user);
      res.json({ result });
    } catch (err: any) {
      console.error("[AI Server Error] Trend Insight:", err);
      res.status(500).json({ error: err.message });
    }
  });
```

- [ ] **Step 5: Typecheck**

Run: `npm run lint`
Expected: PASS (no type errors). If `tsc` flags an unused `Anthropic`/MCP symbol, ensure Step 1/3 removed all references.

- [ ] **Step 6: Commit**

```bash
git add server.ts
git commit -m "feat(arcanum): route interpretation through alder-1-0 + pre-fetched astro context"
```

---

### Task 8: Config + deploy + smoke test

**Files:**
- Modify: `.env`, `.env.example`

- [ ] **Step 1: Update `.env`**

Set the file contents to (verify LiteLLM IP `10.20.0.153` is current first: `curl -s --max-time 6 http://10.20.0.153:4000/v1/models -H "Authorization: Bearer sk-local-supermemory"`):

```
LITELLM_BASE=http://10.20.0.153:4000/v1
LITELLM_API_KEY=sk-local-supermemory
KAIROS_BASE=https://raw-charts.dubtown-server.us
DUBTOWN_API_KEY=<keep existing value>
BIRTH_NAME=Paul Webster
BIRTH_DATE=1989-01-06
BIRTH_TIME=15:10
BIRTH_LATITUDE=40.7128
BIRTH_LONGITUDE=-74.0060
BIRTH_CITY=New York
BIRTH_TZ_OFFSET=-5.0
CURRENT_LATITUDE=40.7128
CURRENT_LONGITUDE=-74.0060
```

Preserve the real existing `DUBTOWN_API_KEY` value (read it first: `grep DUBTOWN_API_KEY .env`). Drop `ANTHROPIC_API_KEY` and `GEMINI_API_KEY`.

- [ ] **Step 2: Update `.env.example`** (no secret values)

```
LITELLM_BASE=http://10.20.0.153:4000/v1
LITELLM_API_KEY=
KAIROS_BASE=https://raw-charts.dubtown-server.us
DUBTOWN_API_KEY=
BIRTH_NAME=
BIRTH_DATE=
BIRTH_TIME=
BIRTH_LATITUDE=
BIRTH_LONGITUDE=
BIRTH_CITY=
BIRTH_TZ_OFFSET=
CURRENT_LATITUDE=
CURRENT_LONGITUDE=
ENABLE_MCP=false
```

- [ ] **Step 3: Restart the service**

```bash
systemctl restart arcanum-dashboard
sleep 3
systemctl is-active arcanum-dashboard
journalctl -u arcanum-dashboard -n 30 --no-pager
```

Expected: `active`; log shows `[MCP] Dormant...` and `Server running on http://localhost:3000`.

- [ ] **Step 4: Smoke-test each endpoint**

```bash
curl -s -X POST http://localhost:3000/api/ai/oracle-insight \
  -H "Content-Type: application/json" \
  -d '{"reading":{"querent":"Paul","question":"What now?","type":"Weekly","summary":"a turning point","drawnCards":[{"card":{"name":"The Star","arcana":"Major"},"isReversed":false,"position":{"name":"Heart"}}]}}' \
  -w "\nHTTP %{http_code}\n"
```

Expected: HTTP 200, JSON `{"result":"<non-empty interpretation>"}`. Repeat for `deep-interpretation` (include `card`, `reading`, `graphContext`) and `trend-insight` (`readings` array).

- [ ] **Step 5: Verify astro context + caching in logs**

The first interpretation of the day triggers one Kairos natal + one transit fetch; subsequent calls reuse caches (no extra Kairos latency). Confirm interpretations render in the dashboard UI (open the app, generate an Oracle Insight).

- [ ] **Step 6: Commit**

```bash
git add .env.example
git commit -m "chore(arcanum): env config for LiteLLM + Kairos + birth data; drop Anthropic/Gemini"
```

(Note: `.env` is gitignored — do not commit it. Only `.env.example` is tracked.)

---

## Self-Review

- **Spec coverage:** (A) model swap → Tasks 5,7. (B) personalized natal+transit pre-fetch + caching → Tasks 2,3,6. neo4j correspondences retained via existing `/api/graph/context` (untouched) + injected in Task 4. Mani dropped / MCP dormant → Task 7 Step 2. (C) graceful degradation → Tasks 2,3,5,6. (D/E) env config + birth data seed → Task 8. Verification list → Task 8 Steps 3-5. All spec sections covered.
- **Deviation from spec:** spec proposed widening transit orbs to ~3° to populate Kairos `cross_aspects`; verification proved that field stays empty regardless. Per user direction, transit-to-natal aspects are instead **computed locally** (`computeTransitAspects`) from cached natal longitudes vs current transit longitudes — verified to find 13 aspects within 3° in the fixture. Kairos `cross_aspects` is no longer used; logged as a separate follow-up.
- **Type consistency:** `KairosFetcher.natalFull/transitFull`, `getAstroContext(f, today)`, `callLiteLLM(system, user)`, `buildDeepPrompt(card, reading, graphContext, astro)`, `summarizeNatal(natal)`, `extractNatalPositions(natal)`, `computeTransitAspects(natalPositions, transitPlanets, orb)`, `summarizeTransit(overlay, natalPositions)` — names/signatures consistent across tasks and call sites. Natal cache stores `{text, positions}`; `getAstroContext` resolves natal before transit so positions feed the aspect math.
- **Placeholders:** none — all code and commands are concrete.
