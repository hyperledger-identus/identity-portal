import { z } from 'zod';

/**
 * A single verification method of a DID document. Only `id` is guaranteed;
 * everything else is optional so an unusual method shape from the resolver never
 * fails output validation.
 */
const verificationMethodSchema = z.object({
  id: z.string(),
  controller: z.string().optional(),
  type: z.string().optional(),
  publicKeyJwk: z.unknown().optional(),
  publicKeyMultibase: z.string().optional(),
});

/** A service entry of a DID document; only `id` is guaranteed. */
const serviceSchema = z.object({
  id: z.string(),
  type: z.union([z.string(), z.array(z.string())]).optional(),
  serviceEndpoint: z.unknown().optional(),
});

/**
 * Response shape of `GET /api/dids/resolve/:did`: the resolved DID document
 * flattened to the fields the resolver returns. Replaces the previous
 * `z.any()` so the endpoint validates its own output and the typed API client
 * gets a real response type instead of `any`.
 */
export const didDocumentSchema = z.object({
  id: z.string(),
  verificationMethod: z.array(verificationMethodSchema),
  authentication: z.array(z.string()),
  assertionMethod: z.array(z.string()),
  keyAgreement: z.array(z.string()),
  capabilityInvocation: z.array(z.string()),
  capabilityDelegation: z.array(z.string()),
  service: z.array(serviceSchema).optional(),
});

export type DidDocument = z.infer<typeof didDocumentSchema>;
