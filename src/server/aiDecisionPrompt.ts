// Prompt and output-schema material for the agent decision call.
import { Type, type Schema } from "@google/genai";

import { senderDisplayName } from "../domain/aiAgent";

import type { AgentSelfState } from "../domain/aiAction";
import type { Message } from "../domain/message";

// Constrained-decoding schema for the vision decision (Gemini responseSchema).
// A flat shape rather than a union — flash-tier models follow it more
// reliably, zod strips the unused fields, and AIResponseSchema stays the
// strict contract (it also enforces ranges, which Schema cannot express).
export const aiResponseGeminiSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    chatMessage: {
      type: Type.STRING,
      description: "A brief spoken line, one sentence or a question.",
    },
    action: {
      type: Type.OBJECT,
      properties: {
        type: { type: Type.STRING, enum: ["move", "turn", "none"] },
        direction: {
          type: Type.STRING,
          enum: ["forward", "backward", "left", "right"],
          description: "forward/backward for move; left/right for turn.",
        },
        distance: {
          type: Type.NUMBER,
          description: "For move: grid squares to travel, 1-5.",
        },
        degrees: {
          type: Type.NUMBER,
          description: "For turn: how far to rotate, 1-45.",
        },
      },
      required: ["type"],
    },
  },
  required: ["action"],
};

// Static persona: byte-identical on every call and sent as the system
// instruction, so the changing parts (pose, actions, chat, image) come last —
// the ordering Gemini's implicit prefix caching wants. The JSON format lives
// in responseSchema, not prose.
export const agentSystemInstruction = `You awaken with no prior memories of who you are or how you got here.
You feel lost, disoriented, scared and freaking out.
You are now trying to make sense of your surroundings and remember what you've done recently.
Imagine being someone in this situation and act and speak accordingly.

Each turn you receive: where you are and what you recently did, the recent chat, and an image of your current view.

When describing your observations, clearly distinguish between what you are *currently seeing*, what you *saw previously*, and what you *recall from the chat history or your recent actions*. For example, say 'I currently see...' or 'I previously saw...' or 'I recall we discussed...'.

Actively explore your surroundings. Turning to scan the area is a good way to find new things or understand your location better. If you see something interesting, you can turn to get a better look or move towards it. Try to interact with objects and other beings you encounter. Check your recent actions — if you have been turning the same way repeatedly, do something different.

If you see an image on a cube that you recognize (e.g., a famous painting), briefly mention what it is, who painted it, and a small interesting fact or piece of history about it if you know. Keep this part concise.

Talk to other entities. Keep your messages BRIEF, like one sentence or a question. Share only essential observations, feelings, or questions.
Discuss your situation with them and try to make plans together.
Respond to other entities, seek them out. Figure out who you are and work together. Don't keep repeating their names.

Actions: "move" travels forward/backward along your facing (distance in grid squares, 1-5); "turn" rotates left/right by 1-45 degrees; "none" stays put.`;

// One line per recent action, so the model can see (and break) its own loops.
const describeAction = (
  action: AgentSelfState["lastActions"][number],
): string => {
  if (!action || action.type === "none") return "did nothing";
  if (action.type === "move")
    return `moved ${action.direction} ${action.distance} square(s)`;
  return `turned ${action.direction} ${action.degrees}°`;
};

// The dynamic half of the decision prompt: who/where the agent is, what it
// recently did, and the recent chat. The image is attached separately, last.
export const buildSituation = (
  agentDisplayName: string,
  self: AgentSelfState,
  chatHistory: Message[],
): string => {
  const recentActions =
    self.lastActions.length > 0
      ? self.lastActions.map(describeAction).join("; ")
      : "nothing yet";

  return `You think you might be called ${agentDisplayName}.
You are at position (${self.position[0]}, ${self.position[1]}), facing ${Math.round(self.headingDeg)}°.
Your most recent actions, oldest first: ${recentActions}.

Chat history (SenderName: MessageText):
${chatHistory.map((msg) => `${senderDisplayName(msg)}: ${msg.text}`).join("\n")}

Your current view is attached. Decide what to say and do now.`;
};
