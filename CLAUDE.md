# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`arcanum-dashboard` is the Tarot reading review/visualization UI for the PathsOfReverence ecosystem. It is a single-process app: an Express server ([server.ts](server.ts)) on port 3000 that mounts Vite middleware in dev (so the React SPA is served from the same origin as the API). There is no separate frontend dev server.

Originally scaffolded from Google AI Studio ("My Google AI Studio App" in [index.html](index.html), `GEMINI_API_KEY` is still wired through [vite.config.ts](vite.config.ts)), but the AI runtime now uses **Anthropic Claude (`claude-opus-4-7`) with MCP tools**, not Gemini.

## Common commands

```bash
npm run dev       # tsx server.ts — runs Express + Vite middleware, port 3000
npm run build     # vite build → dist/
npm start         # node server.ts (production; expects dist/ to exist)
npm run lint      # tsc --noEmit (this is the only "test" — no test framework configured)
npm run clean     # rm -rf dist
```

There is no test runner. `npm run lint` runs `tsc --noEmit` and is the canonical correctness check.

Node >= 22 is required (declared in [package.json](package.json)).

## Required env vars (.env)

- `ANTHROPIC_API_KEY` — Claude API for AI endpoints. Without it, the `/api/ai/*` routes throw at request time, not at boot.
- `DUBTOWN_API_KEY` — Bearer token for the readings backend. **There is a hardcoded fallback in [server.ts](server.ts) used when the env var is missing**; in production the env var must be set. Do not commit changes that rely on the fallback.
- `GEMINI_API_KEY` — legacy, exposed to the client via Vite `define`. Not used by current code; leave blank unless reviving Gemini paths.

## Architecture

### Single-server topology

[server.ts](server.ts) does five things in one process:
1. Connects to **three remote MCP servers** at boot (`kaimcp`, `mani`, `neo4j` on `dubtown-server.us`) via `StreamableHTTPClientTransport` and aggregates their tools into a single `mcpTools` Map keyed by tool name. Tool-name collisions across servers will silently overwrite — be careful when adding servers.
2. Proxies `/api/readings*` to `https://readings.dubtown-server.us/readings*` with the Dubtown bearer token (the browser never sees the key).
3. Hosts `/api/ai/{deep-interpretation,oracle-insight,trend-insight}` — each runs the `runAgent()` loop (up to 10 iterations of Claude calls + MCP `tool_use` resolution).
4. Hosts `/api/upload-cards` — multer disk upload to `public/cards/`, filenames normalized via `normalizeCardName()` (lowercase, strip leading number/`The `, spaces → underscores). The same normalization lives in [src/lib/api.ts](src/lib/api.ts) — keep them in sync.
5. In dev (`NODE_ENV=development` or `VITE_DEV_SERVER=true`), spins up Vite in middleware mode. In prod, serves `dist/` + `public/` and SPA-falls-back to `index.html`.

### AI agent loop

`runAgent(prompt, systemPrompt)` in [server.ts](server.ts) is the only entry to Claude. It:
- Hands all aggregated MCP tools to the model on every call
- Loops while `stop_reason === "tool_use"`, dispatching each `tool_use` block back to its originating MCP `client.callTool()`
- Caps at 10 iterations (throws on overflow)
- Returns the first `text` block when the model stops

If you add a new AI endpoint, route it through `runAgent` rather than calling `ai.messages.create` directly so MCP tools and the iteration cap apply uniformly.

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
- The MCP boot connect is best-effort: failures are logged but the server still starts. AI endpoints will then run with a smaller (or empty) toolset rather than failing loudly. Check the `[MCP] Connected ...` log lines if AI behavior degrades.
- `/api/graph/context` POSTs to `https://neo4j.dubtown-server.us/search` directly (not via MCP) and returns a stubbed string on failure rather than erroring — the AI endpoints will keep running with a "context unavailable" placeholder.
