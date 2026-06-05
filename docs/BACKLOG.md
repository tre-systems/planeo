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

### P1 — correctness & robustness

- **Resolve the dead eye fade-in scale.** `eyesStore` animates an `eye.scale`
  (`INITIAL_SCALE → TARGET_SCALE`) that nothing renders — `Eyes.tsx` can't scale a
  kinematic `RigidBody`. Either apply it to a mesh child or delete the dead state.
- **Durable Object unit tests.** `eventHub` host election, the `setEye`/`setBox`
  merges, and `purgeStale` have no unit coverage; add
  `@cloudflare/vitest-pool-workers`.
- **Wire-format version field on `EventSchema`.** No version discriminant, so a
  long-lived DO can't detect client contract drift during a rollout.
- **Seamless host handoff.** On host change the sim freezes briefly and cube
  velocities aren't migrated (boxes resume at rest); snapshot velocity into the
  `host` event for a clean handoff.

### P2 — maintainability & consistency

- **Single top-level animation-tick loop.** Three `useFrame` updaters (`boxStore`,
  `eyesStore`, `useAIAgentController`) run independently; one tick would unify
  frame-rate handling.
- **Break up the large files.** `useAIAgentController` (318 lines), `eventHub`
  (310), and `eventStore` (289) each mix several concerns — e.g. the agent's
  vision capture vs. decision loop, or the DO's SSE plumbing vs. state mutations.
- **DRY the event-store senders.** `throttledSendBoxUpdate` and `sendChatMessage`
  duplicate the POST + `safeParse` + error-handling block; extract one helper.
- **Broader `useShallow`.** Only `ChatToggleButton` uses it; the frame-driven
  container selectors (`Eyes`, `Box`, `useAIAgentController`) still read whole
  records (the over-render is masked by the frame loop).
- **Validate eye-update egress.** Box and chat egress `safeParse` before sending;
  the eye-update hot path does not — the one asymmetry left.
- **Rename `useAIAgentController`'s `getMessages`** — it is a value, not a getter.

### P3 — minor cleanups (opportunistic; do when next in the file)

- `sceneConstants`: collapse the duplicate `GRID_Y_POSITION` / `GROUND_Y_POSITION`
  (both `-20`).
- `utils`: consolidate `roundVec3` / `roundArray` (identical rounding logic).
- `googleAI`: make `getActiveTextModel` / `getActiveVisionModel` sync (they return
  static literals) and drop the unread `displayName` / `maxTokens` fields.
- `eyesStore`: remove the inert `changed` bookkeeping in `updateEyeAnimations` and
  the unreachable `Vector3` re-init guards in `updateAIAgentTarget`.
- `eventHub`: drop the redundant `p || l` / `p || o` guards in `handlePost` — the
  `.refine()`d schemas already enforce them.
- `box.ts`: drop the no-op `BoxEventSchema.extend({ type })` (identical to
  `BoxSchema`).
- `tts.ts`: reuse the exported `SynthesizeSpeechResult` type for `performSynthesis`'s
  inline return.
- `tests/api.spec.ts`: factor out the repeated `window as …` intersection cast.
- `tsconfig`: scope `@playwright/test` types to the test files instead of globally.
- Delete the stale local `debug_images/` directory and its `.gitignore` /
  `.prettierignore` entries (no code writes it anymore).

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

- **Triage `npm audit`** (19 findings: 1 low / 9 moderate / 9 high) — likely mostly
  transitive/dev; resolve the real ones.
- **Run the Playwright e2e in CI** as a non-gating job (it runs locally via
  `npm run check`).
