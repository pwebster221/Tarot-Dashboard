import { test } from "node:test";
import assert from "node:assert/strict";
import { sessionCookieOptions, requireAuth, safeReturnTo } from "./auth.ts";

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

test("safeReturnTo allows relative paths, rejects absolute/protocol-relative/non-string", () => {
  assert.equal(safeReturnTo("/practice"), "/practice");
  assert.equal(safeReturnTo("/"), "/");
  assert.equal(safeReturnTo("https://evil.com"), "/");
  assert.equal(safeReturnTo("//evil.com"), "/");
  assert.equal(safeReturnTo(undefined), "/");
  assert.equal(safeReturnTo(["/a", "/b"]), "/");
});
