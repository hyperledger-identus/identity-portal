import { z } from 'zod';

import {
  credentialOfferRecordSchema,
  invitationOobInputSchema,
  invitationPreviewSchema,
  type CredentialOfferRecordDto,
  type InvitationPreviewDto,
} from '../../schemas/credential-offers';
import { ContextFactory, HttpError, createRestRouter } from '../../utils/rest';
import type {
  CredentialOfferRecord,
  InvitationPreview,
} from '../../utils/agent/types';

/**
 * Maps an offer record onto the response DTO. The mapping is explicit so
 * storage-only fields (`tenantId`) never reach the client: the framework sends
 * the handler's object as it is and only validates it against the schema.
 */
function toOfferResponse(
  offer: CredentialOfferRecord,
): CredentialOfferRecordDto {
  return {
    recordId: offer.recordId,
    thid: offer.thid,
    role: offer.role,
    protocolState: offer.protocolState,
    credentialFormat: offer.credentialFormat,
    claims: offer.claims,
    issuingDID: offer.issuingDID,
    subjectId: offer.subjectId,
    schemaId: offer.schemaId,
    automaticIssuance: offer.automaticIssuance,
    invitationUrl: offer.invitationUrl,
    createdAt: offer.createdAt,
    updatedAt: offer.updatedAt,
  };
}

function toPreviewResponse(preview: InvitationPreview): InvitationPreviewDto {
  return {
    from: preview.from,
    goalCode: preview.goalCode,
    goal: preview.goal,
    claims: preview.claims,
    credentialFormat: preview.credentialFormat,
    issuingDID: preview.issuingDID,
    schemaId: preview.schemaId,
  };
}

/**
 * Both agent modes throw a plain `Error` whose message starts with this prefix
 * when the OOB string cannot be decoded. Map that to 400 so the caller sees
 * a malformed request instead of a 500.
 */
function mapInvitationError(error: unknown): never {
  if (
    error instanceof Error &&
    error.message.startsWith('Malformed OOB invitation')
  ) {
    throw HttpError.BadRequest(error.message);
  }
  throw error;
}

/**
 * Holder-side OOB invitation surface. `oob` may be a full URL or a raw
 * `_oob` payload; the agent parsers accept either. Handlers do not branch on
 * `AGENT_MODE`.
 */
export default function createInvitationsRouter(
  createContext: ContextFactory,
) {
  return createRestRouter({ createContext })
    .post('/preview', {
      input: z.object({
        oob: z.string().min(1),
      }),
      output: invitationPreviewSchema,
      openAPI: {
        name: 'PREVIEW INVITATION',
        description:
          'Decodes an out-of-band credential invitation without accepting it. `oob` may be a full URL or a raw `_oob` payload.',
        tags: ['invitations'],
      },
      handler: async ({ input, ctx }) => {
        try {
          const preview = await ctx.agent.holder.invitations.preview(
            input.oob,
          );
          return toPreviewResponse(preview);
        } catch (error) {
          mapInvitationError(error);
        }
      },
    })
    .post('/accept', {
      input: invitationOobInputSchema,
      output: credentialOfferRecordSchema,
      openAPI: {
        name: 'ACCEPT INVITATION',
        description:
          'Accepts an out-of-band credential invitation and returns the resulting holder offer record.',
        tags: ['invitations'],
      },
      handler: async ({ input, ctx }) => {
        try {
          const offer = await ctx.agent.holder.invitations.accept(
            input.oob,
            input.subjectId !== undefined
              ? { subjectId: input.subjectId }
              : undefined,
          );
          return toOfferResponse(offer);
        } catch (error) {
          mapInvitationError(error);
        }
      },
    })
    .post('/reject', {
      input: z.object({
        oob: z.string().min(1),
      }),
      output: z.object({
        ok: z.literal(true),
      }),
      openAPI: {
        name: 'REJECT INVITATION',
        description: 'Rejects an out-of-band credential invitation.',
        tags: ['invitations'],
      },
      handler: async ({ input, ctx }) => {
        try {
          await ctx.agent.holder.invitations.reject(input.oob);
          return { ok: true as const };
        } catch (error) {
          mapInvitationError(error);
        }
      },
    });
}
