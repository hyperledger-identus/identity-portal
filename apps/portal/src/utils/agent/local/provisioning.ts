
import {
    Apollo,
    Castor,
    Domain,
    Connection,
} from "@hyperledger/identus-sdk";

import * as DIDComm from "@hyperledger/identus-sdk/plugins/didcomm";

import { MEDIATOR_DID } from "../../../config";
import { MediatorConnection } from "@hyperledger/identus-sdk/plugins/didcomm";
import { createTenantAgent } from ".";
import { createHostPeerDID } from "./mediation";
import { MultiTenantPluto } from "./database";
import { startFetchingMessages } from "./queue";

export async function provisionTenant(options: { subject: string, accessToken: string, label?: string}): Promise<void> {
    const { subject } = options;

    const apollo = new Apollo();
    const castor = new Castor(apollo);
    const pluto = new MultiTenantPluto(subject);
    await pluto.start();

    const tenants = await pluto.listTenants();

    if (!tenants.includes(options.subject)) {
        await pluto.createTenant(options.subject);


        let seedHex = await pluto.getSetting("seed");
        if (!seedHex) {
            const seed = apollo.createSeed(apollo.createRandomMnemonics(), "");
            seedHex = Buffer.from(seed.value).toString("hex");
            await pluto.setSetting("seed", seedHex);
        }

        const agent = await createTenantAgent({
            tenantId: options.subject,
            castor,
            pluto,
        })
     

        const host = await createHostPeerDID({
            tenantId: options.subject,
            mediatorDID: MEDIATOR_DID,
            apollo,
            castor,
            pluto
        });

        const connection = new MediatorConnection(
            MEDIATOR_DID,
            host.toString()
        )

        connection.state = Connection.State.REQUESTED;
       

        const mediationRequest = new DIDComm.MediationRequest(
            host,
            Domain.DID.from(MEDIATOR_DID)
        )
        await connection.send(
            mediationRequest.makeMessage(), agent.runtimeContext
        );
        
        await pluto.storeMediator(connection.asMediator());
        await startFetchingMessages(options.subject);
    }
}
