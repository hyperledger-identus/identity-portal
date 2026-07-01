import { z } from 'zod';


export const didkeyLinkSchema = z.object({
  alias: z.string().optional(),
  uuid: z.string().max(60),
  didId: z.string(),
  keyId: z.string(),
});

export type DidkeyLinkSchema = z.infer<typeof didkeyLinkSchema>;
