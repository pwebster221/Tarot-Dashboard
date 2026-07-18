import { test } from "node:test";
import assert from "node:assert/strict";
import { sessionCookieOptions, requireAuth, requireAdmin, safeReturnTo } from "./auth.ts";

test("requireAdmin fails closed when no admin env is set", () => {
  const saved = { s: process.env.ARCANUM_ADMIN_SUBS, e: process.env.ARCANUM_ADMIN_EMAILS };
  delete process.env.ARCANUM_ADMIN_SUBS; delete process.env.ARCANUM_ADMIN_EMAILS;
  let status = 0; let nexted = false;
  const res: any = { status(c: number) { status = c; return this; }, json() { return this; } };
  requireAdmin({ user: { sub: "anyone", email: "a@b.c" } } as any, res, () => { nexted = true; });
  assert.equal(status, 403);
  assert.equal(nexted, false);
  if (saved.s !== undefined) process.env.ARCANUM_ADMIN_SUBS = saved.s;
  if (saved.e !== undefined) process.env.ARCANUM_ADMIN_EMAILS = saved.e;
});

test("requireAdmin allows an allow-listed sub, denies others", () => {
  const saved = process.env.ARCANUM_ADMIN_SUBS;
  process.env.ARCANUM_ADMIN_SUBS = "admin-sub-1, admin-sub-2";
  const call = (sub: string) => {
    let status = 0; let nexted = false;
    const res: any = { status(c: number) { status = c; return this; }, json() { return this; } };
    requireAdmin({ user: { sub } } as any, res, () => { nexted = true; });
    return { status, nexted };
  };
  assert.deepEqual(call("admin-sub-2"), { status: 0, nexted: true });
  assert.deepEqual(call("intruder"), { status: 403, nexted: false });
  if (saved !== undefined) process.env.ARCANUM_ADMIN_SUBS = saved; else delete process.env.ARCANUM_ADMIN_SUBS;
});

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
  assert.equal(safeReturnTo("/card-detail?id=3#top"), "/card-detail?id=3#top"); // query/hash + dash kept
  assert.equal(safeReturnTo("https://evil.com"), "/");
  assert.equal(safeReturnTo("//evil.com"), "/");
  assert.equal(safeReturnTo(undefined), "/");
  assert.equal(safeReturnTo(["/a", "/b"]), "/");
});

test("safeReturnTo blocks the backslash + CRLF open-redirect bypasses", () => {
  // browsers normalize `\` → `/`, so `/\evil.com` would become protocol-relative
  assert.equal(safeReturnTo("/\\evil.com"), "/");
  assert.equal(safeReturnTo("/\\/evil.com"), "/");
  assert.equal(safeReturnTo("/\t/\\evil.com"), "/"); // tab smuggling
  // CR/LF must never survive into a Location header
  assert.ok(!safeReturnTo("/foo\r\nLocation: https://evil.com").includes("\n"));
  assert.ok(!safeReturnTo("/foo\r\nSet-Cookie: x=1").includes("\r"));
});
