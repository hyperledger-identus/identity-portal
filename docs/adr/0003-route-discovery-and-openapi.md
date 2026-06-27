# 0003. Route discovery and generated OpenAPI

- Status: Accepted
- Date: 2026-06-25

## Context

The API will grow one resource at a time. Manually registering each route and
hand-writing its documentation is repetitive and drifts out of date. We want
adding an endpoint to be cheap, and the API reference to always match the code.

## Decision

`src/api/index.ts` discovers route groups by reading the folders under `src/api`
and importing each `index.js`, mounting it at `/api/<folder>`. Each route is
defined with `createRestRouter` (`src/utils/rest.ts`) and validated by Zod schemas.
The same routers feed an OpenAPI 3.1 generator (`src/utils/openapi.ts`); in
development the spec is served as Swagger UI at `/api/docs` and JSON at
`/api/openapi.json`.

## Consequences

- Adding a folder under `src/api` yields both a live route and its documentation —
  no central registry to edit.
- Zod schemas are the single source of truth for request/response validation and
  for the generated docs.
- The mechanism depends on a folder/file convention and on importing the compiled
  `index.js`, so the server runs from a build, not raw `.ts`.
- Discovery and spec generation happen at startup; spec generation is disabled in
  production.
