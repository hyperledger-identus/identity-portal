import { z } from 'zod';


export const didLinkSchema = z.object({
  alias: z.string().optional(),
  uuid: z.string().max(60),
  role: z.number(),
  hostId: z.string(),
  targetId: z.string(),
});

export type DidLinkSchema = z.infer<typeof didLinkSchema>;
