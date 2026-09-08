import {
  Domain,
  Ed25519PublicKey,
  Secp256k1PublicKey,
  UpdateActionType,
  X25519PublicKey,
  type UpdateAction,
} from '@hyperledger/identus-sdk';
import { z } from 'zod';

import { didDocumentSchema } from '../../schemas/did-document';
import { updateActionSchema, type UpdateActionInput } from '../../schemas/did-update-actions';
import { ContextFactory, HttpError, createRestRouter } from '../../utils/rest';
import { PrismDIDKeyCurves } from 'src/utils/agent/types';

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

/** Builds the public key the caller described from its bytes and its curve. */
function toPublicKey(publicKey: { curve: Domain.Curve; raw: string }): Domain.PublicKey {
  const bytes = Uint8Array.from(Buffer.from(publicKey.raw, 'base64url'));
  try {
    switch (publicKey.curve) {
      case Domain.Curve.SECP256K1:
        return new Secp256k1PublicKey(bytes);
      case Domain.Curve.ED25519:
        return new Ed25519PublicKey(bytes);
      case Domain.Curve.X25519:
        return new X25519PublicKey(bytes);
      default:
        // The schema only admits the curves above; a curve added to the SDK
        // reaches this as a request the API cannot serve, not as a crash.
        throw HttpError.BadRequest(`Unsupported curve ${publicKey.curve}`);
    }
  } catch (error) {
    if (error instanceof HttpError) {
      throw error;
    }
    throw HttpError.BadRequest(
      `The bytes are not a valid ${publicKey.curve} public key: ${(error as Error).message}`,
    );
  }
}

/**
 * Maps a validated action onto the SDK's own update model. The mapping is
 * written out so the wire format and the SDK model can move apart without one
 * silently reshaping the other, and so the key purpose the API names is turned
 * into the numeric usage the SDK works with.
 */
function toUpdateAction(action: UpdateActionInput): UpdateAction {
  switch (action.actionType) {
    case UpdateActionType.addKey:
      return {
        actionType: UpdateActionType.addKey,
        addKey: {
          id: action.addKey.id,
          purpose: Domain.PrismDIDKeyUsage[action.addKey.purpose],
          publicKey: toPublicKey(action.addKey.publicKey),
        },
      };
    case UpdateActionType.removeKey:
      return {
        actionType: UpdateActionType.removeKey,
        removeKey: { id: action.removeKey.id },
      };
    case UpdateActionType.addService:
      return {
        actionType: UpdateActionType.addService,
        addService: {
          id: action.addService.id,
          type: action.addService.type,
          serviceEndpoint: action.addService.serviceEndpoint,
        },
      };
    case UpdateActionType.removeService:
      return {
        actionType: UpdateActionType.removeService,
        removeService: { id: action.removeService.id },
      };
    case UpdateActionType.updateService:
      return {
        actionType: UpdateActionType.updateService,
        updateService: {
          id: action.updateService.id,
          type: action.updateService.type,
          serviceEndpoint: action.updateService.serviceEndpoint,
        },
      };
  }
}

export default function createIssuerRouter(createContext: ContextFactory) {
  return createRestRouter({ createContext })
    .get('/', {
      output: z.object({
        dids: z.array(z.string()),
      }),
      openAPI: {
        name: 'GET DIDS',
        description: 'Lists the prism DIDs stored by the agent.',
        tags: ['dids'],
      },
      handler: async ({ ctx }) => {
        const dids = await ctx.agent.dids.prism.list();
        return { dids: dids.map((did) => did.toString()) };
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
      input: z.object({
        did: z.string().min(1),
        actions: z.array(updateActionSchema).min(1),
      }),
      output: z.object({
        txId: z.string(),
      }),
      openAPI: {
        name: 'UPDATE DID',
        description: [
          'Applies a list of actions to a published DID and returns the id of the transaction carrying the operation.',
          'The actions are the SDK update model: one `actionType` and the payload field named after it.',
          'For `addKey` the SDK builds the verification method id from the purpose and the trailing number of the id sent here, so `authentication-1` stays `authentication-1` while `my-key` becomes `<purpose>-0`.',
          'The cloud agent does not implement update yet (#50), so in cloud mode this reports that error.',
        ].join(' '),
        tags: ['dids'],
      },
      handler: async ({ input, ctx }) => {
        const { txId } = await ctx.agent.dids.prism.update(
          parseDID(input.did),
          input.actions.map(toUpdateAction),
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