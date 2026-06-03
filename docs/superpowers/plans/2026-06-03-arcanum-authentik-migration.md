# Arcanum Dashboard → Authentik OIDC + Multi-User Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Arcanum Dashboard's client-side Firebase auth with Authentik OIDC, gate the server, and make reading ownership genuinely multi-user by keying `(:User)-[:HAS_READING]->(:Reading)` on the Authentik `sub` end-to-end.

**Architecture:** Three services in dependency order. (A) `readings-webhook` gains a `sub`-keyed write link + a `user_sub` read filter (backward-compatible). (B) `esoteric-forms` forwards the authenticated `sub`. (C) Authentik gets an `arcanum` client. (D) Arcanum's Express server becomes a confidential OIDC client (BFF): it runs the auth-code flow, issues a session cookie, validates it on every `/api/*` request, provisions the user on the readings graph (:7687), and scopes all reads to the caller's `sub`; the React SPA drops Firebase and asks `/api/auth/me` who it is.

**Tech Stack:** FastAPI + Pydantic v2 + neo4j-driver (webhook); Astro (forms shell); Node 22 native-TS Express + `jose` + `cookie-parser` + `neo4j-driver` (Arcanum server); React 19 + Vite (SPA). Tests: `pytest` (webhook), `node --test` (Arcanum/forms).

**Spec:** `docs/superpowers/specs/2026-06-03-arcanum-authentik-migration-design.md` (Tarot-Dashboard repo).

**Repos & hosts:**
- Arcanum: `pwebster221/Tarot-Dashboard`, CT 501 `/opt/arcanum-dashboard`, `arcanum-dashboard.service` (`node server.ts`, :3000).
- readings-webhook: control-node `/root/readings-webhook` → CT 520 `/opt/readings-webhook`, `readings-webhook.service` (:8400). Neo4j `bolt://10.20.0.61:7687`.
- esoteric-forms: CT 535 `/opt/esoteric-forms`, `esoteric-forms.service`.

**Phase boundaries are independently deployable.** A and B are backward-compatible and safe to ship before D. Do phases in order A → B → C → D → E.

**Identifiers:** Paul's `sub` = `924a9054d8e720cdc65cb9984629cb88faae3f1853adf39fd21d68486754939a`.

---

## Phase A — readings-webhook (CT 520): sub-keyed write + user_sub read filter

Work in `/root/readings-webhook`. Activate the venv for tests: `cd /root/readings-webhook && source venv/bin/activate` (or `.venv`). Tests: `python -m pytest tests/ -q`.

### Task A1: Add `record_sub` + `display_name` to the native request and canonical model

**Files:**
- Modify: `app/models.py` (`NativeReadingRequest`)
- Modify: `app/parser.py` (`CanonicalReading` dataclass + `native_to_canonical`)
- Test: `tests/test_parser_native.py` (existing native parser tests — confirm path) or `tests/test_native_to_canonical.py`

- [ ] **Step 1: Write the failing test**

Add to the native-converter test module (locate it: `grep -rl native_to_canonical tests/`):

```python
def test_native_to_canonical_carries_record_sub():
    from app.models import NativeReadingRequest, NativeCardDraw
    from app.parser import native_to_canonical
    req = NativeReadingRequest(
        spread_type="single_card",
        reader="Tester",
        record_email="t@example.com",
        record_sub="abc123sub",
        reading_date="2026-06-03",
        question="q?",
        cards=[NativeCardDraw(order=1, name="The Sun")],
        interpretations={},
    )
    canonical = native_to_canonical(req)
    assert canonical.record_sub == "abc123sub"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/ -k record_sub -q`
Expected: FAIL — `NativeReadingRequest` has no field `record_sub` (pydantic ValidationError / TypeError) and/or `CanonicalReading` has no attribute `record_sub`.

- [ ] **Step 3: Add the field to the request model**

In `app/models.py`, in `NativeReadingRequest`, add after `record_email`:

```python
    record_email: str
    record_sub: str | None = None
```

- [ ] **Step 4: Add the field to the canonical model and converter**

In `app/parser.py`, add to the `CanonicalReading` dataclass (after `record_email`):

```python
    record_email: str
    record_sub: str | None
```

In `native_to_canonical`, add to the `CanonicalReading(...)` constructor call (after `record_email=req.record_email,`):

```python
        record_email=req.record_email,
        record_sub=req.record_sub,
```

Note: `CanonicalReading` is also built by the Typeform parser path. Find every `CanonicalReading(` constructor (`grep -n "CanonicalReading(" app/`) and add `record_sub=None,` to any that don't set it, so the dataclass stays valid.

- [ ] **Step 5: Run test to verify it passes**

Run: `python -m pytest tests/ -k record_sub -q`
Expected: PASS

- [ ] **Step 6: Run the full suite (no regressions)**

Run: `python -m pytest tests/ -q`
Expected: all existing tests still PASS.

- [ ] **Step 7: Commit**

```bash
git add app/models.py app/parser.py tests/
git commit -m "feat(readings-webhook): carry record_sub through native intake (PAT-xxx)"
```

### Task A2: sub-keyed user provisioning + HAS_READING link in the writer

**Files:**
- Modify: `app/neo4j_writer.py` (`write_reading`)
- Modify: `app/routes_readings_native.py` (pass `link_to_user_sub`)
- Test: `tests/test_neo4j_writer.py` (locate existing writer test module)

- [ ] **Step 1: Write the failing test**

The writer tests run against a real staging Neo4j (`bolt://10.20.0.180:7692` per the read-API spec). Add a test that a reading written with a `record_sub` MERGEs a `User {sub}` and links it. Use the existing test fixtures/driver pattern in the module (mirror an existing `write_reading` test for setup/teardown):

```python
def test_write_reading_links_user_by_sub(driver):
    from app.parser import CanonicalReading, CardDraw
    reading = CanonicalReading(
        id="test-sub-link-1", spread_type="single_card", reader="SubTester",
        record_email="subtester@example.com", record_sub="sub-unit-test-1",
        reading_date="2026-06-03", submitted_at="2026-06-03T00:00:00+00:00",
        question="q", notes=None, cards=[], interpretations={},
        raw={"source": "arcanum_form", "form_id": "tarot-reading-v1"},
    )
    write_reading(driver, reading, mongo_doc_id="m1", link_to_user_sub="sub-unit-test-1",
                  user_email="subtester@example.com", user_display_name="SubTester")
    with driver.session() as s:
        rec = s.run(
            "MATCH (u:User {sub:$sub})-[:HAS_READING]->(r:Reading {id:$id}) "
            "RETURN u.email AS email, u.display_name AS name, u.role AS role",
            sub="sub-unit-test-1", id="test-sub-link-1",
        ).single()
    assert rec is not None
    assert rec["email"] == "subtester@example.com"
    assert rec["role"] == "practitioner"
    # cleanup
    with driver.session() as s:
        s.run("MATCH (u:User {sub:'sub-unit-test-1'}) DETACH DELETE u")
        s.run("MATCH (r:Reading {id:'test-sub-link-1'}) DETACH DELETE r")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/ -k links_user_by_sub -q`
Expected: FAIL — `write_reading()` got an unexpected keyword argument `link_to_user_sub`.

- [ ] **Step 3: Extend the writer signature and add the sub-keyed link block**

In `app/neo4j_writer.py`, change the signature:

```python
def write_reading(
    driver: Driver,
    reading: CanonicalReading,
    mongo_doc_id: str,
    link_to_user_email: str | None = None,
    link_to_user_sub: str | None = None,
    user_email: str | None = None,
    user_display_name: str | None = None,
) -> dict:
```

Replace the existing `if link_to_user_email:` block (inside the transaction, before `tx.commit()`) with this sub-first, email-fallback block:

```python
            if link_to_user_sub:
                tx.run(
                    """
                    MERGE (u:User {sub: $sub})
                      ON CREATE SET u.email = $email,
                                    u.display_name = $name,
                                    u.role = 'practitioner',
                                    u.created_at = datetime()
                      ON MATCH  SET u.email = coalesce($email, u.email),
                                    u.last_seen_at = datetime()
                    WITH u
                    MATCH (r:Reading {id: $reading_id})
                    MERGE (u)-[:HAS_READING]->(r)
                    """,
                    sub=link_to_user_sub,
                    email=user_email,
                    name=user_display_name,
                    reading_id=reading.id,
                )
                logger.info("neo4j_writer: linked reading=%s to user sub=%s", reading.id, link_to_user_sub)
            elif link_to_user_email:
                tx.run(
                    """
                    MATCH (u:User {email: $email})
                    MATCH (r:Reading {id: $reading_id})
                    MERGE (u)-[:HAS_READING]->(r)
                    """,
                    email=link_to_user_email,
                    reading_id=reading.id,
                )
                logger.info("neo4j_writer: linked reading=%s to user email=%s", reading.id, link_to_user_email)
```

> Dedup note (from spec §4.2): `MERGE (u:User {sub})` forks a new node if a sub-less `User {email}` already exists for that person. Phase E audits/reconciles sub-less nodes before real multi-user use. Paul's :7687 node already has `sub`.

- [ ] **Step 4: Pass the new args from the native route**

In `app/routes_readings_native.py`, update the `write_reading(...)` call in `post_readings_native`:

```python
        result = write_reading(
            get_driver(),
            canonical,
            mongo_doc_id=mongo_doc_id,
            link_to_user_sub=canonical.record_sub,
            link_to_user_email=canonical.record_email,
            user_email=canonical.record_email,
            user_display_name=canonical.reader,
        )
```

(Passing both `link_to_user_sub` and `link_to_user_email` is safe — the writer prefers sub and only falls back to email when sub is `None`.)

- [ ] **Step 5: Run test to verify it passes**

Run: `python -m pytest tests/ -k links_user_by_sub -q`
Expected: PASS

- [ ] **Step 6: Run the full suite**

Run: `python -m pytest tests/ -q`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add app/neo4j_writer.py app/routes_readings_native.py tests/
git commit -m "feat(readings-webhook): provision+link User by sub on native write, email fallback"
```

### Task A3: `user_sub` read filter in list/count

**Files:**
- Modify: `app/filters.py` (`build_reading_filters`)
- Modify: `app/neo4j_reader.py` (`list_readings`, `count_readings`)
- Test: `tests/test_filters.py`

- [ ] **Step 1: Write the failing test**

In `tests/test_filters.py`:

```python
def test_build_reading_filters_user_sub():
    from app.filters import build_reading_filters
    where, params = build_reading_filters(user_sub="abc-sub")
    assert "(:User {sub: $user_sub})-[:HAS_READING]->(r)" in where
    assert params["user_sub"] == "abc-sub"

def test_build_reading_filters_no_user_sub_omits_clause():
    from app.filters import build_reading_filters
    where, params = build_reading_filters()
    assert "HAS_READING" not in where
    assert "user_sub" not in params
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_filters.py -k user_sub -q`
Expected: FAIL — `build_reading_filters` got an unexpected keyword argument `user_sub`.

- [ ] **Step 3: Add the param + clause**

In `app/filters.py`, add `user_sub: str | None = None` to the `build_reading_filters` signature, and after the `clauses = [...]`/`params = {...}` initialization add:

```python
    if user_sub is not None:
        # The reader composes: MATCH (r:Reading) ... WHERE <clause>. This bare
        # pattern predicate scopes r to readings linked to this user's sub.
        # Anonymous-node pattern predicate works on both Neo4j 4.x and 5.x
        # (avoids the 5.x-only `EXISTS { MATCH ... }` subquery form).
        clauses.append("(:User {sub: $user_sub})-[:HAS_READING]->(r)")
        params["user_sub"] = user_sub
```

> This keeps the existing `MATCH (r:Reading) WHERE ...` shape unchanged — the predicate is just AND-joined with the source/reader/date clauses.

- [ ] **Step 4: Thread `user_sub` through the reader functions**

In `app/neo4j_reader.py`, add `user_sub: str | None = None` to both `list_readings` and `count_readings` signatures (in the keyword-only block), and pass it into each `build_reading_filters(...)` call:

```python
    where, params = build_reading_filters(
        reader=reader, spread=spread, from_=from_, to_=to_, q=q, user_sub=user_sub,
    )
```

- [ ] **Step 5: Run test to verify it passes**

Run: `python -m pytest tests/test_filters.py -k user_sub -q`
Expected: PASS

- [ ] **Step 6: Run the full suite**

Run: `python -m pytest tests/ -q`
Expected: all PASS (existing filter tests unaffected — clause only added when `user_sub` is provided).

- [ ] **Step 7: Commit**

```bash
git add app/filters.py app/neo4j_reader.py tests/
git commit -m "feat(readings-webhook): optional user_sub scoping filter on list/count"
```

### Task A4: detail-endpoint ownership guard + route wiring

**Files:**
- Modify: `app/neo4j_reader.py` (`get_reading_detail`)
- Modify: `app/routes_readings.py` (`list_endpoint`, `detail_endpoint`)
- Test: `tests/test_routes_readings.py` (locate existing route/integration test module)

- [ ] **Step 1: Write the failing test**

Add an integration test mirroring the module's existing client-based pattern (the suite uses a FastAPI `TestClient` with a seeded staging graph). Assert that requesting a detail with a non-owning `user_sub` returns 404:

```python
def test_detail_scoped_to_owner_404_for_non_owner(client, bearer_headers, seeded_reading_id):
    resp = client.get(f"/readings/{seeded_reading_id}?user_sub=definitely-not-the-owner",
                       headers=bearer_headers)
    assert resp.status_code == 404
```

(Use the same fixtures the existing detail tests use for `client`, `bearer_headers`, and a seeded reading id.)

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/ -k scoped_to_owner -q`
Expected: FAIL — endpoint ignores `user_sub` and returns 200.

- [ ] **Step 3: Add `user_sub` ownership to `get_reading_detail`**

In `app/neo4j_reader.py`, change `get_reading_detail(driver, reading_id)` to `get_reading_detail(driver, reading_id, user_sub: str | None = None)`. Replace the opening `MATCH (r:Reading {id: $id})` with a conditional guard:

```python
    owner_clause = ""
    if user_sub is not None:
        owner_clause = "WHERE (:User {sub: $user_sub})-[:HAS_READING]->(r)"
    cypher = f"""
        MATCH (r:Reading {{id: $id}})
        {owner_clause}
        OPTIONAL MATCH (r)-[d:DREW]->(c:TarotCard)
        ...
    """
```

(Keep the remainder of the existing query unchanged.) Pass `user_sub=user_sub` into `s.run(cypher, id=reading_id, user_sub=user_sub)`. When `user_sub` is set and the reading isn't owned, the `MATCH` returns no row → function returns `None` → route raises 404.

- [ ] **Step 4: Wire `user_sub` into both routes**

In `app/routes_readings.py`:

`list_endpoint` — add a query param and pass it through:

```python
    q: str | None = None,
    user_sub: str | None = None,
    limit: int = Query(50, ge=1, le=200),
```
```python
        rows = list_readings(
            driver,
            reader=reader, spread=spread, from_=from_, to_=to_, q=q, user_sub=user_sub,
            limit=limit, offset=offset, sort=sort,
        )
        total = count_readings(driver, reader=reader, spread=spread, from_=from_, to_=to_, q=q, user_sub=user_sub)
```

`detail_endpoint` — add the param and pass it:

```python
@router.get("/{reading_id}", response_model=ReadingDetail)
def detail_endpoint(reading_id: str, user_sub: str | None = None):
    from .main import get_neo4j_driver, get_mongo_client
    driver = get_neo4j_driver()
    mongo = get_mongo_client()
    structure = get_reading_detail(driver, reading_id, user_sub=user_sub)
```

- [ ] **Step 5: Run test to verify it passes**

Run: `python -m pytest tests/ -k scoped_to_owner -q`
Expected: PASS

- [ ] **Step 6: Run the full suite**

Run: `python -m pytest tests/ -q`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add app/neo4j_reader.py app/routes_readings.py tests/
git commit -m "feat(readings-webhook): scope list+detail by user_sub (detail 404 on non-owner)"
```

### Task A5: Deploy readings-webhook to CT 520

- [ ] **Step 1: Sync code to the container**

Per the known Ansible `pip` hang ([[feedback_ansible_pip_hang]]), prefer manual push over the role:

```bash
for f in app/models.py app/parser.py app/neo4j_writer.py app/routes_readings_native.py app/filters.py app/neo4j_reader.py app/routes_readings.py; do
  pct push 520 /root/readings-webhook/$f /opt/readings-webhook/$f
done
```

- [ ] **Step 2: Restart and verify health**

```bash
pct exec 520 -- systemctl restart readings-webhook
pct exec 520 -- bash -lc 'sleep 2; curl -fsS http://127.0.0.1:8400/health || journalctl -u readings-webhook -n 30 --no-pager'
```
Expected: healthy response; no traceback in logs.

- [ ] **Step 3: Smoke the back-compat read path (no user_sub = unchanged)**

```bash
TOKEN=$(pct exec 520 -- bash -lc 'grep -E "READINGS_API_TOKEN|BEARER" /etc/readings-webhook/env.conf | head -1 | cut -d= -f2-')
pct exec 520 -- bash -lc "curl -fsS -H 'Authorization: Bearer $TOKEN' 'http://127.0.0.1:8400/readings?limit=1' | head -c 300"
```
Expected: a normal list response (proves the Hub/existing consumers are unaffected).

---

## Phase B — esoteric-forms (CT 535): forward the authenticated `sub`

Source lives only on CT 535 (`/opt/esoteric-forms`). Work in-container or pull to host first; below assumes editing the deployed source then rebuilding. Confirm the repo/build with `pct exec 535 -- bash -lc 'cd /opt/esoteric-forms && cat package.json | grep -A20 scripts'` before starting.

### Task B1: Add `record_sub` to the native body type and forward `locals.userId`

**Files:**
- Modify: `apps/shell/src/lib/readings-client.ts` (`NativeReadingBody`)
- Modify: `apps/shell/src/pages/api/readings.ts`
- Test: `apps/shell/src/lib/__tests__/` (add a small unit test if the harness supports it; otherwise rely on the build + manual smoke)

- [ ] **Step 1: Add the optional field to the body type**

In `apps/shell/src/lib/readings-client.ts`, add to `interface NativeReadingBody` (after `record_email: string;`):

```typescript
  record_email: string;
  record_sub?: string;
```

- [ ] **Step 2: Forward the server-trusted sub**

In `apps/shell/src/pages/api/readings.ts`, after the existing `body.record_email = locals.email;` line, add:

```typescript
  body.reader = locals.username ?? body.reader ?? '';
  body.record_email = locals.email;
  body.record_sub = locals.userId;
```

(`locals.userId` is already populated by the shell middleware = the Authentik `sub`.)

- [ ] **Step 3: Typecheck / build**

```bash
pct exec 535 -- bash -lc 'cd /opt/esoteric-forms && npm run build 2>&1 | tail -20'
```
Expected: build succeeds (no TS error on the new field).

- [ ] **Step 4: Restart and smoke**

```bash
pct exec 535 -- systemctl restart esoteric-forms
pct exec 535 -- bash -lc 'sleep 2; systemctl is-active esoteric-forms'
```
Expected: `active`. (Full end-to-end link is verified in Phase D smoke.)

- [ ] **Step 5: Commit (in whatever repo hosts the forms source)**

```bash
# from the esoteric-forms source tree
git add apps/shell/src/lib/readings-client.ts apps/shell/src/pages/api/readings.ts
git commit -m "feat(esoteric-forms): forward authenticated record_sub to native readings intake"
```

---

## Phase C — Authentik: register the Arcanum client (admin UI, manual)

Authentik runs on CT 570 (`auth.pathsofreverence.com`). These are admin-console steps — document the resulting values, then put secrets into CT 501's `.env` in Phase D.

- [ ] **Step 1: Create the Application + Provider**
  - Admin → Applications → Create. Name `Arcanum Dashboard`, slug **`arcanum`**.
  - Create an OAuth2/OpenID Provider bound to it: authorization code flow.
  - Redirect URI (exact): `https://readings.pathsofreverence.com/api/auth/callback`
  - Signing key: the same key used by the Hub/Forms providers (so the JWKS/issuer model matches the ported `validateToken`).
  - Note the generated **Client ID** and **Client Secret**.

- [ ] **Step 2: Grant `offline_access`**
  - On the provider's scopes, ensure `openid`, `email`, `profile`, **and `offline_access`** are all in the scope mapping list. (This is the gap PAT-509 hit — without it there is no `refresh_token` and sessions die at 1h.)

- [ ] **Step 3: Enable self-serve enrollment**
  - Attach/enable an enrollment flow on the brand or the Arcanum application's authentication flow so testers can self-register from the login screen. (Note for later follow-up: lock this down after the test cohort.)

- [ ] **Step 4: Record the values** for Phase D:
  - `AUTHENTIK_BASE_URL` (e.g. `https://auth.pathsofreverence.com`)
  - `AUTHENTIK_APP_SLUG=arcanum`
  - `AUTHENTIK_CLIENT_ID=…`
  - `AUTHENTIK_CLIENT_SECRET=…`

---

## Phase D — Arcanum (CT 501): OIDC BFF + scoping + Firebase removal

Work in `/opt/arcanum-dashboard` on CT 501 (the established dev location for this repo). Branch first: `git checkout -b pat-arcanum-authentik`. Tests: `node --test server/*.test.ts`. The server is Node-22 native TS; new modules go under `server/` as `.ts`.

### Task D1: Dependencies — add OIDC libs, remove Firebase

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add server deps and remove Firebase**

```bash
cd /opt/arcanum-dashboard
npm install jose cookie-parser neo4j-driver
npm install -D @types/cookie-parser
npm uninstall firebase @firebase/eslint-plugin-security-rules
```

- [ ] **Step 2: Verify it still builds/serves**

Run: `npm run lint` (this repo's `lint` = `tsc --noEmit`)
Expected: may surface errors in files that still import `firebase` — those are removed in D6. For now, confirm `jose`/`cookie-parser`/`neo4j-driver` resolve.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "build(arcanum): add jose+cookie-parser+neo4j-driver, drop firebase"
```

### Task D2: Port the OIDC helper to `server/oidc.ts`

**Files:**
- Create: `server/oidc.ts`
- Test: `server/oidc.test.ts`

- [ ] **Step 1: Write the failing test**

`server/oidc.test.ts`:

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAuthUrl, isExpired, SESSION_COOKIE } from "./oidc.ts";

test("SESSION_COOKIE name is por_session", () => {
  assert.equal(SESSION_COOKIE, "por_session");
});

test("buildAuthUrl returns a PKCE auth url with state+verifier", () => {
  process.env.AUTHENTIK_BASE_URL = "https://auth.example.com";
  process.env.AUTHENTIK_CLIENT_ID = "cid";
  process.env.AUTHENTIK_REDIRECT_URI = "https://readings.example.com/api/auth/callback";
  const { url, state, codeVerifier } = buildAuthUrl();
  assert.ok(url.startsWith("https://auth.example.com/application/o/authorize/?"));
  assert.ok(url.includes("code_challenge_method=S256"));
  assert.ok(url.includes("scope=openid+email+profile+offline_access"));
  assert.ok(state.length > 10);
  assert.ok(codeVerifier.length > 20);
});

test("isExpired true for past exp", () => {
  assert.equal(isExpired({ sub: "s", email: "e", name: "n", exp: 1 }), true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test server/oidc.test.ts`
Expected: FAIL — cannot find module `./oidc.ts`.

- [ ] **Step 3: Create `server/oidc.ts`** (ported from the Hub's `src/lib/oidc.ts`, with `import.meta.env` removed)

```typescript
import { randomBytes, createHash } from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";

export const SESSION_COOKIE = "por_session";
export const REFRESH_COOKIE = "por_refresh";
export const PKCE_VERIFIER_COOKIE = "por_pkce";
export const PKCE_STATE_COOKIE = "por_state";
export const RETURN_TO_COOKIE = "por_return_to";

function env(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing env var: ${key}`);
  return v;
}

function base64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

export interface AuthParams { url: string; state: string; codeVerifier: string; }

export function buildAuthUrl(): AuthParams {
  const base = env("AUTHENTIK_BASE_URL");
  const clientId = env("AUTHENTIK_CLIENT_ID");
  const redirect = env("AUTHENTIK_REDIRECT_URI");
  const state = base64url(randomBytes(24));
  const codeVerifier = base64url(randomBytes(48));
  const codeChallenge = base64url(createHash("sha256").update(codeVerifier).digest());
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirect,
    response_type: "code",
    scope: "openid email profile offline_access",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });
  return { url: `${base}/application/o/authorize/?${params}`, state, codeVerifier };
}

export interface TokenSet { access_token: string; refresh_token: string; id_token: string; }

export async function exchangeCode(code: string, codeVerifier: string): Promise<TokenSet> {
  const base = env("AUTHENTIK_BASE_URL");
  const res = await fetch(`${base}/application/o/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: env("AUTHENTIK_REDIRECT_URI"),
      client_id: env("AUTHENTIK_CLIENT_ID"),
      client_secret: env("AUTHENTIK_CLIENT_SECRET"),
      code_verifier: codeVerifier,
    }),
  });
  if (!res.ok) throw new Error(`Token exchange failed ${res.status}: ${await res.text()}`);
  return res.json() as Promise<TokenSet>;
}

export async function refreshTokens(refreshToken: string): Promise<TokenSet> {
  const base = env("AUTHENTIK_BASE_URL");
  const res = await fetch(`${base}/application/o/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: env("AUTHENTIK_CLIENT_ID"),
      client_secret: env("AUTHENTIK_CLIENT_SECRET"),
    }),
  });
  if (!res.ok) throw new Error(`Token refresh failed: ${res.status}`);
  return res.json() as Promise<TokenSet>;
}

export interface TokenPayload { sub: string; email: string; name: string; exp: number; }

let _JWKS: ReturnType<typeof createRemoteJWKSet> | null = null;
function getJWKS() {
  if (!_JWKS) {
    _JWKS = createRemoteJWKSet(new URL(`${env("AUTHENTIK_BASE_URL")}/application/o/${env("AUTHENTIK_APP_SLUG")}/jwks/`));
  }
  return _JWKS;
}

export async function validateToken(token: string): Promise<TokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getJWKS(), {
      issuer: `${env("AUTHENTIK_BASE_URL")}/application/o/${env("AUTHENTIK_APP_SLUG")}/`,
    });
    return payload as unknown as TokenPayload;
  } catch {
    return null;
  }
}

export function isExpired(payload: TokenPayload): boolean {
  return Date.now() / 1000 > payload.exp - 30;
}

export function logoutUrl(): string {
  return `${env("AUTHENTIK_BASE_URL")}/application/o/${env("AUTHENTIK_APP_SLUG")}/end-session/`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test server/oidc.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add server/oidc.ts server/oidc.test.ts
git commit -m "feat(arcanum): port Authentik OIDC helper to Express server (jose+PKCE)"
```

### Task D3: User provisioning on the readings graph — `server/authProfile.ts`

**Files:**
- Create: `server/authProfile.ts`
- Test: `server/authProfile.test.ts`

- [ ] **Step 1: Write the failing test** (pure-unit: assert the Cypher is sub-keyed; do not hit a live DB in unit tests)

`server/authProfile.test.ts`:

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { UPSERT_USER_CYPHER } from "./authProfile.ts";

test("upsert cypher MERGEs on sub and sets profile fields", () => {
  assert.match(UPSERT_USER_CYPHER, /MERGE \(u:User \{sub: \$sub\}\)/);
  assert.match(UPSERT_USER_CYPHER, /u\.email\s*=\s*\$email/);
  assert.match(UPSERT_USER_CYPHER, /u\.display_name\s*=\s*\$name/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test server/authProfile.test.ts`
Expected: FAIL — cannot find module `./authProfile.ts`.

- [ ] **Step 3: Create `server/authProfile.ts`**

```typescript
import neo4j, { Driver } from "neo4j-driver";
import type { TokenPayload } from "./oidc.ts";

export const UPSERT_USER_CYPHER = `
  MERGE (u:User {sub: $sub})
    ON CREATE SET u.email = $email, u.display_name = $name,
                  u.role = 'practitioner', u.created_at = datetime()
    ON MATCH  SET u.email = $email, u.last_seen_at = datetime()
  RETURN u.sub AS sub, u.email AS email, u.role AS role`;

let _driver: Driver | null = null;
function getDriver(): Driver {
  if (!_driver) {
    const uri = process.env.NEO4J_READINGS_URI as string;
    const user = (process.env.NEO4J_READINGS_USER ?? "neo4j") as string;
    const password = (process.env.NEO4J_READINGS_PASSWORD ?? "") as string;
    _driver = neo4j.driver(uri, neo4j.auth.basic(user, password));
  }
  return _driver;
}

/** Provision/refresh the User node on the readings graph (:7687) so HAS_READING
 *  links and sub-scoping have an anchor. Best-effort: never throws into the
 *  auth flow (logs and continues). */
export async function upsertUser(claims: TokenPayload): Promise<void> {
  const session = getDriver().session();
  try {
    await session.run(UPSERT_USER_CYPHER, { sub: claims.sub, email: claims.email, name: claims.name });
  } finally {
    await session.close();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test server/authProfile.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/authProfile.ts server/authProfile.test.ts
git commit -m "feat(arcanum): provision User by sub on readings graph at login"
```

### Task D4: Auth routes + `requireAuth` middleware — `server/auth.ts`

**Files:**
- Create: `server/auth.ts`
- Test: `server/auth.test.ts`

- [ ] **Step 1: Write the failing test** (unit-test the cookie-options helper + the 401 behavior of requireAuth with no cookie)

`server/auth.test.ts`:

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { sessionCookieOptions, requireAuth } from "./auth.ts";

test("session cookie options are httpOnly+lax with 1h maxAge (ms)", () => {
  const o = sessionCookieOptions();
  assert.equal(o.httpOnly, true);
  assert.equal(o.sameSite, "lax");
  assert.equal(o.path, "/");
  assert.equal(o.maxAge, 60 * 60 * 1000);
});

test("requireAuth returns 401 when no cookies present", async () => {
  let status = 0; let body: any = null;
  const req: any = { cookies: {} };
  const res: any = { status(s: number){ status = s; return this; }, json(b: any){ body = b; return this; } };
  let nextCalled = false;
  await requireAuth(req, res, () => { nextCalled = true; });
  assert.equal(status, 401);
  assert.equal(nextCalled, false);
  assert.deepEqual(body, { error: "unauthorized" });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test server/auth.test.ts`
Expected: FAIL — cannot find module `./auth.ts`.

- [ ] **Step 3: Create `server/auth.ts`**

```typescript
import type { Request, Response, NextFunction, Express } from "express";
import {
  buildAuthUrl, exchangeCode, refreshTokens, validateToken, isExpired, logoutUrl,
  SESSION_COOKIE, REFRESH_COOKIE, PKCE_VERIFIER_COOKIE, PKCE_STATE_COOKIE, RETURN_TO_COOKIE,
  type TokenPayload, type TokenSet,
} from "./oidc.ts";
import { upsertUser } from "./authProfile.ts";

const secure = () => process.env.SESSION_COOKIE_SECURE === "true" || process.env.NODE_ENV === "production";

export function sessionCookieOptions() {
  return { httpOnly: true, secure: secure(), sameSite: "lax" as const, path: "/", maxAge: 60 * 60 * 1000 };
}
function refreshCookieOptions() {
  return { httpOnly: true, secure: secure(), sameSite: "lax" as const, path: "/", maxAge: 60 * 60 * 24 * 7 * 1000 };
}
function shortCookieOptions() {
  return { httpOnly: true, secure: secure(), sameSite: "lax" as const, path: "/", maxAge: 60 * 10 * 1000 };
}

function setSession(res: Response, tokens: TokenSet) {
  res.cookie(SESSION_COOKIE, tokens.access_token, sessionCookieOptions());
  if (tokens.refresh_token) res.cookie(REFRESH_COOKIE, tokens.refresh_token, refreshCookieOptions());
}

/** Resolve a payload from the session cookie, refreshing in place if needed. */
async function resolvePayload(req: Request, res: Response): Promise<TokenPayload | null> {
  const token = req.cookies?.[SESSION_COOKIE];
  const refresh = req.cookies?.[REFRESH_COOKIE];
  let payload: TokenPayload | null = token ? await validateToken(token) : null;
  if ((!payload || (payload && isExpired(payload))) && refresh) {
    try {
      const fresh = await refreshTokens(refresh);
      payload = await validateToken(fresh.access_token);
      if (payload) setSession(res, fresh);
    } catch { payload = null; }
  }
  return payload;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const payload = await resolvePayload(req, res);
  if (!payload) return res.status(401).json({ error: "unauthorized" });
  (req as any).user = { sub: payload.sub, email: payload.email, name: payload.name };
  next();
}

/** Register /api/auth/* routes on the Express app. */
export function registerAuthRoutes(app: Express) {
  app.get("/api/auth/login", (req, res) => {
    const returnTo = (req.query.redirect as string) ?? "/";
    const { url, state, codeVerifier } = buildAuthUrl();
    res.cookie(PKCE_VERIFIER_COOKIE, codeVerifier, shortCookieOptions());
    res.cookie(PKCE_STATE_COOKIE, state, shortCookieOptions());
    res.cookie(RETURN_TO_COOKIE, returnTo, shortCookieOptions());
    res.redirect(302, url);
  });

  app.get("/api/auth/callback", async (req, res) => {
    const code = req.query.code as string | undefined;
    const returnedState = req.query.state as string | undefined;
    if (req.query.error) return res.redirect(302, `/?error=${encodeURIComponent(String(req.query.error))}`);
    const savedState = req.cookies?.[PKCE_STATE_COOKIE];
    const codeVerifier = req.cookies?.[PKCE_VERIFIER_COOKIE];
    const returnTo = req.cookies?.[RETURN_TO_COOKIE] ?? "/";
    res.clearCookie(PKCE_VERIFIER_COOKIE, { path: "/" });
    res.clearCookie(PKCE_STATE_COOKIE, { path: "/" });
    res.clearCookie(RETURN_TO_COOKIE, { path: "/" });
    if (!code || !codeVerifier || returnedState !== savedState) return res.redirect(302, "/?error=invalid_state");
    let tokens: TokenSet;
    try { tokens = await exchangeCode(code, codeVerifier); }
    catch (e) { console.error("[auth/callback] token exchange failed:", e); return res.redirect(302, "/?error=token_exchange_failed"); }
    const payload = await validateToken(tokens.access_token);
    if (!payload) return res.redirect(302, "/?error=invalid_token");
    try { await upsertUser(payload); }
    catch (e) { console.error("[auth/callback] profile upsert failed:", e); }
    if (!tokens.refresh_token) console.warn("[auth/callback] no refresh_token — check offline_access scope on the Authentik provider.");
    setSession(res, tokens);
    res.redirect(302, returnTo);
  });

  app.get("/api/auth/logout", (req, res) => {
    res.clearCookie(SESSION_COOKIE, { path: "/" });
    res.clearCookie(REFRESH_COOKIE, { path: "/" });
    res.redirect(302, logoutUrl());
  });

  app.get("/api/auth/me", requireAuth, (req, res) => {
    res.json((req as any).user);
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test server/auth.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/auth.ts server/auth.test.ts
git commit -m "feat(arcanum): auth routes (login/callback/logout/me) + requireAuth middleware"
```

### Task D5: Wire auth into `server.ts` — gate `/api/*`, inject `user_sub`

**Files:**
- Modify: `server.ts`

- [ ] **Step 1: Imports + cookie parsing**

At the top of `server.ts`, add:

```typescript
import cookieParser from "cookie-parser";
import { registerAuthRoutes, requireAuth } from "./server/auth.ts";
```

Immediately after `const app = express();` (and before the routes), add cookie parsing, register auth routes, then gate the rest of `/api`:

```typescript
  app.use(cookieParser());
  app.use(express.json());

  // Public: auth routes + health (registered BEFORE the /api guard).
  registerAuthRoutes(app);
  app.get("/api/health", (req, res) => res.json({ status: "ok" }));

  // Everything else under /api requires a valid Authentik session.
  app.use("/api", requireAuth);
```

Remove the now-duplicated `app.use(express.json());` and the old `/api/health` handler further down (avoid double registration). The existing `/api/readings`, `/api/ai/*`, `/api/graph/context`, `/api/upload-cards` handlers stay where they are — they now run only after `requireAuth`.

- [ ] **Step 2: Inject the caller's `sub` into the readings proxies**

In the `/api/readings` handler, change the upstream URL build to append `user_sub` from the authenticated user:

```typescript
  app.get("/api/readings", async (req, res) => {
    try {
      const params = new URLSearchParams(req.query as any);
      params.set("user_sub", (req as any).user.sub);
      const apiUrl = `https://readings.dubtown-server.us/readings?${params.toString()}`;
```

In the `/api/readings/:id` handler, append `user_sub` as a query param so the backend enforces ownership (404 on non-owner):

```typescript
      const apiUrl = `https://readings.dubtown-server.us/readings/${req.params.id}?user_sub=${encodeURIComponent((req as any).user.sub)}`;
```

- [ ] **Step 3: Typecheck**

Run: `npm run lint`
Expected: no errors from `server.ts`/`server/*.ts` (SPA Firebase errors handled in D6).

- [ ] **Step 4: Run all server tests**

Run: `node --test server/*.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add server.ts
git commit -m "feat(arcanum): gate /api/* with requireAuth and scope readings by caller sub"
```

### Task D6: SPA — replace Firebase with `/api/auth/me`, remove dead code

**Files:**
- Rewrite: `src/lib/AuthContext.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/LandingPage.tsx`
- Delete: `src/lib/firebase.ts`, `src/components/AuthModal.tsx`
- Delete (repo): `firebase-applet-config.json`, `firestore.rules`, `firebase-blueprint.json`, `firebase-applet-config.json`, `metadata.json` (if Firebase-specific), `.vscode` Firebase bits (leave editor config), `firestore`/`firebase` references

- [ ] **Step 1: Rewrite `AuthContext.tsx` to use the session endpoint**

```tsx
import React, { createContext, useContext, useEffect, useState } from "react";

interface AuthUser { sub: string; email: string; name: string; }
interface AuthContextType { currentUser: AuthUser | null; loading: boolean; }

const AuthContext = createContext<AuthContextType>({ currentUser: null, loading: true });
export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/auth/me", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((u) => setCurrentUser(u))
      .catch(() => setCurrentUser(null))
      .finally(() => setLoading(false));
  }, []);

  return (
    <AuthContext.Provider value={{ currentUser, loading }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
```

- [ ] **Step 2: Update `App.tsx`**

- Remove the Firebase imports (`import { auth } from './lib/firebase'`, `import { signOut } from 'firebase/auth'`) and the `userProfile` usage.
- `useAuth()` now returns `{ currentUser, loading }`. Replace `const { currentUser, userProfile, loading: authLoading } = useAuth();` with `const { currentUser, loading: authLoading } = useAuth();`.
- Sign-out button `onClick`: replace `signOut(auth)` with `() => { window.location.href = "/api/auth/logout"; }`.
- Header display name: replace `{userProfile?.name || currentUser.email}` with `{currentUser.name || currentUser.email}`.
- **Remove the client-side querent filter** inside `filteredReadings` — delete this block (scoping is server-side now):

```tsx
      if (userProfile?.name) {
        if ((reading.querent || '').toLowerCase() !== userProfile.name.toLowerCase()) {
          return false;
        }
      }
```

  and remove `userProfile?.name` from that `useMemo`'s dependency array.
- Delete the dead Typeform modal block (`{isNewReadingModalOpen && ( … )}`) and the `isNewReadingModalOpen` state.

- [ ] **Step 3: Update `LandingPage.tsx` to a Sign-In CTA**

Replace any `AuthModal`/Firebase trigger with a direct link to the server login route. The primary action becomes:

```tsx
<a href="/api/auth/login" className="...existing button classes...">Sign In</a>
```

Remove the `AuthModal` import and its open/close state from `LandingPage.tsx`.

- [ ] **Step 4: Delete Firebase files**

```bash
git rm src/lib/firebase.ts src/components/AuthModal.tsx firebase-applet-config.json firestore.rules firebase-blueprint.json
grep -rn "firebase" src/ || echo "no firebase refs remain in src/"
```
Expected: the `grep` prints `no firebase refs remain in src/`. If any remain, remove them.

- [ ] **Step 5: Build the SPA**

Run: `npm run build`
Expected: Vite build succeeds with no unresolved `firebase` import.

- [ ] **Step 6: Typecheck**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(arcanum): SPA auth via /api/auth/me + Authentik sign-in; remove Firebase"
```

### Task D7: Env, deploy, smoke

**Files:**
- Modify: `/opt/arcanum-dashboard/.env` (gitignored, on CT 501)
- Modify: `.env.example` (repo)

- [ ] **Step 1: Back up and extend `.env`**

```bash
cp /opt/arcanum-dashboard/.env /opt/arcanum-dashboard/.env.pre-authentik.bak
cat >> /opt/arcanum-dashboard/.env <<'EOF'
AUTHENTIK_BASE_URL=https://auth.pathsofreverence.com
AUTHENTIK_APP_SLUG=arcanum
AUTHENTIK_CLIENT_ID=<from Phase C>
AUTHENTIK_CLIENT_SECRET=<from Phase C>
AUTHENTIK_REDIRECT_URI=https://readings.pathsofreverence.com/api/auth/callback
NEO4J_READINGS_URI=bolt://10.20.0.61:7687
NEO4J_READINGS_USER=neo4j
NEO4J_READINGS_PASSWORD=<production neo4j password>
SESSION_COOKIE_SECURE=true
EOF
```

Add the same keys (without secret values) to the repo's `.env.example` and commit that file.

- [ ] **Step 2: Restart the service**

```bash
pct exec 501 -- systemctl restart arcanum-dashboard
pct exec 501 -- bash -lc 'sleep 2; curl -fsS http://127.0.0.1:3000/api/health; echo; systemctl is-active arcanum-dashboard'
```
Expected: `{"status":"ok"}` and `active`.

- [ ] **Step 3: Smoke — unauthenticated API is now 401**

```bash
pct exec 501 -- bash -lc "curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/api/readings"
```
Expected: `401` (PAT-586 closed).

- [ ] **Step 4: Smoke — browser login round-trip**

In a browser: visit `https://readings.pathsofreverence.com` → Sign In → Authentik login (or silent SSO if already logged into Hub/Forms) → returns to the dashboard. Confirm `/api/auth/me` returns your `{sub,email,name}` (devtools) and the readings list renders.

- [ ] **Step 5: Smoke — multi-user isolation (the acceptance test)**

- Self-enroll a fresh Authentik test account; log into Arcanum with it → `User {sub}` appears on :7687 (`MATCH (u:User {sub:$newsub}) RETURN u`).
- As that test user, submit a reading via `forms.pathsofreverence.com/tarot-reading`.
- Confirm it appears in the test user's Arcanum list and **does NOT** appear in Paul's list.

- [ ] **Step 6: Commit `.env.example` and open PR / merge the branch**

```bash
git add .env.example
git commit -m "docs(arcanum): document Authentik+readings-graph env vars"
git push -u origin pat-arcanum-authentik
```

---

## Phase E — One-time orphan backfill + sub-less node audit (:7687)

Run from the control node against production Neo4j (use the readings-webhook venv + creds, as in the spec's discovery step). **Review output before mutating.**

- [ ] **Step 1: Audit sub-less `User {email}` collisions (dedup guard)**

```cypher
MATCH (u:User) WHERE u.sub IS NULL AND u.email IS NOT NULL RETURN u.email, u.display_name;
```
If any collide with a real account's email, set `u.sub` on that existing node so the writer's `MERGE (u:User {sub})` attaches instead of forking. (The 2 current legacy shells have no email, so they won't collide.)

- [ ] **Step 2: Link all current orphans to Paul** (spec §5 decision)

```cypher
MATCH (u:User {sub:'924a9054d8e720cdc65cb9984629cb88faae3f1853adf39fd21d68486754939a'})
MATCH (r:Reading)
WHERE r.source IN ['typeform','arcanum_form'] AND NOT (:User)-[:HAS_READING]->(r)
MERGE (u)-[:HAS_READING]->(r);
```

- [ ] **Step 3: Verify**

```cypher
MATCH (r:Reading) WHERE r.source IN ['typeform','arcanum_form']
OPTIONAL MATCH (:User)-[:HAS_READING]->(r)
RETURN count(r) AS readings, sum(CASE WHEN NOT (:User)-[:HAS_READING]->(r) THEN 1 ELSE 0 END) AS orphaned;
```
Expected: `orphaned = 0`.

---

## Final verification checklist

- [ ] `python -m pytest tests/ -q` green in readings-webhook.
- [ ] `node --test server/*.test.ts` green in Arcanum.
- [ ] `npm run build` succeeds; no `firebase` imports remain.
- [ ] Unauthenticated `GET /api/readings` → 401.
- [ ] A fresh enrolled user sees only their own readings; Paul does not see theirs.
- [ ] Hub still works (its readings calls send no `user_sub` → unscoped, unchanged).
- [ ] `.env` backed up to `.env.pre-authentik.bak`; rollback = restore prior `dist/` + `.env` + restart.

## Out of scope (tracked follow-ups)
- Lock down Authentik enrollment after the cohort.
- Rate-limiting on AI endpoints (other half of PAT-586).
- Reconcile :7687 readings-projection vs :7688 auth-profile User stores ecosystem-wide.
- Retire/merge the 2 legacy sub-less `User` shells on :7687.

---

## Phase DP — Repository persistence (ADDED 2026-06-03, before cutover)

**Why:** Firebase wasn't only auth — Firestore (keyed on the Firebase `uid`) also persisted reading **notes**, **saved insights**, and the dashboard **trend insight**. Removing Firebase (D6) made these session-only. Per operator decision, this user-generated content is spiritual-profile signal and must persist to the **Repository (production Neo4j :7687)** keyed by the Authentik `sub`. Card-layout drag positions are cosmetic UI state and are intentionally **dropped** (no persistence) — SpreadVisualizer is already session-only post-D6, so no further work there.

**Home & writer:** the Arcanum BFF (`server.ts`) writes directly to `:7687` (it already provisions `User{sub}` there via `authProfile.ts`). All endpoints are behind `requireAuth`; the `sub` comes from the session, never the client.

**Schema (on :7687):**
- Note (one per user+reading): `(:User {sub})-[:NOTED {text, updated_at}]->(:Reading {id})`
- Saved insight (per user+reading+card): `(:User {sub})-[:SAVED_INSIGHT {card_id, text, saved_at}]->(:Reading {id})`
- Trend insight (per user): properties on the `User` node — `u.trend_insight`, `u.trend_insight_at`

### Task DP1: `server/userData.ts` — graph read/write helpers (TDD)
Create `server/userData.ts` (own lazy driver via `NEO4J_READINGS_URI`, mirroring `authProfile.ts`) exporting pure Cypher constants + functions: `upsertNote(sub, readingId, text)`, `deleteNote(sub, readingId)`, `saveInsight(sub, readingId, cardId, text)`, `unsaveInsight(sub, readingId, cardId)`, `getAnnotations(sub, readingId)` → `{ note: string|null, savedInsights: [{card_id, text}] }`, `getTrendInsight(sub)`, `setTrendInsight(sub, text)`. Unit test asserts the Cypher constants MERGE on `sub`+reading id (+card_id) and set the documented props — no live DB in unit tests (lazy driver, import opens nothing).

### Task DP2: wire annotation endpoints into `server.ts` (behind requireAuth)
`GET /api/readings/:id/annotations`, `PUT /api/readings/:id/note` `{text}`, `DELETE /api/readings/:id/note`, `POST /api/readings/:id/insights/saved` `{cardId,text}`, `DELETE /api/readings/:id/insights/saved` `{cardId}`, `GET /api/trend-insight`, `PUT /api/trend-insight` `{text}`. Each reads `req.user.sub`. Registered AFTER the `app.use("/api", requireAuth)` gate. Runtime smoke: unauthenticated → 401.

### Task DP3: rewire the SPA to the new endpoints
- `ReadingDetailPane.tsx`: on load fetch `/api/readings/:id/annotations` → hydrate note + saved-insight markers; note edit → `PUT`/`DELETE`; saved-insight toggle → `POST`/`DELETE`.
- `DashboardSpreadsheet.tsx`: on load `GET /api/trend-insight`; on generate, `PUT /api/trend-insight`.
- `SpreadVisualizer.tsx`: leave session-only (card layouts dropped). No change.
- `npm run build` + `npm run lint` clean.
