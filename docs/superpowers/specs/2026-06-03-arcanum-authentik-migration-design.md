# Arcanum Dashboard → Authentik OIDC + Multi-User — Design

- **Date:** 2026-06-03
- **Status:** Approved (brainstorming) — pending implementation plan
- **Primary repo:** `pwebster221/Tarot-Dashboard` (CT 501, `/opt/arcanum-dashboard`, served at `readings.pathsofreverence.com`)
- **Also touches:** `readings-webhook` (CT 520, `/root/readings-webhook` → `/opt/readings-webhook`) and `esoteric-forms` (CT 535, `/opt/esoteric-forms`)
- **Related:** PAT-509 (Unified Auth), PAT-510 (Esoteric Forms), PAT-586 (Arcanum AI endpoints lack auth)

## 1. Problem

The Arcanum Dashboard authenticates with **client-side Firebase email/password** — an island disconnected from the PoR identity standard (Authentik OIDC, established in PAT-509 for the Hub and PAT-510 for Esoteric Forms). Three concrete problems:

1. **Wrong identity provider.** Firebase Auth + Firestore `users/{uid}` profiles, entirely in the React SPA (`src/lib/firebase.ts`, `AuthContext.tsx`, `AuthModal.tsx`).
2. **The server is unauthenticated (PAT-586).** `server.ts` (Express, `:3000`) gates nothing. `/api/readings`, `/api/readings/:id`, `/api/ai/*`, `/api/graph/context`, `/api/upload-cards` are all open; the readings proxy returns *all* readings behind a shared `DUBTOWN_API_KEY` and the SPA filters client-side by display-name (`reading.querent === userProfile.name`).
3. **It is structurally single-user.** This is the primary issue to fix. Reading→user linkage lives on the **production Neo4j (:7687)** graph, but the login/profile pipeline provisions `User` nodes on the **user-data Neo4j (:7688)**. The two never meet, so only the one user hand-backfilled onto :7687 by PAT-509 (Paul) has linked readings. Every new user's readings orphan and are invisible.

## 2. Goals / Non-Goals

**Goals**
- Replace Firebase with Authentik OIDC, matching the PoR service contract (PAT-509).
- Move the auth gate server-side: `server.ts` validates an Authentik session and rejects unauthenticated `/api/*` (closes PAT-586).
- **Make the system genuinely multi-user from the start** — a newly enrolled user can submit readings and see exactly their own, with no manual backfill.
- Per-user reading scoping: each user sees only readings linked to their own identity ("my readings" view).
- Self-serve Authentik enrollment for a small private test cohort.

**Non-Goals**
- No admin/all-readings console (decided: personal scoping only).
- No redesign of the readings data model beyond the `sub`-keyed linkage.
- No change to the AI interpretation pipeline (LiteLLM/reporeason) except that its endpoints become auth-gated.
- Locking down public enrollment after the test cohort is a noted follow-up, not in scope now.

## 3. Current State (verified 2026-06-03)

### Arcanum (CT 501)
- `arcanum-dashboard.service` → `node server.ts`, port `3000`, `NODE_ENV=production`, env from `/opt/arcanum-dashboard/.env`.
- Served at `readings.pathsofreverence.com` via a **CT 501-local** cloudflared tunnel (`e7da8ae9-…`, `localhost:3000`). Separate origin from the Hub (`pathsofreverence.com`, host tunnel `baf685f8-…`).
- SPA: no Firebase `currentUser` → `<LandingPage/>`; else full dashboard. `fetchReadings()` → same-origin `/api/readings` (no token). The "New Reading" header link already points at `forms.pathsofreverence.com/tarot-reading`; the in-file Typeform `isNewReadingModalOpen` iframe is dead code (never opened).

### readings-webhook (CT 520)
- `readings-webhook.service`, `127.0.0.1:8400`, public `readings.dubtown-server.us` (tunnel `aea6e0fb-…`). `NEO4J_URI=bolt://10.20.0.61:7687`.
- Read API is bearer-protected. List/count/detail filter on `r.source IN ['typeform','arcanum_form']` plus `reader`/`spread`/`from`/`to`/`q`. **No user filter.**
- Native write (`POST /readings/native`) links `(:User {email})-[:HAS_READING]->(:Reading)` by `record_email` — i.e. **email-keyed**, and a no-op if no matching `User` node exists on :7687.

### Esoteric Forms (CT 535)
- `esoteric-forms.service`. Astro shell already runs the full OIDC pattern (`oidc.ts`, `profile.ts`, `middleware.ts`, `/api/auth/*`).
- `/api/readings.ts` requires login and **overwrites `record_email = locals.email`** (server-trusted Authentik email) before calling `POST /readings/native`. It has `locals.userId` (the `sub`) available but does **not** currently forward it.
- `profile.ts` `upsertUser` MERGEs `User {sub}` on `NEO4J_USER_DATA_URI = bolt://10.20.0.61:7688`.

### Neo4j topology (the root cause)
| Instance | Role | Users present (2026-06-03) |
|---|---|---|
| `:7688` user-data | Auth/profile store; Hub + Forms `upsertUser` write here | 1 — Paul only |
| `:7687` production | `Reading`, `HAS_READING`, native writer `MATCH (u:User {email})` | 3 — Paul (sub+email, PAT-509 backfill) + 2 legacy shells (no sub/email) |

23 readings total (11 `typeform`, 11 `arcanum_form`, 1 null source); 19 `HAS_READING` edges; **3 orphaned** (2 `typeform`, 1 `arcanum_form`).

## 4. Target Architecture

### 4.1 OIDC BFF in the Express server
The SPA cannot hold a `client_secret`, so `server.ts` becomes a confidential OIDC client that issues its own session cookie (the PAT-509 shape, ported from Astro to Express). New routes:

- `GET /api/auth/login` — build PKCE auth URL, set `por_pkce` + `por_state` cookies, 302 to Authentik.
- `GET /api/auth/callback` — validate `state`, exchange code, set `por_session` (RS256 JWT) + `por_refresh` cookies (httpOnly, Secure, SameSite=Lax), **upsert the user on :7687** (§4.3), 302 to `/`.
- `GET /api/auth/logout` — clear cookies, 302 to Authentik `end-session`.
- `GET /api/auth/me` — return `{ sub, email, name }` from the validated session, else 401. **Replaces Firebase `onAuthStateChanged`.**
- **`requireAuth` middleware** on all `/api/*` except the auth routes and `/api/health`: validate `por_session` via JWKS (`jose`), auto-refresh with `por_refresh` when expired, attach `req.user = { sub, email, name }`, else 401.

The OIDC helper module is ported near-verbatim from the Hub's `src/lib/oidc.ts` (`buildAuthUrl`, `exchangeCode`, `refreshTokens`, `validateToken`, `isExpired`, `logoutUrl`), adapted to read `process.env` and to set cookies via Express. Cookies parsed with `cookie-parser`.

New Authentik **Application + Provider** (`slug: arcanum`), own `client_id`/`client_secret`, redirect `https://readings.pathsofreverence.com/api/auth/callback`, scopes `openid email profile offline_access` with **`offline_access` granted at the provider** (avoids the 1-hour-expiry gap PAT-509 hit). Reuses the existing CT 501-local tunnel — same origin, no new ingress.

**Session model — SSO carry-over (decided 2026-06-03).** Arcanum keeps its own per-app `por_session` cookie on `readings.pathsofreverence.com` and remains its own OIDC client. "Log in once, carries over between areas" is delivered by **Authentik SSO**, not a shared cookie: because Authentik holds its own IdP session, a user who has already authenticated to the Hub or Forms is returned to Arcanum's `/api/auth/callback` without re-entering credentials — an invisible sub-second redirect. This touches only Arcanum; the shipped Hub (PAT-509) and Forms (PAT-510) are not modified. (A literal single shared cookie / single-logout-everywhere was explicitly de-scoped, as it would require consolidating all PoR apps onto one OIDC client.) Logout is per-app. To make carry-over feel seamless, an unauthenticated top-level page request may auto-initiate `/api/auth/login` (silent when an Authentik session exists); the `LandingPage` with an explicit "Sign In" button remains the fallback for brand-new visitors.

### 4.2 Sub-keyed reading linkage (end-to-end)
`sub` (Authentik subject) is the single stable identity key across the readings graph.

- **Esoteric Forms (CT 535):** `/api/readings.ts` adds `body.record_sub = locals.userId` alongside the existing `record_email`. One line. `readings-client.ts`'s `NativeReadingBody` gains an optional `record_sub`.
- **readings-webhook (CT 520) — write:** `NativeReadingRequest` gains optional `record_sub`. `write_reading` provisions and links by sub on :7687:
  ```cypher
  MERGE (u:User {sub: $sub})
    ON CREATE SET u.email = $email, u.display_name = $name,
                  u.role = 'practitioner', u.created_at = datetime()
    ON MATCH  SET u.email = $email, u.last_seen_at = datetime()
  MERGE (u)-[:HAS_READING]->(r)
  ```
  Fallback: if `record_sub` is absent (legacy/back-compat callers), retain the existing `MATCH (u:User {email})` link path.
  - **Dedup guard:** `MERGE (u:User {sub})` will create a *new* node if a sub-less `User {email}` already exists for that person. Before going multi-user, audit :7687 for sub-less `User` nodes whose `email` collides with a real account and reconcile (set `sub` on the existing node) so the MERGE attaches rather than forks. Paul's :7687 node already carries `sub`, so it is unaffected.
- **readings-webhook (CT 520) — read:** add an optional `user_sub` filter to `build_reading_filters` / `list_readings` / `count_readings` and an ownership constraint on `get_reading_detail`:
  ```cypher
  MATCH (u:User {sub: $user_sub})-[:HAS_READING]->(r)
  ```
  Backward-compatible: absent `user_sub` → current unscoped behavior, so the Hub and any other consumer are unaffected.

### 4.3 Provisioning + scoping in Arcanum
- On `/api/auth/callback`, Arcanum upserts `User {sub}` on **:7687** (the readings graph) — same MERGE-by-sub as §4.2, setting `email`, `display_name`, `role`. This guarantees a scoping/linking anchor even for view-only users who never submit a reading. Module: a small `profile.ts` mirroring Forms' but pointed at the **production** instance via dedicated env (`NEO4J_READINGS_URI=bolt://10.20.0.61:7687`, user/password).
- Arcanum's `/api/readings` and `/api/readings/:id` proxies inject `user_sub = req.user.sub` into the webhook call. The SPA never chooses whose readings it sees. Detail returns 404 when the reading is not linked to the caller (prevents IDOR).
- The client-side `reading.querent === userProfile.name` filter is removed (scoping is server-side now). Search/timeframe/archetype filters are kept. Display name comes from the token.

### 4.4 SPA changes (React)
- Delete `src/lib/firebase.ts`, `src/lib/AuthContext.tsx` (Firebase), `src/components/AuthModal.tsx`. Drop the `firebase` dependency, `firebase-applet-config.json`, `firestore.rules`, `firebase-*.json`, and the `@firebase/eslint-plugin-security-rules` devDep.
- New `AuthContext` that fetches `/api/auth/me` (loading / authenticated / anonymous states).
- `App.tsx`: anonymous → `LandingPage` with a **"Sign In"** button linking to `/api/auth/login`; sign-out hits `/api/auth/logout`. Registration now lives in Authentik (self-serve enrollment).
- Delete the dead Typeform `isNewReadingModalOpen` iframe block.

## 5. Data Migration & Decommission

- **One-time orphan backfill (:7687).** Link all 3 existing orphaned readings to Paul (decided 2026-06-03): `MATCH (u:User {sub:'924a9054d8e720cdc65cb9984629cb88faae3f1853adf39fd21d68486754939a'}), (r:Reading) WHERE r.source IN ['typeform','arcanum_form'] AND NOT (:User)-[:HAS_READING]->(r) MERGE (u)-[:HAS_READING]->(r)`. Reviewed one-off, not automated.
- **Firebase decommission.** Remove all Firebase code/config from the repo (above). The Firebase project itself (`aerobic-guide-468317-s1`) can be deleted out-of-band after cutover; not required for this change. The `firebase-applet-config.json` `apiKey` is a public web key (low sensitivity) but should be removed from the repo regardless.
- **Env changes (CT 501 `.env`, gitignored):** add `AUTHENTIK_BASE_URL`, `AUTHENTIK_APP_SLUG=arcanum`, `AUTHENTIK_CLIENT_ID`, `AUTHENTIK_CLIENT_SECRET`, `AUTHENTIK_REDIRECT_URI=https://readings.pathsofreverence.com/api/auth/callback`, `NEO4J_READINGS_URI=bolt://10.20.0.61:7687`, `NEO4J_READINGS_USER`, `NEO4J_READINGS_PASSWORD`, `SESSION_COOKIE_SECURE=true`. Back up `.env` first (`.env.pre-authentik.bak`).

## 6. Testing

- **Unit (Arcanum, `node --test`, zero-dep, Node 22+ — the repo's existing style):** port the Hub's `oidc.test.ts`; cover `requireAuth` (valid / expired-then-refresh / invalid → 401), `/api/auth/me`, and the `user_sub` injection into the readings proxy.
- **readings-webhook (extend the existing 91 unit + 13 integration tests):** `user_sub` filter on list/count, ownership 404 on detail, and the sub-keyed `MERGE`/link in `write_reading` (incl. the email fallback when `record_sub` is absent).
- **Esoteric Forms:** assert `record_sub = locals.userId` is forwarded.
- **Manual smoke (cutover):** self-enroll a fresh Authentik test account → log into Arcanum (user node appears on :7687) → submit a reading via the form → it appears in that user's Arcanum list and **not** in Paul's; unauthenticated `/api/readings` returns 401; logout clears the session.

## 7. Rollout & Rollback

Order (each step independently verifiable):
1. **readings-webhook** — write (`record_sub` + sub-keyed MERGE/link, email fallback) and read (`user_sub` filter, detail ownership). Backward-compatible; Hub unaffected. Deploy, run tests.
2. **Esoteric Forms** — forward `record_sub`. Deploy. (Now new readings link by sub.)
3. **Authentik** — create the `arcanum` Application + Provider (offline_access granted); enable self-serve enrollment flow.
4. **Arcanum** — implement OIDC BFF + provisioning + scoping + Firebase removal; build; deploy via the established tar → `pct push` → extract path; `systemctl restart arcanum-dashboard`. Back up current `dist/` and `.env`.
5. One-time orphan backfill (§5).

**Rollback:** Arcanum is the only user-facing change — restore the previous `dist/` + `.env` and restart to revert to Firebase. The readings-webhook and Forms changes are additive/backward-compatible and can stay.

## 8. Known Follow-ups (out of scope)

- Lock down Authentik enrollment (invite-only or domain-restricted) after the test cohort.
- Rate-limiting on the AI endpoints (the other half of PAT-586).
- Reconcile the two User stores (:7687 readings projection vs :7688 auth profile) into a documented, single ownership model ecosystem-wide.
- The 2 legacy `User` shells on :7687 (no sub/email) — decide whether to merge or retire.
