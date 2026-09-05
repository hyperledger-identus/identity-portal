import { Domain, UpdateActionType } from '@hyperledger/identus-sdk';
import { z } from 'zod';

/**
 * The key usages a Prism DID key can have. The SDK's `PrismDIDKeyUsageType` is
 * the numeric protobuf value; the API speaks the names `Domain.PrismDIDKeyUsage`
 * gives them, the way `POST /api/dids` already does, and the handler maps a name
 * onto its value. `UNKNOWN_KEY` is left out: it is the protobuf zero value, not
 * a usage a caller can ask for.
 */
export const keyPurposes = [
  'MASTER_KEY',
  'ISSUING_KEY',
  'KEY_AGREEMENT_KEY',
  'AUTHENTICATION_KEY',
  'REVOCATION_KEY',
  'CAPABILITY_INVOCATION_KEY',
  'CAPABILITY_DELEGATION_KEY',
] as const satisfies readonly (keyof typeof Domain.PrismDIDKeyUsage)[];

/**
 * Raw key material, base64url encoded. Node decodes base64url leniently, so the
 * value is re-encoded and compared to reject anything that is not exactly what
 * it claims to be.
 */
const base64UrlBytes = z
  .string()
  .min(1)
  .refine(
    (value) => Buffer.from(value, 'base64url').toString('base64url') === value,
    { message: 'Expected base64url encoded bytes' },
  );

const publicKeySchema = z.object({
  curve: z.nativeEnum(Domain.Curve),
  raw: base64UrlBytes,
});

const serviceIdSchema = z.string().min(1);
const serviceSchema = {
  id: serviceIdSchema,
  type: z.string().min(1),
  serviceEndpoint: z.array(z.string().min(1)).min(1),
};

/**
 * One update action, mirroring the SDK's own `UpdateAction` model so the API
 * describes a change the same way both agents do. `actionType` is the
 * discriminant and names the single payload field the action carries.
 *
 * The literals come from the SDK's `UpdateActionType`, so an action the SDK
 * stops accepting cannot stay valid here by accident.
 */
export const updateActionSchema = z.discriminatedUnion('actionType', [
  z.object({
    actionType: z.literal(UpdateActionType.addKey),
    /**
     * The SDK derives the verification method id from the purpose and the
     * trailing number of this id, so `authentication-1` becomes
     * `authentication-1` while `my-key` becomes `<purpose>-0`.
     */
    addKey: z.object({
      id: z.string().min(1),
      purpose: z.enum(keyPurposes),
      publicKey: publicKeySchema,
    }),
  }),
  z.object({
    actionType: z.literal(UpdateActionType.removeKey),
    removeKey: z.object({ id: z.string().min(1) }),
  }),
  z.object({
    actionType: z.literal(UpdateActionType.addService),
    addService: z.object(serviceSchema),
  }),
  z.object({
    actionType: z.literal(UpdateActionType.removeService),
    removeService: z.object({ id: serviceIdSchema }),
  }),
  z.object({
    actionType: z.literal(UpdateActionType.updateService),
    updateService: z.object(serviceSchema),
  }),
]);

export type UpdateActionInput = z.infer<typeof updateActionSchema>;
