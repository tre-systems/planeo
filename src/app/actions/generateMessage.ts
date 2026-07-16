"use server";

import { type GenerateContentConfig, type Schema, Type } from "@google/genai";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";

import {
  actionError,
  actionOk,
  type ActionResult,
} from "@/domain/actionResult";
import {
  AIResponseSchema,
  AgentSelfStateSchema,
  type AgentSelfState,
  type ParsedAIResponse,
} from "@/domain/aiAction";
import { getAIAgentById, senderDisplayName } from "@/domain/aiAgent";
import { Message, MessageSchema } from "@/domain/message";
import { agentDecisionTooSoon, aiCallBlocked } from "@/lib/aiGuard";
import {
  getGoogleAIClient,
  getActiveVisionModel,
  generateTextCompletion,
} from "@/lib/googleAI";
import { log } from "@/lib/log";
import { retry } from "@/lib/retry";

export type ChatHistory = z.infer<typeof MessageSchema>[];

// Length-capped: these actions are billable and any client can call them, so
// an unbounded history array must not be able to inflate the prompt. The real
// client sends at most the last 10 messages.
const ChatHistorySchema = z.array(MessageSchema).max(20);
const ImageDataUrlSchema = z.string().startsWith("data:image/jpeg;base64,");

// Constrained-decoding schema for the vision decision (Gemini responseSchema).
// A flat shape rather than a union — flash-tier models follow it more
// reliably, zod strips the unused fields, and AIResponseSchema stays the
// strict contract (it also enforces ranges, which Schema cannot express).
const aiResponseGeminiSchema: Schema = {
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

// Broadcast a chat message through the EventHub Durable Object (the single
// real-time authority). Best-effort: failures are logged, not thrown, so a
// missing binding during `next dev` doesn't break the AI loop.
const postChatMessageToEvents = async (message: Message): Promise<void> => {
  try {
    const { env } = getCloudflareContext();
    const stub = env.EVENT_HUB.get(env.EVENT_HUB.idFromName("global"));
    // Server-side writer: present the write token when the world requires one.
    const token =
      process.env["WORLD_WRITE_TOKEN"] ||
      process.env["NEXT_PUBLIC_WORLD_WRITE_TOKEN"];
    await stub.fetch("https://event-hub/api/events", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ ...message, type: "chatMessage" as const }),
    });
  } catch (error) {
    log.error("ai.broadcast", "Failed to broadcast via EVENT_HUB", {
      error: String(error),
    });
  }
};

export const generateAiChatMessage = async (
  chatHistory: ChatHistory,
  aiUserId: string,
  writeToken?: string,
): Promise<ActionResult<Message>> => {
  const blocked = aiCallBlocked(writeToken);
  if (blocked) {
    log.warn("ai.chat", "Refusing AI chat call", { reason: blocked });
    return actionError(blocked);
  }

  const validated = ChatHistorySchema.safeParse(chatHistory);
  if (!validated.success || !aiUserId) {
    log.warn("ai.chat", "Invalid input to generateAiChatMessage");
    return actionError("invalid-input");
  }

  const agentName = senderDisplayName({ userId: aiUserId });

  const prompt =
    validated.data
      .map((msg) => `${senderDisplayName(msg)}: ${msg.text}`)
      .join("\n") + `\n${agentName}:`;

  try {
    const aiResponseText = await generateTextCompletion(prompt);

    if (aiResponseText && aiResponseText.trim()) {
      const aiMessage: Message = {
        id: uuidv4(),
        userId: aiUserId,
        name: agentName,
        text: aiResponseText.trim(),
        timestamp: Date.now(),
      };
      await postChatMessageToEvents(aiMessage);
      return actionOk(aiMessage);
    }
    log.info("ai.chat", "No response", { agent: agentName });
    return actionError("unavailable");
  } catch (error) {
    log.error("ai.chat", "Error generating message", {
      agent: agentName,
      error: error instanceof Error ? error.stack : String(error),
    });
    return actionError("unavailable");
  }
};

// One line per recent action, so the model can see (and break) its own loops.
const describeAction = (
  action: AgentSelfState["lastActions"][number],
): string => {
  if (!action || action.type === "none") return "did nothing";
  if (action.type === "move")
    return `moved ${action.direction} ${action.distance} square(s)`;
  return `turned ${action.direction} ${action.degrees}°`;
};

export const generateAiActionAndChat = async (
  aiAgentId: string,
  imageDataUrl: string,
  chatHistory: ChatHistory,
  selfState: AgentSelfState,
  writeToken?: string,
): Promise<ActionResult<ParsedAIResponse>> => {
  const blocked = aiCallBlocked(writeToken);
  if (blocked) {
    log.warn("ai.action", "Refusing AI decision call", { reason: blocked });
    return actionError(blocked);
  }

  if (agentDecisionTooSoon(aiAgentId)) {
    log.warn("ai.action", "Refusing AI decision call: too soon", {
      agent: aiAgentId,
    });
    return actionError("rate-limited");
  }

  const validatedHistory = ChatHistorySchema.safeParse(chatHistory);
  const validatedSelf = AgentSelfStateSchema.safeParse(selfState);
  if (
    !aiAgentId ||
    !ImageDataUrlSchema.safeParse(imageDataUrl).success ||
    !validatedHistory.success ||
    !validatedSelf.success
  ) {
    log.warn("ai.action", "Invalid input to generateAiActionAndChat");
    return actionError("invalid-input");
  }

  const agent = getAIAgentById(aiAgentId);
  const agentDisplayName = agent?.displayName || aiAgentId;
  const visionModelConfig = getActiveVisionModel();

  const base64ImageData = imageDataUrl.split(",")[1];
  if (!base64ImageData) {
    log.warn("ai.action", "Invalid image data URL format", {
      agent: agentDisplayName,
    });
    return actionError("invalid-input");
  }

  // Static persona: byte-identical on every call and sent as the system
  // instruction, so the changing parts (pose, actions, chat, image) come
  // last — the ordering Gemini's implicit prefix caching wants. The JSON
  // format lives in responseSchema, not prose.
  const systemInstruction = `You awaken with no prior memories of who you are or how you got here.
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

  const self = validatedSelf.data;
  const recentActions =
    self.lastActions.length > 0
      ? self.lastActions.map(describeAction).join("; ")
      : "nothing yet";

  const situation = `You think you might be called ${agentDisplayName}.
You are at position (${self.position[0]}, ${self.position[1]}), facing ${Math.round(self.headingDeg)}°.
Your most recent actions, oldest first: ${recentActions}.

Chat history (SenderName: MessageText):
${validatedHistory.data
  .map((msg) => `${senderDisplayName(msg)}: ${msg.text}`)
  .join("\n")}

Your current view is attached. Decide what to say and do now.`;

  const contents = [
    {
      role: "user",
      parts: [
        { text: situation },
        { inlineData: { mimeType: "image/jpeg", data: base64ImageData } },
      ],
    },
  ];

  // @google/genai takes model parameters under `config` (the old SDK's
  // top-level `generationConfig` field is silently ignored).
  const config: GenerateContentConfig = {
    systemInstruction,
    temperature: 0.4,
    topP: 0.7,
    topK: 20,
    candidateCount: 1,
    // Enough headroom that the JSON object never truncates mid-structure —
    // a cut-off response fails parsing and wastes the whole billable call.
    maxOutputTokens: 256,
    responseMimeType: "application/json",
    // Constrained decoding: the model cannot emit fences or malformed JSON.
    responseSchema: aiResponseGeminiSchema,
  };

  const request = {
    model: visionModelConfig.name,
    contents,
    config,
  };

  log.debug("ai.action", "Requesting decision", { agent: agentDisplayName });

  try {
    const genAI = await getGoogleAIClient();
    const result = await retry(() => genAI.models.generateContent(request), {
      attempts: 2,
    });
    const aiResponseText = result.text;

    if (!aiResponseText || !aiResponseText.trim()) {
      log.warn("ai.action", "Empty response", { agent: agentDisplayName });
      return actionError("unavailable");
    }

    // responseSchema guarantees raw JSON (no fences); the try/catch stays as
    // the boundary check.
    let parsedJson;
    try {
      parsedJson = JSON.parse(aiResponseText.trim());
    } catch (jsonParseError) {
      log.error("ai.action", "Failed to parse model JSON", {
        agent: agentDisplayName,
        error: String(jsonParseError),
        raw: aiResponseText,
      });
      return actionError("unavailable");
    }

    const validatedResponse = AIResponseSchema.safeParse(parsedJson);
    if (!validatedResponse.success) {
      log.error("ai.action", "Model JSON failed validation", {
        agent: agentDisplayName,
        details: validatedResponse.error.flatten(),
      });
      return actionError("unavailable");
    }

    if (validatedResponse.data.chatMessage) {
      const aiChatMessage: Message = {
        id: uuidv4(),
        userId: aiAgentId,
        name: agentDisplayName,
        text: validatedResponse.data.chatMessage,
        timestamp: Date.now(),
      };
      await postChatMessageToEvents(aiChatMessage);
    }

    return actionOk(validatedResponse.data);
  } catch (error) {
    log.error("ai.action", "Error generating AI response", {
      agent: agentDisplayName,
      error: error instanceof Error ? error.stack : String(error),
    });
    return actionError("unavailable");
  }
};
