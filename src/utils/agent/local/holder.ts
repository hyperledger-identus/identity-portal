import { randomUUID } from 'node:crypto';
import {
  Domain,
  type Agent as LocalAgent,
  type CollectionMap,
} from '@hyperledger/identus-sdk';
import {
  OfferCredential,
  OutOfBandInvitation,
} from '@hyperledger/identus-sdk/plugins/didcomm';

import type {
  Agent,
  CredentialOfferRecord,
  HolderCredential,
  InvitationPreview,
} from '../types';
import type { MultiTenantPluto } from './database';

export type LocalHolderDeps = {
  pluto: MultiTenantPluto;
  agent: LocalAgent;
  tenantId: string;
};

type ParsedInvitation = {
  invitation: OutOfBandInvitation;
  offer: OfferCredential;
  preview: InvitationPreview;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringifyClaimValue(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function claimValueType(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
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
 * ParseInvitation's URL decoder requires an absolute URL. Local issuer offers
 * are `/oob?_oob=…`, and a paste may also be a full URL. Strip down to the
 * base64 payload so both shapes hit the same SDK path.
 */
function extractOobValue(oob: string): string {
  const trimmed = oob.trim();
  if (!trimmed) {
    throw new Error('Malformed OOB invitation: empty');
  }

  try {
    const url = new URL(trimmed);
    const payload = url.searchParams.get('_oob');
    if (payload) {
      return payload;
    }
  } catch (error) {
    if (!(error instanceof TypeError)) {
      throw error;
    }
  }

  const query = trimmed.match(/[?&]_oob=([^&]+)/);
  if (query?.[1]) {
    try {
      return decodeURIComponent(query[1]);
    } catch {
      return query[1];
    }
  }

  return trimmed;
}

function invitationUrlFromOob(oob: string): string | undefined {
  const trimmed = oob.trim();
  if (/^https?:\/\//i.test(trimmed) || trimmed.includes('_oob=')) {
    return trimmed;
  }
  return undefined;
}

function didToString(value: unknown): string | undefined {
  if (value == null) {
    return undefined;
  }
  if (typeof value === 'string') {
    return value;
  }
  try {
    return Domain.DID.from(value).toString();
  } catch {
    return undefined;
  }
}

function isOfferCredentialPayload(payload: unknown): boolean {
  if (!isObject(payload) && !(payload instanceof Domain.Message)) {
    return false;
  }
  const record = payload as { piuri?: unknown; type?: unknown; '@type'?: unknown };
  const type = record.piuri ?? record.type ?? record['@type'];
  return typeof type === 'string' && type.includes('offer-credential');
}

/**
 * DIDComm JSON uses `media_type`; Message.fromJson reads `mediaType`. Local
 * CreateOOBOffer also JSON.stringifies DID instances as objects, which
 * fromString cannot parse. Coerce both before the SDK sees the payload.
 */
function normalizeOfferPayload(
  payload: unknown,
  fallbackFrom: string,
): Record<string, unknown> {
  if (!isObject(payload) && !(payload instanceof Domain.Message)) {
    throw new Error('Malformed OOB invitation: offer-credential attachment is empty');
  }
  const raw = payload as unknown as Record<string, unknown>;
  const from = didToString(raw.from) ?? fallbackFrom;
  const to = didToString(raw.to);
  const attachments = Array.isArray(raw.attachments)
    ? raw.attachments.map((attachment) => {
        if (!isObject(attachment)) {
          return attachment;
        }
        return {
          ...attachment,
          mediaType: attachment.mediaType ?? attachment.media_type,
          lastModTime: attachment.lastModTime ?? attachment.lastmod_time,
          byteCount: attachment.byteCount ?? attachment.byte_count,
        };
      })
    : raw.attachments;

  return {
    ...raw,
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    attachments,
  };
}

function offerPayloadFromInvitation(invitation: OutOfBandInvitation): unknown {
  for (const attachment of invitation.attachments) {
    let payload: unknown;
    try {
      payload = attachment.payload;
    } catch {
      continue;
    }
    if (isOfferCredentialPayload(payload)) {
      return payload;
    }
  }
  throw new Error('Malformed OOB invitation: missing offer-credential attachment');
}

function toOfferCredential(payload: unknown, fallbackFrom: string): OfferCredential {
  const message = Domain.Message.fromJson(normalizeOfferPayload(payload, fallbackFrom));
  if (!message.from) {
    throw new Error('Malformed OOB invitation: offer-credential has no issuer DID');
  }
  return OfferCredential.fromMessage(message);
}

function claimsFromOffer(offer: OfferCredential): Record<string, unknown> {
  const attributes = offer.body.credential_preview?.body?.attributes ?? [];
  const claims: Record<string, unknown> = {};
  for (const attribute of attributes) {
    claims[attribute.name] = attribute.value;
  }
  return claims;
}

/**
 * Local offers put the Prism issuing DID in the JWT OEA `options.domain`.
 * OfferCredential.from is the host peer DID used for DIDComm routing.
 */
function domainFromPayload(payload: unknown): string | undefined {
  if (!isObject(payload)) {
    return undefined;
  }
  const options = isObject(payload.options) ? payload.options : undefined;
  const nested = isObject(payload.json) ? domainFromPayload(payload.json) : undefined;
  const domain = options?.domain ?? nested;
  if (typeof domain === 'string' && domain.startsWith('did:')) {
    return domain;
  }
  return nested;
}

function prismIssuingDidFromOffer(offer: OfferCredential): string | undefined {
  for (const attachment of offer.attachments) {
    const fromPayload = domainFromPayload(attachment.payload);
    if (fromPayload) {
      return fromPayload;
    }
  }
  return undefined;
}

function formatFromOffer(offer: OfferCredential): string {
  for (const attachment of offer.attachments) {
    const format = attachment.format;
    if (
      format === Domain.CredentialType.JWT ||
      format === 'jwt' ||
      format?.toUpperCase() === 'JWT'
    ) {
      return 'JWT';
    }
    if (format) {
      return format;
    }
  }
  return 'JWT';
}

function schemaIdFromOffer(
  offer: OfferCredential,
  claims: Record<string, unknown>,
): string | undefined {
  if (typeof claims.schemaId === 'string') {
    return claims.schemaId;
  }
  if (typeof claims.schema_id === 'string') {
    return claims.schema_id;
  }
  const body = offer.body as OfferCredential['body'] & {
    schemaId?: unknown;
    schema_id?: unknown;
  };
  if (typeof body.schemaId === 'string') {
    return body.schemaId;
  }
  if (typeof body.schema_id === 'string') {
    return body.schema_id;
  }
  return undefined;
}

function toInvitationPreview(
  invitation: OutOfBandInvitation,
  offer: OfferCredential,
): InvitationPreview {
  const claims = claimsFromOffer(offer);
  const from = invitation.from || offer.from?.toString();
  return {
    from,
    goalCode: invitation.body.goal_code,
    goal: invitation.body.goal,
    claims,
    credentialFormat: formatFromOffer(offer),
    issuingDID: prismIssuingDidFromOffer(offer) ?? offer.from?.toString() ?? from,
    schemaId: schemaIdFromOffer(offer, claims),
  };
}

/**
 * Mutate attachment JSON so HandleOOBInvitation's Message.fromJson can bind
 * `to` to the peer DID it mints. Without this, local offers store `from` as a
 * DID object and acceptInvitation throws before the offer is stored.
 */
function coerceInvitationPayloads(
  invitation: OutOfBandInvitation,
  fallbackFrom: string,
): void {
  for (const attachment of invitation.attachments) {
    let payload: unknown;
    try {
      payload = attachment.payload;
    } catch {
      continue;
    }
    if (!isObject(payload)) {
      continue;
    }
    const normalized = normalizeOfferPayload(payload, fallbackFrom);
    Object.assign(payload, normalized);
  }
}

async function parseOobInvitation(
  agent: LocalAgent,
  oob: string,
): Promise<ParsedInvitation> {
  let invitation: Awaited<ReturnType<LocalAgent['parseInvitation']>>;
  try {
    invitation = await agent.parseInvitation(extractOobValue(oob));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Malformed OOB invitation: ${detail}`);
  }

  if (!(invitation instanceof OutOfBandInvitation)) {
    throw new Error('Malformed OOB invitation: not an out-of-band invitation');
  }

  const payload = offerPayloadFromInvitation(invitation);
  const offer = toOfferCredential(payload, invitation.from);
  return {
    invitation,
    offer,
    preview: toInvitationPreview(invitation, offer),
  };
}

/**
 * acceptInvitation stores the attached offer with `to` set to a new peer DID.
 * prepareRequestCredentialWithIssuer reads that `to` as the DIDComm sender.
 */
async function offerAfterAccept(
  pluto: MultiTenantPluto,
  offer: OfferCredential,
): Promise<OfferCredential> {
  const byId = await pluto.getMessage(offer.id);
  if (byId?.piuri === OfferCredential.type) {
    return OfferCredential.fromMessage(byId);
  }

  const messages = await pluto.getAllMessages();
  const match = messages.find((message) => {
    if (message.piuri !== OfferCredential.type) {
      return false;
    }
    if (offer.thid && message.thid === offer.thid) {
      return true;
    }
    return message.id === offer.id;
  });
  if (match) {
    return OfferCredential.fromMessage(match);
  }

  if (!offer.to) {
    const peers = await pluto.getAllPeerDIDs();
    const last = peers.at(-1);
    if (last) {
      offer.to = last.did;
    }
  }
  return offer;
}

function claimsFromCredential(credential: Domain.Credential): Record<string, unknown> {
  const claims: Record<string, unknown> = {};
  for (const claim of credential.claims) {
    Object.assign(claims, claim);
  }
  return claims;
}

function issuedAtFromCredential(credential: Domain.Credential): string | undefined {
  if ('issuanceDate' in credential) {
    const issuedAt = (credential as { issuanceDate?: unknown }).issuanceDate;
    if (typeof issuedAt === 'string' && !Number.isNaN(Date.parse(issuedAt))) {
      return issuedAt;
    }
  }
  const nbf = credential.getProperty('nbf');
  if (typeof nbf === 'number') {
    return new Date(nbf * 1000).toISOString();
  }
  return undefined;
}

function toHolderCredential(credential: Domain.Credential): HolderCredential {
  const format =
    credential.credentialType === Domain.CredentialType.JWT
      ? 'JWT'
      : credential.credentialType;
  return {
    id: credential.id,
    issuer: credential.issuer || undefined,
    subject: credential.subject || undefined,
    format,
    issuedAt: issuedAtFromCredential(credential),
    claims: claimsFromCredential(credential),
  };
}

/**
 * Holder namespace for the in-process SDK agent. Preview and reject parse only.
 * Accept consumes the OOB, sends Issue Credential 3.0 `request-credential`,
 * and records the holder issuance in `RequestSent`. The VC itself arrives later
 * on mediator pickup (ticket 004).
 */
export function createLocalHolder(deps: LocalHolderDeps): Agent['holder'] {
  const { pluto, agent, tenantId } = deps;

  return {
    credentials: {
      list: async (offset: number, limit: number): Promise<HolderCredential[]> => {
        const credentials = await agent.verifiableCredentials();
        return credentials.slice(offset, offset + limit).map(toHolderCredential);
      },
    },
    invitations: {
      preview: async (oob: string): Promise<InvitationPreview> => {
        const parsed = await parseOobInvitation(agent, oob);
        return parsed.preview;
      },
      accept: async (
        oob: string,
        opts?: { subjectId?: string },
      ): Promise<CredentialOfferRecord> => {
        const { invitation, offer, preview } = await parseOobInvitation(agent, oob);
        coerceInvitationPayloads(invitation, invitation.from);

        // Patched start() loads mediator connections without the SDK job
        // runner. Send uses those connections, not the runner.
        await agent.start();

        // Stores/emits the attached offer with `to` bound to a new peer DID.
        // It does not send request-credential.
        await agent.acceptInvitation(invitation);

        const boundOffer = await offerAfterAccept(pluto, offer);
        const request = await agent.prepareRequestCredentialWithIssuer(boundOffer);
        // opts.subjectId is the JWT credential subject (a published Prism DID).
        // RequestCredential.from is the DIDComm sender — the peer DID minted
        // by acceptInvitation — and the JWT credential-offer plugin signs a
        // fresh Prism DID of its own. There is no subjectId field on the SDK
        // request, so the value is persisted on the issuance row only.
        await agent.sendMessage(request.makeMessage());

        const recordId = randomUUID();
        const now = new Date().toISOString();
        const thid = boundOffer.thid ?? offer.thid ?? offer.id;
        const record: CredentialOfferRecord = {
          recordId,
          thid,
          role: 'Holder',
          protocolState: 'RequestSent',
          credentialFormat: 'JWT',
          claims: preview.claims,
          issuingDID: preview.issuingDID,
          subjectId: opts?.subjectId,
          schemaId: preview.schemaId,
          invitationUrl: invitationUrlFromOob(oob),
          createdAt: now,
          updatedAt: now,
        };

        await pluto.insertIssuance({
          uuid: recordId,
          id: recordId,
          claims: toStoredClaims(preview.claims),
          credentialFormat: 'JWT',
          issuingDID: preview.issuingDID ?? invitation.from,
          thid,
          role: 'Holder',
          protocolState: 'RequestSent',
          schemaId: preview.schemaId,
          invitationUrl: record.invitationUrl,
          subjectId: opts?.subjectId,
          tenantId,
        } as CollectionMap['issuance']);

        return record;
      },
      reject: async (oob: string): Promise<void> => {
        await parseOobInvitation(agent, oob);
      },
    },
  };
}
