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
 * Field numbers on the PRISM wire format, and the protobuf wire types the
 * fields around them can use. An Atala object carries one block, a block
 * carries the signed operations, and a signed operation carries the operation
 * the chain hashes. See the PRISM protobuf definitions:
 * https://github.com/hyperledger-identus/neoprism/blob/main/lib/did-prism/proto/prism.proto
 */
const ATALA_OBJECT_BLOCK_FIELD = 4;
const ATALA_BLOCK_OPERATIONS_FIELD = 2;
const OPERATION_FIELD = 3;
const WIRE_TYPE_VARINT = 0;
const WIRE_TYPE_LENGTH_DELIMITED = 2;

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
 * Cuts the length-delimited fields with a given number out of a protobuf
 * message. Only the top level is walked and the values are returned as they
 * are, so nothing nested is parsed.
 *
 * Every read is bounds-checked. A truncated message throws here instead of
 * reading past its end, where the arithmetic would quietly produce a value that
 * belongs to nothing and the caller would chain on it.
 */
function readMessageFields(message: Uint8Array, field: number): Uint8Array[] {
    const values: Uint8Array[] = [];
    let offset = 0;

    const readVarint = () => {
        let value = 0;
        for (let shift = 0; ; shift += 7) {
            if (offset >= message.length) {
                throw new Error("Truncated protobuf message: a varint runs past its end");
            }
            const byte = message[offset++];
            value += (byte & 0x7f) * 2 ** shift;
            if ((byte & 0x80) === 0) {
                return value;
            }
        }
    };

    while (offset < message.length) {
        const tag = readVarint();
        const wireType = tag & 0b111;
        if (wireType === WIRE_TYPE_VARINT) {
            readVarint();
            continue;
        }
        if (wireType !== WIRE_TYPE_LENGTH_DELIMITED) {
            throw new Error(`Cannot read field ${tag >> 3} of the protobuf message`);
        }
        const length = readVarint();
        const start = offset;
        offset += length;
        if (offset > message.length) {
            throw new Error(
                `Truncated protobuf message: field ${tag >> 3} declares ${length} bytes and ${message.length - start} are left`,
            );
        }
        if (tag >> 3 === field) {
            values.push(message.subarray(start, offset));
        }
    }
    return values;
}

/**
 * SHA-256 of the Atala operation a signed operation carries. The operation sits
 * in field 3 of `SignedPrismOperation` and is hashed as it is, never parsed.
 *
 * The indexer's own `operation_id` is a different digest: it covers the signed
 * envelope, while operations chain on the hash of the operation inside it.
 */
function atalaOperationHash(signedOperation: Uint8Array): Uint8Array {
    const operation = readMessageFields(signedOperation, OPERATION_FIELD).at(0);
    if (!operation) {
        throw new Error("The signed operation carries no Atala operation");
    }
    if (operation.length === 0) {
        throw new Error("The signed operation carries an empty Atala operation");
    }
    return Uint8Array.from(createHash("sha256").update(operation).digest());
}

/**
 * SHA-256 of the operation an Atala object carries, read out of the bytes that
 * are about to be submitted. An object built here wraps one block holding one
 * signed operation, so anything else means these are not those bytes.
 */
function submittedOperationHash(atalaObject: Uint8Array): string {
    const block = readMessageFields(atalaObject, ATALA_OBJECT_BLOCK_FIELD).at(0);
    if (!block) {
        throw new Error("The Atala object carries no block");
    }
    const operations = readMessageFields(block, ATALA_BLOCK_OPERATIONS_FIELD);
    if (operations.length !== 1) {
        throw new Error(
            `Expected one signed operation in the Atala object, found ${operations.length}`,
        );
    }
    return Buffer.from(atalaOperationHash(operations[0])).toString("hex");
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
    const canonical = canonicalDID(did);
    const operation = data.operations.filter((entry) => entry.did === canonical).at(-1);
    if (!operation) {
        throw new Error(`Transaction ${record.transactionId} carries no operation for ${canonical}`);
    }
    return atalaOperationHash(Buffer.from(operation.signed_operation_data, "hex"));
}

/**
 * The tail of every DID's mutation queue, keyed by the canonical DID. It lives
 * in the module and not in an agent, because each request builds its own agent
 * and two requests touching the same DID have to meet somewhere.
 */
const didMutations = new Map<string, Promise<unknown>>();

/**
 * Runs a mutation after everything already queued for the same DID.
 *
 * A DID's operations are a chain: each one carries the hash of the one before
 * it, so two operations built against the same state cannot both be applied,
 * and which of them survives would come down to timing. Queueing turns them
 * back into the steps in a row that they are.
 *
 * The queue covers this process. A second instance of the portal writing the
 * same DID would need a lock both of them can see.
 */
function serializeDIDMutation<T>(did: Domain.DID, mutation: () => Promise<T>): Promise<T> {
    const key = canonicalDID(did);
    const result = (didMutations.get(key) ?? Promise.resolve()).then(mutation);

    // A failed mutation must not block the ones behind it, so the queued tail
    // swallows the failure while the caller still gets it. The entry goes once
    // nothing is waiting on it.
    const tail = result.catch(() => undefined);
    didMutations.set(key, tail);
    void tail.then(() => {
        if (didMutations.get(key) === tail) {
            didMutations.delete(key);
        }
    });
    return result;
}

/**
 * One step of a published DID's operation chain. An update and a deactivation
 * both need the DID's master key and the hash of the operation they follow,
 * both are meaningless before the DID is on the ledger, and both record the
 * transaction and the operation hash in one write.
 */
function chainOperation(
    pluto: MultiTenantPluto,
    did: Domain.DID,
    verb: string,
    build: (masterKey: Domain.PrivateKey, previousOperationHash: Uint8Array) => Promise<Uint8Array>,
    record: (transactionId: string, operationHash: string) => Promise<void>,
): Promise<{ txId: string }> {
    return serializeDIDMutation(did, async () => {
        // Neither read depends on the other.
        const [masterKey, previousOperationHash] = await Promise.all([
            getMasterKey(pluto, did),
            getPreviousOperationHash(pluto, did),
        ]);
        if (!previousOperationHash) {
            throw new Error(`DID ${did.toString()} must be published before it can be ${verb}`);
        }

        const atalaObject = await build(masterKey, previousOperationHash);
        // Reading the hash before the object leaves keeps a malformed one from
        // being submitted, and makes the row describe what was actually sent.
        const operationHash = submittedOperationHash(atalaObject);
        const txId = await submitAtalaObject(atalaObject);
        await record(txId, operationHash);
        return { txId };
    });
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
                publish: (did: Domain.DID) =>
                    // A publish is the first step of the DID's chain, so it takes no
                    // previous hash, but it still queues with the rest of them.
                    serializeDIDMutation(did, async () => {
                        // publishDID signs the create operation with the DID's master
                        // key and returns the signed Atala object bytes.
                        const masterKey = await getMasterKey(pluto, did);
                        const atalaObject = await agent.publishDID("prism", { did, key: masterKey });

                        // The transaction id and the hash of the operation it carries
                        // are what update and deactivate chain on later.
                        const operationHash = submittedOperationHash(atalaObject);
                        const txId = await submitAtalaObject(atalaObject);
                        await pluto.setDIDPublished(did.toString(), txId, operationHash);
                        return { did, txId };
                    }),
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
