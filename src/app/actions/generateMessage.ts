"use server";

import { GenerationConfig } from "@google/genai";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";

import { AIResponseSchema, type ParsedAIResponse } from "@/domain/aiAction";
import { isAIAgentId, getAIAgentById } from "@/domain/aiAgent";
import { Message, MessageSchema } from "@/domain/message";
import { generateAudio } from "@/lib/audioService";
import {
  getGoogleAIClient,
  getActiveVisionModel,
  generateTextCompletion,
} from "@/lib/googleAI";

export type ChatHistory = z.infer<typeof MessageSchema>[];

// Broadcast a chat message through the EventHub Durable Object (the single
// real-time authority). Best-effort: failures are logged, not thrown, so a
// missing binding during `next dev` doesn't break the AI loop.
const postChatMessageToEvents = async (message: Message): Promise<void> => {
  try {
    const { env } = getCloudflareContext();
    const stub = env.EVENT_HUB.get(env.EVENT_HUB.idFromName("global"));
    await stub.fetch("https://event-hub/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...message, type: "chatMessage" as const }),
    });
  } catch (error) {
    console.error("EventService: Failed to broadcast via EVENT_HUB:", error);
  }
};

export const generateAiChatMessage = async (
  chatHistory: ChatHistory,
  aiUserId: string,
): Promise<Message | undefined> => {
  const agent = getAIAgentById(aiUserId);
  const agentName = agent?.displayName || aiUserId;

  const historySlice = chatHistory;
  const prompt =
    historySlice
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
    console.log(`AI Chat: ${agentName} did not return a response.`);
    return undefined;
  } catch (error) {
    console.error(
      `AI Chat: Error generating message for ${agentName}:`,
      error instanceof Error ? error.stack : error,
    );
    return undefined;
  }
};

export type AgentAction = ParsedAIResponse["action"];

export const generateAiActionAndChat = async (
  aiAgentId: string,
  imageDataUrl: string,
  chatHistory: ChatHistory,
): Promise<ParsedAIResponse | undefined> => {
  const agent = getAIAgentById(aiAgentId);
  const agentDisplayName = agent?.displayName || aiAgentId;

  const genAI = await getGoogleAIClient();
  const visionModelConfig = await getActiveVisionModel();

  const base64ImageData = imageDataUrl.split(",")[1];
  if (!base64ImageData) {
    console.error("AI Action/Chat: Invalid image data URL format.");
    return undefined;
  }

  const historySlice = chatHistory;

  const systemPrompt = `You awaken with no prior memories of who you are or how you got here. 
  You feel lost, disoriented, scared and freaking out. 
  You are now trying to make sense of your surroundings and remember what you\'ve done recently. 
  Imagine being someone in this situation and act and speak accordingly.

You are provided with an image of your current view.

This is what has been said by you and others:
Chat History (SenderName: MessageText):
${historySlice
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

  const generationConfig: GenerationConfig = {
    temperature: 0.4,
    topP: 0.7,
    topK: 20,
    candidateCount: 1,
    maxOutputTokens: 150,
    responseMimeType: "application/json",
  };

  const request = {
    model: visionModelConfig.name,
    contents,
    generationConfig,
    safetySettings: [],
  };

  console.log(
    `AI Action/Chat Prompt for ${agentDisplayName}:`,
    JSON.stringify(
      {
        ...request,
        contents: [
          {
            ...request.contents[0],
            parts: [
              {
                inlineData: {
                  mimeType: "image/png",
                  data: "<image_data_omitted>",
                },
              },
              request.contents[0].parts[1],
            ],
          },
        ],
      },
      null,
      2,
    ),
  );

  try {
    const result = await genAI.models.generateContent(request);
    const aiResponseText = result.text;

    console.log(
      `AI Action/Chat Raw Response for ${agentDisplayName}:`,
      aiResponseText,
    );

    if (!aiResponseText || !aiResponseText.trim()) {
      console.warn(
        `AI Action/Chat: No response or empty response for ${agentDisplayName}`,
      );
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
      console.error(
        `AI Action/Chat: Error parsing JSON for ${agentDisplayName}:`,
        jsonParseError,
        "Raw response:",
        aiResponseText,
        "Attempted to parse:",
        jsonToParse,
      );
      return undefined;
    }

    const validatedResponse = AIResponseSchema.safeParse(parsedJson);

    if (validatedResponse.success) {
      console.log(
        `AI Action/Chat: Validated response for ${agentDisplayName}:`,
        validatedResponse.data,
      );

      let audioSrcGenerated: string | undefined;

      if (validatedResponse.data.chatMessage) {
        audioSrcGenerated = await generateAudio(
          validatedResponse.data.chatMessage,
        );

        const aiChatMessage: Message = {
          id: uuidv4(),
          userId: aiAgentId,
          name: agentDisplayName,
          text: validatedResponse.data.chatMessage,
          timestamp: Date.now(),
          audioSrc: audioSrcGenerated,
        };
        await postChatMessageToEvents(aiChatMessage);
      }

      await new Promise((resolve) => setTimeout(resolve, 5000));

      return { ...validatedResponse.data, audioSrc: audioSrcGenerated };
    } else {
      console.error(
        `AI Action/Chat: Failed to validate AI JSON for ${agentDisplayName}:`,
        validatedResponse.error.flatten(),
        "Parsed JSON was:",
        parsedJson,
      );
      return undefined;
    }
  } catch (error) {
    console.error(
      `AI Action/Chat: Error generating AI response for ${agentDisplayName}:`,
      error instanceof Error ? error.stack : error,
    );
    return undefined;
  }
};
