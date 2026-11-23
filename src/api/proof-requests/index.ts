import { z } from 'zod';

import {
  acceptPresentationRequestInputSchema,
  presentationRecordSchema,
  presentationRequestPreviewSchema,
  type PresentationRecordDto,
  type PresentationRequestPreviewDto,
} from '../../schemas/presentations';
import { ContextFactory, HttpError, createRestRouter } from '../../utils/rest';
import type { PresentationRecord, PresentationRequestPreview } from '../../utils/agent/types';

function toRecordResponse(record: PresentationRecord): PresentationRecordDto {
  return {
    presentationId: record.presentationId,
    thid: record.thid,
    role: record.role,
    state: record.state,
    credentialFormat: record.credentialFormat,
    claims: record.claims,
    trustIssuers: record.trustIssuers,
    schemaId: record.schemaId,
    presentedClaims: record.presentedClaims,
    invitationUrl: record.invitationUrl,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function toPreviewResponse(preview: PresentationRequestPreview): PresentationRequestPreviewDto {
  return {
    from: preview.from,
    goalCode: preview.goalCode,
    goal: preview.goal,
    credentialFormat: preview.credentialFormat,
    claims: preview.claims,
    trustIssuers: preview.trustIssuers,
    schemaId: preview.schemaId,
  };
}

/**
 * The agent throws a plain `Error` with one of these prefixes: an OOB string
 * it cannot decode is the caller's mistake (400), and so is a credential id
 * the holder does not have (404).
 */
function mapProofRequestError(error: unknown): never {
  if (error instanceof Error && error.message.startsWith('Malformed OOB invitation')) {
    throw HttpError.BadRequest(error.message);
  }
  if (error instanceof Error && error.message.startsWith('Unknown credential')) {
    throw HttpError.NotFound(error.message);
  }
  throw error;
}

/**
 * Holder side of OOB presentation requests (phase 6, #108). `oob` may be a
 * full URL or a raw `_oob` payload.
 */
export default function createProofRequestsRouter(createContext: ContextFactory) {
  return createRestRouter({ createContext })
    .post('/preview', {
      input: z.object({
        oob: z.string().min(1),
      }),
      output: presentationRequestPreviewSchema,
      openAPI: {
        name: 'PREVIEW PROOF REQUEST',
        description:
          'Decodes an out-of-band presentation request without answering it: who asks, which claims and which trusted issuers.',
        tags: ['proof-requests'],
      },
      handler: async ({ input, ctx }) => {
        try {
          return toPreviewResponse(await ctx.agent.holder.presentations.preview(input.oob));
        } catch (error) {
          mapProofRequestError(error);
        }
      },
    })
    .post('/accept', {
      input: acceptPresentationRequestInputSchema,
      output: presentationRecordSchema,
      openAPI: {
        name: 'ACCEPT PROOF REQUEST',
        description:
          'Answers an out-of-band presentation request with one held credential, and returns the holder record.',
        tags: ['proof-requests'],
      },
      handler: async ({ input, ctx }) => {
        try {
          const record = await ctx.agent.holder.presentations.accept(input.oob, input.credentialId);
          return toRecordResponse(record);
        } catch (error) {
          mapProofRequestError(error);
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
        name: 'REJECT PROOF REQUEST',
        description: 'Rejects an out-of-band presentation request. Nothing is sent or stored.',
        tags: ['proof-requests'],
      },
      handler: async ({ input, ctx }) => {
        try {
          await ctx.agent.holder.presentations.reject(input.oob);
          return { ok: true as const };
        } catch (error) {
          mapProofRequestError(error);
        }
      },
    });
}
