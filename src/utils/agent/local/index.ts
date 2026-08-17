import { createHash } from "node:crypto";

import {
    Apollo,
    Castor,
    Agent as LocalAgent,
    Domain,
    PrismKeyPathIndexTask,
    UpdateAction,
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

/**
 * Field number of `SignedPrismOperation.operation`, and the protobuf wire types
 * its sibling fields can use. See the PRISM protobuf definitions:
 * https://github.com/hyperledger-identus/neoprism/blob/main/lib/did-prism/proto/prism.proto
 */
const OPERATION_FIELD = 3;
const WIRE_TYPE_VARINT = 0;
const WIRE_TYPE_LENGTH_DELIMITED = 2;

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
 * SHA-256 of the Atala operation a signed operation carries. The operation sits
 * in field 3 of `SignedPrismOperation`, so only the top-level fields are walked
 * to cut its bytes out; the operation itself is never parsed.
 *
 * The indexer's own `operation_id` is a different digest: it covers the signed
 * envelope, while operations chain on the hash of the operation inside it.
 */
function atalaOperationHash(signedOperationHex: string): Uint8Array {
    const signedOperation = Buffer.from(signedOperationHex, "hex");
    let offset = 0;
    const readVarint = () => {
        let value = 0;
        for (let shift = 0; ; shift += 7) {
            const byte = signedOperation[offset++];
            value += (byte & 0x7f) * 2 ** shift;
            if ((byte & 0x80) === 0) {
                return value;
            }
        }
    };

    while (offset < signedOperation.length) {
        const tag = readVarint();
        const wireType = tag & 0b111;
        if (wireType === WIRE_TYPE_VARINT) {
            readVarint();
            continue;
        }
        if (wireType !== WIRE_TYPE_LENGTH_DELIMITED) {
            throw new Error(`Cannot read field ${tag >> 3} of the signed operation`);
        }
        const length = readVarint();
        const start = offset;
        offset += length;
        if (tag >> 3 === OPERATION_FIELD) {
            const digest = createHash("sha256").update(signedOperation.subarray(start, offset)).digest();
            return Uint8Array.from(digest);
        }
    }
    throw new Error("The signed operation carries no Atala operation");
}

/**
 * Hash of the last Atala operation submitted for a DID, which the next operation
 * has to chain on. The DID record keeps the id of the transaction that carried
 * it, and the indexer reports the operations of a transaction.
 *
 * `undefined` means the DID was never published, so the create operation is
 * still the last one: its hash is the DID's own state hash, which the SDK fills
 * in on its own.
 */
async function getPreviousOperationHash(
    pluto: MultiTenantPluto,
    did: Domain.DID,
): Promise<Uint8Array | undefined> {
    const record = await pluto.getDIDRecord(did.toString());
    if (!record?.transactionId) {
        return undefined;
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
    const canonical = canonicalDID(did);
    const operation = data.operations.filter((entry) => entry.did === canonical).at(-1);
    if (!operation) {
        throw new Error(`Transaction ${record.transactionId} carries no operation for ${canonical}`);
    }
    return atalaOperationHash(operation.signed_operation_data);
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
                    // publishDID signs the create operation with the DID's master key
                    // and returns the signed Atala object bytes.
                    const masterKey = await getMasterKey(pluto, did);
                    const atalaObject = await agent.publishDID("prism", { did, key: masterKey });

                    // Persist the transaction id; update/deactivate later need it.
                    const txId = await submitAtalaObject(atalaObject);
                    await pluto.setDIDPublished(did.toString(), txId);
                    return { did, txId };
                },
                update: async (did: Domain.DID, actions: UpdateAction[]) => {
                    // An update carries the hash of the operation it follows, so the
                    // ledger applies it to the state the caller has seen. Leaving it
                    // out makes the SDK chain on the create operation, which is what a
                    // DID with no operations of its own needs.
                    const masterKey = await getMasterKey(pluto, did);
                    const previousOperationHash = await getPreviousOperationHash(pluto, did);
                    const atalaObject = await agent.updateDID("prism", {
                        did,
                        key: masterKey,
                        actions,
                        previousOperationHash,
                    });

                    // The DID stays published, only the transaction moves on.
                    const txId = await submitAtalaObject(atalaObject);
                    await pluto.setDIDUpdated(did.toString(), txId);
                    return { txId };
                },
                deactivate: async (did: Domain.DID) => {
                    // Unlike an update, a deactivation has no operation to fall back
                    // on: the DID has to be on the ledger for it to have any effect.
                    const masterKey = await getMasterKey(pluto, did);
                    const previousOperationHash = await getPreviousOperationHash(pluto, did);
                    if (!previousOperationHash) {
                        throw new Error(`DID ${did.toString()} must be published before it can be deactivated`);
                    }

                    const atalaObject = await agent.deactivateDID("prism", {
                        did,
                        key: masterKey,
                        previousOperationHash,
                    });

                    const txId = await submitAtalaObject(atalaObject);
                    await pluto.setDIDDeactivated(did.toString(), txId);
                    return { txId };
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
