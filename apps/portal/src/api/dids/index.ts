import { z } from 'zod';

import { errorResponseSchema } from "../../schemas/error";
import { Context, createRestRouter } from "../../utils/rest";

export default function createIssuerRouter(context: Context) {
    return createRestRouter({ context })
      .get('/', {
        output: errorResponseSchema,
        openAPI: {
          name: 'GET DIDS',
          description: `
 Gets the DIDS from the agent`,
          tags: ['dids'],
        },
        handler: async ({ input, ctx }) => {
          return { success: true, error: '' };
        },
      })
      .post('/', {
        input: z.object({
          did: z.string().min(1),
        }),
        output: errorResponseSchema,
        openAPI: {
          name: 'POST DIDS',
          description: `
          Creates a new DID`,
          tags: ['dids'],
        },
        handler: async ({ input, ctx }) => {
          await ctx.agent.createPeerDID([], true)
          const dids = await ctx.agent.pluto.getAllPeerDIDs();
          return { success: dids.length > 0, error: '' };
        },
      })
  }
  


  