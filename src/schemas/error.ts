import { z } from 'zod';

export const errorResponseSchema = z.object({
  success: z.literal(false),
  error: z.string(),
});

export type ErrorResponse = z.infer<typeof errorResponseSchema>;
