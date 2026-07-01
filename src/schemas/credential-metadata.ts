import { z } from 'zod';

export const credentialMetadataSchema = z.object({
  recoveryId: z.string(),
  uuid: z.string().max(60),
  dataJson: z.string(),
  name: z.string(),
});

export type CredentialMetadataSchema = z.infer<typeof credentialMetadataSchema>;
