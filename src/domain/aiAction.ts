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
