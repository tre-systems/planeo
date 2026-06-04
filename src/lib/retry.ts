// Retry an async function with capped exponential backoff + jitter. Returns the
// result, or throws the last error after `attempts` tries. Used on the external
// API calls (Gemini, TTS, Google OAuth) so a single transient failure doesn't
// drop a decision or some speech.

export const retry = async <T>(
  fn: () => Promise<T>,
  opts: { attempts?: number; baseMs?: number } = {},
): Promise<T> => {
  const attempts = opts.attempts ?? 3;
  const baseMs = opts.baseMs ?? 250;
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (i < attempts - 1) {
        const delay = baseMs * 2 ** i + Math.floor(Math.random() * baseMs);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
};
