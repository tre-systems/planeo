import { z } from "zod";

import { Vec3Schema } from "./common";

export const BoxSchema = z.object({
  type: z.literal("box"),
  id: z.string().min(1),
  p: Vec3Schema, // Position
  o: Vec3Schema, // Orientation, as Euler angles
  c: z.string(), // Color, hex string (e.g. "#FF0000")
  t: z.number(), // Timestamp of last update
});
export type BoxType = z.infer<typeof BoxSchema>;

// The payload a client sends to update a box; the server stamps 't' on
// receive/broadcast, so it is absent here.
export const BoxUpdatePayloadSchema = z.object({
  type: z.literal("boxUpdate"),
  id: z.string().min(1),
  p: Vec3Schema.optional(),
  o: Vec3Schema.optional(),
});
export type BoxUpdatePayloadType = z.infer<typeof BoxUpdatePayloadSchema>;

// Refine to ensure at least position or orientation is present
export const ValidatedBoxUpdatePayloadSchema = BoxUpdatePayloadSchema.refine(
  (data) => data.p !== undefined || data.o !== undefined,
  {
    message:
      "Box update must contain either 'p' (position) or 'o' (orientation) or both.",
  },
);
export type ValidatedBoxUpdatePayloadType = z.infer<
  typeof ValidatedBoxUpdatePayloadSchema
>;

// The box state broadcast to clients over SSE. Identical to BoxSchema; kept as a
// named alias so SSE-event call sites can reference the wire shape explicitly.
export const BoxEventSchema = BoxSchema;
export type BoxEventType = z.infer<typeof BoxEventSchema>;
