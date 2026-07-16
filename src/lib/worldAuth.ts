// Optional shared write token for the world's POST /api/events surface.
//
// When the EventHub is deployed with a WORLD_WRITE_TOKEN, only clients holding
// the token can post events (eyes, chat, boxes); everyone else is a read-only
// spectator on the SSE stream. That is the intended public shape: the host
// browser (e.g. the machine driving a stream) writes, viewers watch. Leave the
// token unset for open local play.
//
// NEXT_PUBLIC_WORLD_WRITE_TOKEN is inlined into the client bundle at build
// time, so only set it on builds whose users are all trusted writers (the
// laptop/host build) — never on a spectator-facing deployment.

export const worldWriteToken = (): string | undefined =>
  process.env["NEXT_PUBLIC_WORLD_WRITE_TOKEN"] || undefined;

export const worldWriteHeaders = (): Record<string, string> => {
  const token = worldWriteToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};
