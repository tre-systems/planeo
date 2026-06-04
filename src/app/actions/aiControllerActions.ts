"use server";

import { log } from "@/lib/log";

import { generateAiActionAndChat, type ChatHistory } from "./generateMessage";

import type { ParsedAIResponse } from "@/domain/aiAction";

export const requestAiDecision = async (
  aiAgentId: string,
  imageDataUrl: string,
  chatHistory: ChatHistory,
): Promise<ParsedAIResponse["action"]> => {
  const decision = await generateAiActionAndChat(
    aiAgentId,
    imageDataUrl,
    chatHistory,
  );

  if (decision) {
    return decision.action;
  }

  log.warn("ai.controller", "No decision returned; defaulting to no action", {
    agent: aiAgentId,
  });
  return { type: "none" };
};
