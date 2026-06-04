# Backlog

Known limitations, deliberate gaps, and forward-looking work. This is the place
to look before "fixing" something that is already a tracked, intentional quirk.

## Known limitations / deliberate gaps

- **Single instance only.** All real-time state (eyes, boxes, subscribers) lives
  in in-memory module globals in
  [`src/app/api/events/sseStore.ts`](../src/app/api/events/sseStore.ts). There is
  no shared store and no persistence — state is lost on restart, and the app
  cannot run on more than one machine. Horizontal scaling needs a shared backing
  store (e.g. Redis pub/sub) first. `fly.toml` pins `max_machines_running = 1`.
- **Vestigial server-side audio.** `generateAudio` in
  [`src/lib/audioService.ts`](../src/lib/audioService.ts) returns a hardcoded
  test clip (a T-Rex roar) and is attached to messages as `audioSrc`, but the
  client never reads `audioSrc`. Live speech actually comes from the separate
  Google Cloud TTS path (`synthesizeSpeechAction` → `ChatMessage.tsx`). The
  server stub and the `audioSrc` plumbing can be removed.
- **Dead `aiVision` SSE event.** `Scene.tsx` periodically captures the human's
  view and POSTs it as an `aiVision` event, but `route.ts` has no handler for
  that type, so it is discarded. The real AI vision path is the
  `requestAiDecision` server action. Either wire it up or drop the capture.
- **Only the first agent replies to text chat.** `useAiChat` always routes
  human chat to `agents[0]`; other agents never answer typed messages (they
  still act and speak via the vision loop).
- **`debug_images/` written in production.** `generateAiActionAndChat` writes
  every captured frame to disk on each decision. Useful for debugging, but it
  runs unconditionally — gate it behind a dev flag or remove it.

## Unused / inconsistent dependencies

- **`better-sqlite3` and `next-auth` are unused.** Neither is imported anywhere
  in `src/` (next-auth survives only as commented-out lines in `tts.ts`). They,
  their `@types`, and the matching `.env`/Dockerfile leftovers (`/data` dir,
  auth/admin/OAuth env vars) can be dropped.
- **`nanoid` is undeclared.** `page.tsx` imports it but it is not in
  `package.json` `dependencies` (it currently resolves transitively). Add it
  explicitly before it breaks.
- **Node version mismatch.** `package.json` requires Node 22+, but the
  `Dockerfile` builds on `node:20-alpine`. Align them.

## Forward-looking work

- **Finish the speech experience** — the Chirp3 TTS path works but the docs
  once described per-message status indicators in the chat UI that aren't built.
- **User-to-user chat** — humans can currently only see AI messages.
- **More agent behavior** — memory across decisions, agent-to-agent dialogue,
  and richer actions beyond `move`/`turn`.
- **Tests** — there are no unit tests. The `src/domain/` Zod schemas and the SSE
  store logic are the highest-value first targets; e2e coverage could move into
  a non-gating CI job.
- **Persistent profiles** — identities are ephemeral `nanoid` ids today.
