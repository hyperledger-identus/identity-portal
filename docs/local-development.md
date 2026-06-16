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
