import {
    Apollo,
    Castor,
    Agent,
} from "@hyperledger/identus-sdk";
import { DB_ENCRYPTION_KEY, MONGODB_URI } from "../../config";
import { ExtendedPluto as Pluto } from "../database";

// The RIDB MongoDB backend reads its connection string from MONGODB_URL.
process.env.MONGODB_URL = MONGODB_URI;

export async function CreateLocalAgent() {
    const apollo = new Apollo();
    const castor = new Castor(apollo);
    const pluto = new Pluto({ dbName: "portal", password: DB_ENCRYPTION_KEY });
    return Agent.initialize({
        apollo,
        castor,
        pluto,
        seed: async () => {
            let seedHex = await pluto.getSetting("seed");
            if (!seedHex) {
                const seed = apollo.createSeed(apollo.createRandomMnemonics(), "");
                seedHex = Buffer.from(seed.value).toString("hex");
                await pluto.setSetting("seed", seedHex);
            }
            return Buffer.from(seedHex, "hex");
        },
    })
}