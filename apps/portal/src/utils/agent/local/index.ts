import {
    Apollo,
    Castor,
    Agent as LocalAgent,
} from "@hyperledger/identus-sdk";
import { DB_ENCRYPTION_KEY, MONGODB_URI } from "../../../config";
import { ExtendedPluto as Pluto } from "../../database";
import { Agent } from "../types";

// The RIDB MongoDB backend reads its connection string from MONGODB_URL.
process.env.MONGODB_URL = MONGODB_URI;

export async function CreateLocalAgent(): Promise<Agent> {
    const apollo = new Apollo();
    const castor = new Castor(apollo);
    const pluto = new Pluto({ dbName: "portal", password: DB_ENCRYPTION_KEY });
    const agent =  LocalAgent.initialize({
        apollo,
        castor,
        pluto,
        seed: async () => {
            // A new seed is generated if it doesn't exist
            // This is a remote encrypted database
            // It can be restored later if the same encryption key is used
            let seedHex = await pluto.getSetting("seed");
            if (!seedHex) {
                const seed = apollo.createSeed(apollo.createRandomMnemonics(), "");
                seedHex = Buffer.from(seed.value).toString("hex");
                await pluto.setSetting("seed", seedHex);
            }
            return Buffer.from(seedHex, "hex");
        },
    })
    return {
        start: async () => {
            await agent.start();
        },
        stop: async () => {
            await agent.stop();
        },
        dids: {
            resolveDID: (did: string) => agent.castor.resolveDID(did),
            // Add additional methods here to use create, update, publish methods
            // First, types.ts Agent interface needs to be extended to support additional functionality
        }
    }
}