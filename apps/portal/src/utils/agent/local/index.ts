import {
    Apollo,
    Castor,
    Agent as LocalAgent,
    Domain,
} from "@hyperledger/identus-sdk";


import {  MONGODB_URI } from "../../../config";
import { AgentSession } from "..";
import { MediatorConnection } from "@hyperledger/identus-sdk/plugins/didcomm";
import { Agent } from "../types";
import { MultiTenantPluto } from "./database";

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
    const castor = new Castor(apollo);
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
            resolveDID: (did: string) => {
                throw new Error("Not implemented");
            }
        }
    }
}