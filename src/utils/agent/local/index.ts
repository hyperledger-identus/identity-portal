import {
    Apollo,
    Castor,
    Agent as LocalAgent,
    Domain,
    PrismKeyPathIndexTask,
} from "@hyperledger/identus-sdk";

import { MONGODB_URI } from "../../../config";
import { AgentSession } from "..";
import { MediatorConnection } from "@hyperledger/identus-sdk/plugins/didcomm";
import {
    Agent,
    CredentialSchemaInput,
    MutablePrismDIDSecretKeys,
    PrismDIDKeyCurves,
    typedEntries,
} from "../types";
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
        try {
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
                create: async (keyTypeCurves: PrismDIDKeyCurves) => {
                    // PrismDIDKeyCurves keys are the types of keys we need to add to the DID
                    // values contain an array of Domain.Curves, we need to create a key with the specific
                    // curve and use the agent.createDID function directly

                    const seedHex = await pluto.getSetting("seed");
                    if (!seedHex) {
                        throw new Error("Seed not found");
                    }
                    const seed = Buffer.from(seedHex, "hex");
                    const index = await agent.runTask(new PrismKeyPathIndexTask({}));

                    const keys: MutablePrismDIDSecretKeys = {};

                    // MASTER_KEY is mandatory and holds a single curve.
                    const { ...extraCurves } = keyTypeCurves;

                    const masterKeyDerivation = Domain.PrismDerivationPath.init(
                        index, Domain.PrismDIDKeyUsage.MASTER_KEY
                    );
                    keys.MASTER_KEY = apollo.createPrivateKey({
                        [Domain.KeyProperties.curve]: Domain.Curve.SECP256K1,
                        [Domain.KeyProperties.seed]: seed,
                        [Domain.KeyProperties.derivationPath]: masterKeyDerivation.toString(),
                        [Domain.KeyProperties.derivationSchema]: Domain.PrismDerivationPathSchema
                    });

                    // Every other usage is optional and holds an array of keys.
                    for (const [keyType, curves] of typedEntries(extraCurves)) {
                        const keyUsage = Domain.PrismDIDKeyUsage[keyType];
                        keys[keyType] = curves.map((curve, curveIndex) => {
                            const derivation = Domain.PrismDerivationPath.init(
                                index + curveIndex,
                                keyUsage
                            );
                            return apollo.createPrivateKey({
                                [Domain.KeyProperties.curve]: curve,
                                [Domain.KeyProperties.seed]: seed,
                                [Domain.KeyProperties.derivationPath]: derivation.toString(),
                                [Domain.KeyProperties.derivationSchema]: Domain.PrismDerivationPathSchema
                            });
                        });
                    }

                    const { MASTER_KEY, ...optionalKeys } = keys;
                    if (!MASTER_KEY) {
                        throw new Error("MASTER_KEY is required");
                    }
                    return castor.createDID('prism', {
                        keys: { MASTER_KEY, ...optionalKeys },
                    });
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
        },
        schemas: {
            // Records are tenant-scoped by MultiTenantPluto's store filters.
            list: () => pluto.getSchemas(),
            get: (uuid: string) => pluto.getSchema(uuid),
            create: (schema: CredentialSchemaInput) => pluto.createSchema({ ...schema, tenantId: session.tenantId }),
            update: (uuid: string, schema: Partial<CredentialSchemaInput>) => pluto.updateSchema(uuid, schema),
            delete: (uuid: string) => pluto.deleteSchema(uuid),
        }
    }
}
