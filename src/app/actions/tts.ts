"use server";

import { z } from "zod";

import { getGoogleAccessToken } from "@/lib/googleAuth";
import { log } from "@/lib/log";
import { retry } from "@/lib/retry";

// Google Cloud Text-to-Speech via the REST API (the gRPC @google-cloud/* client
// does not run on the Cloudflare Workers runtime). Auth is a service-account
// OAuth token minted in googleAuth.ts.

const TTS_ENDPOINT = "https://texttospeech.googleapis.com/v1/text:synthesize";

const chirp3Voices = [
  "en-GB-Chirp3-HD-Aoede",
  "en-GB-Chirp3-HD-Charon",
  "en-GB-Chirp3-HD-Fenrir",
  "en-GB-Chirp3-HD-Kore",
  "en-GB-Chirp3-HD-Leda",
  "en-GB-Chirp3-HD-Orus",
  "en-GB-Chirp3-HD-Puck",
  "en-GB-Chirp3-HD-Zephyr",
  "en-IN-Chirp3-HD-Aoede",
  "en-IN-Chirp3-HD-Charon",
  "en-IN-Chirp3-HD-Fenrir",
  "en-IN-Chirp3-HD-Kore",
  "en-IN-Chirp3-HD-Leda",
  "en-IN-Chirp3-HD-Orus",
  "en-IN-Chirp3-HD-Puck",
  "en-IN-Chirp3-HD-Zephyr",
  "en-US-Chirp3-HD-Aoede",
  "en-US-Chirp3-HD-Charon",
  "en-US-Chirp3-HD-Fenrir",
  "en-US-Chirp3-HD-Kore",
  "en-US-Chirp3-HD-Leda",
  "en-US-Chirp3-HD-Orus",
  "en-US-Chirp3-HD-Puck",
  "en-US-Chirp3-HD-Zephyr",
];

const SynthesizeSpeechParamsSchema = z.object({
  text: z.string().min(1, "Text cannot be empty."),
  userId: z.string().min(1, "User ID cannot be empty."),
  voiceName: z.string().optional(),
});

type SynthesizeSpeechParams = z.infer<typeof SynthesizeSpeechParamsSchema>;

export interface SynthesizeSpeechResult {
  audioBase64?: string;
  error?: string;
}

// Deterministically map a userId to a voice so each speaker is consistent.
const getVoiceForUser = (userId: string): string => {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    const char = userId.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  const voiceIndex = Math.abs(hash) % chirp3Voices.length;
  return chirp3Voices[voiceIndex];
};

const performSynthesis = async (
  text: string,
  voiceName: string,
  languageCode: string,
): Promise<{ audioBase64?: string; error?: string }> => {
  try {
    const audioContent = await retry(
      async () => {
        const token = await getGoogleAccessToken();
        const res = await fetch(TTS_ENDPOINT, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            input: { text },
            voice: { name: voiceName, languageCode },
            audioConfig: { audioEncoding: "MP3" },
          }),
        });
        if (!res.ok) {
          throw new Error(
            `TTS ${res.status}: ${(await res.text()).slice(0, 200)}`,
          );
        }
        // The REST API returns audioContent already base64-encoded.
        const data = (await res.json()) as { audioContent?: string };
        if (!data.audioContent) throw new Error("No audio content");
        return data.audioContent;
      },
      { attempts: 2 },
    );
    return { audioBase64: audioContent };
  } catch (error) {
    log.error("tts", "Synthesis error", { error: String(error) });
    return {
      error: error instanceof Error ? error.message : "TTS synthesis failed.",
    };
  }
};

export const synthesizeSpeechAction = async (
  params: SynthesizeSpeechParams,
): Promise<SynthesizeSpeechResult> => {
  const ttsEnabled = process.env["NEXT_PUBLIC_TTS_ENABLED"] !== "false";
  if (!ttsEnabled) {
    return { audioBase64: "", error: "TTS is disabled." };
  }

  const validationResult = SynthesizeSpeechParamsSchema.safeParse(params);
  if (!validationResult.success) {
    log.warn("tts", "Invalid parameters", {
      details: validationResult.error.flatten(),
    });
    return { error: "Invalid parameters." };
  }

  const { text, userId, voiceName: preferredVoiceName } = validationResult.data;
  const voiceName = preferredVoiceName || getVoiceForUser(userId);
  const languageCode = voiceName.split("-").slice(0, 2).join("-");

  return performSynthesis(text, voiceName, languageCode);
};
