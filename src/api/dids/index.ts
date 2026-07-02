import { z } from 'zod';

import { errorResponseSchema } from '../../schemas/error';
import { ContextFactory, createRestRouter } from '../../utils/rest';
import { PrismDIDKeyCurves } from 'src/utils/agent/types';

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
        ISSUING_KEY: z.array(z.string()).min(1),
        KEY_AGREEMENT_KEY: z.array(z.string()).min(1),
        AUTHENTICATION_KEY: z.array(z.string()).min(1),
        REVOCATION_KEY: z.array(z.string()).min(1),
        CAPABILITY_INVOCATION_KEY: z.array(z.string()).min(1),
        CAPABILITY_DELEGATION_KEY: z.array(z.string()).min(1),
      }),
      output: z.object({
        did: z.string()
      }),
      openAPI: {
        name: 'POST DIDS',
        description: `
          Creates a new DID`,
        tags: ['dids'],
      },
      handler: async ({ input, ctx }) => {
        const did = await ctx.agent.dids.prism.create(input as PrismDIDKeyCurves)
        return {
          did: did.toString()
        };
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