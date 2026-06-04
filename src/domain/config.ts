import { z } from "zod";

// Workers-safe shared config helpers. Pure — no `process.env` reads at import
// time — so both the Next.js side and the EventHub Durable Object can use them
// (the DO is bundled by Wrangler and must not import process.env-at-load
// modules; see eventHub.ts).

export const AIAgentSchema = z.object({
  id: z.string(),
  displayName: z.string(),
});
export type AIAgent = z.infer<typeof AIAgentSchema>;

export const DEFAULT_AGENTS: AIAgent[] = [
  { id: "ai-agent-1", displayName: "Orion" },
  { id: "ai-agent-2", displayName: "Nova" },
];

// Parse an integer config value, falling back when missing / invalid / negative.
export const parseConfigInt = (
  value: string | undefined,
  fallback: number,
): number => {
  const parsed = parseInt(String(value ?? ""), 10);
  return isNaN(parsed) || parsed < 0 ? fallback : parsed;
};

// Parse the AI_AGENTS_CONFIG JSON array, falling back to DEFAULT_AGENTS on any
// problem (missing, malformed, or empty).
export const parseAgentsConfig = (
  configJson: string | undefined,
): AIAgent[] => {
  if (!configJson) return DEFAULT_AGENTS;
  try {
    const parsed = z.array(AIAgentSchema).safeParse(JSON.parse(configJson));
    if (parsed.success && parsed.data.length > 0) return parsed.data;
  } catch {
    // fall through to defaults
  }
  return DEFAULT_AGENTS;
};
