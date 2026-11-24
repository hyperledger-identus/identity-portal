
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
import { startFetchingMessages, startProcessMessages } from "./queue";
import { PRISM_DID_RESOLVERS } from "../../../config/resolvers";

export async function provisionTenant(options: { subject: string, accessToken: string, label?: string}): Promise<void> {
    const { subject } = options;

    const apollo = new Apollo();
    const castor = new Castor(apollo, PRISM_DID_RESOLVERS);
    const pluto = new MultiTenantPluto(subject);
    await pluto.start();

    const tenants = await pluto.listTenants();

    if (!tenants.includes(subject)) {
        await pluto.createTenant(subject);
    }

    let mediators = await pluto.getAllMediators();
    if (mediators.length === 0) {
        let seedHex = await pluto.getSetting("seed");
        if (!seedHex) {
            const seed = apollo.createSeed(apollo.createRandomMnemonics(), "");
            seedHex = Buffer.from(seed.value).toString("hex");
            await pluto.setSetting("seed", seedHex);
        }

        const agent = await createTenantAgent({
            tenantId: subject,
            castor,
            pluto,
            mediatorDID: MEDIATOR_DID,
        })
     

        const host = await createHostPeerDID({
            tenantId: subject,
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
        agent.connections.addMediator(connection);

        const mediationRequest = new DIDComm.MediationRequest(
            host,
            Domain.DID.from(MEDIATOR_DID)
        )
        await connection.send(
            mediationRequest.makeMessage(), agent.runtimeContext
        );
        if ((connection.state as Connection.State) !== Connection.State.GRANTED) {
            throw new Error(`Mediator did not grant mediation for tenant ${subject}`);
        }
        mediators = await pluto.getAllMediators();
    }

    // A grant creates a mailbox, while keylist-update tells the mediator
    // which tenant host DID should route into it. Repeating this also repairs
    // accounts provisioned before host DID registration was added.
    const agent = await createTenantAgent({ tenantId: subject, castor, pluto, mediatorDID: MEDIATOR_DID });
    await agent.start();
    for (const mediator of mediators) {
        const connection = agent.connections.find(mediator.mediatorDID.toString());
        if (!connection) {
            throw new Error(`Missing mediator connection for tenant ${subject}`);
        }
        const update = new DIDComm.MediationKeysUpdateList(
            mediator.hostDID,
            mediator.mediatorDID,
            [mediator.hostDID],
        );
        await connection.send(update.makeMessage(), agent.runtimeContext);
    }

    // Both schedules are idempotent and must be restored on later logins too.
    await startFetchingMessages(subject);
    await startProcessMessages(subject);
}
