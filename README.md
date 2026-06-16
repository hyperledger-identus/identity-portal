# Identity Portal

Identity Portal is a lightweight reference interface for Hyperledger Identus.
It is designed to help developers, evaluators, and mentors interact with Identus
as either an offline-first Edge Agent application or as a connected Cloud Agent
dashboard.

The project comes from the LF Decentralized Trust mentorship proposal
[Hyperledger Identus - Identity Portal](https://github.com/LF-Decentralized-Trust-Mentorships/mentorship-program/issues/77).

## Goals

- Provide a unified React web portal for Edge Agent and Cloud Agent workflows.
- Keep offline-first mode as the default: if no Cloud Agent endpoint is
  configured, the app should run in the browser using the TypeScript Edge Agent
  SDK.
- Package reusable SSI logic as TypeScript modules that can later be published
  or reused in React Native, wallet extensions, dApps, and other web projects.
- Support PRISM DID creation, resolution, update, publishing, and lifecycle
  management with CIP-30 Cardano wallet integration and/or neo-prism services.
- Support issuer, holder, verifier, connection, message, schema, credential, and
  presentation workflows.

## Repository Layout

```text
apps/
  portal/                 React 18 + Vite reference application
packages/
  ssi-core/               Framework-agnostic SSI contracts and helpers
  cloud-agent-client/     Minimal Cloud Agent HTTP adapter boundary
docs/
  architecture.md         System structure and package ownership
  local-development.md    Local development notes
```

## Stack

- React 18
- Vite
- TypeScript strict mode
- Tailwind CSS with project-owned components
- Redux Toolkit for app state
- Nx for workspace orchestration
- `@hyperledger/identus-sdk` for Edge Agent workflows
- Mesh SDK for CIP-30 wallet integration

## Quick Start

```sh
npm install
npm run dev
```

The portal runs at <http://localhost:5173> by default.

## Configuration

Copy `.env.example` to `.env` and set only the services you want to use.

```sh
cp .env.example .env
```

Important variables:

- `VITE_CLOUD_AGENT_API_ENDPOINT`: optional Cloud Agent API URL. When omitted,
  the portal should operate in offline-first Edge Agent mode.
- `VITE_MEDIATOR_DID`: optional DIDComm mediator DID.
- `VITE_PRISM_RESOLVER_URL`: optional PRISM DID resolver URL.
- `VITE_NEOPRISM_NODE_URL`: optional neo-prism service URL.

## Local Identus Services

This repository includes Docker Compose helpers for local Mediator,
Cloud Agent, and NeoPRISM development. The default stack is disposable:
NeoPRISM runs in documented in-memory dev mode, while PostgreSQL and MongoDB use
container tmpfs storage.

```sh
docker compose up -d
docker compose down --remove-orphans
```

If `just` is installed, equivalent recipes are available:

```sh
just up
just down
```

Default local service ports:

- Portal: <http://localhost:5173>
- Mediator: <http://localhost:8080>
- NeoPRISM: <http://localhost:8081>
- Cloud Agent REST API: <http://localhost:8085>
- Cloud Agent DIDComm endpoint: <http://localhost:8090>

## Development Commands

```sh
npm run dev         # start the portal
npm run build       # build all projects
npm run lint        # lint all projects
npm run typecheck   # type-check all projects
npm run format      # format repository files
```

## Package Direction

Reusable logic should move toward these boundaries:

- `@hyperledger-identus/identity-portal-ssi-core`: pure TypeScript contracts,
  workflow orchestration, and shared domain helpers.
- `@hyperledger-identus/cloud-agent-client`: Cloud Agent REST adapter.
- `@hyperledger/identus-react`: React providers and hooks for Identus SDK
  workflows.

The React portal should consume packages rather than becoming the owner of SSI
business logic.
