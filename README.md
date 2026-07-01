# Identity Portal

Identity Portal is a lightweight reference interface for Hyperledger Identus.
It is designed to help developers, evaluators, and mentors interact with Identus
as either an offline-first Edge Agent application or as a connected Cloud Agent
dashboard.

The project comes from the LF Decentralized Trust mentorship proposal
[Hyperledger Identus - Identity Portal](https://github.com/LF-Decentralized-Trust-Mentorships/mentorship-program/issues/77).

## Documentation

- [Architecture](./docs/architecture.md) — how the project is structured and why.
- [Local development](./docs/local-development.md) — setup, run modes, scripts, troubleshooting.
- [Architecture Decision Records](./docs/adr/) — the reasoning behind key decisions.

While running in development, the live API reference is the Swagger UI at `/api/docs`.

## Authentication

The portal authenticates through Keycloak using a Backend-for-Frontend (BFF) gateway:
the Express server performs the OIDC exchanges and keeps tokens in an encrypted,
httpOnly session cookie (tokens never reach the browser). The React UI renders a
branded login page that supports:

- Native username/password (Keycloak Direct Access Grant), and
- Social sign-in with Google and/or GitHub when configured.

Copy [.env.example](./.env.example) to `.env` to configure it. With an empty `.env`,
`npm run local:up` provisions Keycloak (realm `atala-demo`, the `identity-portal`
client, brute-force protection, and sample users `alice` / `bob`, password `1234`).

To enable social login, create an OAuth app in the provider and point its callback
at Keycloak's broker endpoint, then set the credentials in `.env` before running
`local:up` / `cloud-agent:up`:

- Google: `http://localhost:9980/realms/atala-demo/broker/google/endpoint`
- GitHub: `http://localhost:9980/realms/atala-demo/broker/github/endpoint`

## Instructions

Install dependencies with ```npm i```

This is a single, private Node/React project (no monorepo or workspaces). All
source lives under [src/](./src): the Express server boots in
[src/main.ts](./src/main.ts) and serves the React UI from [src/ui/](./src/ui).

The application provides a unified user interface for the identus agent, can either work with a local agent using TS-SDK, or use a remote agent like the Cloud-Agent.

Everything integrated into a single React application.

### Local mode
Uses the typescript SDK + MongoDB to create and provide a storage for the TS Edge Agent.
To start, this mode requires a MongoDB Database, one mediator and its corresponding MongoDB Database.
Also, in order to publish DIDS onChain using the API, we need the neoprism node.

Start the environment with: ```npm run local:up```

Check the logs with: ```npm run local:logs```

And Destroy the env with  ```npm run local:down```


### Cloud Agent (To be implemented)

Uses the Cloud-Agent API, requires additional environmnent configuration.
This requires all the docker services used by the agent.

Start the environment with: ```npm run cloud-agent:up```

Check the logs with: ```npm run cloud-agent:logs```

And Destroy the env with  ```npm run cloud-agent:down```

## Running with Docker

The [Dockerfile](./Dockerfile) builds a standalone production image: it bundles
the Express server (`dist/main.cjs`) and the pre-built React UI (`dist/ui`) and
runs both from a single Node process on port `3000`.

```bash
docker build -t identity-portal .
```

The image expects its supporting services (MongoDB, Redis, neoprism, the
mediator, and Keycloak) to be reachable — start them with `npm run local:up`
and point the container at them via environment variables (see
[.env.example](./.env.example)). On macOS/Windows, reach host services with
`host.docker.internal`:

```bash
docker run --rm -p 3000:3000 \
  -e NODE_ENV=production \
  -e MONGODB_URI="mongodb://admin:admin@host.docker.internal:27019/identus?authSource=admin" \
  -e REDIS_URL="redis://host.docker.internal:6379" \
  -e NEOPRISM_BASE_URL="http://host.docker.internal:8081" \
  -e KEYCLOAK_ISSUER_URL="http://host.docker.internal:9980/realms/atala-demo" \
  -e SESSION_SECRET="$(openssl rand -hex 32)" \
  identity-portal
```