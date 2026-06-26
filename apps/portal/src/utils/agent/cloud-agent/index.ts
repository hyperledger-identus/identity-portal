import { Agent } from "../types";
// import { createClient } from "./client";

export async function createCloudAgentClient(): Promise<Agent> {
  // const agent = createClient({ 
  //   baseUrl: "http://localhost:8085",
  //   headers: {
  //     "Content-Type": "application/json",
  //     //Optional Authentication for production
  //     // "Authorization": `Bearer ${process.env.CLOUD_AGENT_TOKEN}`
  //   }
  // });
  return {
    start: async () => {
      console.log("Starting Cloud Agent");
    },
    stop: async () => {
      console.log("Stopping Cloud Agent");
    },
    dids: {
      resolveDID: (did: string) => {
        // Implemented by using the API resolver to 
        // resolve the DID from the Cloud-Agent
        throw new Error("Not implemented");
      },
      // Add additional methods here to use create, update, publish methods
      // First, types.ts Agent interface needs to be extended to support additional functionality
    }
  }
}