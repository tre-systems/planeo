import { z } from "zod";

export const MessageSchema = z.object({
  id: z.string().uuid(),
  userId: z.string(),
  name: z.string().optional(),
  text: z.string().min(1),
  timestamp: z.number(), // Unix epoch ms
});

export type Message = z.infer<typeof MessageSchema>;
