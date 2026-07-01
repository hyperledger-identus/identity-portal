import path from "node:path";

export const PORT = process.env.PORT ?? "3000";
export const DB_ENCRYPTION_KEY = process.env.DB_ENCRYPTION_KEY ?? "CHANGEMECHANGEMECHANGEMECHANGEMECHANGEMECHANGEMECHANGEMECHANGEMECHANGEMECHANGEMECHANGEMECHANGEMECHANGEMECHANGEMECHANGEMECHANGEMECHANGEMECHANGEMECHANGEME";
export const NODE_ENV = process.env.NODE_ENV ?? "development";
export const IS_PRODUCTION = NODE_ENV === "production";
export const VITE_CONFIG = process.env.VITE_CONFIG ?? path.resolve(process.cwd(), "vite.config.ts");
export const UI_DIST = process.env.UI_DIST ?? path.resolve(process.cwd(), "dist/ui");
export const MONGODB_URI = process.env.MONGODB_URI ?? 'mongodb://admin:admin@localhost:27019/identus?authSource=admin';
export const MEDIATOR_DID = process.env.MEDIATOR_DID ?? "did:peer:2.Ez6LSghwSE437wnDE1pt3X6hVDUQzSjsHzinpX3XFvMjRAm7y.Vz6Mkhh1e5CEYYq6JBUcTZ6Cp2ranCWRrv7Yax3Le4N59R6dd.SeyJ0IjoiZG0iLCJzIjp7InVyaSI6Imh0dHA6Ly9sb2NhbGhvc3Q6ODA4MCIsImEiOlsiZGlkY29tbS92MiJdfX0.SeyJ0IjoiZG0iLCJzIjp7InVyaSI6IndzOi8vbG9jYWxob3N0OjgwODAvd3MiLCJhIjpbImRpZGNvbW0vdjIiXX19";

export const AGENT_MODE = process.env.AGENT_MODE ?? "local";
export const NEOPRISM_BASE_URL = process.env.NEOPRISM_BASE_URL ?? "http://localhost:8081";
export const RESOLVER_URL = process.env.RESOLVER_URL ?? `${NEOPRISM_BASE_URL}/api/dids/`;

/**
 * Redis connection used by the BullMQ task queue. Defaults to the local `redis`
 * service from the docker compose files; override with `REDIS_URL` in any real
 * environment.
 */
export const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

/**
 * Interval (in milliseconds) of the per-tenant repeatable heartbeat task.
 * Defaults to 60s.
 */
export const TENANT_HEARTBEAT_INTERVAL_MS = Number(
  process.env.TENANT_HEARTBEAT_INTERVAL_MS ?? String(60 * 1000),
);

/**
 * Interval (in milliseconds) of the per-tenant repeatable message-fetch task,
 * which polls the mediator for new DIDComm messages. Defaults to 15s.
 */
export const TENANT_MESSAGE_FETCH_INTERVAL_MS = Number(
  process.env.TENANT_MESSAGE_FETCH_INTERVAL_MS ?? String(15 * 1000),
);

/**
 * Cloud Agent connection used by the BFF to auto-provision a wallet for each
 * Keycloak user on their first login (see `utils/agent/cloud-agent/provisioning`).
 *
 * - `CLOUD_AGENT_BASE_URL`: where the BFF reaches the agent. `localhost:8085`
 *   for `npm run dev`; `http://cloud-agent:8085` when the portal runs in Docker.
 * - `CLOUD_AGENT_ADMIN_API_KEY`: matches the agent's `ADMIN_TOKEN`. In `DEV_MODE`
 *   the agent defaults to `admin`; set an explicit value in any real environment.
 * - `WALLET_AUTO_PROVISION_ENABLED`: master switch. Defaults on only in
 *   cloud-agent mode (the local agent manages its own storage).
 */
export const CLOUD_AGENT_BASE_URL = process.env.CLOUD_AGENT_BASE_URL ?? "http://localhost:8085";
export const CLOUD_AGENT_ADMIN_API_KEY = process.env.CLOUD_AGENT_ADMIN_API_KEY ?? "admin";
export const WALLET_AUTO_PROVISION_ENABLED = true

/**
 * OIDC / Keycloak authentication gateway settings.
 *
 * Defaults target the local Keycloak from `docker.local.compose.yml` or the cloud-agent one.
 * (realm `atala-demo`, port `9980`) and the `identity-portal` client
 * registered by `docker/keycloak-init.sh`.
 */
export const KEYCLOAK_ISSUER_URL = process.env.KEYCLOAK_ISSUER_URL ?? "http://localhost:9980/realms/atala-demo";
// Browser-facing Keycloak origin (used in docs / external provider setup). In the
// local/dev setup the server and browser both reach Keycloak at the same origin.
export const KEYCLOAK_PUBLIC_URL = process.env.KEYCLOAK_PUBLIC_URL ?? "http://localhost:9980";
export const OIDC_CLIENT_ID = process.env.OIDC_CLIENT_ID ?? "identity-portal";
export const OIDC_CLIENT_SECRET = process.env.OIDC_CLIENT_SECRET ?? "identity-portal-ui-secret";
export const OIDC_BASE_URL = process.env.OIDC_BASE_URL ?? `http://localhost:${PORT}`;
// Where Keycloak redirects back after the authorization code flow.
export const OIDC_REDIRECT_URI = process.env.OIDC_REDIRECT_URI ?? `${OIDC_BASE_URL}/auth/callback`;
// Used to encrypt the session cookie. Must be at least 32 characters. Override in any non-local environment.
export const SESSION_SECRET = process.env.SESSION_SECRET ?? "dev-only-session-secret-change-me-0123456789abcdef0123456789abcdef";
export const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME ?? "portal_session";
// Session lifetime in seconds (default 8h).
export const SESSION_TTL = Number(process.env.SESSION_TTL ?? String(60 * 60 * 8));

/**
 * Social identity providers. A provider is considered enabled when its OAuth
 * app credentials are present (the same vars the Keycloak init script reads), or
 * when explicitly toggled via `AUTH_<PROVIDER>_ENABLED`. The SPA only renders a
 * social button when the provider is enabled here.
 */
function hasValue(...values: (string | undefined)[]): boolean {
  return values.every((value) => typeof value === "string" && value.trim().length > 0);
}
export const AUTH_GOOGLE_ENABLED = process.env.AUTH_GOOGLE_ENABLED
  ? process.env.AUTH_GOOGLE_ENABLED === "true"
  : hasValue(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
export const AUTH_GITHUB_ENABLED = process.env.AUTH_GITHUB_ENABLED
  ? process.env.AUTH_GITHUB_ENABLED === "true"
  : hasValue(process.env.GITHUB_CLIENT_ID, process.env.GITHUB_CLIENT_SECRET);

/**
 * Backend rate limiting for the native (ROPC) login endpoint. This is defense in
 * depth on top of Keycloak's own brute-force protection.
 */
export const LOGIN_RATE_LIMIT_WINDOW_MS = Number(process.env.LOGIN_RATE_LIMIT_WINDOW_MS ?? String(15 * 60 * 1000));
export const LOGIN_RATE_LIMIT_MAX = Number(process.env.LOGIN_RATE_LIMIT_MAX ?? "10");