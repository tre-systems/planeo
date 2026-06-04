# Claude Code Notes

Read [`AGENTS.md`](AGENTS.md) first — it is the source of truth for workflow,
verification commands, architecture rules, and the code map in this repo.

Key reflexes for Planeo:

- Work on `main` and push there. A push to `main` runs CI and auto-deploys to
  Fly.io once `FLY_API_TOKEN` is set, so after a code change confirm CI is green
  and smoke-test <https://planeo.fly.dev>. Docs-only changes just need commit + push.
- The gate before pushing is `npm run verify` (prettier, lint, `tsc --noEmit`);
  `npm run check` adds the Playwright e2e suite.
- The server keeps all real-time state in memory ([`sseStore.ts`](src/app/api/events/sseStore.ts)),
  so the app is single-instance by design — don't assume horizontal scaling.
