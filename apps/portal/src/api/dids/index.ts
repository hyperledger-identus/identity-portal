import { z } from 'zod';

import { errorResponseSchema } from "../../schemas/error";
import { ContextFactory, createRestRouter } from "../../utils/rest";

export default function createIssuerRouter(createContext: ContextFactory) {
    return createRestRouter({ createContext })
      .get('/', {
        output: errorResponseSchema,
        openAPI: {
          name: 'GET DIDS',
          description: `
 Gets the DIDS from the agent`,
          tags: ['dids'],
        },
        handler: async ({ input, ctx }) => {
          throw new Error("Not implemented");
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
          throw new Error("Not implemented");
        },
      })
  }
  


  