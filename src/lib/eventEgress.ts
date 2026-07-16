// The one client-side door to POST /api/events. Endpoint, auth headers, and
// beacon-vs-fetch policy live here and nowhere else. (The server actions'
// writer is separate by design: it fetches the DO binding directly in
// generateMessage.ts rather than going over public HTTP.)
import { log } from "./log";
import { worldWriteHeaders, worldWriteToken } from "./worldAuth";

const EVENTS_ENDPOINT = "/api/events";

// Fire-and-forget POST of an already-validated event. sendBeacon survives
// page unload but cannot carry the Authorization header, so it is only used
// when the world has no write token; otherwise fall back to a keepalive
// fetch that presents the token.
export const postWorldEvent = (
  payload: unknown,
  onError?: (error: unknown) => void,
): void => {
  const body = JSON.stringify(payload);
  if (!worldWriteToken() && navigator.sendBeacon) {
    navigator.sendBeacon(EVENTS_ENDPOINT, body);
    return;
  }
  fetch(EVENTS_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...worldWriteHeaders() },
    body,
    keepalive: true,
  }).catch((error) => onError?.(error));
};

// Awaited POST that surfaces failures: non-2xx and network errors are logged
// with the human-readable `kind` woven in; `onError` lets a caller react.
export const postWorldEventChecked = async (
  payload: unknown,
  { kind, onError }: { kind: string; onError?: (msg: string) => void },
): Promise<void> => {
  try {
    const response = await fetch(EVENTS_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...worldWriteHeaders() },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = await response.text();
      log.error("sse", `Failed to send ${kind} to server`, {
        status: response.status,
        body: errorData,
      });
      onError?.(`Server error sending ${kind}: ${response.status}`);
    }
  } catch (error) {
    log.error("sse", `Network error sending ${kind}`, {
      error: String(error),
    });
    onError?.(`Network error sending ${kind}`);
  }
};
