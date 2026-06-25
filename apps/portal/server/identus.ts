import * as SDK from "@hyperledger/identus-sdk";
import { createMongoDB } from "@trust0/ridb-mongodb";
import { config } from "./config";

// The RIDB MongoDB backend reads its connection string from MONGODB_URL.
process.env.MONGODB_URL = config.MONGODB_URL;

let agent: SDK.Agent | null = null;

/**
 * Lazily create a single Identus agent backed by a MongoDB-backed Pluto store.
 * Subsequent calls reuse the cached instance.
 */
export async function getAgent(): Promise<SDK.Agent> {
  if (agent) return agent;

  const apollo = new SDK.Apollo();
  const castor = new SDK.Castor(apollo);

  const pluto = await SDK.Pluto.create({
    keyRestoration: apollo,
    dbName: "portal",
    // createMongoDB() returns a RIDB storage backend whose BaseStorage type is
    // structurally identical to the SDK's but declared in a separate package.
    startOptions: { storageType: (await createMongoDB()) as never },
  });

  const seed = apollo.createSeed(apollo.createRandomMnemonics(), "");

  agent = await SDK.Agent.initialize({
    apollo,
    castor,
    pluto,
    seed: async () => seed.value,
  });

  return agent;
}
