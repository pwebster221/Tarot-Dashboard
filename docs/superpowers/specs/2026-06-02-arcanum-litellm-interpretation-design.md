# Arcanum Dashboard — Route Interpretation to alder-1-0 via LiteLLM

**Date:** 2026-06-02
**Status:** Design approved, pending implementation plan
**Scope:** `server.ts` + `.env` on CT 501 (`/opt/arcanum-dashboard`). No frontend changes.

## Problem

The Arcanum Dashboard's three LLM interpretation endpoints
(`/api/ai/deep-interpretation`, `/api/ai/oracle-insight`, `/api/ai/trend-insight`)
currently run server-side through the Anthropic SDK (`claude-opus-4-7`) in an
agentic tool-use loop (`runAgent`, up to 10 iterations) wired to three MCP
servers (Kairos `kaimcp`, Mani, neo4j).

Goal: route all interpretation through the local LiteLLM instance on CT 560
(`http://10.20.0.153:4000/v1`, model `alder-1-0`, the custom Hermes model),
replacing Claude — primarily to cut Anthropic cost. Local Hermes is unreliable
at multi-step function-calling, so the live agentic tool loop is replaced with
deterministic, pre-fetched, personalized astrological context.

## Decisions (from brainstorming)

1. **Model:** Interpretation runs on `alder-1-0` via LiteLLM, replacing Claude.
   LiteLLM exposes only this one model, OpenAI-style.
2. **Tools:** No live agentic tool loop. Keep **Kairos** (daily transit chart)
   and **neo4j** (card correspondences) as deterministic pre-fetches. **Drop
   Mani** (broken). MCP client scaffolding stays in `server.ts` but **dormant**.
3. **Personalization:** Context is personalized — pull birth data + current
   location, run Kairos `natal/full` and `transit/full` against them.
4. **Birth data source:** Seed canonical birth data + current location into
   arcanum-dashboard `.env` (values already in `DailyAPICall/.env`, sourced from
   the repository). Static data; live HTTP profile endpoints are currently broken
   (v1 `/sacred-journey/profile/{id}` returns 500; v2 profile lacks birth fields).

## Architecture

All changes confined to `server.ts`. The frontend (`src/lib/ai.ts`) only calls
local `/api/ai/*` and `/api/graph/context`, so the model swap is invisible to the
UI; request/response contracts of all three endpoints are unchanged.

### A. LLM call

- Remove `@anthropic-ai/sdk` usage: `getAI()`, `runAgent()`, `claude-opus-4-7`.
- Replace with a plain `fetch` to `POST {LITELLM_BASE}/chat/completions`
  (`LITELLM_BASE=http://10.20.0.153:4000/v1`), model `alder-1-0`, bearer
  `LITELLM_API_KEY`. Use `fetch` (not the `openai` package) for consistency with
  the existing HTTP style in `server.ts` — no new dependency.
- Each endpoint sends two messages: `{role:"system", ...}` + `{role:"user", ...}`.
  Single completion, no loop. Response text = `choices[0].message.content`.
- `ANTHROPIC_API_KEY` becomes dead; remove from `.env` / `.env.example`.

### B. Personalized astro-context module (new helper in server.ts)

Builds a **compact** text block (~400–600 tokens) — never the raw ~275KB payload.

- **Natal summary** — computed once via Kairos `POST /api/v1/natal/full`, cached
  long-term in-memory (birth data is static). Extract: each planet → sign,
  degree, house, dignity; major natal aspects; a few `deep_analysis` highlights
  (esoteric / patterns). House system: **Whole Sign** (user default).
- **Daily transit summary** — Kairos `POST /api/v1/transit/full` with **widened
  orbs (~3°)** so `cross_aspects` populates (default 1° orbs returned `[]`).
  Cached by date key `YYYY-MM-DD`; first call of the day computes, rest reuse.
  Extract: today's planet positions + active transit-to-natal aspects.
- Both `/full` calls use `anonymous: true` with explicit `birth_data` +
  `observer_latitude/longitude` from `.env`.
- The combined natal + transit text block is injected into **all three**
  interpretation prompts. neo4j card correspondences remain a per-card pre-fetch
  on `deep-interpretation` only (existing `/api/graph/context`).

### C. Caching

Module-level in-memory state:
- `natalSummaryCache: string | null` — computed once, no expiry.
- `transitSummaryCache: { date: string, text: string } | null` — refreshed on
  date rollover. Survives until process restart.

### D. Error handling (graceful degradation — interpretation always runs)

- Kairos natal/transit fetch fails → context line "Personalized chart data
  unavailable"; interpretation proceeds. (Mirrors existing graph-context fallback.)
- neo4j correspondence fetch fails → existing fallback text (unchanged).
- LiteLLM non-200 → endpoint returns 500 with the error body (as today).

### E. Config (`.env` on CT 501)

Add:
```
LITELLM_BASE=http://10.20.0.153:4000/v1
LITELLM_API_KEY=sk-local-supermemory
KAIROS_BASE=https://raw-charts.dubtown-server.us
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
Remove `ANTHROPIC_API_KEY`, `GEMINI_API_KEY` (unused). Update `.env.example`.
Note: LiteLLM IP is DHCP — verify `10.20.0.153` before deploy.

## Out of scope

- Fixing the broken Sacred Journey profile endpoint.
- Re-enabling Mani.
- Any frontend / UI change.
- Restoring live agentic MCP tool-calling.

## Verification

1. `npm run lint` (tsc) passes.
2. Each endpoint returns 200 with non-empty `result` when LiteLLM + Kairos up.
3. Transit summary populates `cross_aspects` (non-empty with 3° orbs).
4. Natal summary computed once (logged), transit cached per day (logged).
5. With Kairos down, interpretation still returns (degraded context).
6. `arcanum-dashboard.service` restarts cleanly; dashboard renders interpretations.
