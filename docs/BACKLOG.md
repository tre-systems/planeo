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
- **No custom domain yet.** The app is live at `planeo.rob-gilks.workers.dev`
  (CI auto-deploys on push to `main`). A `planeo.tre.systems` custom domain is an
  optional one-line `wrangler.jsonc` add and is not yet configured.
- **PWA dropped.** `next-pwa` is removed, so there is no service worker /
  offline support (the `manifest.json` link in `layout.tsx` remains). It could
  be re-added with a Workers-compatible service worker such as Serwist.

## Pattern consistency & gaps

The patterns the code is built from are documented in
[`ARCHITECTURE.md`](../ARCHITECTURE.md#patterns). These are the places it does
not yet follow them, and patterns worth adopting.

### Deviations to reconcile

- **Duplicate `EyeUpdateType`.** Two same-named types from different schemas flow
  through the same code: `event.ts`'s `EyeUpdateSchema` (`Vec3` tuple) and
  `eye.ts`'s `EyeUpdatePayloadSchema` (`array().length(3)`). Only the `event.ts`
  one actually validates anything. Collapse to one canonical schema. _(Highest
  value — a latent correctness hazard.)_
- **`getGoogleAIClient()` runs outside the try** in `generateAiActionAndChat`
  (`generateMessage.ts`), so a missing `GOOGLE_AI_API_KEY` surfaces as a 500
  instead of the graceful `undefined` the rest of the function returns.
- **Server-action error contracts vary** four ways (return `undefined` /
  return `{ error }` / throw → 500 / coerce to `{ type: "none" }`). Pick one;
  drop the never-produced `SynthesizeSpeechResult.rateLimitError`.
- **Server-action inputs aren't validated** — only `tts.ts` parses its params;
  the AI actions trust `chatHistory`/`imageDataUrl`/`aiAgentId`. Parse at the
  action boundary like the DO does (the schemas already exist).
- **Config validation is partial and duplicated.** `env.ts` validates only
  `TOTAL_AGENTS`/`NUMBER_OF_BOXES`; other vars are read raw; the DO re-implements
  int parsing and `DEFAULT_AGENTS`; box/agent defaults live in three places
  (`env.ts`, `eventHub.ts`, `wrangler.jsonc`). Consolidate into one Workers-safe
  shared config helper/schema.
- **State-store idioms aren't uniform.** `aiVisionStore`/`simulationStore` use
  plain spreads instead of immer; the `window.__store` debug-handle block is
  copy-pasted in two stores (and `__rawEyeEventStore` is declared twice) while
  the most debug-relevant stores expose nothing. Factor one helper, apply evenly.
- **Selector discipline.** `ChatToggleButton` subscribes to the whole
  `communicationStore` (re-renders on every message); no `useShallow` anywhere,
  so container selectors over-render.
- **No teardown.** `eventStore.disconnect` and `rawEyeEventStore.removeStaleEyes`
  are never called — the `EventSource` is never closed and stale peers rely on
  `syncEyes` diffing. Wire teardown/reset on disconnect.
- **Casts defeat parsing.** `eventStore` re-casts (`as EyeUpdateType`, …) values
  the `safeParse` already narrowed; eye-update egress isn't validated though box
  and chat egress are.
- **Ad-hoc logging.** `eyesStore.syncEyes` logs on every raw-eye update (hot
  path); logging elsewhere uses ~6 prefix styles and the DO logs nothing.
- **Vestigial paths are active waste.** The `aiVision` POST (full base64 PNG on
  every move) and the `generateAudio`/`audioSrc` round-trip (every decision) run
  but are never consumed — see the deliberate-gaps entries above; removing them
  applies the "one live path" intent. A stale `sseStore` comment also lingers in
  `aiControllerActions.ts`.

### Patterns worth adopting

- **A uniform `Result<T>` (or consistently `undefined`) for server actions**, with
  graceful degradation when a key/credential is missing.
- **One validated `env` object** for all variables — Workers-safe (no
  `process.env` at import) so the DO and the actions share it.
- **Parse-at-the-boundary for server-action inputs**, reusing the existing schemas.
- **A tiny structured logger** (one-line JSON; Workers observability is already
  on) to replace the ad-hoc `console.*`.
- **Retry/backoff** on the three external `fetch`es (Gemini, TTS, OAuth) — none
  retry today, so a transient 5xx silently drops a decision or some speech.
- **`useShallow` + selector discipline**, a single top-level animation tick loop,
  and a single source of truth for `myId` (context/store) instead of threading a
  ref and a string through five hooks.
- **A wire-format version field** on `EventSchema`, so a long-lived Durable Object
  can detect contract drift across client versions during a rollout.

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
