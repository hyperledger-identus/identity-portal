import { z } from 'zod';

import {
  createOobPresentationRequestInputSchema,
  presentationListSchema,
  presentationRecordSchema,
  type PresentationRecordDto,
} from '../../schemas/presentations';
import { ContextFactory, HttpError, createRestRouter } from '../../utils/rest';
import type { PresentationRecord } from '../../utils/agent/types';

/**
 * Maps a presentation record onto the response DTO. The mapping is explicit,
 * so storage-only fields (`tenantId`, the stored request) never reach the
 * client.
 */
function toResponse(record: PresentationRecord): PresentationRecordDto {
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

/**
 * Verifier-side connectionless OOB presentation requests (phase 6, #108).
 * List and get return verifier records only.
 */
export default function createPresentationsRouter(createContext: ContextFactory) {
  return createRestRouter({ createContext })
    .get('/', {
      input: z.object({
        offset: z.coerce.number().int().min(0),
        limit: z.coerce.number().int().min(1),
      }),
      output: presentationListSchema,
      openAPI: {
        name: 'GET PRESENTATIONS',
        description:
          'Lists the OOB presentation requests the verifier created. `offset` is the number of items to skip; `limit` is the page size.',
        tags: ['presentations'],
      },
      handler: async ({ input, ctx }) => {
        const presentations = await ctx.agent.verifier.presentations.listRequests(
          input.offset,
          input.limit,
        );
        return { presentations: presentations.map(toResponse) };
      },
    })
    .get('/:presentationId', {
      input: z.object({
        presentationId: z.string().min(1),
      }),
      output: presentationRecordSchema,
      openAPI: {
        name: 'GET PRESENTATION',
        description: 'Reads one OOB presentation request of the verifier, with its state.',
        tags: ['presentations'],
      },
      handler: async ({ input, ctx }) => {
        const record = await ctx.agent.verifier.presentations.getRequest(
          input.presentationId,
        );
        if (!record) {
          throw HttpError.NotFound(`Presentation ${input.presentationId} not found`);
        }
        return toResponse(record);
      },
    })
    .post('/', {
      input: createOobPresentationRequestInputSchema,
      output: presentationRecordSchema,
      openAPI: {
        name: 'POST PRESENTATION',
        description:
          'Creates a connectionless OOB presentation request and returns its record, including `invitationUrl` and `state`.',
        tags: ['presentations'],
      },
      handler: async ({ input, ctx }) => {
        // A request with no claim and no trusted issuer accepts any credential.
        if (!input.claims?.length && !input.trustIssuers?.length) {
          throw HttpError.BadRequest('Ask for at least one claim or one trusted issuer.');
        }
        const record = await ctx.agent.verifier.presentations.createOobRequest(input);
        return toResponse(record);
      },
    });
}
