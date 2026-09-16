import { z } from 'zod';

import {
  holderCredentialListSchema,
  type HolderCredentialDto,
} from '../../schemas/holder-credentials';
import { ContextFactory, createRestRouter } from '../../utils/rest';
import type { HolderCredential } from '../../utils/agent/types';

/**
 * Maps a held credential onto the response DTO. The mapping is explicit so
 * storage-only fields (`tenantId`) never reach the client: the framework sends
 * the handler's object as it is and only validates it against the schema.
 */
function toResponse(credential: HolderCredential): HolderCredentialDto {
  return {
    id: credential.id,
    issuer: credential.issuer,
    subject: credential.subject,
    format: credential.format,
    issuedAt: credential.issuedAt,
    claims: credential.claims,
  };
}

/**
 * Holder wallet credentials already received. Distinct from issuer offer
 * records and from in-flight invitation rows.
 */
export default function createCredentialsRouter(
  createContext: ContextFactory,
) {
  return createRestRouter({ createContext }).get('/', {
    input: z.object({
      offset: z.coerce.number().int().min(0),
      limit: z.coerce.number().int().min(1),
    }),
    output: holderCredentialListSchema,
    openAPI: {
      name: 'GET CREDENTIALS',
      description:
        'Lists the verifiable credentials in the holder wallet. `offset` is the number of items to skip; `limit` is the page size.',
      tags: ['credentials'],
    },
    handler: async ({ input, ctx }) => {
      const credentials = await ctx.agent.holder.credentials.list(
        input.offset,
        input.limit,
      );
      return { credentials: credentials.map(toResponse) };
    },
  });
}
