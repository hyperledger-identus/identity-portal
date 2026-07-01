import {
    Apollo,
    Castor,
    Agent as LocalAgent,
    Domain,
} from "@hyperledger/identus-sdk";

import {  MONGODB_URI } from "../../../config";
import { AgentSession } from "..";
import { MediatorConnection } from "@hyperledger/identus-sdk/plugins/didcomm";
import { Agent, PrismDIDKeyCurves } from "../types";
import { MultiTenantPluto } from "./database";
import { PRISM_DID_RESOLVERS } from "../../../config/resolvers";

// The RIDB MongoDB backend reads its connection string from MONGODB_URL.
process.env.MONGODB_URL = MONGODB_URI;

type AgentOptions = {
    tenantId: string,
    castor: Castor;
    pluto: MultiTenantPluto;
}

export async function createTenantAgent(options: AgentOptions): Promise<LocalAgent> {
    const { castor, pluto } = options;
    LocalAgent.prototype.start = async function start() {
       try{
        if (this.pluto.state === Domain.Startable.State.STOPPED) {
            await this.pluto.start();
        }
        const mediators = await this.pluto.getAllMediators();
        for (const mediator of mediators) {
            const connection = new MediatorConnection(
                mediator.mediatorDID.toString(),
                mediator.hostDID.toString(),
                mediator.routingDID.toString(),
            );
            this.connections.addMediator(connection);
        }
       } catch (error) {
        console.error("Failed to start agent:", error);
        throw error;
       }
        return Domain.Startable.State.RUNNING;
    }
    const agent = LocalAgent.initialize({
        castor,
        pluto,
        seed: async () => {
            const seedHex = await pluto.getSetting("seed");
            if (!seedHex) {
                throw new Error("Seed not found");
            }
            return Buffer.from(seedHex, "hex");
        }
    })
    return agent;
}

export async function createLocalAgent(session: AgentSession): Promise<Agent> {
    const apollo = new Apollo();
    const castor = new Castor(apollo, PRISM_DID_RESOLVERS);
    const pluto = new MultiTenantPluto(session.tenantId);
    const agent = await createTenantAgent({
        tenantId: session.tenantId,
        castor,
        pluto,
    })
    return {
        start: async () => {
            await agent.start()
        },
        stop: async () => {
            await agent.stop()
        },
        dids: {
            resolveDID: (did: string) => castor.resolveDID(did),
            prism: {
                list: () => {
                    throw new Error("Not implemented");
                },
                create: (keys: PrismDIDKeyCurves) => {
                    // PrismDIDKeyCurves keys are the types of keys we need to add to the DID
                    // values contain an array of Domain.Curves, we need to create a key with the specific
                    // curve and use the agent.createDID function directly
                    throw new Error("Not implemented");
                },
                publish: (did: Domain.DID) => {
                    /**
                     * On SDK mode, we call agent.publishDID("prism", payload)
                     * Payload should be { did: Domain.DID, key: PrivateKey }
                     * I would fetch all the keys from the DID from storage and then grab the MASTER_KEY
                     * 
                     * This publishDID function returns a signed AtalaOperation
                     * Which you need to send into the corresponding API call from neoprism
                     */
                    throw new Error("Not implemented");
                },
                deactivate: (did: Domain.DID) => {
                    /**
                     * The TS SDK does not support creating signed deactivate operations
                     * We first need to make this feature in the TS-SDK.
                     * 
                     * Will then be accessible under agent.deactivateDID("prism")
                     */
                    throw new Error("Not implemented");
                }
            }
        }
    }
}