import { Domain } from '@hyperledger/identus-sdk';
import { z } from 'zod';

/** Portal lifecycle of a stored prism DID. */
export const prismDIDStatusSchema = z.enum(['created', 'published', 'deactivated']);

/** One entry of `GET /api/dids`. */
export const prismDIDRecordSchema = z.object({
  did: z.string(),
  status: prismDIDStatusSchema,
  transactionId: z.string().optional(),
});

export const prismDIDListSchema = z.object({
  dids: z.array(prismDIDRecordSchema),
});

const prismDIDKeyPurposeSchema = z.enum([
  'ISSUING_KEY',
  'KEY_AGREEMENT_KEY',
  'AUTHENTICATION_KEY',
  'REVOCATION_KEY',
  'CAPABILITY_INVOCATION_KEY',
  'CAPABILITY_DELEGATION_KEY',
]);

const addKeyActionSchema = z.object({
  actionType: z.literal('addKey'),
  addKey: z.object({
    id: z.string().min(1),
    purpose: prismDIDKeyPurposeSchema,
    curve: z.nativeEnum(Domain.Curve),
  }),
});

const removeKeyActionSchema = z.object({
  actionType: z.literal('removeKey'),
  removeKey: z.object({
    id: z.string().min(1),
  }),
});

const addServiceActionSchema = z.object({
  actionType: z.literal('addService'),
  addService: z.object({
    id: z.string().min(1),
    type: z.string().min(1),
    serviceEndpoint: z.array(z.string().min(1)).min(1),
  }),
});

const removeServiceActionSchema = z.object({
  actionType: z.literal('removeService'),
  removeService: z.object({
    id: z.string().min(1),
  }),
});

const updateServiceActionSchema = z.object({
  actionType: z.literal('updateService'),
  updateService: z.object({
    id: z.string().min(1),
    type: z.string().min(1),
    serviceEndpoint: z.array(z.string().min(1)).min(1),
  }),
});

/** JSON body of `POST /api/dids/:did/update`. */
export const prismDIDUpdateActionSchema = z.discriminatedUnion('actionType', [
  addKeyActionSchema,
  removeKeyActionSchema,
  addServiceActionSchema,
  removeServiceActionSchema,
  updateServiceActionSchema,
]);

export const prismDIDUpdateInputSchema = z.object({
  did: z.string().min(1),
  actions: z.array(prismDIDUpdateActionSchema).min(1),
});

export const prismDIDRefSchema = z.object({
  did: z.string().min(1),
});

export const prismDIDPublishOutputSchema = z.object({
  did: z.string(),
  txId: z.string(),
});

export const prismDIDTxOutputSchema = z.object({
  txId: z.string(),
});

export type PrismDIDRecordPayload = z.infer<typeof prismDIDRecordSchema>;
export type PrismDIDUpdateActionPayload = z.infer<typeof prismDIDUpdateActionSchema>;
