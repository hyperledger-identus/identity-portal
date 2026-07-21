# Local development

How to set up, run, and work on the Identity Portal locally. For how the project
is structured, see [architecture.md](./architecture.md).

## Prerequisites

- **Node.js 22** (see `.nvmrc`; `nvm use` if you use nvm).
- **npm 11** (the repo pins `npm@11.9.0` via `packageManager`).
- **Docker** with Docker Compose — for MongoDB, Redis, Keycloak, neoprism, the
  mediator, and (in cloud mode) the Cloud Agent.

## Install

```bash
npm i
```

This is a single, flat project (no npm/nx workspaces) — all source lives under
`src/`. No `.env` file is required to start — `src/config/index.ts` provides
working defaults that target the local Docker stack; override only what you need
(see [Configuration](#configuration)).

## Running

The portal serves the API and the React UI from one process on
`http://localhost:3000`. Pick a mode with `AGENT_MODE` (default `local`). Access is
gated by Keycloak — see [Logging in](#logging-in).

### Local mode (edge)

Identity runs in-process through the TypeScript SDK, with storage in MongoDB.

```bash
npm run local:up     # start docker services
npm run dev          # start the portal
```

Services started by `local:up` (`docker.local.compose.yml`):

| Service          | Port    | Notes                                             |
| ---------------- | ------- | ------------------------------------------------- |
| `mongo-identus`  | `27019` | Portal store (db `identus`, `admin`/`admin`).     |
| `neoprism`       | `8081`  | Resolves/publishes `did:prism`.                   |
| `mediator`       | `8080`  | DIDComm mediator.                                 |
| `mongo-mediator` | `27017` | Mediator's own Mongo.                             |
| `redis`          | `6379`  | Backs the per-tenant BullMQ task queue.           |
| `keycloak`       | `9980`  | OIDC provider (realm `atala-demo`).               |
| `keycloak-wait`  | —       | One-shot: waits for Keycloak to be healthy.       |
| `keycloak-init`  | —       | One-shot: creates the realm, clients, demo users. |
| `mongo-express`  | `8888`  | Web UI to inspect Mongo.                          |

Useful URLs while `dev` is running:

- App — `http://localhost:3000`
- Swagger (API reference) — `http://localhost:3000/docs`
- OpenAPI JSON — `http://localhost:3000/openapi.json`
- Keycloak admin — `http://localhost:9980` (`admin`/`admin`)
- Mongo Express — `http://localhost:8888`

Stop / inspect the services:

```bash
npm run local:logs   # follow logs
npm run local:down   # stop and remove
```

### Cloud Agent mode

Identity is delegated to a Cloud Agent over HTTP. This mode is still being
implemented.

```bash
npm run cloud-agent:up
AGENT_MODE=cloud-agent npm run dev
```

`cloud-agent:up` (`docker.cloud.compose.yml`) starts `postgres` (:5432),
`neoprism` (:8081), the `cloud-agent` (:8085 HTTP, :8090 DIDComm), the `mediator`
with its Mongo, and `keycloak` (:9980). Tear down with `npm run cloud-agent:down`.

## Logging in

The portal is authenticated; `keycloak-init` seeds the `atala-demo` realm with two
demo users:

| Username | Password |
| -------- | -------- |
| `alice`  | `1234`   |
| `bob`    | `1234`   |

Open `http://localhost:3000`, and unauthenticated page loads are redirected to
`/login`. Sign in with a demo user (username/password) — the server exchanges the
credentials with Keycloak and sets an encrypted, `httpOnly` session cookie; tokens
never reach the browser.

Social login (Google / GitHub) buttons appear only when the matching OAuth app
credentials are configured. Set `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (and/or
the GitHub pair) in your shell or `.env` before `local:up`, and `keycloak-init`
wires up the corresponding identity provider.

## Configuration

Read from the environment in `src/config/index.ts` (DID resolvers in
`src/config/resolvers.ts`). All defaults target the local Docker stack.

### Core

| Variable            | Default                                                          | Purpose                                                                   |
| ------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `PORT`              | `3000`                                                           | Portal HTTP port.                                                         |
| `AGENT_MODE`        | `local`                                                          | `local` or `cloud-agent`.                                                 |
| `NODE_ENV`          | `development`                                                    | Enables Swagger and the Vite dev middleware.                              |
| `MONGODB_URI`       | `mongodb://admin:admin@localhost:27019/identus?authSource=admin` | Local-mode store.                                                         |
| `DB_ENCRYPTION_KEY` | placeholder                                                      | Encryption key for the local store. Set a real value outside development. |

### DID resolution

| Variable            | Default                          | Purpose                                                 |
| ------------------- | -------------------------------- | ------------------------------------------------------- |
| `NEOPRISM_BASE_URL` | `http://localhost:8081`          | neoprism node used to resolve/publish `did:prism`.      |
| `RESOLVER_URL`      | `${NEOPRISM_BASE_URL}/api/dids/` | Resolver endpoint passed to the SDK's `PrismDIDMethod`. |

### DIDComm and task queue (local mode)

| Variable                           | Default                  | Purpose                                                |
| ---------------------------------- | ------------------------ | ------------------------------------------------------ |
| `MEDIATOR_DID`                     | local mediator peer DID  | Mediator used for DIDComm routing.                     |
| `REDIS_URL`                        | `redis://localhost:6379` | Backs the per-tenant BullMQ queue.                     |
| `TENANT_MESSAGE_FETCH_INTERVAL_MS` | `15000`                  | How often each tenant polls the mediator for messages. |

### Cloud Agent (cloud mode)

| Variable                        | Default                 | Purpose                                           |
| ------------------------------- | ----------------------- | ------------------------------------------------- |
| `CLOUD_AGENT_BASE_URL`          | `http://localhost:8085` | Where the BFF reaches the Cloud Agent.            |
| `CLOUD_AGENT_ADMIN_API_KEY`     | `admin`                 | Admin key for wallet auto-provisioning.           |
| `WALLET_AUTO_PROVISION_ENABLED` | `true`                  | Ensure each Keycloak user owns a wallet on login. |

### Authentication (Keycloak / OIDC / session)

| Variable                                              | Default                                   | Purpose                                            |
| ----------------------------------------------------- | ----------------------------------------- | -------------------------------------------------- |
| `KEYCLOAK_ISSUER_URL`                                 | `http://localhost:9980/realms/atala-demo` | OIDC issuer.                                       |
| `OIDC_CLIENT_ID`                                      | `identity-portal`                         | Confidential client id.                            |
| `OIDC_CLIENT_SECRET`                                  | `identity-portal-ui-secret`               | Client secret (matches `keycloak-init`).           |
| `OIDC_REDIRECT_URI`                                   | `http://localhost:3000/auth/callback`     | Authorization-code callback.                       |
| `SESSION_SECRET`                                      | dev placeholder (≥ 32 chars)              | Encrypts the session cookie. Override outside dev. |
| `SESSION_COOKIE_NAME`                                 | `portal_session`                          | Session cookie name.                               |
| `SESSION_TTL`                                         | `28800` (8h)                              | Session lifetime, seconds.                         |
| `AUTH_GOOGLE_ENABLED` / `AUTH_GITHUB_ENABLED`         | auto (from provider creds)                | Whether the SPA shows each social button.          |
| `LOGIN_RATE_LIMIT_WINDOW_MS` / `LOGIN_RATE_LIMIT_MAX` | `900000` / `10`                           | Native-login rate limit (defense in depth).        |

## Scripts

| Script                                       | What it does                                              |
| -------------------------------------------- | --------------------------------------------------------- |
| `npm run dev`                                | Run the portal (Express + React) in watch mode via `tsx`. |
| `npm run build`                              | Build the UI (`vite` → `dist/ui`) and bundle the server (`esbuild` → `dist/main.cjs`). |
| `npm run build:ui` / `build:server`          | Build only the UI / only the server bundle.               |
| `npm start`                                  | Run the built server (`node dist/main.cjs`).              |
| `npm run typecheck`                          | Type-check (`tsc --noEmit`).                              |
| `npm run lint`                               | Lint (`eslint`).                                          |
| `npm run test`                               | Run tests (`vitest`).                                     |
| `npm run format` / `format:check`            | Prettier write / check.                                   |
| `npm run docs:api`                           | Generate the TypeDoc API reference.                       |
| `npm run local:up` / `:down` / `:logs`       | Local-mode docker services.                               |
| `npm run cloud-agent:up` / `:down` / `:logs` | Cloud-mode docker services.                               |

## Adding code

- **A new endpoint** — create `src/api/<name>/index.ts` and register it in
  `src/api/registry.ts`; it is then mounted at `/api/<name>`, added to Swagger, and
  exposed on the typed client. See
  [architecture.md](./architecture.md#extending-the-api).
- **A new agent capability** — extend `src/utils/agent/types.ts`, implement it in
  `agent/local` and `agent/cloud-agent`, then call it from the endpoint.

## Troubleshooting

- **Docker not running** — `local:up` fails to connect to the Docker daemon. Start
  Docker Desktop first.
- **Port already in use** — the local stack uses `3000`, `27019`, `8081`, `8080`,
  `27017`, `6379`, `9980`, `8888`. Free the conflicting port or remap it in the
  compose file.
- **First `local:up` is slow** — `neoprism`, `mediator`, and `keycloak` images are
  pulled on the first run.
- **Login fails / redirect loop right after `local:up`** — Keycloak takes a few
  seconds to boot and `keycloak-init` to seed the realm. Wait for both to finish
  (`npm run local:logs`) before logging in.
- **`keycloak-init` exits with code `22`** — the realm already exists, so creating
  it returns `409` and the one-shot container stops there. This is cosmetic:
  Keycloak is healthy as long as
  `http://localhost:9980/realms/atala-demo/.well-known/openid-configuration`
  returns `200`. Run `npm run local:down` before `local:up` to start from a clean
  realm.
- **`using deprecated parameters for initSync()`** — a harmless warning from the
  SDK's wasm init; safe to ignore.
- **`Dynamic require of "crypto" is not supported`** — the SDK's ESM build needs a
  CommonJS `require` in scope. `src/require-shim.ts` installs one, and it has to be
  evaluated before anything that pulls in the SDK: `main.ts` imports it first, and a
  standalone script needs `import "./src/require-shim"` as its own first line.
- **Cannot reach Mongo** — confirm `mongo-identus` is up (`docker ps`) and that
  `MONGODB_URI` points at port `27019`.
- **Local data is gone after restarting Docker** — `mongo-identus` mounts its data
  directory as `tmpfs`, so the store lives in memory and is wiped whenever the
  container restarts. Log in again to re-provision the tenant; the new tenant gets a
  new seed, so DIDs created before the restart cannot be derived again.
- **Queue jobs don't run** — confirm `redis` is up; the per-tenant tasks need it.
- **Local data looks empty after a key change** — the store is encrypted with
  `DB_ENCRYPTION_KEY`; data is tied to that key.
