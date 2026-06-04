# Agent Notes

Operational guidance for Claude Code, Codex, and other repo agents working on Planeo.

## Project

Planeo is an interactive 3D web app where a human user and AI agents share one
space. The user moves a first-person camera through a React Three Fiber world
with Rapier physics; AI agents are floating eyeballs that render the scene from
their own viewpoint, send that view to Gemini, and decide how to move and what
to say. User positions, AI chat, and the physics cubes are synchronized between
browsers over Server-Sent Events. It is a Next.js app configured to deploy to
Fly.io (app `planeo`, region `lhr`) as a single machine that scales to zero.
It is **not currently deployed** — the `planeo.fly.dev` hostname does not
resolve — and CI deploys it on push to `main` once a `FLY_API_TOKEN` secret is
set (see Workflow). The deploy target would be <https://planeo.fly.dev>.

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
- A push to `main` triggers CI, which **auto-deploys to Fly.io** once a
  `FLY_API_TOKEN` secret is set on the repo. Treat a push to `main` as a
  potential production deploy.
- After a code change: confirm CI is green. Once the app is deployed, smoke-test
  it in a browser (click to start, watch agents move and chat). Docs-only changes
  just need commit + push.

## Verification

- **Gate before pushing:** `npm run verify` — `prettier --write .`,
  `next lint --fix`, and `tsc --noEmit`. This is what CI's `check` job runs.
- `npm run check` runs `verify` plus the Playwright suite (`--reporter=list`);
  use it when a change could affect runtime behavior.
- There is no pre-commit hook in this repo, so run the gate yourself before
  pushing — a red `check` job blocks the deploy.

## Build & Run

- `npm run dev` — Next.js dev server with Turbopack on <http://localhost:3000>.
- `npm run build` / `npm run start` — production standalone build and serve.
- Requires `.env.local` (copy from [`.env.example`](.env.example)). The AI loop
  needs `GOOGLE_AI_API_KEY` and `NEXT_PUBLIC_APP_URL`; live speech needs
  `GOOGLE_APP_CREDS_JSON`. With no keys the world still renders and you can move
  around, but agents won't think or speak.
- Node 22+ (`package.json` `engines`). Note the Dockerfile pins Node 20 — see
  the backlog.

## Architecture Rules

- **Single instance only.** All cross-client state (eyes, boxes, subscribers)
  lives in in-memory module globals in
  [`src/app/api/events/sseStore.ts`](src/app/api/events/sseStore.ts) — no shared
  store. Broadcasts reach only clients on the same process. Do not assume
  horizontal scaling; `fly.toml` pins `max_machines_running = 1`. Adding a
  second machine requires a shared backing store (Redis/pub-sub) first.
- **`src/domain/` schemas are the contracts.** The Zod schemas define the SSE
  wire format (`event.ts`) and the JSON the vision model must return
  (`aiAction.ts` → `AIResponseSchema`). A change there ripples to the server
  route, every client, and the LLM prompt at once — keep them in sync.
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
