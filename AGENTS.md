# Agent Notes

Operational guidance for Claude Code, Codex, and other repo agents working on Planeo.

## Project

Planeo is an interactive 3D web app where a human user and AI agents share one
space. The user moves a first-person camera through a React Three Fiber world
with Rapier physics; AI agents are floating eyeballs that render the scene from
their own viewpoint, send that view to Gemini, and decide how to move and what
to say. User positions, AI chat, and the physics cubes are synchronized between
browsers over Server-Sent Events. It is a Next.js app that runs on **Cloudflare
Workers** via the `@opennextjs/cloudflare` adapter, with a single `EventHub`
Durable Object as the real-time authority. It is live at
<https://planeo.rob-gilks.workers.dev>, and CI redeploys it on every push to
`main`. A `planeo.tre.systems` custom domain is an optional one-line
`wrangler.jsonc` add, not yet configured.

Read before substantial work:

- [`ARCHITECTURE.md`](ARCHITECTURE.md) — system overview, codebase map, the SSE
  wire protocol, the AI loop, and the constants that matter.
- [`docs/BACKLOG.md`](docs/BACKLOG.md) — known limitations and intentional gaps.
  Read it before "fixing" something that is already a tracked, deliberate quirk
  (the vestigial audio stub, the dead `aiVision` event, unused deps).
- [`docs/`](docs/) — per-feature detail (AI agents, vision, SSE, chat, physics,
  TTS, camera, cube art).

## Workflow

- Work directly on `main`. Commit and push to `main` — no feature branches,
  worktrees, or PRs unless explicitly asked.
- Check `git status` before editing. Stage only the files owned by the current
  task; avoid `git add -A`.
- A push to `main` triggers CI, which **auto-deploys to Cloudflare Workers**
  once `CLOUDFLARE_API_TOKEN` (and `CLOUDFLARE_ACCOUNT_ID`) secrets are set on
  the repo. Treat a push to `main` as a potential production deploy.
- After a code change: confirm CI is green, then smoke-test
  <https://planeo.rob-gilks.workers.dev> in a browser (click to start, watch
  agents move and chat). Docs-only changes just need commit + push.

## Verification

- **Gate before pushing:** `npm run verify` — `prettier --write .`,
  `next lint --fix`, and `tsc --noEmit`. This is what CI's `check` job runs.
- `npm run check` runs `verify` plus the Playwright suite (`--reporter=list`);
  use it when a change could affect runtime behavior.
- `npm run preview` builds with OpenNext and serves the full Workers runtime
  (including the `EventHub` Durable Object). Use it to verify real-time behavior,
  which `npm run dev` does not exercise.
- Run `npm run cf-typegen` (`wrangler types`) after editing `wrangler.jsonc` to
  regenerate the binding/env types.
- Diagrams: edit the `.dot` sources in [`docs/diagrams/`](docs/diagrams/), then
  `npm run diagrams` to re-render the PNGs (needs Graphviz — `brew install graphviz`);
  `check:diagrams` (part of `verify`) confirms they render. Use Graphviz for
  complex diagrams, inline Mermaid for small ones.
- There is no pre-commit hook in this repo, so run the gate yourself before
  pushing — a red `check` job blocks the deploy.

## Build & Run

- `npm run dev` — Next.js dev server with Turbopack on <http://localhost:3000>.
  UI only: the real-time hub (`/api/events` + the `EventHub` DO) is not served by
  `next dev`.
- `npm run preview` — full Workers runtime (OpenNext build + `wrangler preview`),
  **including** the `EventHub` DO. Use this to test real-time.
- `npm run deploy` — OpenNext build + `wrangler deploy` to Cloudflare.
- Secrets go in `.dev.vars` locally (copy from
  [`.dev.vars.example`](.dev.vars.example)); non-secret world config is in
  [`wrangler.jsonc`](wrangler.jsonc) `vars`. The AI loop needs
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
  multiple independent worlds, shard by DO name. The DO is bundled by Wrangler,
  not Next — import domain schemas from their specific files via relative paths,
  never `@/domain` or modules that read `process.env` at load time.
- **`src/domain/` schemas are the contracts.** The Zod schemas define the SSE
  wire format (`event.ts`) and the JSON the vision model must return
  (`aiAction.ts` → `AIResponseSchema`). A change there ripples to the `EventHub`
  DO, every client, and the LLM prompt at once — keep them in sync.
- **Keep agent decisions cheap and paced.** Each decision is a Gemini vision
  call followed by a deliberate `setTimeout(5000)` server-side pause in
  `generateMessage.ts`. That pause is the rate limiter; removing it will hammer
  the API and the chat.
- The `aiVision` SSE event has no server handler and the server-side
  `generateAudio` stub's `audioSrc` is never read by the client. Don't build on
  either without reading the backlog — they're vestigial, not load-bearing.

## Tests

- End-to-end only, Playwright in [`tests/`](tests/) (`basic`, `api`,
  `visual-snapshot`). `npm run test:e2e` boots the dev server automatically;
  first run needs `npx playwright install`.
- There are no unit tests. The domain schemas and the SSE store are the
  highest-value targets if adding them (see the backlog).

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
