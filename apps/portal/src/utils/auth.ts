/**
 * @module Utils
 *
 * ## Authentication Gateway (BFF) with a branded login
 *
 * The Express server is the only party that talks to Keycloak. It supports two
 * complementary flows, both ending in a single encrypted, httpOnly session
 * cookie (tokens never reach the browser):
 *
 * - Native username/password via the OAuth 2.0 Resource Owner Password
 *   Credentials grant (ROPC / Keycloak "Direct Access Grant"). The branded React
 *   form posts to `POST /api/auth/login`, the server exchanges the credentials
 *   for tokens server-side.
 * - Social / interactive login via the authorization code flow with PKCE.
 *   `GET /auth/google` and `GET /auth/github` redirect to Keycloak with a
 *   `kc_idp_hint`, brokering out to the provider; `GET /auth/login` is the plain
 *   interactive flow used as a fallback when a password login needs an
 *   interactive step (MFA, required actions).
 *
 * Trade-off mitigations for ROPC live here and in the Keycloak realm config:
 * - Backend rate limiting on the login endpoint ({@link loginRateLimiter}).
 * - Keycloak realm brute-force protection (configured by `keycloak-init.sh`)
 *   also guards the token endpoint; lockouts are surfaced as friendly errors.
 * - When Keycloak signals an interactive step is required, the login endpoint
 *   responds with `requiresRedirect` so the SPA hands off to the hosted page.
 *
 * @category Utils
 */
import {
  type Request,
  type Response,
  type NextFunction,
  Router,
} from 'express';
import { getIronSession, type IronSession, type SessionOptions } from 'iron-session';
import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import * as client from 'openid-client';
import {
  AGENT_MODE,
  AUTH_GITHUB_ENABLED,
  AUTH_GOOGLE_ENABLED,
  KEYCLOAK_ISSUER_URL,
  LOGIN_RATE_LIMIT_MAX,
  LOGIN_RATE_LIMIT_WINDOW_MS,
  OIDC_BASE_URL,
  OIDC_CLIENT_ID,
  OIDC_CLIENT_SECRET,
  OIDC_REDIRECT_URI,
  SESSION_COOKIE_NAME,
  SESSION_SECRET,
  SESSION_TTL,
} from '../config';
import { provisionTenant  as provisionTenantCloudAgent} from './agent/cloud-agent/provisioning';
import { provisionTenant  as provisionTenantLocalAgent} from './agent/local/provisioning';

const OIDC_SCOPE = 'openid profile email';
/** Refresh the access token this many seconds before it actually expires. */
const REFRESH_LEEWAY_SECONDS = 30;

/** Identity + tokens persisted in the encrypted session cookie. */
export type PortalSession = {
  sub?: string;
  username?: string;
  email?: string;
  name?: string;
  accessToken?: string;
  refreshToken?: string;
  /** Epoch seconds when the access token expires. */
  accessTokenExpiresAt?: number;
};

/** Transient state for an in-flight authorization code flow. */
type AuthTxSession = {
  state?: string;
  nonce?: string;
  codeVerifier?: string;
  returnTo?: string;
};

const isSecure = OIDC_BASE_URL.startsWith('https');

const sessionOptions: SessionOptions = {
  cookieName: SESSION_COOKIE_NAME,
  password: SESSION_SECRET,
  ttl: SESSION_TTL,
  cookieOptions: { httpOnly: true, sameSite: 'lax', secure: isSecure, path: '/' },
};

const txSessionOptions: SessionOptions = {
  cookieName: `${SESSION_COOKIE_NAME}_tx`,
  password: SESSION_SECRET,
  ttl: 60 * 10,
  cookieOptions: { httpOnly: true, sameSite: 'lax', secure: isSecure, path: '/' },
};

/**
 * Lazily discovers the Keycloak OIDC configuration once and caches it. The
 * `allowInsecureRequests` execute hook is added for plain-HTTP issuers (local
 * dev); production issuers should be HTTPS.
 */
let configPromise: Promise<client.Configuration> | null = null;
function getOidcConfig(): Promise<client.Configuration> {
  if (!configPromise) {
    const server = new URL(KEYCLOAK_ISSUER_URL);
    const execute = server.protocol === 'http:' ? [client.allowInsecureRequests] : undefined;
    configPromise = client
      .discovery(server, OIDC_CLIENT_ID, OIDC_CLIENT_SECRET, undefined, { execute })
      .catch((err) => {
        // Don't cache a failed discovery; allow the next request to retry
        // (e.g. once Keycloak finishes booting).
        configPromise = null;
        throw err;
      });
  }
  return configPromise;
}

/** Reads (and memoizes per request) the main session. */
export async function getSession(
  req: Request,
  res: Response,
): Promise<IronSession<PortalSession>> {
  const holder = req as Request & { _portalSession?: IronSession<PortalSession> };
  if (!holder._portalSession) {
    holder._portalSession = await getIronSession<PortalSession>(req, res, sessionOptions);
  }
  return holder._portalSession;
}

function getTxSession(req: Request, res: Response): Promise<IronSession<AuthTxSession>> {
  return getIronSession<AuthTxSession>(req, res, txSessionOptions);
}

type TokenResponse = client.TokenEndpointResponse & client.TokenEndpointResponseHelpers;

/** Copies identity claims and tokens from a token response into the session. */
async function applyTokens(
  session: IronSession<PortalSession>,
  tokens: TokenResponse,
): Promise<void> {
  let claims = tokens.claims() as Record<string, unknown> | undefined;

  // ROPC responses normally include an id_token (openid scope); fall back to the
  // userinfo endpoint if for some reason claims are unavailable.
  if (!claims && tokens.access_token) {
    try {
      const cfg = await getOidcConfig();
      claims = (await client.fetchUserInfo(
        cfg,
        tokens.access_token,
        client.skipSubjectCheck,
      )) as unknown as Record<string, unknown>;
    } catch {
      claims = undefined;
    }
  }

  const now = Math.floor(Date.now() / 1000);
  const expiresIn = tokens.expiresIn();

  session.sub = claims?.['sub'] as string | undefined;
  session.username = (claims?.['preferred_username'] ??
    claims?.['name'] ??
    claims?.['email']) as string | undefined;
  session.email = claims?.['email'] as string | undefined;
  session.name = claims?.['name'] as string | undefined;
  session.accessToken = tokens.access_token;
  session.accessTokenExpiresAt = expiresIn !== undefined ? now + expiresIn : undefined;
  if (tokens.refresh_token) {
    session.refreshToken = tokens.refresh_token;
  }
}

/**
 * Best-effort: ensure the just-logged-in user owns a Cloud Agent wallet.
 *
 * Runs after the session is established (both the ROPC and OIDC-callback flows).
 * Failures are logged but never block login — auth must still work if the agent
 * is unreachable or auto-provisioning is disabled (the helper is a no-op then).
 */
async function provisionWalletForSession(session: PortalSession): Promise<void> {
  if (!session.sub || !session.accessToken) {
    return;
  }

  try {
    if (AGENT_MODE === 'cloud-agent') {
      await provisionTenantCloudAgent({
        subject: session.sub,
        accessToken: session.accessToken,
        label: session.username ?? session.email ?? session.sub,
      });
    } else {
      await provisionTenantLocalAgent({
        subject: session.sub,
        accessToken: session.accessToken,
        label: session.username ?? session.email ?? session.sub,
      });
    }
   
  } catch (err) {
    console.error('Wallet auto-provisioning failed (login still succeeds):', err);
  }
}

/** Public user shape returned to the SPA. */
function sessionUser(session: PortalSession) {
  return {
    sub: session.sub,
    username: session.username ?? session.email,
    email: session.email,
    name: session.name,
  };
}

/** Ensures `returnTo` is a same-site relative path to prevent open redirects. */
function safeReturnTo(returnTo: string | undefined): string {
  if (typeof returnTo === 'string' && returnTo.startsWith('/') && !returnTo.startsWith('//')) {
    return returnTo;
  }
  return '/';
}

/**
 * Ensures a valid (non-expired) session, refreshing the access token when
 * needed. Returns `true` when the request is authenticated.
 */
async function ensureValidSession(session: IronSession<PortalSession>): Promise<boolean> {
  if (!session.sub) {
    return false;
  }

  const now = Math.floor(Date.now() / 1000);
  const expired =
    session.accessTokenExpiresAt !== undefined &&
    session.accessTokenExpiresAt <= now + REFRESH_LEEWAY_SECONDS;

  if (!expired) {
    return true;
  }

  if (!session.refreshToken) {
    session.destroy();
    return false;
  }

  try {
    const cfg = await getOidcConfig();
    const tokens = await client.refreshTokenGrant(cfg, session.refreshToken);
    await applyTokens(session, tokens);
    await session.save();
    return true;
  } catch {
    session.destroy();
    return false;
  }
}

/**
 * Protects API routes. Unauthenticated requests get a JSON `401` (so fetch
 * callers can branch on it) rather than a redirect.
 */
export async function requireApiAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const session = await getSession(req, res);
    if (await ensureValidSession(session)) {
      return next();
    }
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  } catch (err) {
    return next(err as Error);
  }
}

/** Pages the SPA is allowed to render while unauthenticated. */
const PUBLIC_PAGES = new Set(['/login', '/logged-out']);

/**
 * Enforces the login redirect for unauthenticated page loads. A top-level HTML
 * navigation to a protected route by a visitor without a session is
 * 302-redirected to `/login?returnTo=...`. Asset / XHR / HMR requests and the
 * public pages (`/login`, `/logged-out`) pass through so the SPA can load and
 * render them. The API is still guarded separately by {@link requireApiAuth}.
 */
export async function guardUi(req: Request, res: Response, next: NextFunction) {
  // Only act on top-level document navigations, never assets, HMR, or XHR.
  if (req.method !== 'GET' || !(req.headers.accept ?? '').includes('text/html')) {
    return next();
  }
  if (PUBLIC_PAGES.has(req.path)) {
    return next();
  }

  try {
    const session = await getSession(req, res);
    if (session.sub) {
      return next();
    }
  } catch {
    /* fall through to the login redirect */
  }

  return res.redirect(`/login?returnTo=${encodeURIComponent(req.originalUrl)}`);
}

/** Backend rate limiter for the native login endpoint (keyed by IP + username). */
export const loginRateLimiter = rateLimit({
  windowMs: LOGIN_RATE_LIMIT_WINDOW_MS,
  limit: LOGIN_RATE_LIMIT_MAX,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    const ip = ipKeyGenerator(req.ip ?? '');
    const username =
      typeof req.body?.username === 'string' ? req.body.username.toLowerCase() : '';
    return `${ip}:${username}`;
  },
  handler: (_req: Request, res: Response) =>
    res.status(429).json({
      success: false,
      error: 'Too many login attempts. Please wait a moment and try again.',
    }),
});

/**
 * Maps Keycloak token-endpoint errors to friendly responses. Distinguishes
 * invalid credentials, brute-force lockout, and the "needs an interactive step"
 * case (MFA / required actions), which triggers a redirect to the hosted page.
 */
function respondGrantError(err: unknown, res: Response, username: string) {
  if (err instanceof client.ResponseBodyError) {
    const description = (err.error_description ?? '').toLowerCase();

    if (err.error === 'invalid_grant') {
      const interactive =
        description.includes('not fully set up') ||
        description.includes('account is not fully set up') ||
        description.includes('required action') ||
        description.includes('credential setup');
      if (interactive) {
        return res.status(409).json({
          success: false,
          requiresRedirect: true,
          loginUrl: `/auth/login?login_hint=${encodeURIComponent(username)}`,
          error: 'Additional verification is required to finish signing in.',
        });
      }

      const locked =
        description.includes('disabled') ||
        description.includes('temporarily') ||
        description.includes('locked');
      if (locked) {
        return res.status(423).json({
          success: false,
          error: 'This account is temporarily locked due to too many attempts. Try again later.',
        });
      }

      return res
        .status(401)
        .json({ success: false, error: 'Invalid username or password.' });
    }

    if (err.error === 'invalid_client' || err.error === 'unauthorized_client') {
      console.error('OIDC client misconfiguration during login:', err.error, err.error_description);
      return res
        .status(500)
        .json({ success: false, error: 'Authentication is misconfigured. Please contact support.' });
    }
  }

  console.error('Unexpected login error:', err);
  return res.status(502).json({ success: false, error: 'Unable to reach the identity provider.' });
}

/** Builds + redirects to the Keycloak authorization URL (PKCE), optionally via a social IdP. */
async function startInteractiveLogin(
  req: Request,
  res: Response,
  idpHint?: string,
): Promise<void> {
  const cfg = await getOidcConfig();
  const codeVerifier = client.randomPKCECodeVerifier();
  const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);
  const state = client.randomState();
  const nonce = client.randomNonce();

  const tx = await getTxSession(req, res);
  tx.state = state;
  tx.nonce = nonce;
  tx.codeVerifier = codeVerifier;
  tx.returnTo = safeReturnTo(
    typeof req.query.returnTo === 'string' ? req.query.returnTo : '/',
  );
  await tx.save();

  const params: Record<string, string> = {
    redirect_uri: OIDC_REDIRECT_URI,
    scope: OIDC_SCOPE,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state,
    nonce,
  };
  if (idpHint) {
    params.kc_idp_hint = idpHint;
  }
  if (typeof req.query.login_hint === 'string' && req.query.login_hint) {
    params.login_hint = req.query.login_hint;
  }

  const url = client.buildAuthorizationUrl(cfg, params);
  res.redirect(url.href);
}

/**
 * Public auth routes (no existing session required). Mounted before
 * {@link requireApiAuth}: native login, social/interactive redirects, the OIDC
 * callback, logout, and the providers probe used by the login page.
 */
export function createPublicAuthRouter(): Router {
  const router = Router();

  // Native username/password login (ROPC), rate-limited.
  router.post('/api/auth/login', loginRateLimiter, async (req: Request, res: Response) => {
    const username = typeof req.body?.username === 'string' ? req.body.username : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!username || !password) {
      return res
        .status(400)
        .json({ success: false, error: 'Username and password are required.' });
    }

    try {
      const cfg = await getOidcConfig();
      const tokens = await client.genericGrantRequest(cfg, 'password', {
        username,
        password,
        scope: OIDC_SCOPE,
      });
      const session = await getSession(req, res);
      await applyTokens(session, tokens);
      await session.save();
      await provisionWalletForSession(session);
      return res.json({ success: true, user: sessionUser(session) });
    } catch (err) {
      return respondGrantError(err, res, username);
    }
  });

  // Which social providers the SPA should offer (login page is unauthenticated).
  router.get('/api/auth/providers', (_req: Request, res: Response) => {
    return res.json({
      success: true,
      providers: { google: AUTH_GOOGLE_ENABLED, github: AUTH_GITHUB_ENABLED },
    });
  });

  // Interactive / social login entry points.
  router.get('/auth/login', (req, res, next) =>
    startInteractiveLogin(req, res).catch(next),
  );
  router.get('/auth/google', (req, res, next) =>
    startInteractiveLogin(req, res, 'google').catch(next),
  );
  router.get('/auth/github', (req, res, next) =>
    startInteractiveLogin(req, res, 'github').catch(next),
  );

  // OIDC redirect target: exchange the code, establish the session.
  router.get('/auth/callback', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const cfg = await getOidcConfig();
      const tx = await getTxSession(req, res);
      if (!tx.state || !tx.codeVerifier) {
        return res.redirect('/login?error=session_expired');
      }

      const currentUrl = new URL(req.originalUrl, OIDC_BASE_URL);
      const tokens = await client.authorizationCodeGrant(cfg, currentUrl, {
        pkceCodeVerifier: tx.codeVerifier,
        expectedState: tx.state,
        expectedNonce: tx.nonce,
      });

      const returnTo = safeReturnTo(tx.returnTo);
      tx.destroy();

      const session = await getSession(req, res);
      await applyTokens(session, tokens);
      await session.save();
      await provisionWalletForSession(session);
      return res.redirect(returnTo);
    } catch (err) {
      console.error('OIDC callback failed:', err);
      return res.redirect('/login?error=login_failed');
    }
  });

  // Clear our session and end the Keycloak SSO session, landing on /logged-out.
  router.get('/auth/logout', async (req: Request, res: Response) => {
    try {
      const session = await getSession(req, res);
      session.destroy();
      const cfg = await getOidcConfig();
      const url = client.buildEndSessionUrl(cfg, {
        post_logout_redirect_uri: `${OIDC_BASE_URL}/logged-out`,
        client_id: OIDC_CLIENT_ID,
      });
      return res.redirect(url.href);
    } catch (err) {
      console.error('Logout error (session cleared anyway):', err);
      return res.redirect('/logged-out');
    }
  });

  return router;
}

/**
 * Authenticated auth routes. Mounted after {@link requireApiAuth}, so these only
 * respond for a valid session.
 */
export function createProtectedAuthRouter(): Router {
  const router = Router();

  router.get('/api/auth/me', async (req: Request, res: Response) => {
    const session = await getSession(req, res);
    return res.json({ success: true, user: sessionUser(session) });
  });

  return router;
}
