import { AGENT_MODE, MONGODB_URI } from "../../config";
import { createCloudAgentClient } from "./cloud-agent";
import { createLocalAgent } from "./local";
import { MultiTenantPluto } from "./local/database";
import { startQueueWorker } from "./local/queue";
import { Agent } from "./types";

// The RIDB MongoDB backend reads its connection string from MONGODB_URL.
process.env.MONGODB_URL = MONGODB_URI;

/** The session data the agent needs to authenticate a request. */
export type AgentSession = {
  tenantId: string;
  accessToken?: string;
};

/**
 * The local Edge Agent is a long-lived, stateful singleton: it owns the
 * on-device encrypted store, so there must be exactly one per process.
 */

export async function getLocalAgent(session: AgentSession): Promise<Agent> {
  return createLocalAgent(session);;
}

/**
 * Resolves the agent to use for a single request. The returned agent always
 * exposes the same interface regardless of mode, decoupling callers from the
 * implementation.
 *
 * - Local mode: the stateful singleton (one per process).
 * - Cloud mode: a fresh, lightweight client pre-authenticated with the caller's
 *   access token, so downstream code never has to handle the token itself.
 */
export async function getRequestAgent(session: AgentSession): Promise<Agent> {
  if (AGENT_MODE === 'local') {
    return getLocalAgent(session);
  }
  return createCloudAgentClient(session);
}

/**
 * Start the database connection
 */
export async function startAgent(): Promise<void> {
  if (AGENT_MODE === 'local') {
    try {
      await MultiTenantPluto.connect({ dbName: "portal" });
      startQueueWorker();
    } catch (error) {
      console.error("Failed to connect to the database:", error);
      process.exit(1);
    }
  }
}