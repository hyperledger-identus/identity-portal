import {
    Apollo,
    Castor,
    Agent as LocalAgent,
    Domain,
    PrismKeyPathIndexTask,
    UpdateAction,
    getOperationHash
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


/** Length of the SHA-256 an operation chains on. */
const OPERATION_HASH_LENGTH = 32;

/**
 * Picks a DID's master key out of the keys Pluto stored with it. The key purpose
 * is the fifth segment of the derivation path
 * (`m/29'/29'/<didIndex>'/<keyPurpose>'/<keyIndex>'`).
 */
async function getMasterKey(pluto: MultiTenantPluto, did: Domain.DID): Promise<Domain.PrivateKey> {
    const privateKeys = await pluto.getDIDPrivateKeysByDID(did);
    const masterKey = privateKeys.find((key) => {
        const path = key.getProperty(Domain.KeyProperties.derivationPath);
        const keyPurpose = path ? Number.parseInt(path.split("/")[4], 10) : NaN;
        return keyPurpose === Domain.PrismDIDKeyUsage.MASTER_KEY;
    });
    if (!masterKey) {
        throw new Error("Master key not found for DID");
    }
    return masterKey;
}

/**
 * Submits a signed Atala object to the neoprism submitter API as a hex string
 * and returns the id of the transaction carrying it.
 */
async function submitAtalaObject(atalaObject: Uint8Array): Promise<string> {
    const neoprism = createNeoPrismClient();
    const { data, error, response } = await neoprism.POST("/api/submissions/objects", {
        body: { object: Buffer.from(atalaObject).toString("hex") },
    });
    if (!response.ok || error || !data) {
        throw new Error(`neoprism rejected the submitted object (HTTP ${response.status})`);
    }
    return data.tx_id;
}

/**
 * The canonical form of a Prism DID: its state hash, without the encoded state
 * a long-form DID carries after the second `:`.
 */
function canonicalDID(did: Domain.DID): string {
    return `${did.schema}:${did.method}:${did.methodId.split(":")[0]}`;
}

/**
 * Hash of the last Atala operation submitted for a DID, which the next operation
 * has to chain on.
 *
 * The hash is written on the DID's row in the same call that records the
 * transaction, so the operation right after another one reads it from there and
 * never waits for the indexer. A row written before that field existed carries
 * only the transaction id, and the indexer is asked which operation it holds.
 *
 * `undefined` means the DID was never published, so it has no operation of its
 * own to chain on.
 */
async function getPreviousOperationHash(
    pluto: MultiTenantPluto,
    did: Domain.DID,
): Promise<Uint8Array | undefined> {
    const record = await pluto.getDIDRecord(did.toString());
    if (!record?.transactionId) {
        return undefined;
    }
    if (record.operationHash) {
        const hash = Buffer.from(record.operationHash, "hex");
        if (hash.length !== OPERATION_HASH_LENGTH) {
            throw new Error(`DID ${did.toString()} carries a malformed operation hash`);
        }
        return Uint8Array.from(hash);
    }

    const neoprism = createNeoPrismClient();
    const { data, error, response } = await neoprism.GET("/api/transactions/{tx_id}", {
        params: { tx_id: record.transactionId },
    });
    if (!response.ok || error || !data) {
        throw new Error(
            `neoprism has not indexed transaction ${record.transactionId} yet (HTTP ${response.status})`,
        );
    }

    // A transaction can carry operations for more than one DID, and the indexer
    // reports each of them under the canonical DID it applies to.
    const shortFormDID = canonicalDID(did);
    const operation = data.operations.filter((entry) => entry.did === shortFormDID).at(-1);
    if (!operation) {
        throw new Error(`Transaction ${record.transactionId} carries no operation for ${shortFormDID}`);
    }
    const operationHashHex = getOperationHash(Buffer.from(operation.signed_operation_data, "hex"));

    return Buffer.from(operationHashHex, "hex");
}


/**
 * One step of a published DID's operation chain. An update and a deactivation
 * both need the DID's master key and the hash of the operation they follow,
 * both are meaningless before the DID is on the ledger, and both record the
 * transaction and the operation hash in one write.
 */
async function chainOperation(
    pluto: MultiTenantPluto,
    did: Domain.DID,
    verb: string,
    build: (masterKey: Domain.PrivateKey, previousOperationHash: Uint8Array) => Promise<{ operation: Uint8Array, operationHash: string }>,
    record: (transactionId: string, operationHash: string) => Promise<void>,
): Promise<{ txId: string }> {
    // Neither read depends on the other.
    const [masterKey, previousOperationHash] = await Promise.all([
        getMasterKey(pluto, did),
        getPreviousOperationHash(pluto, did),
    ]);
    if (!previousOperationHash) {
        throw new Error(`DID ${did.toString()} must be published before it can be ${verb}`);
    }
    const {operation: atalaObject, operationHash} = await build(masterKey, previousOperationHash);
    const txId = await submitAtalaObject(atalaObject);
    await record(txId, operationHash);
    return { txId };
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
                    const masterKey = await getMasterKey(pluto, did);
                    const { operation: atalaObject,  operationHash   } = await agent.publishDID("prism", { did, key: masterKey });
                    const txId = await submitAtalaObject(atalaObject);
                    await pluto.setDIDPublished(did.toString(), txId, operationHash);
                    return { did, txId };
                },
                // An update carries the hash of the operation it follows, so the
                // ledger applies it to the state the caller has seen. A DID that was
                // never published has no such state, and the create operation it
                // would chain on is not on the ledger either, so it is refused here
                // rather than by the node.
                update: (did: Domain.DID, actions: UpdateAction[]) =>
                    chainOperation(
                        pluto,
                        did,
                        "updated",
                        (key, previousOperationHash) =>
                            agent.updateDID("prism", { did, key, actions, previousOperationHash }),
                        (txId, operationHash) =>
                            // The DID stays published, only the chain moves on.
                            pluto.setDIDUpdated(did.toString(), txId, operationHash),
                    ),
                deactivate: (did: Domain.DID) =>
                    chainOperation(
                        pluto,
                        did,
                        "deactivated",
                        (key, previousOperationHash) =>
                            agent.deactivateDID("prism", { did, key, previousOperationHash }),
                        (txId, operationHash) =>
                            pluto.setDIDDeactivated(did.toString(), txId, operationHash),
                    )
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
