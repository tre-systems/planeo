// Tiny structured logger: one-line JSON with a level + scope, so server and
// Worker logs (Cloudflare observability is on) are greppable instead of ad-hoc
// `console.*`. Dependency-free and safe on the Workers runtime.

type Level = "debug" | "info" | "warn" | "error";

// Debug lines are development-only chatter (per-decision, per-subscriber);
// keep them out of production consoles and Workers observability. Must stay
// dot-notation: Vite statically replaces exactly `process.env.NODE_ENV` in
// the client bundle (bracket access would crash — no `process` in browsers).
const debugEnabled = process.env.NODE_ENV !== "production";

const emit = (
  level: Level,
  scope: string,
  message: string,
  fields?: Record<string, unknown>,
): void => {
  const line = JSON.stringify({ level, scope, message, ...fields });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
};

export const log = {
  debug: (scope: string, message: string, fields?: Record<string, unknown>) => {
    if (debugEnabled) emit("debug", scope, message, fields);
  },
  info: (scope: string, message: string, fields?: Record<string, unknown>) =>
    emit("info", scope, message, fields),
  warn: (scope: string, message: string, fields?: Record<string, unknown>) =>
    emit("warn", scope, message, fields),
  error: (scope: string, message: string, fields?: Record<string, unknown>) =>
    emit("error", scope, message, fields),
};
