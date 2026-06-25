import { z } from 'zod';


export const messagesSchema = z.object({
  to: z.string().optional(),
  uuid: z.string().max(60),
  dataJson: z.string(),
  id: z.string(),
  createdTime: z.number(),
  thid: z.string().optional(),
  piuri: z.string(),
  from: z.string().optional(),
  isReceived: z.number(),
});

export type MessagesSchema = z.infer<typeof messagesSchema>;
