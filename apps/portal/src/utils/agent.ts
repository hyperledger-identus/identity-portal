import {
  Apollo,
  Castor,
  Pluto,
  Agent,
} from "@hyperledger/identus-sdk";
import { createMongoDB } from "@trust0/ridb-mongodb";
import { DB_ENCRYPTION_KEY, MONGODB_URI } from "../config";
import { createExtendedStore } from "./database";
import { randomUUID } from "node:crypto";

// The RIDB MongoDB backend reads its connection string from MONGODB_URL.
process.env.MONGODB_URL = MONGODB_URI;

let agent: Agent | null = null;

async function CreateLocalAgent() {
  const apollo = new Apollo();
  const castor = new Castor(apollo);
  const storageType = await createMongoDB();
  const { 
    store, 
  } = await createExtendedStore("portal", {
    storageType,
    password: DB_ENCRYPTION_KEY,
  });
  const pluto = await Pluto.create({
    keyRestoration: apollo,
    store,
  });

  
  agent = await Agent.initialize({
    apollo,
    castor,
    pluto,
    seed: async () => {
      const settings = await store.query("settings", {
        selector: {
          key: "seed",
        },
      })
      if (settings.length === 0) {
        const seed = apollo.createSeed(apollo.createRandomMnemonics(), "");
        await store.insert("settings", {
          value: Buffer.from(seed.value).toString("hex"),
          key: "seed",
          uuid: randomUUID(),
          id: randomUUID(),
        })
      }
      return Buffer.from(settings[0].value, "hex");
    },
  });
  return agent;
}
  
export async function getAgent(): Promise<Agent> {
  /**
   * This function should be modified:
   * 1. Change the return type of this function and add specific methods
   * createDID, updateDID, publishDID, resolveDID.
   * 
   * This interface will be then extended to support other flows
   * issue credentials, 
   * send didcomm message
   * verify digital credentials.
   * 
   * 
   * This is the place where we will connect with cloud-agent or the local-agent
   */
  agent ??= await CreateLocalAgent();
  return agent;
}
