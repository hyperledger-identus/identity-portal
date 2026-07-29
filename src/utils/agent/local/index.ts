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
import { createNeoPrismClient } from "./neoprism";
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
                list: async () => {
                    // Pluto pairs each stored key with its DID, so a DID created with
                    // seven keys comes back seven times. Deduplicate by DID string.
                    // MultiTenantPluto scopes the read to the current tenant.
                    const prismDIDs = await pluto.getAllPrismDIDs();
                    const unique = new Map<string, Domain.DID>();
                    for (const { did } of prismDIDs) {
                        unique.set(did.toString(), did);
                    }
                    return [...unique.values()];
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
                        [Domain.KeyProperties.index]: index,
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
                                [Domain.KeyProperties.index]: index + curveIndex,
                                [Domain.KeyProperties.derivationPath]: derivation.toString(),
                                [Domain.KeyProperties.derivationSchema]: Domain.PrismDerivationPathSchema
                            });
                        });
                    }

                    const { MASTER_KEY, ...optionalKeys } = keys;
                    if (!MASTER_KEY) {
                        throw new Error("MASTER_KEY is required");
                    }
                    return agent.createDID('prism', {
                        keys: { MASTER_KEY, ...optionalKeys },
                    });
                },
                publish: async (did: Domain.DID) => {
                    // publishDID signs the create operation with the DID's master key.
                    // Fetch the stored keys and pick the master by its derivation path
                    // purpose segment (m/29'/29'/<didIndex>'/<keyPurpose>'/<keyIndex>').
                    const privateKeys = await pluto.getDIDPrivateKeysByDID(did);
                    const masterKey = privateKeys.find((key) => {
                        const path = key.getProperty(Domain.KeyProperties.derivationPath);
                        const keyPurpose = path ? Number.parseInt(path.split("/")[4], 10) : NaN;
                        return keyPurpose === Domain.PrismDIDKeyUsage.MASTER_KEY;
                    });
                    if (!masterKey) {
                        throw new Error("Master key not found for DID");
                    }

                    // Returns the signed Atala object bytes for the create operation.
                    const atalaObject = await agent.publishDID("prism", { did, key: masterKey });

                    // Submit the object to the neoprism submitter API as a hex string.
                    const neoprism = createNeoPrismClient();
                    const { data, error, response } = await neoprism.POST("/api/submissions/objects", {
                        body: { object: Buffer.from(atalaObject).toString("hex") },
                    });
                    if (!response.ok || error || !data) {
                        throw new Error(`neoprism rejected the publish object (HTTP ${response.status})`);
                    }

                    // Persist the transaction id; update/deactivate later need it.
                    await pluto.setDIDPublished(did.toString(), data.tx_id);
                    return { did, txId: data.tx_id };
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
