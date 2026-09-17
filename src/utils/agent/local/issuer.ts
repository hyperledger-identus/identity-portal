import { randomUUID } from 'node:crypto';
import {
  Domain,
  type Agent as LocalAgent,
  type CollectionMap,
} from '@hyperledger/identus-sdk';
import {
  CreateOOBOffer,
  OfferCredential,
} from '@hyperledger/identus-sdk/plugins/didcomm';

import type {
  Agent,
  CreateOobOfferInput,
  CredentialOfferRecord,
  CredentialOfferRole,
  CredentialProtocolState,
} from '../types';
import type { MultiTenantPluto } from './database';

export type LocalIssuerDeps = {
  pluto: MultiTenantPluto;
  agent: LocalAgent;
  tenantId: string;
};

/** DIDComm preview type for Issue Credential 3.0. */
const CREDENTIAL_PREVIEW_TYPE =
  'https://didcomm.org/issue-credential/3.0/credential-preview';

/**
 * Portal columns on the RIDB `issuance` collection. SDK `CollectionMap['issuance']`
 * only types id / claims / format / issuingDID, so extras are read through this
 * shape after a cast.
 */
type PortalIssuance = CollectionMap['issuance'] & {
  thid?: string;
  role?: CredentialOfferRole;
  protocolState?: string;
  schemaId?: string;
  invitationUrl?: string;
  subjectId?: string;
  createdAt?: number | string;
  updatedAt?: number | string;
  tenantId?: string;
};

/**
 * RIDB stamps `createdAt` / `updatedAt` as unix seconds on every collection.
 * The portal offer DTO is ISO-8601, which is what Cloud Agent returns.
 */
function ridbTimestampToIso(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const ms = value < 1e12 ? value * 1000 : value;
    return new Date(ms).toISOString();
  }
  if (typeof value === 'string' && value !== '' && !Number.isNaN(Date.parse(value))) {
    return new Date(value).toISOString();
  }
  return new Date().toISOString();
}

function stringifyClaimValue(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function claimValueType(value: unknown): string {
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return typeof value;
  }
  return 'string';
}

/**
 * SDK `IssuanceSchema` stores claims as `{ name, value, type }[]` with string
 * values. The portal API keeps a JSON object; this is the persist-side map.
 */
function toStoredClaims(
  claims: Record<string, unknown>,
): CollectionMap['issuance']['claims'] {
  return Object.entries(claims).map(([name, value]) => ({
    name,
    value: stringifyClaimValue(value),
    type: claimValueType(value),
  }));
}

/**
 * Reverse of `toStoredClaims`. Object/array values were JSON.stringified; parse
 * those back. Plain strings stay strings.
 */
function parseStoredClaimValue(value: string): unknown {
  const trimmed = value.trimStart();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}

function claimsToRecord(
  claims: CollectionMap['issuance']['claims'],
): Record<string, unknown> {
  const record: Record<string, unknown> = {};
  for (const claim of claims) {
    record[claim.name] = parseStoredClaimValue(claim.value);
  }
  return record;
}

/**
 * Issuer-only view of a stored issuance row. Holder rows share the collection
 * and must not leak through `listOffers` / `getOffer`.
 */
function toIssuerOfferRecord(
  row: CollectionMap['issuance'],
): CredentialOfferRecord | undefined {
  const stored = row as PortalIssuance;
  if (stored.role !== 'Issuer') {
    return undefined;
  }
  return {
    recordId: stored.id,
    thid: stored.thid ?? stored.id,
    role: 'Issuer',
    protocolState:
      (stored.protocolState as CredentialProtocolState | undefined) ??
      'InvitationGenerated',
    credentialFormat: 'JWT',
    claims: claimsToRecord(stored.claims),
    issuingDID: stored.issuingDID,
    subjectId: stored.subjectId,
    schemaId: stored.schemaId,
    automaticIssuance: stored.automaticIssuance,
    invitationUrl: stored.invitationUrl,
    createdAt: ridbTimestampToIso(stored.createdAt),
    updatedAt:
      stored.updatedAt !== undefined
        ? ridbTimestampToIso(stored.updatedAt)
        : undefined,
  };
}

/**
 * Issuer namespace for the in-process SDK agent. Creates a connectionless OOB
 * offer in-process and persists it; DIDComm send happens later when the holder
 * accepts.
 */
export function createLocalIssuer(deps: LocalIssuerDeps): Agent['issuer'] {
  const { pluto, agent, tenantId } = deps;

  return {
    credentials: {
      createOobOffer: async (
        input: CreateOobOfferInput,
      ): Promise<CredentialOfferRecord> => {
        const issuingDid = Domain.DID.fromString(input.issuingDID);
        const thid = randomUUID();

        // Prism DIDs have no DIDCommMessaging service. The holder sends
        // request-credential to OfferCredential.from, so that DID must be the
        // tenant host peer DID (mediator-routed). The JWT issuer stays
        // `input.issuingDID` on the stored record and in the OEA domain.
        const mediators = await pluto.getAllMediators();
        const hostDid = mediators[0]?.hostDID;
        if (!hostDid) {
          throw new Error(
            'No mediator host DID. Sign out and in again so the tenant can be provisioned.',
          );
        }

        // Preview attributes are DIDComm `{ name, value }` strings. Non-strings
        // are JSON-encoded at this boundary so the portal object can stay intact.
        const previewAttributes = Object.entries(input.claims).map(
          ([name, value]) => ({
            name,
            value: stringifyClaimValue(value),
          }),
        );

        // OfferCredential.validate() only checks the preview, but
        // prepareRequestCredentialWithIssuer later keys off attachment.format.
        // The JWT plugin expects OEA `{ options: { challenge, domain } }`.
        const jwtAttachment = Domain.AttachmentDescriptor.build(
          {
            json: {
              options: {
                challenge: randomUUID(),
                domain: issuingDid.toString(),
              },
            },
          },
          undefined,
          'application/json',
          undefined,
          Domain.CredentialType.JWT,
        );

        const offer = new OfferCredential(
          {
            credential_preview: {
              type: CREDENTIAL_PREVIEW_TYPE,
              body: { attributes: previewAttributes },
            },
          },
          [jwtAttachment],
          hostDid,
          undefined,
          thid,
        );

        // CreateOOBOffer only base64-encodes the invitation JSON. It does not
        // send DIDComm; the holder fetches this out of band.
        const oob = await agent.runTask(
          new CreateOOBOffer({
            from: hostDid,
            offer,
            goalCode: input.goalCode ?? 'issue-vc',
            goal: input.goal ?? 'Issue Credential',
          }),
        );
        const invitationUrl = `/oob?_oob=${encodeURIComponent(oob)}`;

        const recordId = randomUUID();
        const now = new Date().toISOString();
        const automaticIssuance = input.automaticIssuance ?? true;

        await pluto.insertIssuance({
          uuid: recordId,
          id: recordId,
          claims: toStoredClaims(input.claims),
          credentialFormat: 'JWT',
          issuingDID: input.issuingDID,
          automaticIssuance,
          thid,
          role: 'Issuer',
          protocolState: 'InvitationGenerated',
          schemaId: input.schemaId,
          invitationUrl,
          tenantId,
        } as CollectionMap['issuance']);

        return {
          recordId,
          thid,
          role: 'Issuer',
          protocolState: 'InvitationGenerated',
          credentialFormat: 'JWT',
          claims: input.claims,
          issuingDID: input.issuingDID,
          schemaId: input.schemaId,
          automaticIssuance,
          invitationUrl,
          createdAt: now,
          updatedAt: now,
        };
      },

      listOffers: async (
        offset: number,
        limit: number,
      ): Promise<CredentialOfferRecord[]> => {
        const rows = await pluto.listIssuance(offset, limit, 'Issuer');
        return rows.flatMap((row) => {
          const record = toIssuerOfferRecord(row);
          return record ? [record] : [];
        });
      },

      getOffer: async (
        recordId: string,
      ): Promise<CredentialOfferRecord | undefined> => {
        const row = await pluto.getIssuance(recordId);
        if (!row) {
          return undefined;
        }
        return toIssuerOfferRecord(row);
      },
    },
  };
}
