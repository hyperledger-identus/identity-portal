import { z } from 'zod';

export const didsSchema = z.object({
  alias: z.string().optional(),
  method: z.string(),
  methodId: z.string(),
  schema: z.string(),
  uuid: z.string(),
});

export type DidsSchema = z.infer<typeof didsSchema>;
