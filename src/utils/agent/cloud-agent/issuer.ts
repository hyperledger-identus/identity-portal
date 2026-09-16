import { CLOUD_AGENT_BASE_URL } from '../../../config';
import {
  CREDENTIAL_PROTOCOL_STATES,
  type Agent,
  type CredentialOfferRecord,
  type CredentialProtocolState,
  type CreateOobOfferInput,
} from '../types';
import type { CloudAgentClient } from './client';
import type { components } from './spec';

export type CloudIssuerDeps = {
  client: CloudAgentClient;
  tenantId: string;
};

type IssueCredentialRecord = components['schemas']['IssueCredentialRecord'];

/**
 * The agent reports failures as a problem document whose `detail` names the
 * exact cause. An error surfaced without it cannot be diagnosed from the portal.
 */
function problemDetail(error: unknown): string {
  if (
    error &&
    typeof error === 'object' &&
    'detail' in error &&
    typeof (error as { detail: unknown }).detail === 'string'
  ) {
    return `: ${(error as { detail: string }).detail}`;
  }
  return '';
}

function toClaims(claims: unknown): Record<string, unknown> {
  if (claims && typeof claims === 'object' && !Array.isArray(claims)) {
    return claims as Record<string, unknown>;
  }
  return {};
}

function toProtocolState(
  state: IssueCredentialRecord['protocolState'],
): CredentialProtocolState {
  if ((CREDENTIAL_PROTOCOL_STATES as readonly string[]).includes(state)) {
    return state as CredentialProtocolState;
  }
  throw new Error(`Cloud Agent protocol state ${state} is not supported`);
}

function schemaIdFromClaims(
  claims: Record<string, unknown>,
): string | undefined {
  const value = claims.schemaId ?? claims.schema_id;
  return typeof value === 'string' ? value : undefined;
}

/**
 * Portal offers are JWT-only. AnonCreds rows cannot be represented on
 * `CredentialOfferRecord.credentialFormat`.
 */
export function toCredentialOfferRecord(
  record: IssueCredentialRecord,
): CredentialOfferRecord {
  if (record.credentialFormat !== 'JWT') {
    throw new Error(
      `Cloud Agent record ${record.recordId} uses ${record.credentialFormat}; only JWT is supported`,
    );
  }

  const claims = toClaims(record.claims);

  return {
    recordId: record.recordId,
    thid: record.thid,
    role: record.role,
    protocolState: toProtocolState(record.protocolState),
    credentialFormat: 'JWT',
    claims,
    issuingDID: record.issuingDID,
    subjectId: record.subjectId,
    schemaId: schemaIdFromClaims(claims),
    automaticIssuance: record.automaticIssuance,
    invitationUrl: record.invitation?.invitationUrl,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

/**
 * The registry schema endpoint is what JWT issuance dereferences. A caller that
 * already has an http(s) URL is left alone; a guid is expanded against this
 * agent's base URL.
 */
function toSchemaId(schemaId: string): string {
  if (/^https?:\/\//i.test(schemaId)) {
    return schemaId;
  }
  return `${CLOUD_AGENT_BASE_URL}/schema-registry/schemas/${schemaId}/schema`;
}

/**
 * Issuer namespace for the Cloud Agent HTTP client.
 */
export function createCloudIssuer({
  client,
}: CloudIssuerDeps): Agent['issuer'] {
  return {
    credentials: {
      createOobOffer: async (input: CreateOobOfferInput) => {
        const body: components['schemas']['CreateIssueCredentialRecordRequest'] =
          {
            claims: input.claims,
            issuingDID: input.issuingDID,
            credentialFormat: 'JWT',
            automaticIssuance: input.automaticIssuance ?? true,
          };
        if (input.schemaId) {
          body.schemaId = toSchemaId(input.schemaId);
        }
        if (input.goalCode) {
          body.goalCode = input.goalCode;
        }
        if (input.goal) {
          body.goal = input.goal;
        }

        const { data, error, response } = await client.POST(
          '/issue-credentials/credential-offers/invitation',
          { body },
        );

        if (!response.ok || error || !data) {
          throw new Error(
            `Cloud Agent could not create a credential offer (HTTP ${response.status})${problemDetail(error)}`,
          );
        }

        const offer = toCredentialOfferRecord(data);
        // The holder paste flow is this URL; a record without it cannot be shared.
        if (!offer.invitationUrl) {
          throw new Error(
            `Cloud Agent created offer ${offer.recordId} without an invitationUrl`,
          );
        }
        return offer;
      },
      listOffers: async (offset: number, limit: number) => {
        const { data, error, response } = await client.GET(
          '/issue-credentials/records',
          { query: { offset, limit } },
        );

        if (!response.ok || error) {
          throw new Error(
            `Cloud Agent could not list credential offers (HTTP ${response.status})${problemDetail(error)}`,
          );
        }

        const contents = data?.contents ?? [];
        // Cloud Agent has no `role` query, so a mixed page is filtered here and
        // may come back shorter than `limit`. The UI treats length < limit as
        // the last page.
        return contents
          .filter(
            (record) =>
              record.role === 'Issuer' && record.credentialFormat === 'JWT',
          )
          .map(toCredentialOfferRecord);
      },
      getOffer: async (recordId: string) => {
        const { data, error, response } = await client.GET(
          '/issue-credentials/records/{recordId}',
          { params: { recordId } },
        );

        if (response.status === 404) return undefined;

        if (!response.ok || error || !data) {
          throw new Error(
            `Cloud Agent could not read credential offer ${recordId} (HTTP ${response.status})${problemDetail(error)}`,
          );
        }

        return toCredentialOfferRecord(data);
      },
    },
  };
}
