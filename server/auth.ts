import type { Request, Response, NextFunction, Express } from "express";
import {
  buildAuthUrl, exchangeCode, refreshTokens, validateToken, isExpired, logoutUrl,
  SESSION_COOKIE, REFRESH_COOKIE, PKCE_VERIFIER_COOKIE, PKCE_STATE_COOKIE, RETURN_TO_COOKIE,
  type TokenPayload, type TokenSet,
} from "./oidc.ts";
import { upsertUser } from "./authProfile.ts";
import { getUserState, type UserState } from "./userData.ts";

const secure = () => process.env.SESSION_COOKIE_SECURE === "true" || process.env.NODE_ENV === "production";

// Single-flight refresh: the SPA fires several /api/* calls at once, so when the
// access token expires they all try to refresh simultaneously. Authentik rotates
// refresh tokens on use, so concurrent refreshes with the same token race and all
// but one fail (invalid_grant) → spurious 401s. Serialize them, keyed by the
// refresh-token value, so concurrent callers share one refresh result.
const _refreshInFlight = new Map<string, Promise<TokenSet>>();
function refreshOnce(refreshToken: string): Promise<TokenSet> {
  let p = _refreshInFlight.get(refreshToken);
  if (!p) {
    p = refreshTokens(refreshToken).finally(() => _refreshInFlight.delete(refreshToken));
    _refreshInFlight.set(refreshToken, p);
  }
  return p;
}

export function sessionCookieOptions() {
  return { httpOnly: true, secure: secure(), sameSite: "lax" as const, path: "/", maxAge: 60 * 60 * 1000 };
}
function refreshCookieOptions() {
  return { httpOnly: true, secure: secure(), sameSite: "lax" as const, path: "/", maxAge: 60 * 60 * 24 * 7 * 1000 };
}
function shortCookieOptions() {
  return { httpOnly: true, secure: secure(), sameSite: "lax" as const, path: "/", maxAge: 60 * 10 * 1000 };
}

/** Only allow same-origin relative paths as post-login redirect targets (blocks
 *  open-redirect). Resolves the candidate against a throwaway origin and accepts it
 *  only if the resolved origin is unchanged — which rejects absolute URLs,
 *  protocol-relative `//host`, the backslash bypass `/\host` (the WHATWG parser
 *  normalizes `\`→`/`, making it protocol-relative), and CR/LF/tab (stripped by the
 *  parser). On a match it re-emits the normalized path+query+hash only. */
const RETURN_TO_BASE = "http://placeholder.invalid";
export function safeReturnTo(raw: unknown): string {
  if (typeof raw !== "string" || !raw.startsWith("/")) return "/";
  try {
    const u = new URL(raw, RETURN_TO_BASE);
    if (u.origin !== RETURN_TO_BASE) return "/";
    return u.pathname + u.search + u.hash;
  } catch {
    return "/";
  }
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
  if (!payload && !refresh) console.warn("[auth] no valid session token and no refresh cookie present");
  if ((!payload || (payload && isExpired(payload))) && refresh) {
    try {
      const fresh = await refreshOnce(refresh);
      payload = await validateToken(fresh.access_token);
      if (payload) { setSession(res, fresh); console.log("[auth] token refreshed ok"); }
      else console.error("[auth] refresh succeeded but new access token failed validation");
    } catch (e) { console.error("[auth] refresh FAILED:", (e as Error)?.message); payload = null; }
  }
  return payload;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const payload = await resolvePayload(req, res);
  if (!payload) return res.status(401).json({ error: "unauthorized" });
  (req as any).user = { sub: payload.sub, email: payload.email, name: payload.name };
  next();
}

const csv = (v: string | undefined) => (v || "").split(",").map((s) => s.trim()).filter(Boolean);

/** Restrict a route to admins. Runs AFTER requireAuth (reads req.user). Admins
 *  are configured via ARCANUM_ADMIN_SUBS / ARCANUM_ADMIN_EMAILS (comma-separated);
 *  fail-closed — if neither is set, no one is admin. Use for writes to shared,
 *  non-user-scoped resources (e.g. :Spread definitions). */
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const user = (req as any).user as { sub?: string; email?: string } | undefined;
  const subs = csv(process.env.ARCANUM_ADMIN_SUBS);
  const emails = csv(process.env.ARCANUM_ADMIN_EMAILS).map((e) => e.toLowerCase());
  const ok = !!user && (
    (user.sub && subs.includes(user.sub)) ||
    (user.email && emails.includes(user.email.toLowerCase()))
  );
  if (!ok) return res.status(403).json({ error: "forbidden — admin only" });
  next();
}

/** Register /api/auth/* routes on the Express app. */
export function registerAuthRoutes(app: Express) {
  app.get("/api/auth/login", (req, res) => {
    const returnTo = safeReturnTo(req.query.redirect);
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
    const returnTo = safeReturnTo(req.cookies?.[RETURN_TO_COOKIE]);
    res.clearCookie(PKCE_VERIFIER_COOKIE, { path: "/" });
    res.clearCookie(PKCE_STATE_COOKIE, { path: "/" });
    res.clearCookie(RETURN_TO_COOKIE, { path: "/" });
    if (!code || !codeVerifier || returnedState !== savedState) return res.redirect(302, "/?error=invalid_state");
    let tokens: TokenSet;
    try { tokens = await exchangeCode(code, codeVerifier); }
    catch (e) { console.error("[auth/callback] token exchange failed:", e); return res.redirect(302, "/?error=token_exchange_failed"); }
    console.log("[auth/callback] exchanged ok; access_token.len=%d id_token.len=%d has_refresh=%s",
      tokens.access_token?.length ?? -1, (tokens as any).id_token?.length ?? -1, !!tokens.refresh_token);
    const payload = await validateToken(tokens.access_token);
    console.log("[auth/callback] validate:", payload ? `ok sub=${payload.sub}` : "NULL"); // sub only — no PII in logs
    if (!payload) return res.redirect(302, "/?error=invalid_token");
    try { await upsertUser(payload); console.log("[auth/callback] profile upserted sub=%s", payload.sub); }
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

  app.get("/api/auth/me", requireAuth, async (req, res) => {
    const user = (req as any).user;
    let state: UserState = { onboarded: false, lens: "archetypal", displayName: null };
    try {
      state = await getUserState(user.sub);
    } catch (e) {
      console.error("[auth/me] getUserState failed:", (e as Error)?.message);
    }
    res.json({ ...user, onboarded: state.onboarded, lens: state.lens, displayName: state.displayName });
  });
}
