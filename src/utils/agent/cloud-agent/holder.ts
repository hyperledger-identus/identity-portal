import type { Agent, HolderCredential, InvitationPreview } from '../types';
import type { CloudAgentClient } from './client';
import { toCredentialOfferRecord } from './issuer';
import type { components } from './spec';

export type CloudHolderDeps = {
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

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toClaims(claims: unknown): Record<string, unknown> {
  if (isObject(claims)) {
    return claims;
  }
  return {};
}

/**
 * Cloud Agent accepts either url-safe or standard base64. Normalising here
 * means a pasted `_oob` value does not have to match one alphabet.
 */
function decodeBase64(value: string): string {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, 'base64').toString('utf8');
}

/**
 * Accept-invitation takes the raw invitation payload, not the URL that carries
 * it. A pasted URL is stripped down to `_oob`; anything else is treated as the
 * payload itself. Parsed by regex rather than URLSearchParams because the
 * latter treats `+` as space and would corrupt standard base64.
 */
function extractInvitationPayload(oob: string): string {
  const trimmed = oob.trim();
  if (!trimmed) {
    throw new Error('Malformed OOB invitation: empty');
  }

  const query = trimmed.match(/[?&]_oob=([^&]+)/);
  if (query?.[1]) {
    try {
      return decodeURIComponent(query[1]);
    } catch {
      throw new Error('Malformed OOB invitation');
    }
  }

  return trimmed;
}

function readType(value: Record<string, unknown>): string | undefined {
  const type = value.type ?? value['@type'];
  return typeof type === 'string' ? type : undefined;
}

function decodeAttachmentData(attachment: Record<string, unknown>): unknown {
  const data = attachment.data;
  if (!isObject(data)) return undefined;
  if ('json' in data) {
    return typeof data.json === 'string' ? JSON.parse(data.json) : data.json;
  }
  if (typeof data.base64 === 'string') {
    return JSON.parse(decodeBase64(data.base64));
  }
  return undefined;
}

function findOfferCredential(
  invitation: Record<string, unknown>,
): Record<string, unknown> {
  const attachments = invitation.attachments;
  if (!Array.isArray(attachments)) {
    throw new Error(
      'Malformed OOB invitation: missing offer-credential attachment',
    );
  }

  for (const attachment of attachments) {
    if (!isObject(attachment)) continue;
    let json: unknown;
    try {
      json = decodeAttachmentData(attachment);
    } catch {
      continue;
    }
    if (isObject(json) && readType(json)?.includes('offer-credential')) {
      return json;
    }
  }

  throw new Error(
    'Malformed OOB invitation: missing offer-credential attachment',
  );
}

function claimsFromOffer(
  offer: Record<string, unknown>,
): Record<string, unknown> {
  const body = isObject(offer.body) ? offer.body : offer;
  const preview = isObject(body.credential_preview)
    ? body.credential_preview
    : isObject(body.credentialPreview)
      ? body.credentialPreview
      : undefined;
  const previewBody =
    preview && isObject(preview.body) ? preview.body : preview;
  const attributes = Array.isArray(previewBody?.attributes)
    ? previewBody.attributes
    : Array.isArray(preview?.attributes)
      ? preview.attributes
      : undefined;

  if (attributes) {
    const claims: Record<string, unknown> = {};
    for (const attribute of attributes) {
      if (!isObject(attribute) || typeof attribute.name !== 'string') continue;
      claims[attribute.name] = attribute.value;
    }
    return claims;
  }

  if (isObject(body.claims)) {
    return body.claims;
  }
  return {};
}

function formatFromOffer(offer: Record<string, unknown>): string {
  const attachments = offer.attachments;
  if (Array.isArray(attachments)) {
    for (const attachment of attachments) {
      if (!isObject(attachment)) continue;
      let json: unknown;
      try {
        json = decodeAttachmentData(attachment);
      } catch {
        continue;
      }
      if (isObject(json) && typeof json.format === 'string') {
        const format = json.format;
        if (format === 'prism/jwt' || format.toUpperCase() === 'JWT') {
          return 'JWT';
        }
        return format;
      }
    }
  }
  return 'JWT';
}

function schemaIdFromOffer(
  offer: Record<string, unknown>,
  claims: Record<string, unknown>,
): string | undefined {
  if (typeof claims.schemaId === 'string') return claims.schemaId;
  if (typeof claims.schema_id === 'string') return claims.schema_id;
  const body = isObject(offer.body) ? offer.body : offer;
  if (typeof body.schemaId === 'string') return body.schemaId;
  if (typeof body.schema_id === 'string') return body.schema_id;
  return undefined;
}

function toInvitationPreview(
  invitation: Record<string, unknown>,
): InvitationPreview {
  const offer = findOfferCredential(invitation);
  const invitationBody = isObject(invitation.body) ? invitation.body : {};
  const offerBody = isObject(offer.body) ? offer.body : {};
  const claims = claimsFromOffer(offer);
  const from =
    typeof invitation.from === 'string'
      ? invitation.from
      : typeof offer.from === 'string'
        ? offer.from
        : undefined;
  const issuingDID = typeof offer.from === 'string' ? offer.from : from;

  return {
    from,
    goalCode:
      typeof invitationBody.goal_code === 'string'
        ? invitationBody.goal_code
        : typeof offerBody.goal_code === 'string'
          ? offerBody.goal_code
          : undefined,
    goal:
      typeof invitationBody.goal === 'string'
        ? invitationBody.goal
        : typeof offerBody.goal === 'string'
          ? offerBody.goal
          : undefined,
    claims,
    credentialFormat: formatFromOffer(offer),
    issuingDID,
    schemaId: schemaIdFromOffer(offer, claims),
  };
}

/**
 * Decode only. Preview and reject must not create a Cloud Agent record.
 */
function parseInvitation(oob: string): {
  invitation: string;
  preview: InvitationPreview;
} {
  const invitation = extractInvitationPayload(oob);
  let parsed: unknown;
  try {
    parsed = JSON.parse(decodeBase64(invitation));
  } catch {
    throw new Error('Malformed OOB invitation');
  }
  if (!isObject(parsed)) {
    throw new Error('Malformed OOB invitation');
  }
  return { invitation, preview: toInvitationPreview(parsed) };
}

function toHolderCredential(record: IssueCredentialRecord): HolderCredential {
  return {
    id: record.recordId,
    issuer: record.issuingDID,
    subject: record.subjectId,
    format: record.credentialFormat,
    issuedAt: record.updatedAt ?? record.createdAt,
    claims: toClaims(record.claims),
  };
}

/**
 * Invitation accept only consumes the OOB. The spec comment says the new record
 * is RequestReceived, but connectionless issuance lands on OfferReceived until
 * accept-offer. Trust the live protocolState: skip once the holder has already
 * requested or received the credential.
 */
function needsAcceptOffer(protocolState: string): boolean {
  if (
    protocolState === 'RequestSent' ||
    protocolState === 'RequestReceived' ||
    protocolState.startsWith('Credential')
  ) {
    return false;
  }
  return protocolState === 'OfferReceived';
}

/**
 * Holder namespace for the Cloud Agent HTTP client.
 */
export function createCloudHolder({
  client,
}: CloudHolderDeps): Agent['holder'] {
  return {
    credentials: {
      list: async (offset: number, limit: number) => {
        const { data, error, response } = await client.GET(
          '/issue-credentials/records',
          { query: { offset, limit } },
        );

        if (!response.ok || error) {
          throw new Error(
            `Cloud Agent could not list credentials (HTTP ${response.status})${problemDetail(error)}`,
          );
        }

        const contents = data?.contents ?? [];
        // Cloud Agent has no role / protocolState query, so a mixed page is
        // filtered here and may come back shorter than `limit`. The UI treats
        // length < limit as the last page.
        return contents
          .filter(
            (record) =>
              record.role === 'Holder' &&
              record.protocolState === 'CredentialReceived',
          )
          .map(toHolderCredential);
      },
    },
    invitations: {
      preview: async (oob: string) => parseInvitation(oob).preview,
      accept: async (oob: string, opts?: { subjectId?: string }) => {
        const { invitation } = parseInvitation(oob);

        const accepted = await client.POST(
          '/issue-credentials/credential-offers/accept-invitation',
          { body: { invitation } },
        );

        if (!accepted.response.ok || accepted.error || !accepted.data) {
          throw new Error(
            `Cloud Agent could not accept the credential invitation (HTTP ${accepted.response.status})${problemDetail(accepted.error)}`,
          );
        }

        let record = accepted.data;
        if (needsAcceptOffer(record.protocolState)) {
          const offered = await client.POST(
            '/issue-credentials/records/{recordId}/accept-offer',
            {
              params: { recordId: record.recordId },
              body: opts?.subjectId ? { subjectId: opts.subjectId } : {},
            },
          );

          if (!offered.response.ok || offered.error || !offered.data) {
            throw new Error(
              `Cloud Agent could not accept credential offer ${record.recordId} (HTTP ${offered.response.status})${problemDetail(offered.error)}`,
            );
          }
          record = offered.data;
        }

        return toCredentialOfferRecord(record);
      },
      reject: async (oob: string) => {
        parseInvitation(oob);
      },
    },
  };
}
