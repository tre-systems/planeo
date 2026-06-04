"use server";

import { GoogleGenAI, GenerationConfig } from "@google/genai";

import { log } from "./log";
import { retry } from "./retry";

let genAIClient: GoogleGenAI | null = null;

// Shape of a Google AI error that may carry safety feedback we want to log.
interface GoogleAIError extends Error {
  response?: {
    candidates?: Array<{
      safetyRatings?: Array<Record<string, unknown>>;
    }>;
  };
}

// Lazily creates and caches a single GoogleGenAI client from GOOGLE_AI_API_KEY.
export const getGoogleAIClient = async (): Promise<GoogleGenAI> => {
  if (genAIClient) {
    return genAIClient;
  }

  const apiKey = process.env["GOOGLE_AI_API_KEY"];
  if (!apiKey) {
    throw new Error("GOOGLE_AI_API_KEY is not set");
  }

  genAIClient = new GoogleGenAI({ apiKey });
  return genAIClient;
};

// Config for the active text-generation model.
const getActiveTextModel = async () => {
  return {
    provider: "google",
    name: "gemini-2.0-flash-lite",
    displayName: "Gemini 2.0 Flash-Lite",
    maxTokens: 500,
  };
};

// Config for the active vision-capable model.
export const getActiveVisionModel = async () => {
  return {
    provider: "google",
    name: "gemini-1.5-flash-latest",
    displayName: "Gemini 1.5 Flash",
    maxTokens: 500,
  };
};

type AIConfigOverrides = Partial<GenerationConfig>;

// Calls the text model for a completion, returning undefined on error or empty
// output so callers can degrade gracefully.
export const generateTextCompletion = async (
  prompt: string,
  configOverrides?: AIConfigOverrides,
): Promise<string | undefined> => {
  try {
    const genAI: GoogleGenAI = await getGoogleAIClient();
    const textModelConfig = await getActiveTextModel();

    const baseConfig: GenerationConfig = {
      temperature: 0.5,
      topP: 0.8,
      topK: 30,
      frequencyPenalty: 0.3,
      presencePenalty: 0.6,
      candidateCount: 1,
      maxOutputTokens: 150,
    };

    const generationConfig = { ...baseConfig, ...configOverrides };

    const request = {
      model: textModelConfig.name,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig,
      safetySettings: [],
    };

    log.debug("ai.text", "Requesting completion");

    const result = await retry(() => genAI.models.generateContent(request), {
      attempts: 2,
    });
    const text = result.text;

    if (!text || text.trim() === "") {
      log.warn("ai.text", "Empty response from model");
      return undefined;
    }

    return text;
  } catch (error) {
    const gError = error as GoogleAIError;
    log.error("ai.text", "Error during generation", {
      error: error instanceof Error ? error.message : String(error),
      safety: gError.response?.candidates?.[0]?.safetyRatings,
    });
    return undefined;
  }
};
