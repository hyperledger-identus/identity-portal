import { z } from 'zod';

/**
 * The JSON Schema a credential schema carries. Every field is optional and
 * unknown keys pass through, so a valid JSON Schema is never cut down or
 * rejected on its way to the agent. It replaces a `z.any()` here, which would
 * leave the typed API client without a response type.
 *
 * `type` and `additionalProperties` are unions because JSON Schema gives them
 * more than one shape: `type` is a string or an array of strings, and
 * `additionalProperties` is a boolean or a nested schema. `passthrough` only
 * keeps unknown keys, so a known key declared too narrow would still be a 400
 * on create and a failed output validation on read.
 */
const jsonSchemaSchema = z
  .object({
    $id: z.string().optional(),
    $schema: z.string().optional(),
    description: z.string().optional(),
    type: z.union([z.string(), z.array(z.string())]).optional(),
    properties: z.record(z.unknown()).optional(),
    required: z.array(z.string()).optional(),
    additionalProperties: z
      .union([z.boolean(), z.record(z.unknown())])
      .optional(),
  })
  .passthrough();

/**
 * Response shape of the `/api/schemas` endpoints. Only the fields the agent
 * guarantees are required; the rest is optional so a record coming from either
 * agent never fails output validation.
 *
 * `tenantId` is left out on purpose: it is a storage detail of the local agent
 * and it always equals the caller's own session.
 */
export const credentialSchemaSchema = z.object({
  uuid: z.string(),
  name: z.string(),
  version: z.string(),
  type: z.string(),
  schema: jsonSchemaSchema,
  author: z.string(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  createdAt: z.number().optional(),
  updatedAt: z.number().optional(),
});

/** Body of `POST /api/schemas`. */
export const createCredentialSchemaSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
  type: z.string().min(1),
  schema: jsonSchemaSchema,
  author: z.string().min(1),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

export type CredentialSchemaResponse = z.infer<typeof credentialSchemaSchema>;
export type CreateCredentialSchemaInput = z.infer<
  typeof createCredentialSchemaSchema
>;
