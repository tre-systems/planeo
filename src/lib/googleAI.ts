// Server-only helper — NOT a "use server" module. A "use server" directive
// here would publish generateTextCompletion (arbitrary prompt, caller-chosen
// config, no aiGuard) as an anonymous public server-action endpoint.
import "server-only";

import { GoogleGenAI, type GenerateContentConfig } from "@google/genai";

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
//
// Defaults target Gemini 3.1 Flash-Lite — the cheapest current multimodal tier,
// right for a high-volume agent loop. Override per deployment via env
// (GOOGLE_TEXT_MODEL / GOOGLE_VISION_MODEL) so model churn never needs a code
// change: Google retires model ids aggressively (every 1.5 and 2.0 id now 404s).
const getActiveTextModel = () => {
  return {
    provider: "google",
    name: process.env["GOOGLE_TEXT_MODEL"] || "gemini-3.1-flash-lite",
  };
};

// Config for the active vision-capable model.
export const getActiveVisionModel = () => {
  return {
    provider: "google",
    name: process.env["GOOGLE_VISION_MODEL"] || "gemini-3.1-flash-lite",
  };
};

type AIConfigOverrides = Partial<GenerateContentConfig>;

// Calls the text model for a completion, returning undefined on error or empty
// output so callers can degrade gracefully.
export const generateTextCompletion = async (
  prompt: string,
  configOverrides?: AIConfigOverrides,
): Promise<string | undefined> => {
  try {
    const genAI: GoogleGenAI = await getGoogleAIClient();
    const textModelConfig = getActiveTextModel();

    // @google/genai takes model parameters under `config` (the old
    // @google/generative-ai SDK's top-level `generationConfig`/`safetySettings`
    // fields are silently ignored).
    const baseConfig: GenerateContentConfig = {
      temperature: 0.5,
      topP: 0.8,
      topK: 30,
      frequencyPenalty: 0.3,
      presencePenalty: 0.6,
      candidateCount: 1,
      maxOutputTokens: 150,
    };

    const request = {
      model: textModelConfig.name,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: { ...baseConfig, ...configOverrides },
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
