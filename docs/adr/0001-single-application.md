# 0001. Single application for API and UI

- Status: Accepted
- Date: 2026-06-25

## Context

Identity Portal is a reference interface for Hyperledger Identus, aimed at
developers, evaluators, and mentors. An earlier direction split the work into
separate npm packages (for example a reusable `identus-react` package alongside a
thin app). For an early-stage reference project maintained by a small team, that
boundary added overhead — multiple build targets, versioning, and indirection —
before there was a second consumer to justify it.

## Decision

Serve the Express API and the React UI from a single application (`apps/portal`),
in one process. The API lives under `src/api` and `src/utils`; the UI under
`src/ui`. The standalone packages were removed.

## Consequences

- One command to run the whole thing (`npm run dev`); one build, one deploy.
- API and UI share types and schemas directly, with no package boundary to publish
  across.
- Less reuse: the UI and SDK integration are not consumable as independent packages
  today. If a second consumer appears, a package can be extracted later — this
  decision does not prevent that.
