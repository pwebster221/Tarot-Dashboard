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
