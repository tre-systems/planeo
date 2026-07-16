// Typed client for the Worker's billable API routes. Each wrapper POSTs JSON
// with the optional write token as a Bearer header and returns the server's
// ActionResult envelope; transport failures collapse to "unavailable" so
// callers handle exactly one failure shape.
import type { ActionResult } from "@/domain/actionResult";
import type { AgentSelfState, ParsedAIResponse } from "@/domain/aiAction";
import type { Message } from "@/domain/message";

const postAction = async <T>(
  path: string,
  body: unknown,
  writeToken?: string,
): Promise<ActionResult<T>> => {
  try {
    const response = await fetch(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(writeToken ? { Authorization: `Bearer ${writeToken}` } : {}),
      },
      body: JSON.stringify(body),
    });
    return (await response.json()) as ActionResult<T>;
  } catch {
    return { ok: false, reason: "unavailable" };
  }
};

export const generateAiActionAndChat = (
  agentId: string,
  imageDataUrl: string,
  chatHistory: Message[],
  selfState: AgentSelfState,
  writeToken?: string,
): Promise<ActionResult<ParsedAIResponse>> =>
  postAction(
    "/api/ai/decision",
    { agentId, imageDataUrl, chatHistory, selfState },
    writeToken,
  );

export const generateAiChatMessage = (
  chatHistory: Message[],
  agentId: string,
  writeToken?: string,
): Promise<ActionResult<Message>> =>
  postAction("/api/ai/chat", { agentId, chatHistory }, writeToken);

export const synthesizeSpeechAction = (params: {
  text: string;
  userId: string;
}): Promise<ActionResult<{ audioBase64: string }>> =>
  postAction("/api/tts", params);
