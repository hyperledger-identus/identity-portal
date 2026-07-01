# 0004. Multi-tenancy over a shared local agent

- Status: Accepted
- Date: 2026-06-30

## Context

The portal now authenticates users through Keycloak, so it must serve many users,
each seeing only their own DIDs, keys, and DIDComm messages. The Cloud Agent is
already multi-tenant (a wallet per user). The local Edge Agent is not: the Identus
TypeScript SDK and its `Pluto` store are single-user by design. Running a separate
agent and store per user in one process does not scale, and DIDComm needs
per-user background work (a mediator connection and message polling) that has to
keep running between requests.

## Decision

Treat one tenant as one Keycloak subject (`session.sub`) and partition a single
shared agent and store by tenant rather than instantiating one per user.

- `MultiTenantPluto` (`agent/local/database`) extends the SDK `Pluto` and stamps
  every write with the caller's `tenantId` and filters every read by it, over one
  shared, encrypted RIDB + MongoDB store.
- Each request resolves a tenant-scoped agent (`api/context.ts` →
  `getRequestAgent({ tenantId: session.sub, accessToken })`) before the handler
  runs.
- On a tenant's first login, provisioning (`agent/local/provisioning.ts`)
  registers the tenant, generates and stores its seed, creates a host peer DID and
  requests mediation, and schedules its recurring message-fetch task.
- Per-tenant background jobs run on a BullMQ + Redis queue keyed
  `<jobName>:<tenantId>`. In cloud mode, tenancy maps to Cloud Agent wallets,
  auto-provisioned per user at login.

## Consequences

- One process and one store serve all local tenants; there is no agent-per-user
  fan-out.
- Agent selection is now per request (`getRequestAgent(session)`), refining
  [ADR-0002](./0002-agent-abstraction.md)'s process-startup selection: each request
  runs as its own tenant.
- Isolation is enforced centrally — in the store and in the per-request context —
  so handlers cannot act outside their tenant. Correctness depends on all data
  going through the tenant-scoped store; a query that bypassed it would not be
  scoped.
- New infrastructure is required: Redis + BullMQ for per-tenant jobs, and Keycloak
  as the source of tenant identity.
- Provisioning is best-effort at login: a failure is logged and login still
  succeeds, so a tenant may stay un-provisioned until a later login.
- Trade-off accepted: a single shared store means one encryption key and a shared
  blast radius. Stronger isolation (a separate store/key per tenant) is deferred
  until there is a reason to pay for it.
