# Architecture

This document describes how the Identity Portal is structured and why. It is the
entry point for anyone working on the codebase. For setup and day-to-day commands
see [local-development.md](./local-development.md); the live API reference is the
Swagger UI at `/api/docs` while running in development.

## Overview

Identity Portal is a single application that exposes a REST API and serves a React
UI from the same Express process. It is a reference interface for Hyperledger
Identus and runs in one of two modes:

- **local (edge)** — identity operations run in-process through the Identus
  TypeScript SDK, with encrypted storage in MongoDB.
- **cloud** — identity operations are delegated to a separate Cloud Agent over an
  HTTP client; the portal holds no keys or storage of its own.

The mode is selected at startup by the `AGENT_MODE` environment variable. The rest
of the application is written against a single `Agent` interface and is unaware of
which mode is active.

## System context

```mermaid
flowchart LR
  user["Browser / Developer"]

  subgraph portal["Identity Portal — single app (:3000)"]
    ui["React UI"]
    api["Express API (/api)"]
  end

  mongo[("MongoDB<br/>mongo-identus :27019")]
  neoprism["neoprism node<br/>:8081"]
  cloud["Cloud Agent<br/>:8085"]

  user --> ui
  ui --> api
  api -->|local mode| mongo
  api -->|local: resolve prism DID| neoprism
  api -->|cloud mode| cloud
```

## Application architecture

Everything lives under `apps/portal/src`. The server boots in `main.ts`, builds an
`HttpServer`, and mounts two routers: the API (assembled by route discovery) and
the UI.

```mermaid
flowchart TD
  main["main.ts<br/>entry point"] --> http["utils/http.ts<br/>HttpServer (express, cors, json)"]
  http --> apirouter["api/index.ts<br/>route discovery + OpenAPI"]
  http --> uirouter["utils/ui.ts<br/>serves the React app"]
  apirouter --> routes["api/&lt;name&gt;/index.ts<br/>endpoints"]
  routes --> rest["utils/rest.ts<br/>validation framework (Zod)"]
  routes --> agent["utils/agent<br/>Agent interface"]
  agent --> local["agent/local<br/>SDK: Apollo / Castor / Pluto"]
  agent --> cloud["agent/cloud-agent<br/>HTTP client"]
  local --> db["utils/database<br/>ExtendedPluto · RIDB · Mongo"]
```

## Key design decisions

### Single application

Express and React are served from one process instead of separate services. This
keeps the reference implementation easy to run (`npm run dev`) and to reason about.
Vite is used in middleware mode in development; in production the built assets are
served statically (`utils/ui.ts`).

### Agent abstraction

`local` and `cloud` are two implementations of the same contract,
`utils/agent/types.ts`. Callers depend only on the interface, so switching modes
does not touch the API or UI layers.

```mermaid
flowchart LR
  caller["API handler"] --> iface{{"Agent interface<br/>utils/agent/types.ts"}}
  iface -. "AGENT_MODE=local" .-> local["CreateLocalAgent<br/>SDK + Pluto + Mongo"]
  iface -. "AGENT_MODE=cloud" .-> cloud["createCloudAgentClient<br/>HTTP client"]
```

The interface is intentionally minimal today (DID resolution) and grows as
features are added. Extending it is a deliberate three-step change: update the
interface, then both implementations, then the endpoint that calls it. TypeScript
enforces that neither mode is left behind.

### Route discovery and OpenAPI

Endpoints are not registered by hand. `api/index.ts` reads the folders under
`api/`, imports each `index.js`, and mounts it at `/api/<folder>`. The same set of
routers feeds the OpenAPI generator, so adding a folder gives both a live route
and its documentation.

In development the spec is served as Swagger UI at `/api/docs` and as raw JSON at
`/api/openapi.json`. Generation is skipped in production.

### Validation at the edge

`utils/rest.ts` wraps each route with Zod validation: input is parsed and checked
before the handler runs, and output is checked before it is sent. Schemas live in
`schemas/` and are the single source of truth for both validation and the OpenAPI
spec. Handlers throw `HttpError` for expected failures, which maps to the right
status code.

### Encrypted local storage

In local mode, storage is an `ExtendedPluto` (`utils/database`) built on RIDB with
a MongoDB backend. The store is encrypted with `DB_ENCRYPTION_KEY`, so the same key
can restore the same data. The agent seed is persisted through the store's settings
and regenerated only if absent.

## Request lifecycle

A request flows through the framework before and after the handler runs.

```mermaid
sequenceDiagram
  participant B as Browser
  participant E as Express (http.ts)
  participant R as APIRouter (api/index.ts)
  participant V as rest.ts (validation)
  participant H as Handler (api/&lt;name&gt;)
  participant A as Agent (local | cloud)

  B->>E: GET /api/dids/resolve?did=...
  E->>R: route to /api/dids
  R->>V: invoke route
  V->>V: validate input (Zod)
  alt input invalid
    V-->>B: 400 Validation failed
  else input valid
    V->>H: handler({ input, ctx })
    H->>A: ctx.agent.dids.resolveDID(did)
    A-->>H: DID Document
    H-->>V: result
    V->>V: validate output (Zod)
    V-->>B: 200 JSON
  end
```

## Components

| Path                      | Responsibility                                                   |
| ------------------------- | ---------------------------------------------------------------- |
| `src/main.ts`             | Entry point: get the agent, start `HttpServer`, handle shutdown. |
| `src/api/index.ts`        | Route discovery, mounts `/api/*`, builds OpenAPI / Swagger.      |
| `src/api/<name>/index.ts` | A route group (endpoints only).                                  |
| `src/utils/http.ts`       | `HttpServer`: Express app, middleware, API + UI routers.         |
| `src/utils/rest.ts`       | Route builder with Zod input/output validation, `HttpError`.     |
| `src/utils/openapi.ts`    | OpenAPI 3.1 generation from Zod schemas.                         |
| `src/utils/ui.ts`         | Serves the React app (Vite in dev, static in prod).              |
| `src/utils/agent/`        | `Agent` interface and its `local` / `cloud` implementations.     |
| `src/utils/database/`     | `ExtendedPluto` over RIDB + MongoDB, schemas, migrations.        |
| `src/ui/`                 | React frontend.                                                  |
| `src/schemas/`            | Zod schemas (request/response shapes).                           |
| `src/config/index.ts`     | Environment configuration.                                       |

## Configuration

Configuration is read from the environment in `src/config/index.ts`.

| Variable            | Default                                                          | Purpose                                                       |
| ------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------- |
| `PORT`              | `3000`                                                           | HTTP port for the portal.                                     |
| `AGENT_MODE`        | `local`                                                          | `local` or `cloud`.                                           |
| `MONGODB_URI`       | `mongodb://admin:admin@localhost:27019/identus?authSource=admin` | Local-mode store.                                             |
| `DB_ENCRYPTION_KEY` | placeholder                                                      | Encryption key for the local store (set in real deployments). |
| `NODE_ENV`          | `development`                                                    | Enables Swagger and Vite dev middleware.                      |

## Runtime environments

Two Docker Compose files provide the supporting services:

- `docker.local.compose.yml` — `neoprism` (:8081), `mediator` (:8080) with its
  Mongo, `mongo-identus` (:27019), and `mongo-express` (:8888). Brought up with
  `npm run local:up`.
- `docker.cloud.compose.yml` — `postgres` (:5432), `neoprism` (:8081), and the
  `cloud-agent` (:8085 HTTP, :8090 DIDComm). Brought up with
  `npm run cloud-agent:up`.

## Extending the API

Two common changes:

1. **New endpoint** — add `src/api/<name>/index.ts` exporting a default function
   that returns `createRestRouter(...)`. Route discovery picks it up; no manual
   registration.
2. **New agent capability** — add the method to `utils/agent/types.ts`, implement
   it in `agent/local` and `agent/cloud-agent`, then call it from the endpoint.

## References

- Live API reference: `/api/docs` (development).
- Setup and commands: [local-development.md](./local-development.md).
- Identus SDK building blocks: Apollo (crypto), Castor (DID operations), Pluto
  (storage).
