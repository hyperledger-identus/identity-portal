import { z } from 'zod';

import { errorResponseSchema } from '../../schemas/error';
import { ContextFactory, createRestRouter } from '../../utils/rest';

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
        throw new Error('Not implemented');
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
        throw new Error('Not implemented');
      },
    })
    .get('/resolve/:did', {
      input: z.object({
        did: z.string().min(1),
      }),
      output: z.any(),
      openAPI: {
        name: 'RESOLVE DID',
        description: 'Resolves a DID to its DID document.',
        tags: ['dids'],
      },
      handler: async ({ input, ctx }) => {
        const doc = await ctx.agent.dids.resolveDID(input.did);
        return {
          id: doc.id.toString(),
          verificationMethod: doc.verificationMethods,
          authentication: doc.authentication.map((vm) => vm.id),
          assertionMethod: doc.assertionMethod.map((vm) => vm.id),
          keyAgreement: doc.keyAgreement.map((vm) => vm.id),
          capabilityInvocation: doc.capabilityInvocation.map((vm) => vm.id),
          capabilityDelegation: doc.capabilityDelegation.map((vm) => vm.id),
          service: doc.services,
        };
      },
    });
}
