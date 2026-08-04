/**
 * @packageDocumentation
 *
 * The Hyperledger Identus identity portal. It serves a REST API built with
 * Express and Zod, plus the React UI that consumes it. Identity operations go
 * through one agent interface with two implementations, selected by
 * `AGENT_MODE`: the Identus SDK with local storage, or a remote Cloud Agent.
*/
import "./require-shim";
import "dotenv/config";

import { PORT } from "./config";
import { HttpServer } from "./utils/http";
import { startAgent } from "./utils/agent";

async function onClose() {
  console.log('SIGTERM signal received. Shutting down gracefully...');
  console.log('Server closed');
  process.exit(0);
}

async function start() {
  await startAgent();

  const server = new HttpServer({ onClose });

  await server.start();
 
  console.log(`Server running on port ${PORT}`);

  // Handle graceful shutdown
  process.on('SIGTERM', () => {
    server.close()
  });

  process.on('SIGINT', () => {
    server.close()
  });
}

start().catch((error) => {
  console.error("Failed to start the application:", error);
  process.exit(1);
});