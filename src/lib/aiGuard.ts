// Server-side guard for the billable Gemini server actions. Server actions are
// anonymous POST RPCs — any client that can reach the app can invoke them — so
// the cost surface needs its own protection, mirroring the TTS budget cap and
// the EventHub write gate:
//
// - With WORLD_WRITE_TOKEN set, callers must present the token (the host
//   client passes NEXT_PUBLIC_WORLD_WRITE_TOKEN through the action arguments).
// - A rolling one-hour global budget caps total Gemini calls regardless.
//   In-memory state is exact on a single server (the laptop/self-host case)
//   and best-effort per isolate on Workers — a circuit-breaker, not auth.
const AI_RATE_WINDOW_MS = 60 * 60 * 1000;
const aiCallTimes: number[] = [];

// Returns a refusal reason, or undefined when the call may proceed (in which
// case it has been counted against the budget).
export const aiCallBlocked = (writeToken?: string): string | undefined => {
  const required = process.env["WORLD_WRITE_TOKEN"] || "";
  if (required && writeToken !== required) {
    return "Unauthorized";
  }

  const limit = Number.parseInt(
    process.env["RATE_LIMIT_AI_HOURLY"] || "2000",
    10,
  );
  const cutoff = Date.now() - AI_RATE_WINDOW_MS;
  while (aiCallTimes.length > 0 && aiCallTimes[0] < cutoff) {
    aiCallTimes.shift();
  }
  if (aiCallTimes.length >= limit) {
    return "AI rate limit reached";
  }
  aiCallTimes.push(Date.now());
  return undefined;
};
