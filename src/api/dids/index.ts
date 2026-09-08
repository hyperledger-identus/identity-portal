import { Domain } from '@hyperledger/identus-sdk';
import { z } from 'zod';

import { didDocumentSchema } from '../../schemas/did-document';
import {
  prismDIDListSchema,
  prismDIDPublishOutputSchema,
  prismDIDRefSchema,
  prismDIDTxOutputSchema,
  prismDIDUpdateInputSchema,
} from '../../schemas/prism-did';
import { PrismDIDKeyCurves, PrismDIDUpdateAction } from 'src/utils/agent/types';
import { ContextFactory, createRestRouter, HttpError } from '../../utils/rest';

function parseDID(value: string): Domain.DID {
  try {
    return Domain.DID.fromString(value);
  } catch {
    throw HttpError.BadRequest(`Invalid DID: ${value}`);
  }
}

function mapPrismDIDError(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  if (lower.includes('not found')) {
    throw HttpError.NotFound(message);
  }
  if (
    lower.includes('must be published') ||
    lower.includes('malformed operation hash') ||
    lower.includes('master key not found') ||
    lower.includes('not indexed') ||
    lower.includes('seed not found')
  ) {
    throw HttpError.BadRequest(message);
  }
  throw error;
}

async function withPrismDIDErrors<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    mapPrismDIDError(error);
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
      input: prismDIDRefSchema,
      output: prismDIDPublishOutputSchema,
      openAPI: {
        name: 'PUBLISH DID',
        description: 'Publishes a stored prism DID to the ledger.',
        tags: ['dids'],
      },
      handler: async ({ input, ctx }) => {
        const did = parseDID(input.did);
        const result = await withPrismDIDErrors(() => ctx.agent.dids.prism.publish(did));
        return { did: result.did.toString(), txId: result.txId };
      },
    })
    .post('/:did/update', {
      input: prismDIDUpdateInputSchema,
      output: prismDIDTxOutputSchema,
      openAPI: {
        name: 'UPDATE DID',
        description: 'Submits an update operation for a published prism DID.',
        tags: ['dids'],
      },
      handler: async ({ input, ctx }) => {
        const did = parseDID(input.did);
        return withPrismDIDErrors(() =>
          ctx.agent.dids.prism.update(did, input.actions as PrismDIDUpdateAction[]),
        );
      },
    })
    .post('/:did/deactivate', {
      input: prismDIDRefSchema,
      output: prismDIDTxOutputSchema,
      openAPI: {
        name: 'DEACTIVATE DID',
        description: 'Deactivates a published prism DID on the ledger.',
        tags: ['dids'],
      },
      handler: async ({ input, ctx }) => {
        const did = parseDID(input.did);
        return withPrismDIDErrors(() => ctx.agent.dids.prism.deactivate(did));
      },
    });
}
