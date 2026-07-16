// The one failure shape for every server action. Callers can then tell a
// refusal apart from an empty success ("the model chose to do nothing") and
// back off instead of hammering a surface that will keep refusing.
export type ActionFailureReason =
  | "unauthorized" // write token required and missing/wrong
  | "rate-limited" // budget or cadence guard refused the call
  | "invalid-input" // request failed schema validation
  | "unavailable"; // feature disabled, or the upstream call/model failed

export type ActionResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: ActionFailureReason };

export const actionOk = <T>(value: T): ActionResult<T> => ({
  ok: true,
  value,
});

export const actionError = (
  reason: ActionFailureReason,
): { ok: false; reason: ActionFailureReason } => ({ ok: false, reason });
