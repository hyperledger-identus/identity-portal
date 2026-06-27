# 0002. Agent abstraction for local and cloud modes

- Status: Accepted
- Date: 2026-06-25

## Context

The portal must work in two ways: as an edge agent running the Identus TypeScript
SDK in-process, and as a client of a separate Cloud Agent over HTTP. These differ
in where keys live, where data is stored, and how operations are performed. Without
a boundary, that difference would leak into the API handlers and the UI.

## Decision

Define one `Agent` interface (`src/utils/agent/types.ts`) and provide two
implementations: `agent/local` (SDK: Apollo, Castor, Pluto) and
`agent/cloud-agent` (HTTP client). `getAgent()` selects the implementation at
startup from the `AGENT_MODE` environment variable. All callers depend only on the
interface.

## Consequences

- Switching modes does not touch the API or UI layers.
- The interface is the contract: every new capability is added in three places —
  the interface, then both implementations — and TypeScript fails the build if one
  is missing. This is intentional friction that keeps the modes in sync.
- The interface starts minimal (DID resolution) and grows with features.
- The cloud implementation is currently partial; methods not yet wired throw rather
  than silently differ from local.
