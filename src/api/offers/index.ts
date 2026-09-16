import { z } from 'zod';

import {
  credentialOfferListSchema,
  credentialOfferRecordSchema,
  createOobOfferInputSchema,
  type CredentialOfferRecordDto,
} from '../../schemas/credential-offers';
import { ContextFactory, HttpError, createRestRouter } from '../../utils/rest';
import type { CredentialOfferRecord } from '../../utils/agent/types';

/**
 * Maps an offer record onto the response DTO. The mapping is explicit so
 * storage-only fields (`tenantId`) never reach the client: the framework sends
 * the handler's object as it is and only validates it against the schema.
 */
function toResponse(offer: CredentialOfferRecord): CredentialOfferRecordDto {
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

/**
 * Issuer-side connectionless OOB offers. List and get are issuer records
 * only; holder-side issuance rows are not this surface.
 */
export default function createOffersRouter(createContext: ContextFactory) {
  return createRestRouter({ createContext })
    .get('/', {
      input: z.object({
        offset: z.coerce.number().int().min(0),
        limit: z.coerce.number().int().min(1),
      }),
      output: credentialOfferListSchema,
      openAPI: {
        name: 'GET OFFERS',
        description:
          'Lists the issuer credential offers the agent holds. `offset` is the number of items to skip; `limit` is the page size.',
        tags: ['offers'],
      },
      handler: async ({ input, ctx }) => {
        const offers = await ctx.agent.issuer.credentials.listOffers(
          input.offset,
          input.limit,
        );
        return { offers: offers.map(toResponse) };
      },
    })
    .get('/:recordId', {
      input: z.object({
        recordId: z.string().min(1),
      }),
      output: credentialOfferRecordSchema,
      openAPI: {
        name: 'GET OFFER',
        description: 'Reads a single issuer credential offer by its record id.',
        tags: ['offers'],
      },
      handler: async ({ input, ctx }) => {
        const offer = await ctx.agent.issuer.credentials.getOffer(
          input.recordId,
        );
        if (!offer) {
          throw HttpError.NotFound(`Offer ${input.recordId} not found`);
        }
        return toResponse(offer);
      },
    })
    .post('/', {
      input: createOobOfferInputSchema,
      output: credentialOfferRecordSchema,
      openAPI: {
        name: 'POST OFFER',
        description:
          'Creates a connectionless OOB credential offer and returns the offer record, including `invitationUrl` and `protocolState`.',
        tags: ['offers'],
      },
      handler: async ({ input, ctx }) => {
        const offer = await ctx.agent.issuer.credentials.createOobOffer(input);
        return toResponse(offer);
      },
    });
}
