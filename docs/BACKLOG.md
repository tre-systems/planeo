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
- **One simulation host, best-effort handoff.** The DO elects the oldest
  connected client as the host that drives the AI agents and the cube physics
  (broadcast as a `host` event). If the host disconnects the next-oldest takes
  over from the last broadcast state — but there's a sub-second gap with no host
  (the sim briefly freezes), and in-flight physics velocities aren't migrated, so
  boxes resume from their last broadcast pose at rest. Acceptable here; a true
  handoff would snapshot velocities into the `host` event.
- **Agent POV thumbnails are host-only.** Only the host renders each agent's
  offscreen view, so the `AIAgentViews` HUD thumbnails stay blank on viewer
  clients (the agents still move and chat for everyone). Rendering them on every
  client is exactly the redundant per-frame work the host model removes.
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

The patterns the code follows are documented in
[`ARCHITECTURE.md`](../ARCHITECTURE.md#patterns). The earlier consistency
deviations have been reconciled: one canonical `EyeUpdate` schema; graceful
server-action failure (`getGoogleAIClient` inside the try) with `safeParse`d
inputs; one Workers-safe config helper ([`src/domain/config.ts`](../src/domain/config.ts))
shared by the actions and the DO; immer + a shared debug-handle helper across
stores; casts removed after parsing; a structured logger
([`src/lib/log.ts`](../src/lib/log.ts)) + retry/backoff
([`src/lib/retry.ts`](../src/lib/retry.ts)) on the Gemini/TTS/OAuth calls;
`useShallow` on the chat toggle; SSE teardown on unmount; and the vestigial
`aiVision` and `generateAudio`/`audioSrc` paths removed.

Deliberately not done yet:

- **Single top-level animation-tick loop.** Three `useFrame` updaters
  (`boxStore`, `eyesStore`, `useAIAgentController`) still run independently.
  Centralizing them would unify frame-rate handling, but it's a refactor of
  working render code with no concrete bug, so it's left for now.
- **Wire-format version field on `EventSchema`.** There's no version discriminant
  on events, so a long-lived Durable Object can't detect contract drift across
  client versions during a rollout. Add one when the wire format next changes.
- **Eye-update egress isn't validated.** Box and chat egress run through
  `safeParse` before sending; eye updates (hot path, every 100 ms) do not — low
  value, since the client constructs them itself, but it's the one asymmetry left.
- **Broader `useShallow`.** Only `ChatToggleButton` was converted; the
  frame-driven container selectors (`Eyes`, `Box`, `useAIAgentController`) still
  subscribe to whole records, though the over-render is masked by the frame loop.
- **`useAIAgentController`'s `getMessages`** is a value, not a getter — a
  misleading name worth renaming.

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
