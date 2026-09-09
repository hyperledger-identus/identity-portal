import { Domain } from '@hyperledger/identus-sdk';
import { z } from 'zod';

import { didDocumentSchema } from '../../schemas/did-document';
import {
  prismDIDListSchema,
  prismDIDUpdateInputSchema,
  prismDIDTxOutputSchema,
} from '../../schemas/prism-did';
import { ContextFactory, HttpError, createRestRouter } from '../../utils/rest';
import { PrismDIDKeyCurves } from '../../utils/agent/types';

/**
 * Reads the DID out of the path. `Domain.DID.fromString` throws a plain error on
 * anything that is not a DID, which the router would report as a 500 for what is
 * a malformed request.
 */
function parseDID(value: string): Domain.DID {
  try {
    return Domain.DID.fromString(value);
  } catch {
    throw HttpError.BadRequest(`${value} is not a DID`);
  }
}

export default function createIssuerRouter(createContext: ContextFactory) {
  return createRestRouter({ createContext })
    .get('/', {
      output: prismDIDListSchema,
      openAPI: {
        name: 'GET DIDS',
        description: 'Lists the prism DIDs stored by the agent, with publication status.',
        tags: ['dids'],
      },
      handler: async ({ ctx }) => {
        const dids = await ctx.agent.dids.prism.list();
        return {
          dids: dids.map((record) => ({
            did: record.did.toString(),
            status: record.status,
            transactionId: record.transactionId,
          })),
        };
      },
    })
    .post('/', {
      input: z.object({
        ISSUING_KEY: z.array(z.string()).min(1),
        KEY_AGREEMENT_KEY: z.array(z.string()).min(1),
        AUTHENTICATION_KEY: z.array(z.string()).min(1),
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
      output: didDocumentSchema,
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
    })
    .post('/:did/publish', {
      input: z.object({
        did: z.string().min(1),
      }),
      output: z.object({
        did: z.string(),
        txId: z.string(),
      }),
      openAPI: {
        name: 'PUBLISH DID',
        description:
          'Publishes a Prism DID and returns the id of the transaction carrying the operation. The DID is the long-form string `GET /api/dids` lists.',
        tags: ['dids'],
      },
      handler: async ({ input, ctx }) => {
        const published = await ctx.agent.dids.prism.publish(parseDID(input.did));
        return { did: published.did.toString(), txId: published.txId };
      },
    })
    .post('/:did/update', {
      input: prismDIDUpdateInputSchema,
      output: prismDIDTxOutputSchema,
      openAPI: {
        name: 'UPDATE DID',
        description: [
          'Applies a list of actions to a published DID and returns the id of the transaction carrying the operation.',
          'Actions are the portal update model: one `actionType` and the payload field named after it.',
          'For `addKey` the caller names a purpose and curve; the agent generates and stores the key.',
        ].join(' '),
        tags: ['dids'],
      },
      handler: async ({ input, ctx }) => {
        const { txId } = await ctx.agent.dids.prism.update(
          parseDID(input.did),
          input.actions,
        );
        return { txId };
      },
    })
    .post('/:did/deactivate', {
      input: z.object({
        did: z.string().min(1),
      }),
      output: z.object({
        txId: z.string(),
      }),
      openAPI: {
        name: 'DEACTIVATE DID',
        description:
          'Deactivates a published DID and returns the id of the transaction carrying the operation. The DID stops resolving once the operation is indexed.',
        tags: ['dids'],
      },
      handler: async ({ input, ctx }) => {
        const { txId } = await ctx.agent.dids.prism.deactivate(parseDID(input.did));
        return { txId };
      },
    });
}
