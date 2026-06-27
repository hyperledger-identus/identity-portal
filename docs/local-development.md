# Local development

How to set up, run, and work on the Identity Portal locally. For how the project
is structured, see [architecture.md](./architecture.md).

## Prerequisites

- **Node.js 22** (see `.nvmrc`; `nvm use` if you use nvm).
- **npm 11** (the repo pins `npm@11.9.0` via `packageManager`).
- **Docker** with Docker Compose — for MongoDB, neoprism, the mediator, and the
  Cloud Agent.

## Install

```bash
npm i
```

This installs the workspace (npm workspaces: `apps/*`). No `.env` file is required
to start — `src/config/index.ts` provides working defaults; override only what you
need (see [Configuration](#configuration)).

## Running

The portal serves the API and the React UI from one process on
`http://localhost:3000`. Pick a mode with `AGENT_MODE` (default `local`).

### Local mode (edge)

Identity runs in-process through the TypeScript SDK, with storage in MongoDB.

```bash
npm run local:up     # start docker services
npm run dev          # start the portal
```

Services started by `local:up` (`docker.local.compose.yml`):

| Service          | Port    | Notes                                         |
| ---------------- | ------- | --------------------------------------------- |
| `mongo-identus`  | `27019` | Portal store (db `identus`, `admin`/`admin`). |
| `neoprism`       | `8081`  | Resolves/publishes `did:prism`.               |
| `mediator`       | `8080`  | DIDComm mediator.                             |
| `mongo-mediator` | `27017` | Mediator's own Mongo.                         |
| `mongo-express`  | `8888`  | Web UI to inspect Mongo.                      |

Useful URLs while `dev` is running:

- App — `http://localhost:3000`
- Swagger (API reference) — `http://localhost:3000/api/docs`
- OpenAPI JSON — `http://localhost:3000/api/openapi.json`
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
AGENT_MODE=cloud npm run dev
```

`cloud-agent:up` (`docker.cloud.compose.yml`) starts `postgres` (:5432),
`neoprism` (:8081), and the `cloud-agent` (:8085 HTTP, :8090 DIDComm). Tear down
with `npm run cloud-agent:down`.

## Configuration

Read from the environment in `src/config/index.ts`:

| Variable            | Default                                                          | Purpose                                                                   |
| ------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `PORT`              | `3000`                                                           | Portal HTTP port.                                                         |
| `AGENT_MODE`        | `local`                                                          | `local` or `cloud`.                                                       |
| `MONGODB_URI`       | `mongodb://admin:admin@localhost:27019/identus?authSource=admin` | Local-mode store.                                                         |
| `DB_ENCRYPTION_KEY` | placeholder                                                      | Encryption key for the local store. Set a real value outside development. |
| `NODE_ENV`          | `development`                                                    | Enables Swagger and the Vite dev middleware.                              |

## Scripts

| Script                                       | What it does                             |
| -------------------------------------------- | ---------------------------------------- |
| `npm run dev`                                | Run the portal (Express + React) via nx. |
| `npm run build`                              | Build all projects.                      |
| `npm run typecheck`                          | Type-check.                              |
| `npm run lint`                               | Lint.                                    |
| `npm run test`                               | Run tests.                               |
| `npm run format` / `format:check`            | Prettier write / check.                  |
| `npm run local:up` / `:down` / `:logs`       | Local-mode docker services.              |
| `npm run cloud-agent:up` / `:down` / `:logs` | Cloud-mode docker services.              |

## Adding code

- **A new endpoint** — create `src/api/<name>/index.ts`; route discovery mounts it
  at `/api/<name>` and adds it to Swagger. See
  [architecture.md](./architecture.md#extending-the-api).
- **A new agent capability** — extend `src/utils/agent/types.ts`, implement it in
  `agent/local` and `agent/cloud-agent`, then call it from the endpoint.

## Troubleshooting

- **Docker not running** — `local:up` fails to connect to the Docker daemon. Start
  Docker Desktop first.
- **Port already in use** — the stack uses `3000`, `27019`, `8081`, `8080`,
  `27017`, `8888`. Free the conflicting port or remap it in the compose file.
- **First `local:up` is slow** — `neoprism` and `mediator` images are pulled on the
  first run.
- **`using deprecated parameters for initSync()`** — a harmless warning from the
  SDK's wasm init; safe to ignore.
- **Cannot reach Mongo** — confirm `mongo-identus` is up (`docker ps`) and that
  `MONGODB_URI` points at port `27019`.
- **Local data looks empty after a key change** — the store is encrypted with
  `DB_ENCRYPTION_KEY`; data is tied to that key.
