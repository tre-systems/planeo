"use server";

import { type GenerateContentConfig } from "@google/genai";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";

import { AIResponseSchema, type ParsedAIResponse } from "@/domain/aiAction";
import { isAIAgentId, getAIAgentById } from "@/domain/aiAgent";
import { Message, MessageSchema } from "@/domain/message";
import { aiCallBlocked } from "@/lib/aiGuard";
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
const ImageDataUrlSchema = z.string().startsWith("data:image/png;base64,");

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
): Promise<Message | undefined> => {
  const blocked = aiCallBlocked(writeToken);
  if (blocked) {
    log.warn("ai.chat", "Refusing AI chat call", { reason: blocked });
    return undefined;
  }

  const validated = ChatHistorySchema.safeParse(chatHistory);
  if (!validated.success || !aiUserId) {
    log.warn("ai.chat", "Invalid input to generateAiChatMessage");
    return undefined;
  }

  const agent = getAIAgentById(aiUserId);
  const agentName = agent?.displayName || aiUserId;

  const prompt =
    validated.data
      .map((msg) => {
        const senderName =
          msg.name ||
          (isAIAgentId(msg.userId)
            ? getAIAgentById(msg.userId)?.displayName || "AI"
            : "User");
        return `${senderName}: ${msg.text}`;
      })
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
      return aiMessage;
    }
    log.info("ai.chat", "No response", { agent: agentName });
    return undefined;
  } catch (error) {
    log.error("ai.chat", "Error generating message", {
      agent: agentName,
      error: error instanceof Error ? error.stack : String(error),
    });
    return undefined;
  }
};

export const generateAiActionAndChat = async (
  aiAgentId: string,
  imageDataUrl: string,
  chatHistory: ChatHistory,
  writeToken?: string,
): Promise<ParsedAIResponse | undefined> => {
  const blocked = aiCallBlocked(writeToken);
  if (blocked) {
    log.warn("ai.action", "Refusing AI decision call", { reason: blocked });
    return undefined;
  }

  const validatedHistory = ChatHistorySchema.safeParse(chatHistory);
  if (
    !aiAgentId ||
    !ImageDataUrlSchema.safeParse(imageDataUrl).success ||
    !validatedHistory.success
  ) {
    log.warn("ai.action", "Invalid input to generateAiActionAndChat");
    return undefined;
  }

  const agent = getAIAgentById(aiAgentId);
  const agentDisplayName = agent?.displayName || aiAgentId;
  const visionModelConfig = getActiveVisionModel();

  const base64ImageData = imageDataUrl.split(",")[1];
  if (!base64ImageData) {
    log.warn("ai.action", "Invalid image data URL format", {
      agent: agentDisplayName,
    });
    return undefined;
  }

  const systemPrompt = `You awaken with no prior memories of who you are or how you got here. 
  You feel lost, disoriented, scared and freaking out. 
  You are now trying to make sense of your surroundings and remember what you\'ve done recently. 
  Imagine being someone in this situation and act and speak accordingly.

You are provided with an image of your current view.

This is what has been said by you and others:
Chat History (SenderName: MessageText):
${chatHistory
  .map((msg) => {
    const senderName =
      msg.name ||
      (isAIAgentId(msg.userId)
        ? getAIAgentById(msg.userId)?.displayName || msg.userId
        : "User");
    return `${senderName}: ${msg.text}`;
  })
  .join("\n")}

You think you might be called ${agentDisplayName}

When describing your observations, clearly distinguish between what you are *currently seeing*, what you *saw previously*, and what you *recall from the chat history or previous actions*. For example, say 'I currently see...' or 'I previously saw...' or 'I recall we discussed...'.

Actively explore your surroundings. Turning to scan the area is a good way to find new things or understand your location better. If you see something interesting, you can turn to get a better look or move towards it. Try to interact with objects and other beings you encounter.

If you see an image on a cube that you recognize (e.g., a famous painting), briefly mention what it is, who painted it, and a small interesting fact or piece of history about it if you know. Keep this part concise.

Talk to other entities. Keep your messages BRIEF, like one sentence or a question. Share only essential observations, feelings, or questions. 
Discuss your situation with them and try to make plans together. 
Figure out who you are and work together. 

Respond, to other entities, seek them out. Figure out who you are and work together. Don't keep repeating their names.

Output Format: Respond with a single JSON object adhering to this structure:
\\\`\\\`\\\`json
{
  "chatMessage": "Your brief message. (e.g., \'I spot an eye!\', \'What is this cube?\', \'Is anyone there?\', \'What should we do next?\')",
  "action": {
    "type": "move" | "turn" | "none",
    // Conditional properties based on 'type':
    // For "turn": { "direction": "left" | "right", "degrees": number_between_30_and_45 }
    // For "move": { "direction": "forward" | "backward", "distance": number_of_grid_squares }
    // For "none": {}
  }
}
\\\`\\\`\\\`

Action Examples:
- Scan: { "type": "turn", "direction": "right", "degrees": 34 }
- Approach eye/object: { "type": "move", "direction": "forward", "distance": 2 }

Your response:`;

  const contents = [
    {
      role: "user",
      parts: [
        { inlineData: { mimeType: "image/png", data: base64ImageData } },
        { text: systemPrompt },
      ],
    },
  ];

  // @google/genai takes model parameters under `config` (the old SDK's
  // top-level `generationConfig` field is silently ignored).
  const config: GenerateContentConfig = {
    temperature: 0.4,
    topP: 0.7,
    topK: 20,
    candidateCount: 1,
    // Enough headroom that the JSON object never truncates mid-structure —
    // a cut-off response fails parsing and wastes the whole billable call.
    maxOutputTokens: 256,
    responseMimeType: "application/json",
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
      return undefined;
    }

    let jsonToParse = aiResponseText.trim();
    if (jsonToParse.startsWith("```json") && jsonToParse.endsWith("```")) {
      jsonToParse = jsonToParse.substring(7, jsonToParse.length - 3).trim();
    } else if (jsonToParse.startsWith("```") && jsonToParse.endsWith("```")) {
      jsonToParse = jsonToParse.substring(3, jsonToParse.length - 3).trim();
    }

    let parsedJson;
    try {
      parsedJson = JSON.parse(jsonToParse);
    } catch (jsonParseError) {
      log.error("ai.action", "Failed to parse model JSON", {
        agent: agentDisplayName,
        error: String(jsonParseError),
        raw: aiResponseText,
      });
      return undefined;
    }

    const validatedResponse = AIResponseSchema.safeParse(parsedJson);
    if (!validatedResponse.success) {
      log.error("ai.action", "Model JSON failed validation", {
        agent: agentDisplayName,
        details: validatedResponse.error.flatten(),
      });
      return undefined;
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

    return validatedResponse.data;
  } catch (error) {
    log.error("ai.action", "Error generating AI response", {
      agent: agentDisplayName,
      error: error instanceof Error ? error.stack : String(error),
    });
    return undefined;
  }
};
