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

## Instructions

Install this workspace with ```npm i```

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