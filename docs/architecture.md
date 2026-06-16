# Architecture

Identity Portal is split into reusable packages and a thin reference
application.

## Runtime Modes

### Offline-first Edge Agent

This is the default mode. When `VITE_CLOUD_AGENT_API_ENDPOINT` is empty, the
portal should run in the browser using `@hyperledger/identus-sdk`, IndexedDB
storage, and optional CIP-30 wallet integration for PRISM DID publishing.

### Connected Cloud Agent

When `VITE_CLOUD_AGENT_API_ENDPOINT` is configured, the portal can use a Cloud
Agent REST adapter for custodial workflows. UI flows should stay as close as
possible to offline-first flows, with mode-specific differences hidden behind
adapter boundaries.

## Package Boundaries

- `packages/ssi-core`: pure TypeScript contracts, state-independent helpers,
  and workflow-level types.
- `packages/cloud-agent-client`: HTTP client boundary for Cloud Agent APIs.
- `packages/identus-react`: React providers and hooks imported from the
  `hyperledger-identus/sdk-ts` WIP PR once moved into this repository.
- `apps/portal`: React UI, routing, Redux store, Tailwind styling, and runtime
  composition.

## Design Constraints

- React 18 only.
- No UI component kits.
- Reusable logic must not depend on React.
- Edge Agent and Cloud Agent implementations should be replaceable behind
  service interfaces.
- Browser storage and key handling must be explicit in UI flows and docs.
