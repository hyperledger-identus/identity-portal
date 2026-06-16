# Local Development

## Prerequisites

- Node.js 20 or newer
- npm 11 or newer
- Docker with Docker Compose

Optional:

- `just` for shorter Docker helper commands
- a CIP-30-compatible Cardano wallet configured for testnet

## Install

```sh
npm install
```

## Run the Portal

```sh
npm run dev
```

## Run Local Services

```sh
npm run docker:up
npm run docker:logs
npm run docker:down
```

The compose file is intentionally local-development focused. Prefer in-memory
service configuration where upstream images support it, and keep persistent
volumes out of the default workflow unless a feature requires them.

The default stack starts:

- NeoPRISM in `dev` mode with `NPRISM_DB_URL=sqlite::memory:`
- Cloud Agent with NeoPRISM VDR enabled and PRISM Node VDR disabled
- Mediator with demo-only keys and tmpfs MongoDB storage
- tmpfs PostgreSQL for Cloud Agent databases

The default ports are managed through `.env.docker`.

## Just Helpers

```sh
just up
just ps
just logs
just health
just down
just clean
```

`just clean` removes containers and anonymous volumes for a fresh local stack.
