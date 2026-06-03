# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`arcanum-dashboard` is the Tarot reading review/visualization UI for the PathsOfReverence ecosystem. It is a single-process app: an Express server ([server.ts](server.ts)) on port 3000 that mounts Vite middleware in dev (so the React SPA is served from the same origin as the API). There is no separate frontend dev server.

Originally scaffolded from Google AI Studio ("My Google AI Studio App" in [index.html](index.html), `GEMINI_API_KEY` is still wired through [vite.config.ts](vite.config.ts)), but the AI runtime now uses the **local LiteLLM model `alder-1-0`** (a tool-calling-tuned Hermes on CT 560) via a single OpenAI-compatible chat completion, enriched with **pre-fetched personalized astrological context** (Kairos natal + daily transit). It no longer uses Gemini, Anthropic Claude, or a live MCP tool loop.

## Common commands

```bash
npm run dev       # tsx server.ts — runs Express + Vite middleware, port 3000
npm run build     # vite build → dist/
npm start         # node server.ts (production; expects dist/ to exist)
npm run lint      # tsc --noEmit (this is the only "test" — no test framework configured)
npm run clean     # rm -rf dist
```

There IS now a small unit-test suite for the server modules under `server/`, run with Node's built-in runner: `npm test` (`node --test server/*.test.ts`). It needs no extra dependencies (Node 22+ strips TS types and ships `node:test`). `npm run lint` (`tsc --noEmit`) remains the canonical typecheck.

Node >= 22 is required (declared in [package.json](package.json)).

## Required env vars (.env)

- `LITELLM_BASE` — base URL of the LiteLLM OpenAI-compatible API (e.g. `http://10.20.0.153:4000/v1`; the IP is DHCP — verify it).
- `LITELLM_API_KEY` — bearer key for LiteLLM. Without `LITELLM_BASE`/`LITELLM_API_KEY`, the `/api/ai/*` routes throw at request time, not at boot.
- `KAIROS_BASE` — base URL of the Kairos charts API for astro context (default `https://raw-charts.dubtown-server.us`).
- `BIRTH_NAME`, `BIRTH_DATE`, `BIRTH_TIME`, `BIRTH_LATITUDE`, `BIRTH_LONGITUDE`, `BIRTH_CITY`, `BIRTH_TZ_OFFSET` — the querent's birth data used to compute the cached natal chart.
- `CURRENT_LATITUDE`, `CURRENT_LONGITUDE` — current observer location for the daily transit overlay. If birth/observer vars are missing, astro context degrades to "unavailable" placeholders (logged) but interpretation still runs.
- `DUBTOWN_API_KEY` — Bearer token for the readings backend proxy; required in production (the `/api/readings*` routes return 503 without it).
- `ENABLE_MCP` — optional; set to `"true"` to re-enable the dormant MCP client loop. Default off.
- `GEMINI_API_KEY` — legacy, exposed to the client via Vite `define`. Not used by current code; leave blank.

## Architecture

### Single-server topology

[server.ts](server.ts) does five things in one process:
1. Holds **dormant MCP scaffolding** (`mcpClients`/`mcpTools` Maps, the `servers` list, the SDK imports). The connect-at-boot loop only runs when `ENABLE_MCP="true"`; by default it logs a dormancy notice and skips connecting. Interpretation no longer uses live tools — it uses pre-fetched context instead (see below).
2. Proxies `/api/readings*` to `https://readings.dubtown-server.us/readings*` with the Dubtown bearer token (the browser never sees the key).
3. Hosts `/api/ai/{deep-interpretation,oracle-insight,trend-insight}` — each fetches astro context, builds a prompt, and makes one `callLiteLLM` completion (no loop). See "AI interpretation" below.
4. Hosts `/api/upload-cards` — multer disk upload to `public/cards/`, filenames normalized via `normalizeCardName()` (lowercase, strip leading number/`The `, spaces → underscores). The same normalization lives in [src/lib/api.ts](src/lib/api.ts) — keep them in sync.
5. In dev (`NODE_ENV=development` or `VITE_DEV_SERVER=true`), spins up Vite in middleware mode. In prod, serves `dist/` + `public/` and SPA-falls-back to `index.html`.

### AI interpretation (server/ modules)

The AI runtime is split into small, unit-tested modules under `server/`:
- [server/llm.ts](server/llm.ts) — `callLiteLLM(system, user)`: one OpenAI-shaped chat completion against `LITELLM_BASE` with model `alder-1-0`. No streaming, no tools.
- [server/astroFormat.ts](server/astroFormat.ts) — pure extractors that turn Kairos payloads into compact text: `summarizeNatal`, `extractNatalPositions`, `summarizeTransit`, and `computeTransitAspects` (transit-to-natal aspects are computed locally from natal vs current longitudes, because Kairos's `cross_aspects` field is broken/empty).
- [server/astroContext.ts](server/astroContext.ts) — `getAstroContext()`: fetches the Kairos natal (`/api/v1/natal/full`) and daily transit (`/api/v1/transit/full`) charts via an injectable fetcher, **caches the natal for the process lifetime and the transit per calendar day**, and composes them into one text block. Degrades gracefully (logs + placeholder) on Kairos failure.
- [server/prompts.ts](server/prompts.ts) — pure `buildDeepPrompt`/`buildOraclePrompt`/`buildTrendPrompt`, each returning `{ system, user }` with the astro context injected.

Each AI endpoint is now three lines: `getAstroContext()` → build the prompt → `callLiteLLM`. If you add a new AI endpoint, follow that same shape and add a prompt builder rather than inlining prompt strings.

### Frontend data flow

- [src/lib/api.ts](src/lib/api.ts) — the **only** place where the wire shape from the readings API is normalized into the internal `Reading` / `DrawnCard` / `Card` types ([src/types/index.ts](src/types/index.ts)). The API returns two different card shapes (list vs. detail); `getCardMetadata()` handles both. Card metadata that isn't in [src/data/mockData.ts](src/data/mockData.ts) goes through a fallback parser that infers arcana/suit/numeral from the name.
- `normalizePositionId()` collapses many backend position labels (`"Present Situation"`, `"goal"`, `"hopes/fears"`, etc.) into a small canonical set used by [src/components/SpreadVisualizer.tsx](src/components/SpreadVisualizer.tsx) for layout. When adding a new spread layout, extend both this function and the visualizer.
- [src/lib/ai.ts](src/lib/ai.ts) — thin client wrappers around the `/api/ai/*` endpoints. The browser never imports `@anthropic-ai/sdk`.

### Auth

Firebase Auth + Firestore in [src/lib/firebase.ts](src/lib/firebase.ts) and [src/lib/AuthContext.tsx](src/lib/AuthContext.tsx). `firestoreDatabaseId` is read from [firebase-applet-config.json](firebase-applet-config.json). `AuthProvider` blocks rendering until the auth state resolves. User profile (`{ name, email }`) is loaded from `users/{uid}`; the `name` field is what filters readings to the current reader. The Firestore schema is documented in [firebase-blueprint.json](firebase-blueprint.json) (entities: `User`, `Insight`); rules in [firestore.rules](firestore.rules).

## Place in the wider monorepo

This dashboard belongs to the **Sun path** (the 78 archetypal profiles) in the PathsOfReverence ecosystem — it surfaces saved readings and runs Oracle interpretations against them. It is not the Sun API itself; it is read-only against the readings service and read-mostly against the MCP-backed knowledge graphs (Saturn). See the parent [.claude/CLAUDE.md](../../.claude/CLAUDE.md) for the seven-paths overview and Saturn Neo4j instance map.

## Gotchas

- The directory name has a trailing ` (1)` — quote paths in shell commands.
- `dist/` is checked in (or at least present on disk) — `npm run clean` then `npm run build` if you suspect stale assets.
- Vite HMR is gated by `DISABLE_HMR` env var (see [vite.config.ts](vite.config.ts)) — set to `true` when running under an agent harness to avoid edit-induced reload churn.
- MCP is dormant by default (`ENABLE_MCP` unset). The boot log shows `[MCP] Dormant ...`. To re-enable the live tool loop you must both set `ENABLE_MCP="true"` AND re-wire the endpoints to use it — the interpretation path currently calls `callLiteLLM` directly with pre-fetched context, not the MCP tools.
- Astro context is cached in-process: the natal chart for the whole process lifetime, the daily transit per calendar day. Only the first interpretation each day hits Kairos for transits; a server restart re-fetches both. If birth/observer env vars are wrong, you'll see `[astroContext] ... fetch failed` logs and interpretations run with "unavailable" placeholders.
- `/api/graph/context` POSTs to `https://neo4j.dubtown-server.us/search` directly (not via MCP) and returns a stubbed string on failure rather than erroring — the AI endpoints will keep running with a "context unavailable" placeholder.
