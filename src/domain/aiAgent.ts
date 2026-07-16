import { type AIAgent, parseAgentsConfig } from "./config";

// AI agents come from AI_AGENTS_CONFIG (parsed + validated in config.ts), or the
// Orion/Nova defaults. Memoized so the env var is parsed once per context.
let parsedAIAgents: AIAgent[] | null = null;

export const getAIAgents = (): AIAgent[] => {
  if (parsedAIAgents !== null) return parsedAIAgents;
  // Shared with the client bundle, where `process` does not exist — browsers
  // always get the defaults (see BACKLOG: AI_AGENTS_CONFIG is server-only).
  const raw =
    typeof process === "undefined"
      ? undefined
      : process.env["AI_AGENTS_CONFIG"];
  parsedAIAgents = parseAgentsConfig(raw);
  return parsedAIAgents;
};

export const isAIAgentId = (userId: string): boolean =>
  getAIAgents().some((agent) => agent.id === userId);

export const getAIAgentById = (userId: string): AIAgent | undefined =>
  getAIAgents().find((agent) => agent.id === userId);

// The one display-name fallback chain for a message sender: explicit name,
// else the agent's configured displayName, else the raw user id. Every
// prompt-builder and UI label uses this so the chains can't drift apart.
export const senderDisplayName = (msg: {
  userId: string;
  name?: string | undefined;
}): string =>
  msg.name ||
  (isAIAgentId(msg.userId)
    ? getAIAgentById(msg.userId)?.displayName || msg.userId
    : msg.userId);
