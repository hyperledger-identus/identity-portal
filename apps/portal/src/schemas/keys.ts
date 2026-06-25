import { z } from 'zod';

export const keysSchema = z.object({
  alias: z.string().optional(),
  index: z.number().optional(),
  recoveryId: z.string(),
  uuid: z.string().max(60),
  rawHex: z.string(),
});

export type KeysSchema = z.infer<typeof keysSchema>;
