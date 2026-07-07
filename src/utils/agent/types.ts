import { CollectionMap, Domain, RequiredPrismDIDSecretKeys } from "@hyperledger/identus-sdk";


/**
 * The LocalAgent is temporary, we should design 1 interface that
 * is able to manage the Agent operations from a shared interface.
 * 
 * We can use the localAgent one as an orientation, 
 * the cloudAgent one is just an API Client.
 * 
 * This interface needs to be replaced with a common, unified interface for both modes
 */


//master key is ignored because MASTER_KEY is always required
export type PrismDIDKeys = Exclude<keyof RequiredPrismDIDSecretKeys, 'MASTER_KEY'>;

export type PrismDIDKeyCurves = {
    [K in PrismDIDKeys]?: Domain.Curve[]
}

/**
 * A `RequiredPrismDIDSecretKeys` under construction: every entry (including
 * `MASTER_KEY`) is optional so the object can start empty and be populated
 * incrementally, while still being strongly typed per key usage.
 */
export type MutablePrismDIDSecretKeys = Partial<RequiredPrismDIDSecretKeys>;

/**
 * `Object.entries` typed against the object's own key/value types instead of
 * widening keys to `string`. Lets us iterate key maps without casting.
 */
export function typedEntries<K extends PropertyKey, V>(
    obj: Partial<Record<K, V>>,
): [K, V][] {
    return Object.entries(obj) as [K, V][];
}

/**
 * The RIDB `schemas` collection model. The collection is augmented into
 * `CollectionMap` by the local database module.
 */
export type CredentialSchema = CollectionMap['schemas'];

/**
 * Payload for creating a schema: `uuid` is generated on insert and
 * `tenantId` is injected by the tenant-scoped store.
 */
export type CredentialSchemaInput = Omit<CredentialSchema, 'uuid' | 'tenantId'>;

export type Agent = {
    start: () => Promise<void>;
    stop: () => Promise<void>;
    dids: {
        resolveDID: (did: string) => ReturnType<Domain.DIDResolver['resolve']>;
        prism: {
            list: () => Promise<Domain.DID[]>;
            create: (keys: PrismDIDKeyCurves) => Promise<Domain.DID>;
            publish: (did: Domain.DID) => Promise<{ did: Domain.DID, txId: string }>;
            deactivate: (did: Domain.DID) => Promise<{ txId: string }>
        }
    },
    schemas: {
        list: () => Promise<CredentialSchema[]>;
        get: (uuid: string) => Promise<CredentialSchema | undefined>;
        create: (schema: CredentialSchemaInput) => Promise<string>;
        update: (uuid: string, schema: Partial<CredentialSchemaInput>) => Promise<void>;
        delete: (uuid: string) => Promise<void>;
    },
};
