# 0005. Explicit route registry driving OpenAPI and a typed client

- Status: Accepted
- Date: 2026-06-30

## Context

[ADR-0003](./0003-route-discovery-and-openapi.md) chose folder-based route
discovery: `src/api/index.ts` would scan the folders under `src/api`, import each
compiled `index.js`, and mount it at `/api/<folder>`. That works for mounting, but
it has two limits. It depends on running from a build and on a file convention,
and — more importantly — a runtime directory scan carries no type information, so
the UI client cannot know the API surface at compile time. We want a fully-typed
client whose types come straight from the route definitions, with no
code-generation step.

## Decision

Replace folder discovery with an explicit registry, `src/api/registry.ts`. It
exports `routeGroups`, a map from mount path (relative to `/api`) to a
route-group factory (a function that returns a validated router). This map is the
single source of truth:

- `createAPIRouter` (`api/index.ts`) iterates it to mount the routers.
- `utils/openapi.ts` generates the OpenAPI 3.1 spec from the same set.
- `AppRouter` is computed from the registry, so the client's type surface is
  inferred from the Zod route definitions at compile time.

Adding a route group is: create `src/api/<name>/index.ts` and add one entry to
`routeGroups`.

## Consequences

- The client is fully typed with no generation step, and the runtime routes, the
  OpenAPI spec, and the client types are guaranteed to agree because they derive
  from one registry.
- Adding an endpoint costs one explicit line (the registry entry) instead of
  relying on a filesystem convention — a small, deliberate cost that buys the type
  safety above.
- Mounting no longer depends on importing a compiled `index.js` by convention.
- Supersedes ADR-0003.
