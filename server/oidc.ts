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
  if (!res.ok) throw new Error(`Token refresh failed ${res.status}: ${await res.text()}`);
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

// NOTE (cutover): we validate the ACCESS token and pin aud=client_id. Authentik sets
// aud=client_id on tokens by default; if login fails with invalid_token after the
// arcanum client is created, verify the access token's actual `aud` claim
// (Authentik admin → token preview) and adjust if it differs.
export async function validateToken(token: string): Promise<TokenPayload | null> {
  try {
    // audience pinned to this client — reject tokens minted for other PoR apps on the shared Authentik
    const { payload } = await jwtVerify(token, getJWKS(), {
      issuer: `${env("AUTHENTIK_BASE_URL")}/application/o/${env("AUTHENTIK_APP_SLUG")}/`,
      audience: env("AUTHENTIK_CLIENT_ID"),
    });
    return payload as unknown as TokenPayload;
  } catch (e) {
    console.error("[validateToken] FAIL:", (e as Error)?.message);
    return null;
  }
}

export function isExpired(payload: TokenPayload): boolean {
  return Date.now() / 1000 > payload.exp - 30;
}

export function logoutUrl(): string {
  return `${env("AUTHENTIK_BASE_URL")}/application/o/${env("AUTHENTIK_APP_SLUG")}/end-session/`;
}
