import {  AGENT_MODE, MONGODB_URI } from "../../config";
import { createCloudAgentClient } from "./cloud-agent";
import { CreateLocalAgent } from "./local";
import { Agent } from "./types";

// The RIDB MongoDB backend reads its connection string from MONGODB_URL.
process.env.MONGODB_URL = MONGODB_URI;

let agent: Agent | null = null;



export async function getAgent(): Promise<Agent> {
  /**
   * This function will check environment variables to determine the mode of the agent,
   * Will either use the LocalAgent or the CloudAgent API Client
   * 
   * The Agent will ALWAYS have the same interface no matter what, 
   * So we always call and get the same responses, making it easier to integrate
   */
  agent ??= await (AGENT_MODE === 'local' ? CreateLocalAgent() : createCloudAgentClient())
  return agent;
}
