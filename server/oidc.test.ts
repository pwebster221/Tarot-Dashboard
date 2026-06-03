import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAuthUrl, isExpired, logoutUrl, SESSION_COOKIE } from "./oidc.ts";

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

test("isExpired false for future exp", () => {
  assert.equal(isExpired({ sub: "s", email: "e", name: "n", exp: Math.floor(Date.now() / 1000) + 3600 }), false);
});

test("buildAuthUrl does not leak client_secret", () => {
  process.env.AUTHENTIK_BASE_URL = "https://auth.example.com";
  process.env.AUTHENTIK_CLIENT_ID = "cid";
  process.env.AUTHENTIK_CLIENT_SECRET = "shhh-secret";
  process.env.AUTHENTIK_REDIRECT_URI = "https://readings.example.com/api/auth/callback";
  const { url } = buildAuthUrl();
  assert.ok(!url.includes("shhh-secret"));
  assert.ok(!url.includes("client_secret"));
});

test("logoutUrl uses the app slug end-session path", () => {
  process.env.AUTHENTIK_BASE_URL = "https://auth.example.com";
  process.env.AUTHENTIK_APP_SLUG = "arcanum";
  assert.equal(logoutUrl(), "https://auth.example.com/application/o/arcanum/end-session/");
});
