# 0006. Flat npm package instead of nx workspaces

- Status: Accepted
- Date: 2026-07-01

## Context

[ADR-0001](./0001-single-application.md) collapsed the project to a single
application, but the repository kept the scaffolding of a monorepo: npm
workspaces (`workspaces: ["apps/*", "packages/*"]`), nx (`nx.json`,
`apps/portal/project.json`, the `.nx/` cache), a nested `apps/portal/package.json`,
and a `tsconfig.base.json` with path aliases to `packages/*` that no longer
existed.

That scaffolding only pays off with multiple projects. With exactly one — and no
second consumer on the horizon — it added cost without benefit:

- Two `package.json` files with the runtime dependencies split between them, so
  "what does this app depend on?" had no single answer.
- Build and run went through nx executors (`nx serve`, `@nx/esbuild:esbuild`,
  `generatePackageJson`, workspace-module copying) — indirection over what is
  ultimately one esbuild bundle plus one vite build.
- Dead configuration: `tsconfig.base.json` aliases pointing at absent
  `packages/*`, and an nx `typecheck`/`test` target that matched zero projects
  and so silently never ran (a real type error had accumulated undetected).

## Decision

Remove npm workspaces and nx. The repository is a single, flat, private npm
package:

- One root `package.json` (merged dependencies, no `workspaces` field, no
  `@nx/*` tooling). Source moved from `apps/portal/src` to `src/` at the root.
- Build with the tools directly, no orchestrator:
  - UI — `vite build` → `dist/ui`.
  - Server — `esbuild` (`esbuild.config.mjs`) bundles `src/main.ts` to
    `dist/main.cjs`, keeping third-party packages external (the Identus SDK and
    RIDB ship wasm/native assets that must not be inlined).
- Scripts map to plain tools: `dev` (`tsx watch`), `build`, `start`
  (`node dist/main.cjs`), `typecheck` (`tsc --noEmit`), `lint` (`eslint`),
  `test` (`vitest`).
- ESLint config moved off `@nx/eslint-plugin` onto `typescript-eslint` directly.

## Consequences

- A single source of truth for dependencies, and a build anyone can follow
  without knowing nx.
- `typecheck`, `lint`, and `test` now actually run over the code (nx previously
  matched no projects for them), so regressions surface locally and in CI.
- No nx computation cache: with one project and fast builds this is negligible.
- Adding a second deployable or a shared library later means reintroducing a
  workspace tool. This decision accepts that trade in exchange for present
  simplicity; it does not preclude a future split.
- The layout described in ADR-0001 (`apps/portal`) is superseded by the flat
  `src/` layout; the single-application decision itself still holds.
