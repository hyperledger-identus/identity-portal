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

/** Lifecycle of a prism DID as the portal presents it. */
export const PRISM_DID_STATUSES = ['created', 'published', 'deactivated'] as const;
export type PrismDIDStatus = (typeof PRISM_DID_STATUSES)[number];

/**
 * Maps a stored or registrar status onto the portal's three-state lifecycle.
 * Missing values and cloud `CREATED` / `PUBLICATION_PENDING` become `created`.
 */
export function toPrismDIDStatus(status?: string): PrismDIDStatus {
    const normalized = status?.toLowerCase();
    if (normalized === 'published' || normalized === 'deactivated') {
        return normalized;
    }
    return 'created';
}

/** A prism DID plus the fields the UI needs to gate publish / update / deactivate. */
export type PrismDIDRecord = {
    did: Domain.DID;
    status: PrismDIDStatus;
    transactionId?: string;
};

/**
 * JSON-safe DID update actions. Unlike the SDK `UpdateAction`, `addKey` names a
 * purpose and curve instead of carrying a `PublicKey`; the local agent derives
 * that key itself.
 */
export type PrismDIDUpdateAction =
    | {
        actionType: 'addKey';
        addKey: {
            id: string;
            purpose: PrismDIDKeys;
            curve: Domain.Curve;
        };
    }
    | {
        actionType: 'removeKey';
        removeKey: { id: string };
    }
    | {
        actionType: 'addService';
        addService: {
            id: string;
            type: string;
            serviceEndpoint: string[];
        };
    }
    | {
        actionType: 'removeService';
        removeService: { id: string };
    }
    | {
        actionType: 'updateService';
        updateService: {
            id: string;
            type: string;
            serviceEndpoint: string[];
        };
    };

    export type Claims = {name: string, value: unknown}
    export type  OfferPayload = {
        id: string;
        claims: Claims[];
        credentialFormat: string;
        //Always use automatic issuance for now
        automaticIssuance: boolean;
        issuingDID: string;
    }


export type Agent = {
    start: () => Promise<void>;
    stop: () => Promise<void>;
    issuer: {
        credentials: {
            getOffers: () => Promise<OfferPayload[]>;
            getOffer: (offerId: string) => Promise<OfferPayload | undefined>;
            createOffer: (offer:OfferPayload) => Promise<string>;
        }
    },
    dids: {
        resolveDID: (did: string) => ReturnType<Domain.DIDResolver['resolve']>;
        prism: {
            list: () => Promise<PrismDIDRecord[]>;
            create: (keys: PrismDIDKeyCurves) => Promise<Domain.DID>;
            publish: (did: Domain.DID) => Promise<{ did: Domain.DID, txId: string }>;
            update: (did: Domain.DID, actions: PrismDIDUpdateAction[]) => Promise<{ txId: string }>;
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
