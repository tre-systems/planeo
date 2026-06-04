# Backlog

Known limitations, deliberate gaps, and forward-looking work. This is the place
to look before "fixing" something that is already a tracked, intentional quirk.

## Known limitations / deliberate gaps

- **One shared world, by design.** All real-time state (eyes, boxes,
  subscribers) lives in a single `EventHub` Durable Object
  ([`src/server/eventHub.ts`](../src/server/eventHub.ts)), resolved by
  `idFromName("global")`. This is intentional: the DO is the shared-state
  authority, so no Redis or external store is needed. State is in-memory and
  ephemeral — it lives only while the DO is active and is not persisted. To
  support multiple independent worlds, shard by DO name (one instance per world)
  rather than introducing a separate backing store.
- **Vestigial server-side audio.** `generateAudio` in
  [`src/lib/audioService.ts`](../src/lib/audioService.ts) returns a hardcoded
  test clip (a T-Rex roar) and is attached to messages as `audioSrc`, but the
  client never reads `audioSrc`. Live speech actually comes from the separate
  Google Cloud TTS path (`synthesizeSpeechAction` → `ChatMessage.tsx`). The
  server stub and the `audioSrc` plumbing can be removed.
- **Dead `aiVision` SSE event.** `Scene.tsx` periodically captures the human's
  view and POSTs it as an `aiVision` event. `EventSchema` accepts the type, but
  the `EventHub` DO's `handlePost` has no branch for it, so it is discarded. The
  real AI vision path is the `requestAiDecision` server action. Either wire it up
  or drop the capture.
- **Only the first agent replies to text chat.** `useAiChat` always routes
  human chat to `agents[0]`; other agents never answer typed messages (they
  still act and speak via the vision loop).
- **`next dev` serves the UI only.** The real-time hub (`/api/events` + the
  `EventHub` DO) is wired in `worker.ts` and only runs under the Workers runtime.
  Use `npm run preview` to exercise real-time locally.
- **Not deployed; no custom domain.** CI deploys to a `*.workers.dev` URL on
  push to `main` once `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID` are set. The
  `planeo.tre.systems` custom domain is an optional one-line `wrangler.jsonc` add
  and is not yet configured.
- **PWA dropped.** `next-pwa` is removed, so there is no service worker /
  offline support (the `manifest.json` link in `layout.tsx` remains). It could
  be re-added with a Workers-compatible service worker such as Serwist.

## Forward-looking work

- **Finish the speech experience** — the Chirp3 TTS path works but the docs
  once described per-message status indicators in the chat UI that aren't built.
- **User-to-user chat** — humans can currently only see AI messages.
- **More agent behavior** — memory across decisions, agent-to-agent dialogue,
  and richer actions beyond `move`/`turn`.
- **Tests** — there are no unit tests. The `src/domain/` Zod schemas and the
  `EventHub` DO logic are the highest-value first targets; e2e coverage could
  move into a non-gating CI job.
- **Persistent profiles** — identities are ephemeral `nanoid` ids today.
