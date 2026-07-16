// HTTP handlers for the Worker's billable API routes. Every route parses its
// body at the boundary, extracts the optional write token from the
// Authorization header, and returns the ActionResult as JSON — the same
// envelope the client's typed wrappers expect. Guards (token, budgets,
// cadence) live inside the called functions.
import { z } from "zod";

import { AgentSelfStateSchema } from "../domain/aiAction";
import { MessageSchema } from "../domain/message";

import { generateAiActionAndChat, generateAiChatMessage } from "./ai";
import { synthesizeSpeech } from "./tts";

import type { ActionResult } from "../domain/actionResult";

const bearerToken = (request: Request): string | undefined => {
  const auth = request.headers.get("authorization") ?? "";
  return auth.startsWith("Bearer ") ? auth.slice(7) : undefined;
};

const INVALID: ActionResult<never> = { ok: false, reason: "invalid-input" };

const readJson = async (request: Request): Promise<unknown | undefined> => {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
};

// Body shapes are loose here (fields present, sane types); the called
// functions re-validate strictly and enforce the length caps.
const DecisionBodySchema = z.object({
  agentId: z.string().min(1),
  imageDataUrl: z.string(),
  chatHistory: z.array(MessageSchema).max(20),
  selfState: AgentSelfStateSchema,
});

const ChatBodySchema = z.object({
  agentId: z.string().min(1),
  chatHistory: z.array(MessageSchema).max(20),
});

const TtsBodySchema = z.object({
  text: z.string(),
  userId: z.string(),
});

export const handleAiDecision = async (
  request: Request,
  env: Env,
): Promise<Response> => {
  const body = DecisionBodySchema.safeParse(await readJson(request));
  if (!body.success) return Response.json(INVALID, { status: 400 });
  const result = await generateAiActionAndChat(
    env,
    body.data.agentId,
    body.data.imageDataUrl,
    body.data.chatHistory,
    body.data.selfState,
    bearerToken(request),
  );
  return Response.json(result);
};

export const handleAiChat = async (
  request: Request,
  env: Env,
): Promise<Response> => {
  const body = ChatBodySchema.safeParse(await readJson(request));
  if (!body.success) return Response.json(INVALID, { status: 400 });
  const result = await generateAiChatMessage(
    env,
    body.data.chatHistory,
    body.data.agentId,
    bearerToken(request),
  );
  return Response.json(result);
};

export const handleTts = async (request: Request): Promise<Response> => {
  const body = TtsBodySchema.safeParse(await readJson(request));
  if (!body.success) return Response.json(INVALID, { status: 400 });
  const result = await synthesizeSpeech(body.data);
  return Response.json(result);
};
