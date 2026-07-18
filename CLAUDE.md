# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`arcanum-dashboard` is the Tarot reading review/visualization UI for the PathsOfReverence ecosystem. It is a single-process app: an Express server ([server.ts](server.ts)) on port 3000 that mounts Vite middleware in dev (so the React SPA is served from the same origin as the API). There is no separate frontend dev server.

Originally scaffolded from Google AI Studio ("My Google AI Studio App" in [index.html](index.html), `GEMINI_API_KEY` is still wired through [vite.config.ts](vite.config.ts)), but the AI runtime now runs interpretations on **Claude Fable 5** (`claude-fable-5`, direct Anthropic API, with a server-side refusal fallback to Opus 4.8), enriched with **pre-fetched personalized astrological context** (Kairos natal + daily transit) and an optional **Mani (`attune`) cognitive-stack** perspective. Both the single-shot completion and the opt-in reporeason reasoning loop run on Fable 5 (Anthropic tool-use). It no longer uses Gemini or the local LiteLLM model.

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

- `ANTHROPIC_API_KEY` — key for the Anthropic API (Claude Fable 5 interpretations). Without it, the `/api/ai/*` routes throw at request time, not at boot.
- `KAIROS_BASE` — base URL of the Kairos charts API for astro context (default `https://raw-charts.dubtown-server.us`).
- `BIRTH_NAME`, `BIRTH_DATE`, `BIRTH_TIME`, `BIRTH_LATITUDE`, `BIRTH_LONGITUDE`, `BIRTH_CITY`, `BIRTH_TZ_OFFSET` — the querent's birth data used to compute the cached natal chart.
- `CURRENT_LATITUDE`, `CURRENT_LONGITUDE` — current observer location for the daily transit overlay. If birth/observer vars are missing, astro context degrades to "unavailable" placeholders (logged) but interpretation still runs.
- `DUBTOWN_API_KEY` — Bearer token for the readings backend proxy; required in production (the `/api/readings*` routes return 503 without it).
- `ENABLE_MCP` — optional; set to `"true"` to re-enable the dormant MCP client loop. Default off.
- `ENABLE_REPOREASON` — optional; `"true"` activates per-card live reasoning (Fable 5 calls the reporeason MCP engine via Anthropic tool-use) on `deep-interpretation`. Default off. Expensive/slow — gated + per-card cached.
- `REPOREASON_URL` — reporeason MCP endpoint (default `https://reporeason.dubtown-server.us/mcp`).
- `ENABLE_MANI` — optional; `"true"` adds a Mani (`attune`) cognitive-stack enrichment call per interpretation, injected into the prompt. Profile is chosen by card tier (Majors→arendt, Court/Majestic→jung, Minors by suit). Best-effort: connect/attune failure degrades to no enrichment (logged), never blocks. Default off.
- `MANI_URL` — Mani (keystone) MCP endpoint (default `https://mani.dubtown-server.us/mcp`).
- `GEMINI_API_KEY` — legacy, exposed to the client via Vite `define`. Not used by current code; leave blank.

## Architecture

### Single-server topology

[server.ts](server.ts) does five things in one process:
1. Holds **dormant MCP scaffolding** (`mcpClients`/`mcpTools` Maps, the `servers` list, the SDK imports). The connect-at-boot loop only runs when `ENABLE_MCP="true"`; by default it logs a dormancy notice and skips connecting. Interpretation no longer uses live tools — it uses pre-fetched context instead (see below).
2. Proxies `/api/readings*` to `https://readings.dubtown-server.us/readings*` with the Dubtown bearer token (the browser never sees the key).
3. Hosts `/api/ai/{deep-interpretation,oracle-insight,trend-insight}`. `oracle`/`trend` fetch whole-reading astro context and make one `callFable` completion. `deep-interpretation` builds **per-card** context (`getCardContext`) and — when `ENABLE_REPOREASON=true` — runs a bounded Fable 5 reporeason tool-use loop on top of it (else single-shot). When `ENABLE_MANI=true`, each endpoint also folds in a Mani `attune` cognitive-stack perspective. See "AI interpretation" below.
4. Hosts `/api/upload-cards` — multer disk upload to `public/cards/`, filenames normalized via `normalizeCardName()` (lowercase, strip leading number/`The `, spaces → underscores). The same normalization lives in [src/lib/api.ts](src/lib/api.ts) — keep them in sync.
5. In dev (`NODE_ENV=development` or `VITE_DEV_SERVER=true`), spins up Vite in middleware mode. In prod, serves `dist/` + `public/` and SPA-falls-back to `index.html`.

### AI interpretation (server/ modules)

The AI runtime is split into small, unit-tested modules under `server/`:
- [server/llm.ts](server/llm.ts) — `callFable(system, user)`: one single-shot Claude Fable 5 completion via the Anthropic SDK, with a server-side refusal fallback to Opus 4.8. Also owns the shared lazily-constructed Anthropic client (`client()`/`_setClient` test hook, `FABLE_MODEL`, `EFFORT`, `textOf`) that the reasoning loop reuses. Fable's thinking is always on and never configured here; depth is tuned with `output_config.effort`.
- [server/astroFormat.ts](server/astroFormat.ts) — pure extractors that turn Kairos payloads into compact text: `summarizeNatal`, `extractNatalPositions`, `summarizeTransit`, and `computeTransitAspects` (transit-to-natal aspects are computed locally from natal vs current longitudes, because Kairos's `cross_aspects` field is broken/empty).
- [server/astroContext.ts](server/astroContext.ts) — `getAstroContext()` (oracle/trend: whole-chart natal+transit, natal cached for process life, transit per day) AND `getCardContext(cardName)` (deep: one cached `transit/full` overlay per day → lean shared summary + a per-card focused slice). Degrades gracefully (logs + placeholder) on Kairos failure.
- [server/correspondences.ts](server/correspondences.ts) — static Golden Dawn card→planet/sign table (22 Majors, 36 decan pips, courts→element) used as the fallback anchor when a card has no direct placement.
- [server/cardChart.ts](server/cardChart.ts) — `buildCardPlacementIndex` (inverts Kairos `deep_analysis.esoteric.placements[]` into card→placement) and `resolveCardFocus` (direct placement hit → ruling-planet fallback → element note; appends transit-to-natal aspects for the linked body). This is what makes each card read differently.
- [server/prompts.ts](server/prompts.ts) — pure `buildDeepPrompt`/`buildOraclePrompt`/`buildTrendPrompt`, each returning `{ system, user }` with astro context injected.
- [server/agent.ts](server/agent.ts) — `runReasoningAgent`: bounded Claude Fable 5 **tool-use** loop (caps: `maxIters`=4, `maxToolCalls`=8, forced final answer) dispatching tool calls via an injected runner; `toAnthropicTools` maps MCP tool defs to Anthropic tool schema. On a Fable refusal it throws so the caller degrades to single-shot. Used for the reporeason path.
- [server/reporeason.ts](server/reporeason.ts) — optional reporeason MCP client (`initReporeason`/`reporeasonReady`/`reporeasonTools`/`reporeasonRunner`), gated by `ENABLE_REPOREASON`. `reporeasonTools()` returns Anthropic-shaped tools. Connect failure degrades to disabled (logged), never throws.
- [server/mani.ts](server/mani.ts) — optional Mani ("keystone") MCP client (`initMani`/`maniReady`/`maniAttune`/`profileForCard`), gated by `ENABLE_MANI`. One `attune` call per interpretation compiles a cognitive-stack document (profile by card tier) that is injected into the prompt. Best-effort: any failure yields `""` and never blocks interpretation.

`oracle`/`trend` endpoints follow `getAstroContext()` → (optional Mani `attune`) → build prompt → `callFable`. `deep-interpretation` is cache check → on miss: `getCardContext()` → (optional Mani `attune`, profile by card tier) → build prompt → (reporeason loop OR `callFable`), with a per-card cache keyed on a sha256 of the request inputs + day, and untrusted free-text clamped before it enters the prompt. The Mani call runs only on a cache miss. If you add a new AI endpoint, add a prompt builder rather than inlining prompt strings.

### Frontend data flow

- [src/lib/api.ts](src/lib/api.ts) — the **only** place where the wire shape from the readings API is normalized into the internal `Reading` / `DrawnCard` / `Card` types ([src/types/index.ts](src/types/index.ts)). The API returns two different card shapes (list vs. detail); `getCardMetadata()` handles both. Card metadata that isn't in [src/data/mockData.ts](src/data/mockData.ts) goes through a fallback parser that infers arcana/suit/numeral from the name.
- `normalizePositionId()` collapses many backend position labels (`"Present Situation"`, `"goal"`, `"hopes/fears"`, etc.) into a small canonical set used by [src/components/SpreadVisualizer.tsx](src/components/SpreadVisualizer.tsx) for layout. When adding a new spread layout, extend both this function and the visualizer.
- [src/lib/ai.ts](src/lib/ai.ts) — thin client wrappers around the `/api/ai/*` endpoints. The browser never imports `@anthropic-ai/sdk`.

### Auth (Authentik OIDC — BFF pattern)

Firebase auth was replaced by **Authentik OIDC**, with the Express server acting as a confidential OIDC client (backend-for-frontend). The SPA holds no secrets and asks the server who the user is.

- [server/oidc.ts](server/oidc.ts) — framework-agnostic OIDC core: `buildAuthUrl` (PKCE S256), `exchangeCode`, `refreshTokens`, `validateToken` (jose + Authentik JWKS; **issuer AND audience pinned** to this app's client_id), `isExpired`, `logoutUrl`. Reads `AUTHENTIK_*` env vars.
- [server/auth.ts](server/auth.ts) — Express layer: `registerAuthRoutes(app)` mounts `GET /api/auth/{login,callback,logout,me}`; `requireAuth` middleware validates the `por_session` cookie (auto-refreshing via `por_refresh`) and sets `req.user = {sub,email,name}`. `safeReturnTo` blocks open-redirects.
- [server/authProfile.ts](server/authProfile.ts) — at callback, MERGEs a `(:User {sub})` node on the **readings graph (:7687)** so `HAS_READING` links and sub-scoping have an anchor.
- [server.ts](server.ts) — `app.use("/api", requireAuth)` gates all `/api/*` except the auth routes + `/api/health`; the readings proxy injects `user_sub = req.user.sub` so the backend scopes readings to the caller (and 404s non-owners).
- [src/lib/AuthContext.tsx](src/lib/AuthContext.tsx) — SPA `AuthProvider` polls `GET /api/auth/me`; unauthenticated users see [src/components/LandingPage.tsx](src/components/LandingPage.tsx) with a "Sign In" link to `/api/auth/login`. Registration/enrollment lives in Authentik.

Per-user data (reading notes, saved insights, dashboard trend insight) persists to the Repository (:7687) keyed by the Authentik `sub` via [server/userData.ts](server/userData.ts) and the `/api/readings/:id/{annotations,note,insights/saved}` + `/api/trend-insight` endpoints. Card-layout drag positions are intentionally session-only (not persisted).

Required env: `AUTHENTIK_BASE_URL`, `AUTHENTIK_APP_SLUG=arcanum`, `AUTHENTIK_CLIENT_ID`, `AUTHENTIK_CLIENT_SECRET`, `AUTHENTIK_REDIRECT_URI=https://readings.pathsofreverence.com/api/auth/callback`, `NEO4J_READINGS_URI`/`NEO4J_READINGS_USER`/`NEO4J_READINGS_PASSWORD` (the :7687 readings graph), `SESSION_COOKIE_SECURE=true`.

## Place in the wider monorepo

This dashboard belongs to the **Sun path** (the 78 archetypal profiles) in the PathsOfReverence ecosystem — it surfaces saved readings and runs Oracle interpretations against them. It is not the Sun API itself; it is read-only against the readings service and read-mostly against the MCP-backed knowledge graphs (Saturn). See the parent [.claude/CLAUDE.md](../../.claude/CLAUDE.md) for the seven-paths overview and Saturn Neo4j instance map.

## Gotchas

- The directory name has a trailing ` (1)` — quote paths in shell commands.
- `dist/` is checked in (or at least present on disk) — `npm run clean` then `npm run build` if you suspect stale assets.
- Vite HMR is gated by `DISABLE_HMR` env var (see [vite.config.ts](vite.config.ts)) — set to `true` when running under an agent harness to avoid edit-induced reload churn.
- MCP is dormant by default (`ENABLE_MCP` unset). The boot log shows `[MCP] Dormant ...`. To re-enable the live tool loop you must both set `ENABLE_MCP="true"` AND re-wire the endpoints to use it — the interpretation path currently calls `callLiteLLM` directly with pre-fetched context, not the MCP tools.
- Astro context is cached in-process: the natal chart for the whole process lifetime, the daily transit per calendar day. Only the first interpretation each day hits Kairos for transits; a server restart re-fetches both. If birth/observer env vars are wrong, you'll see `[astroContext] ... fetch failed` logs and interpretations run with "unavailable" placeholders.
- `/api/graph/context` POSTs to `https://neo4j.dubtown-server.us/search` directly (not via MCP) and returns a stubbed string on failure rather than erroring — the AI endpoints will keep running with a "context unavailable" placeholder.
