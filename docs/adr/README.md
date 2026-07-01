# Architecture Decision Records

An ADR captures a single architectural decision: the context that forced it, the
decision itself, and the consequences. ADRs are short, append-only, and immutable —
when a decision changes, add a new ADR and mark the old one `Superseded`.

They answer "why is it like this?" months later, without archaeology through git
history.

## Index

| #                                             | Title                                                      | Status             |
| --------------------------------------------- | ---------------------------------------------------------- | ------------------ |
| [0001](./0001-single-application.md)          | Single application for API and UI                          | Accepted           |
| [0002](./0002-agent-abstraction.md)           | Agent abstraction for local and cloud modes                | Accepted           |
| [0003](./0003-route-discovery-and-openapi.md) | Route discovery and generated OpenAPI                      | Superseded by 0005 |
| [0004](./0004-multi-tenant-local-agent.md)    | Multi-tenancy over a shared local agent                    | Accepted           |
| [0005](./0005-route-registry.md)              | Explicit route registry driving OpenAPI and a typed client | Accepted           |

## Adding an ADR

Copy the template below to `NNNN-short-title.md` (next number), fill it in, and add
a row to the index.

```markdown
# NNNN. Title

- Status: Proposed | Accepted | Superseded by ADR-XXXX
- Date: YYYY-MM-DD

## Context

What problem or force is driving the decision? Keep it factual.

## Decision

What we decided to do.

## Consequences

What becomes easier, what becomes harder, and what we accept as a trade-off.
```
