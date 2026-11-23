import { randomUUID } from 'node:crypto';
import { type Agent as LocalAgent, type CollectionMap } from '@hyperledger/identus-sdk';
import { OutOfBandInvitation } from '@hyperledger/identus-sdk/plugins/didcomm';
import { RequestPresentation } from '@hyperledger/identus-sdk/plugins/oea';

import type {
  Agent,
  PresentationRecord,
  PresentationRequestPreview,
  PresentationState,
} from '../types';
import type { MultiTenantPluto } from './database';
import { coerceInvitationPayloads, extractOobValue, invitationUrlFromOob } from './holder';
import { ridbTimestampToIso } from './issuer';
import { readPresentationRequest } from './presentation-request';

export type LocalHolderPresentationsDeps = {
  pluto: MultiTenantPluto;
  agent: LocalAgent;
  tenantId: string;
};

type ParsedRequest = {
  invitation: OutOfBandInvitation;
  thid: string;
  claims: string[];
  trustIssuers: string[];
  request: unknown;
  preview: PresentationRequestPreview;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The attached request-presentation message of an OOB invitation. */
function requestMessagePayload(invitation: OutOfBandInvitation): Record<string, unknown> {
  for (const attachment of invitation.attachments) {
    let payload: unknown;
    try {
      payload = attachment.payload;
    } catch {
      continue;
    }
    if (
      isRecord(payload) &&
      (payload.piuri === RequestPresentation.type || payload.type === RequestPresentation.type)
    ) {
      return payload;
    }
  }
  throw new Error('Malformed OOB invitation: missing request-presentation attachment');
}

/** The DIF presentation request inside the request-presentation message. */
function presentationRequestFrom(message: Record<string, unknown>): unknown {
  const attachments = message.attachments;
  const first = Array.isArray(attachments) ? attachments[0] : undefined;
  const data = isRecord(first) ? first.data : undefined;
  return isRecord(data) ? data.json : undefined;
}

async function parseRequestInvitation(agent: LocalAgent, oob: string): Promise<ParsedRequest> {
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

  const message = requestMessagePayload(invitation);
  const request = presentationRequestFrom(message);
  const { claims, trustIssuers } = readPresentationRequest(request);
  const thid =
    typeof message.thid === 'string' ? message.thid : typeof message.id === 'string' ? message.id : undefined;
  if (!thid) {
    throw new Error('Malformed OOB invitation: the request has no thread id');
  }

  return {
    invitation,
    thid,
    claims,
    trustIssuers,
    request,
    preview: {
      from: invitation.from,
      goalCode: invitation.body.goal_code,
      goal: invitation.body.goal,
      credentialFormat: 'JWT',
      claims,
      trustIssuers: trustIssuers.length ? trustIssuers : undefined,
    },
  };
}

/**
 * acceptInvitation stores the attached request with `to` set to a new peer DID
 * of the holder. The presentation is sent from that DID, so read it back.
 */
async function storedRequest(pluto: MultiTenantPluto, thid: string): Promise<RequestPresentation> {
  const messages = await pluto.getAllMessages();
  const match = messages
    .filter((message) => message.piuri === RequestPresentation.type && message.thid === thid && message.to)
    .at(-1);
  if (!match) {
    throw new Error(`The presentation request ${thid} was not stored after accepting the invitation`);
  }
  return RequestPresentation.fromMessage(match);
}

function toProverRecord(row: CollectionMap['presentations']): PresentationRecord {
  return {
    presentationId: row.uuid,
    thid: row.thid,
    role: 'Prover',
    state: row.state as PresentationState,
    credentialFormat: 'JWT',
    claims: row.claims ?? [],
    trustIssuers: row.trustIssuers?.length ? row.trustIssuers : undefined,
    invitationUrl: row.invitationUrl,
    createdAt: ridbTimestampToIso(row.createdAt),
    updatedAt: row.updatedAt !== undefined ? ridbTimestampToIso(row.updatedAt) : undefined,
  };
}

/**
 * Holder side of OOB presentation requests (phase 6, #108): read a request,
 * answer it with one credential, or reject it.
 */
export function createLocalHolderPresentations(
  deps: LocalHolderPresentationsDeps,
): Agent['holder']['presentations'] {
  const { pluto, agent, tenantId } = deps;

  return {
    preview: async (oob: string): Promise<PresentationRequestPreview> => {
      const parsed = await parseRequestInvitation(agent, oob);
      return parsed.preview;
    },

    accept: async (oob: string, credentialId: string): Promise<PresentationRecord> => {
      const parsed = await parseRequestInvitation(agent, oob);
      const credentials = await agent.verifiableCredentials();
      const credential = credentials.find((item) => item.id === credentialId);
      if (!credential) {
        throw new Error('Unknown credential: the holder has no credential with this id');
      }

      // The SDK writes the DIDs of the attached message as objects; turn them
      // into strings before acceptInvitation reads the message.
      coerceInvitationPayloads(parsed.invitation, parsed.invitation.from);
      // Patched start() loads the mediator connections that send uses.
      await agent.start();
      await agent.acceptInvitation(parsed.invitation);

      const request = await storedRequest(pluto, parsed.thid);
      const presentation = await agent.createPresentationForRequestProof(request, credential);
      await agent.sendMessage(presentation.makeMessage());

      const presentationId = randomUUID();
      const invitationUrl = invitationUrlFromOob(oob);
      await pluto.insertPresentation({
        uuid: presentationId,
        tenantId,
        thid: parsed.thid,
        role: 'Prover',
        state: 'PresentationSent',
        credentialFormat: 'JWT',
        claims: parsed.claims,
        trustIssuers: parsed.trustIssuers,
        request: JSON.stringify(parsed.request),
        ...(invitationUrl ? { invitationUrl } : {}),
        // See `createLocalVerifier`: the Doc type marks every field as required.
      } as Omit<CollectionMap['presentations'], 'createdAt' | 'updatedAt'>);

      const stored = await pluto.getPresentation(presentationId);
      if (!stored) {
        throw new Error(`Presentation record ${presentationId} was not stored`);
      }
      return toProverRecord(stored);
    },

    reject: async (oob: string): Promise<void> => {
      // Nothing is sent and nothing is stored, like a rejected offer.
      await parseRequestInvitation(agent, oob);
    },
  };
}
