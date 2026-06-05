# Backlog

Outstanding work and intentional gaps. Check here before "fixing" something that
is already a tracked, deliberate quirk. The patterns the code follows are in
[`ARCHITECTURE.md`](../ARCHITECTURE.md#patterns).

## Deliberate gaps (intentional — context, not bugs)

- **One shared world, by design.** All real-time state (eyes, boxes, subscribers)
  lives in a single `EventHub` Durable Object resolved by `idFromName("global")` —
  in-memory and ephemeral, no external store needed. For multiple worlds, shard by
  DO name rather than adding a backing store.
- **Agent POV thumbnails are host-only.** Only the host renders each agent's
  offscreen view, so the `AIAgentViews` HUD stays blank on viewer clients — that
  redundant per-frame work is exactly what the host model removes.
- **`next dev` serves the UI only.** The real-time hub (`/api/events` + the DO)
  runs only under the Workers runtime; use `npm run preview` to exercise it.
- **Auto-deploy paused.** CI deploys only when the `DEPLOY_ENABLED` repo variable
  is `true` (currently unset). The `planeo.tre.systems` custom domain is already
  configured in `wrangler.jsonc` and takes effect once deploy is re-enabled.

## Outstanding work

Prioritised, P1 (highest value) → P3. None are known bugs in shipped behavior.

### P2 — maintainability & robustness

- **Break up the remaining large files.** `useAIAgentController` (318 lines) mixes
  camera setup, offscreen capture, the decision call, and movement; `eventStore`
  mixes the connection, listener registries, and senders. Extract cohesive units.
  (`eventHub`'s pure logic is already split into `eventHubLogic.ts`.)
- **Single top-level animation-tick loop.** Three `useFrame` updaters (`boxStore`,
  `eyesStore`, `useAIAgentController`) run independently; one tick would unify
  frame-rate handling.
- **Seamless host handoff.** On host change the sim freezes briefly and cube
  velocities aren't migrated (boxes resume at rest); snapshot velocity into the
  `host` event for a clean handoff.
- **Broader `useShallow`.** The frame-driven container selectors (`Eyes`, `Box`,
  `useAIAgentController`) still read whole records — low impact, since the
  over-render is masked by the frame loop.

### P3 — minor

- `googleAI`: make `getActiveTextModel` / `getActiveVisionModel` sync (they return
  static literals) — needs the one caller's `await` removed to satisfy the
  await-thenable lint, so it's not a single-file change.
- **Wire-format version field on `EventSchema`.** No version discriminant, so a
  long-lived DO can't detect client contract drift during a rollout — add one when
  the wire format next changes.

### Product / features

- **Multi-agent text chat.** `useAiChat` routes human chat only to `agents[0]`;
  let other agents answer typed messages too (they already act and speak via the
  vision loop).
- **Richer agent behavior.** Memory across decisions, agent-to-agent dialogue, and
  actions beyond `move` / `turn`.
- **User-to-user chat.** Humans currently only see AI messages.
- **Persistent profiles.** Identities are ephemeral `nanoid` ids today.
- **Speech UI polish.** The Chirp3 TTS path works; there are no per-message
  playback/status indicators in the chat UI.
- **SSE → WebSocket + DO hibernation.** A bidirectional transport with hibernation
  would cut idle cost and simplify egress; a bigger change — evaluate when needed.
- **Re-add PWA.** `next-pwa` was removed (no service worker today); a
  Workers-compatible SW such as Serwist could restore offline/installable support.

### Ops / hygiene

- **Run the Playwright e2e in CI** as a non-gating job (it runs locally via
  `npm run check`).
- **Dependency bump.** `npm audit` flags 19 issues, but all are dev/build-tooling
  transitive (eslint, playwright, wrangler, postcss toolchains) or non-exploitable
  in our usage (the prod `uuid` finding needs a `buf` argument we never pass) —
  none reach the deployed worker. Clear them on a deliberate `npm run deps:update`
  pass rather than a risky 28-package `audit fix`.
