// Shared real-time lifecycle constants. Imported by both the EventHub Durable
// Object (via relative path — it is Wrangler-bundled) and the client, so the
// two sides purge on the same clock: the DO drops stale eyes silently (no
// removal event exists on the wire), and each client must run the same sweep.
export const EYE_MAX_AGE_MS = 30_000;
export const EYE_PURGE_INTERVAL_MS = 10_000;

// The offscreen size at which each AI agent's view is rendered and captured
// (the render target, the capture readback, and the HUD thumbnail's aspect).
export const AGENT_VIEW_WIDTH = 320;
export const AGENT_VIEW_HEIGHT = 200;
