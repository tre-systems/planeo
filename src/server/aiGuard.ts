// Server-side guard for the billable Gemini server actions. Server actions are
// anonymous POST RPCs — any client that can reach the app can invoke them — so
// the cost surface needs its own protection, mirroring the TTS budget cap and
// the EventHub write gate:
//
// - With WORLD_WRITE_TOKEN set, callers must present the token (the host
//   client passes NEXT_PUBLIC_WORLD_WRITE_TOKEN through the action arguments).
// - A rolling one-hour global budget caps total Gemini calls regardless.
// - A per-agent minimum decision interval enforces the host's ~5 s pacing
//   server-side, so a buggy or hostile caller can't drain the hourly budget
//   in minutes.
//
// In-memory state is exact on a single server (the laptop/self-host case)
// and best-effort per isolate on Workers — a circuit-breaker, not auth.
import { parseConfigInt } from "../domain/config";

import type { ActionFailureReason } from "../domain/actionResult";

const AI_RATE_WINDOW_MS = 60 * 60 * 1000;
const aiCallTimes: number[] = [];

// Returns a refusal reason, or undefined when the call may proceed (in which
// case it has been counted against the budget).
export const aiCallBlocked = (
  writeToken?: string,
): ActionFailureReason | undefined => {
  const required = process.env["WORLD_WRITE_TOKEN"] || "";
  if (required && writeToken !== required) {
    return "unauthorized";
  }

  // parseConfigInt (not parseInt): a malformed value would yield NaN, and
  // `length >= NaN` is always false — the budget would silently be unlimited.
  const limit = parseConfigInt(process.env["RATE_LIMIT_AI_HOURLY"], 2000);
  const cutoff = Date.now() - AI_RATE_WINDOW_MS;
  while (aiCallTimes.length > 0 && aiCallTimes[0] < cutoff) {
    aiCallTimes.shift();
  }
  if (aiCallTimes.length >= limit) {
    return "rate-limited";
  }
  aiCallTimes.push(Date.now());
  return undefined;
};

// Slightly looser than the client's DECISION_MAKING_INTERVAL_MS (5 s) so
// normal pacing never trips it.
const MIN_DECISION_INTERVAL_MS = 4000;
const lastDecisionAt = new Map<string, number>();

// Per-agent decision cadence floor. Returns true (and does not record the
// call) when the agent decided too recently.
export const agentDecisionTooSoon = (agentId: string): boolean => {
  const now = Date.now();
  const last = lastDecisionAt.get(agentId);
  if (last !== undefined && now - last < MIN_DECISION_INTERVAL_MS) {
    return true;
  }
  lastDecisionAt.set(agentId, now);
  return false;
};
