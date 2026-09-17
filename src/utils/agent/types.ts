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

/**
 * Issue Credential 3.0 protocol states as Cloud Agent reports them. Local
 * mode maps SDK events onto the same strings so the UI never branches on
 * `AGENT_MODE`.
 */
export const CREDENTIAL_PROTOCOL_STATES = [
    'InvitationGenerated',
    'OfferPending',
    'OfferSent',
    'OfferReceived',
    'RequestPending',
    'RequestGenerated',
    'RequestSent',
    'RequestReceived',
    'CredentialPending',
    'CredentialGenerated',
    'CredentialSent',
    'CredentialReceived',
    'ProblemReportPending',
    'ProblemReportSent',
    'ProblemReportReceived',
    'InvitationExpired',
] as const;

export type CredentialProtocolState = (typeof CREDENTIAL_PROTOCOL_STATES)[number];

/** Short labels for protocol states. The API still returns the raw enum. */
export function toProtocolStateLabel(state: CredentialProtocolState): string {
    switch (state) {
        case 'InvitationGenerated':
        case 'OfferPending':
            return 'Pending';
        case 'OfferSent':
            return 'Offer sent';
        case 'OfferReceived':
            return 'Offer received';
        case 'RequestPending':
        case 'RequestGenerated':
        case 'RequestSent':
            return 'Requesting';
        case 'RequestReceived':
            return 'Request received';
        case 'CredentialPending':
        case 'CredentialGenerated':
            return 'Issuing';
        case 'CredentialSent':
            return 'Issued';
        case 'CredentialReceived':
            return 'Received';
        case 'InvitationExpired':
            return 'Expired';
        case 'ProblemReportPending':
        case 'ProblemReportSent':
        case 'ProblemReportReceived':
            return 'Problem';
    }
}

export type CredentialOfferRole = 'Issuer' | 'Holder';

/**
 * A connectionless OOB credential offer as the portal presents it. Mapped
 * from Cloud Agent `IssueCredentialRecord` or from the local issuance store.
 */
export type CredentialOfferRecord = {
    recordId: string;
    thid: string;
    role: CredentialOfferRole;
    protocolState: CredentialProtocolState;
    credentialFormat: 'JWT';
    claims: Record<string, unknown>;
    issuingDID?: string;
    subjectId?: string;
    schemaId?: string;
    automaticIssuance?: boolean;
    invitationUrl?: string;
    createdAt: string;
    updatedAt?: string;
};

/** Body for creating a connectionless OOB offer. JWT only; issuance is automatic. */
export type CreateOobOfferInput = {
    claims: Record<string, unknown>;
    issuingDID: string;
    credentialFormat?: 'JWT';
    schemaId?: string;
    automaticIssuance?: boolean;
    goalCode?: string;
    goal?: string;
};

/** A verifiable credential already in the holder's wallet. */
export type HolderCredential = {
    id: string;
    issuer?: string;
    subject?: string;
    format: string;
    issuedAt?: string;
    claims?: Record<string, unknown>;
};

/** Decoded OOB invitation, before the holder accepts or rejects it. */
export type InvitationPreview = {
    from?: string;
    goalCode?: string;
    goal?: string;
    claims: Record<string, unknown>;
    credentialFormat: string;
    issuingDID?: string;
    schemaId?: string;
};

export type Agent = {
    start: () => Promise<void>;
    stop: () => Promise<void>;
    issuer: {
        credentials: {
            createOobOffer: (input: CreateOobOfferInput) => Promise<CredentialOfferRecord>;
            listOffers: (offset: number, limit: number) => Promise<CredentialOfferRecord[]>;
            getOffer: (recordId: string) => Promise<CredentialOfferRecord | undefined>;
        };
    };
    holder: {
        credentials: {
            list: (offset: number, limit: number) => Promise<HolderCredential[]>;
        };
        invitations: {
            preview: (oob: string) => Promise<InvitationPreview>;
            accept: (oob: string, opts?: { subjectId?: string }) => Promise<CredentialOfferRecord>;
            reject: (oob: string) => Promise<void>;
        };
    };
    dids: {
        resolveDID: (did: string) => ReturnType<Domain.DIDResolver['resolve']>;
        prism: {
            list: (offset: number, limit: number) => Promise<PrismDIDRecord[]>;
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
