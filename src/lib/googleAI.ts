"use server";

import { GoogleGenAI, GenerationConfig } from "@google/genai";

import { log } from "./log";
import { retry } from "./retry";

// Singleton client instance
let genAIClient: GoogleGenAI | null = null;

/**
 * Interface for Google AI errors, attempting to capture potential safety feedback.
 */
interface GoogleAIError extends Error {
  response?: {
    candidates?: Array<{
      safetyRatings?: Array<Record<string, unknown>>;
    }>;
  };
}

/**
 * Initializes and returns a singleton GoogleGenAI client.
 * Uses the GOOGLE_AI_API_KEY environment variable.
 * @returns {Promise<GoogleGenAI>} The initialized GoogleGenAI client.
 * @throws Will throw an error if initialization fails.
 */
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

/**
 * Retrieves the configuration for the active text generation model.
 * @returns {Promise<object>} Model configuration.
 */
export const getActiveTextModel = async () => {
  return {
    provider: "google",
    name: "gemini-2.0-flash-lite", // Updated from gemini-1.5-flash-latest to gemini-2.0-flash-lite
    displayName: "Gemini 2.0 Flash-Lite",
    maxTokens: 500, // Example value, adjust as needed
  };
};

/**
 * Retrieves the configuration for the active vision-capable model.
 * @returns {Promise<object>} Model configuration.
 */
export const getActiveVisionModel = async () => {
  return {
    provider: "google",
    name: "gemini-1.5-flash-latest", // Corrected to gemini-1.5-flash-latest
    displayName: "Gemini 1.5 Flash",
    maxTokens: 500, // Example value, adjust as needed
  };
};

/**
 * Type for overriding parts of the AI generation configuration.
 */
export type AIConfigOverrides = Partial<GenerationConfig>;

/**
 * Calls a Google AI model for text completion based on a prompt.
 * @param {string} prompt - The input prompt for the AI.
 * @param {AIConfigOverrides} [configOverrides] - Optional overrides for the generation config.
 * @returns {Promise<string | undefined>} The AI-generated text, or undefined if an error occurs or no text is generated.
 */
export const generateTextCompletion = async (
  prompt: string,
  configOverrides?: AIConfigOverrides,
): Promise<string | undefined> => {
  try {
    const genAI: GoogleGenAI = await getGoogleAIClient();
    const textModelConfig = await getActiveTextModel(); // Using the specific text model

    const baseConfig: GenerationConfig = {
      temperature: 0.5,
      topP: 0.8,
      topK: 30,
      frequencyPenalty: 0.3,
      presencePenalty: 0.6,
      candidateCount: 1,
      maxOutputTokens: 150, // Default for general text, can be overridden
    };

    const generationConfig = { ...baseConfig, ...configOverrides };

    const request = {
      model: textModelConfig.name, // Use the dynamically fetched model name
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig,
      safetySettings: [], // Consider making safety settings configurable
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
    return undefined; // Return undefined on error to allow graceful handling
  }
};
