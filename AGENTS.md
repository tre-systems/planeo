# Agent Notes

Operational guidance for Claude Code, Codex, and other repo agents working on Planeo.

## Project

Planeo is an interactive 3D web app where a human user and AI agents share one
space. The user moves a first-person camera through a React Three Fiber world
with Rapier physics; AI agents are floating eyeballs that render the scene from
their own viewpoint, send that view to Gemini, and decide how to move and what
to say. User positions, AI chat, and the physics cubes are synchronized between
browsers over Server-Sent Events. It is a Vite + React SPA served by a single
**Cloudflare Worker** (`worker.ts` — the whole server), with a single `EventHub`
Durable Object as the real-time authority. CI redeploys it on every push to
`main` **when the `DEPLOY_ENABLED` repo variable is `true`** — currently unset,
so the app is not presently deployed. The `planeo.tre.systems` custom domain is
configured in `wrangler.jsonc` (`routes`) and takes effect once it is.

Read before substantial work:

- [`ARCHITECTURE.md`](ARCHITECTURE.md) — the comprehensive technical reference:
  system overview, codebase map, patterns, the SSE wire protocol, the AI loop,
  and the constants that matter.
- [`docs/BACKLOG.md`](docs/BACKLOG.md) — known limitations and intentional gaps.
  Read it before "fixing" something that is already a tracked, deliberate quirk.
- [`docs/diagrams/`](docs/diagrams/) — Graphviz architecture diagrams; the
  rendered PNGs are embedded in `ARCHITECTURE.md`.

## Workflow

- Work directly on `main`. Commit and push to `main` — no feature branches,
  worktrees, or PRs unless explicitly asked.
- Check `git status` before editing. Stage only the files owned by the current
  task; avoid `git add -A`.
- A push to `main` triggers CI. It **auto-deploys to Cloudflare Workers** only
  when the `DEPLOY_ENABLED` repo variable is `true` (with the
  `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` secrets); it is currently
  unset, so the app is not presently deployed. Treat a deploy-enabled push to
  `main` as a production deploy.
- After a code change: confirm CI is green. If the app is deployed, smoke-test it
  in a browser (click to start, watch agents move and chat); otherwise verify
  real-time behavior locally with `npm run preview`. Docs-only changes just need
  commit + push.

## Verification

- **Gate before pushing:** `npm run verify` — `eslint --fix`,
  `prettier --write .`, `tsc --noEmit`, the diagram render check, and the vitest
  unit tests. CI's `check` job runs `verify:ci`, the non-fixing equivalent
  (`prettier --check`, `eslint --max-warnings 0`) — so run `verify` locally
  or CI will fail on anything it would have auto-fixed.
- `npm run check` runs `verify` plus the Playwright suite (`--reporter=list`);
  use it when a change could affect runtime behavior.
- `npm run preview` builds the SPA with Vite and serves the full Workers runtime
  with `wrangler dev` (including the `EventHub` Durable Object). Use it to
  verify real-time behavior, which `npm run dev` alone does not exercise.
- Run `npm run cf-typegen` (`wrangler types`) after editing `wrangler.jsonc` to
  regenerate the binding/env types.
- Diagrams: edit the `.dot` sources in [`docs/diagrams/`](docs/diagrams/), then
  `npm run diagrams` to re-render the PNGs (needs Graphviz — `brew install graphviz`);
  `check:diagrams` (part of `verify`) confirms they render. Use Graphviz for
  complex diagrams, inline Mermaid for small ones.
- There is no pre-commit hook in this repo, so run the gate yourself before
  pushing — a red `check` job blocks the deploy.

## Build & Run

- `npm run dev` — Vite dev server with hot reload on <http://localhost:5173>.
  It proxies `/api` to a Worker on port 8787, so run `npm run dev:worker`
  (`wrangler dev`) alongside it for a live `EventHub`.
- `npm run preview` — `vite build && wrangler dev` on <http://localhost:8787>:
  the full Workers runtime, **including** the `EventHub` DO. Use this to test
  real-time.
- `npm run deploy` — `vite build && wrangler deploy` to Cloudflare.
- Secrets go in `.dev.vars` locally (copy from
  [`.dev.vars.example`](.dev.vars.example)); non-secret world config is in
  [`wrangler.jsonc`](wrangler.jsonc) `vars`; client build-time vars
  (`VITE_WORLD_WRITE_TOKEN`, `VITE_TTS_ENABLED`) go in `.env`/`.env.local` and
  are inlined by Vite. The AI loop needs
  `GOOGLE_AI_API_KEY`; live speech needs `GOOGLE_APP_CREDS_JSON`. With no keys
  the world still renders and you can move around, but agents won't think or
  speak.
- Node 22+ (`package.json` `engines`).

## Architecture Rules

- **One `EventHub` Durable Object is the real-time authority.** All cross-client
  state (eyes, boxes, subscribers) lives in the single DO in
  [`src/server/eventHub.ts`](src/server/eventHub.ts), resolved by
  `idFromName("global")` — one instance, in-memory and ephemeral, no separate
  shared store and none needed (the DO is the shared-state primitive). To run
  multiple independent worlds, shard by DO name. The whole server graph
  (`worker.ts` + everything under `src/server/`) is bundled by Wrangler,
  not Vite — import domain schemas from their specific files via relative paths,
  never `@/domain` (the `@/` alias belongs to the Vite build) or modules that
  read env at load time.
- **`src/domain/` schemas are the contracts.** The Zod schemas define the SSE
  wire format (`event.ts`) and the JSON the vision model must return
  (`aiAction.ts` → `AIResponseSchema`). A change there ripples to the `EventHub`
  DO, every client, and the LLM prompt at once — keep them in sync.
- **One client is the simulation host.** The DO elects the oldest connected
  client as `host` (broadcast as a `host` event); only that client drives the AI
  agents and simulates the cubes, while everyone else renders the broadcast
  results. `useAIAgentController` and `Box.tsx` gate on `eventStore.hostId === myId`.
- **Keep agent decisions cheap and paced.** The host paces each agent to roughly
  one decision every 5 s via the interval in `useAIAgentController`'s frame loop
  (`DECISION_MAKING_INTERVAL_MS`) plus a per-agent in-flight lock. The
  `/api/ai/decision` route enforces only a per-agent minimum interval
  (`aiGuard`) as a backstop, not a pacer — removing the client interval will
  hammer the API and the chat.

## Tests

- Unit tests: vitest (`npm test`) covers the pure logic — domain schemas,
  `eventHubLogic`, agent movement math, `retry`.
- End-to-end: Playwright in [`tests/`](tests/) (`basic`, `api`,
  `visual-snapshot`). `npm run test:e2e` builds the SPA and boots `wrangler dev`
  (the full Workers runtime, with `VITE_E2E=true`) on port 8787 automatically;
  first run needs `npx playwright install`.

## Commits

- Match the existing history: short, outcome-focused summaries, conventional-ish
  prefixes (`feat:`, `fix:`, `chore:`, `docs:`) or a plain imperative line.
- No AI-attribution lines in commit messages or in code comments.

## Docs

- Docs describe current behavior in the present tense. Keep history out — no
  changelog, "now implemented", or "used to be X" prose. Git history is the
  record.
- Forward-looking work goes in [`docs/BACKLOG.md`](docs/BACKLOG.md), not as TODO
  narration inside reference docs.
- [`ARCHITECTURE.md`](ARCHITECTURE.md) is the single overview; the files in
  `docs/` are focused per-feature references that link back to it.
