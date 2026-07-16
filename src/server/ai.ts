// The billable Gemini calls behind the Worker's /api/ai/* routes. Server-only:
// bundled into the Worker by Wrangler, never by Vite.
import { type GenerateContentConfig } from "@google/genai";
import { z } from "zod";

import {
  actionError,
  actionOk,
  type ActionResult,
} from "../domain/actionResult";
import {
  AIResponseSchema,
  AgentSelfStateSchema,
  type AgentSelfState,
  type ParsedAIResponse,
} from "../domain/aiAction";
import { getAIAgentById, senderDisplayName } from "../domain/aiAgent";
import { Message, MessageSchema } from "../domain/message";
import { log } from "../lib/log";
import { retry } from "../lib/retry";

import {
  agentSystemInstruction,
  aiResponseGeminiSchema,
  buildSituation,
} from "./aiDecisionPrompt";
import { agentDecisionTooSoon, aiCallBlocked } from "./aiGuard";
import {
  getGoogleAIClient,
  getActiveVisionModelName,
  generateTextCompletion,
} from "./googleAI";

// Length-capped: these actions are billable and any client can call them, so
// an unbounded history array must not be able to inflate the prompt. The real
// client sends at most the last 10 messages.
const ChatHistorySchema = z.array(MessageSchema).max(20);
const ImageDataUrlSchema = z.string().startsWith("data:image/jpeg;base64,");

// Broadcast a chat message through the EventHub Durable Object (the single
// real-time authority). Best-effort: failures are logged, not thrown, so a
// broken hub doesn't break the AI loop.
const postChatMessageToEvents = async (
  env: Env,
  message: Message,
): Promise<void> => {
  try {
    const stub = env.EVENT_HUB.get(env.EVENT_HUB.idFromName("global"));
    // Server-side writer: present the write token when the world requires one.
    const token = process.env["WORLD_WRITE_TOKEN"];
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
  env: Env,
  chatHistory: Message[],
  aiUserId: string,
  writeToken?: string,
): Promise<ActionResult<Message>> => {
  // Validate before the guard so an invalid request can't burn a budget slot.
  const validated = ChatHistorySchema.safeParse(chatHistory);
  if (!validated.success || !aiUserId) {
    log.warn("ai.chat", "Invalid input to generateAiChatMessage");
    return actionError("invalid-input");
  }

  const blocked = aiCallBlocked(writeToken);
  if (blocked) {
    log.warn("ai.chat", "Refusing AI chat call", { reason: blocked });
    return actionError(blocked);
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
        id: crypto.randomUUID(),
        userId: aiUserId,
        name: agentName,
        text: aiResponseText.trim(),
        timestamp: Date.now(),
      };
      await postChatMessageToEvents(env, aiMessage);
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

export const generateAiActionAndChat = async (
  env: Env,
  aiAgentId: string,
  imageDataUrl: string,
  chatHistory: Message[],
  selfState: AgentSelfState,
  writeToken?: string,
): Promise<ActionResult<ParsedAIResponse>> => {
  // Validate before the guards so an invalid request can't burn a budget
  // slot or the agent's cadence window.
  const validatedHistory = ChatHistorySchema.safeParse(chatHistory);
  const validatedSelf = AgentSelfStateSchema.safeParse(selfState);
  const base64ImageData = imageDataUrl.split(",")[1];
  if (
    !aiAgentId ||
    !ImageDataUrlSchema.safeParse(imageDataUrl).success ||
    !base64ImageData ||
    !validatedHistory.success ||
    !validatedSelf.success
  ) {
    log.warn("ai.action", "Invalid input to generateAiActionAndChat");
    return actionError("invalid-input");
  }

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

  const agent = getAIAgentById(aiAgentId);
  const agentDisplayName = agent?.displayName || aiAgentId;

  const situation = buildSituation(
    agentDisplayName,
    validatedSelf.data,
    validatedHistory.data,
  );

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
    systemInstruction: agentSystemInstruction,
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
    model: getActiveVisionModelName(),
    contents,
    config,
  };

  log.debug("ai.action", "Requesting decision", { agent: agentDisplayName });

  try {
    const genAI = getGoogleAIClient();
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
        id: crypto.randomUUID(),
        userId: aiAgentId,
        name: agentDisplayName,
        text: validatedResponse.data.chatMessage,
        timestamp: Date.now(),
      };
      await postChatMessageToEvents(env, aiChatMessage);
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
