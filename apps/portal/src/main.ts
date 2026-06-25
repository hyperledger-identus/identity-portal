/**
 * @packageDocumentation
 * 
 * Lace KYC Server runs as an HTTP server that provides a REST API layer using Express with Zod validation, and a powerful task queue system powered by BullMQ.
 * This service also runs on top of Hyperledger Identus SDK to manage the identity issuance and secure communication with the Lace wallet.
 * 
 * ## Dev stack
 * 
 * - Node.js
 * - TypeScript
 * - MongoDB
 * - Redis
 * 
 * Server dependencies:
 * - Hyperledger Identus SDK
 * - BullMQ
 * - Express
 * - Zod
 * - Mongoose
*/
import dotenv from "dotenv";

import { PORT } from "./config";
import { HttpServer } from "./utils/http";

dotenv.config();

async function onClose() {
  console.log('SIGTERM signal received. Shutting down gracefully...');
  console.log('Server closed');
  process.exit(0);
}

async function start() {
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