import { z } from "zod";

// The action half of the LLM response: what the agent does this turn.
const MoveActionSchema = z.object({
  type: z.literal("move"),
  direction: z.enum(["forward", "backward"]),
  distance: z.number().positive(),
});

const TurnActionSchema = z.object({
  type: z.literal("turn"),
  direction: z.enum(["left", "right"]),
  degrees: z.number().min(1).max(45),
});

const NoActionSchema = z.object({
  type: z.literal("none"),
});

// A tagged union of the action variants; null means "no action".
export const AIActionSchema = z
  .discriminatedUnion("type", [
    MoveActionSchema,
    TurnActionSchema,
    NoActionSchema,
  ])
  .nullable();

export type AIAction = z.infer<typeof AIActionSchema>;

// The full JSON contract the vision model must return: an optional chat line
// plus the action.
export const AIResponseSchema = z.object({
  chatMessage: z.string().optional(),
  action: AIActionSchema,
});

export type ParsedAIResponse = z.infer<typeof AIResponseSchema>;

// The agent's own situation, sent with each decision request so the model
// knows where it is and what it just did — without this every call is an
// amnesiac frame and agents spin in place. Length-capped like the chat
// history: the action is a billable public endpoint.
export const AgentSelfStateSchema = z.object({
  // World-space position, rounded; y is fixed so [x, z] carries the meaning.
  position: z.tuple([z.number(), z.number()]),
  // Compass-style yaw in degrees (atan2(dir.x, dir.z)), -180..180.
  headingDeg: z.number().min(-180).max(180),
  lastActions: z.array(AIActionSchema).max(5),
});

export type AgentSelfState = z.infer<typeof AgentSelfStateSchema>;
