import { z } from 'zod';


export const credentialsSchema = z.object({
  recoveryId: z.string(),
  revoked: z.boolean().optional(),
  uuid: z.string().max(60),
  dataJson: z.string(),
  issuer: z.string().optional(),
  subject: z.string().optional(),
  credentialCreated: z.string().optional(),
  credentialUpdated: z.string().optional(),
  credentialSchema: z.string().optional(),
  validUntil: z.number().optional(),
  id: z.string(),
});

export type CredentialsSchema = z.infer<typeof credentialsSchema>;
