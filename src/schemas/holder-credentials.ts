import { z } from 'zod';

/**
 * A verifiable credential already in the holder's wallet. Distinct from the
 * RIDB `credentials` collection schema in `src/schemas/credentials.ts`.
 */
export const holderCredentialSchema = z.object({
  id: z.string(),
  issuer: z.string().optional(),
  subject: z.string().optional(),
  format: z.string(),
  issuedAt: z.string().optional(),
  claims: z.record(z.unknown()).optional(),
});

export const holderCredentialListSchema = z.object({
  credentials: z.array(holderCredentialSchema),
});

export type HolderCredentialDto = z.infer<typeof holderCredentialSchema>;
