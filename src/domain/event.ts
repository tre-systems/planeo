import { z } from "zod";

import { BoxEventSchema, BoxUpdatePayloadSchema } from "./box";
import { Vec3Schema } from "./common";
import { MessageSchema } from "./message";

export const EyeUpdateSchema = z.object({
  type: z.literal("eyeUpdate"),
  id: z.string().min(1),
  name: z.string().optional(),
  p: Vec3Schema.optional(),
  l: Vec3Schema.optional(),
  t: z.number(),
});
export type EyeUpdateType = z.infer<typeof EyeUpdateSchema>;

export const ChatMessageEventSchema = MessageSchema.extend({
  type: z.literal("chatMessage"),
});
export type ChatMessageEventType = z.infer<typeof ChatMessageEventSchema>;

// Server → client: designates the current simulation host (the one client that
// drives the AI agents and box physics).
export const HostEventSchema = z.object({
  type: z.literal("host"),
  hostId: z.string(),
});
export type HostEventType = z.infer<typeof HostEventSchema>;

export const EventSchema = z.discriminatedUnion("type", [
  EyeUpdateSchema,
  ChatMessageEventSchema,
  BoxEventSchema,
  BoxUpdatePayloadSchema,
  HostEventSchema,
]);
export type EventType = z.infer<typeof EventSchema>;

export const ValidatedEyeUpdatePayloadSchema = EyeUpdateSchema.refine(
  (data) => data.p !== undefined || data.l !== undefined,
  {
    message:
      "Eye update must contain either 'p' (position) or 'l' (lookAt) or both.",
  },
);
export type ValidatedEyeUpdatePayloadType = z.infer<
  typeof ValidatedEyeUpdatePayloadSchema
>;
