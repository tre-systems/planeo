# Claude Code Notes

Read [`AGENTS.md`](AGENTS.md) first — it is the source of truth for workflow,
verification commands, architecture rules, and the code map in this repo.

Key reflexes for Planeo:

- Work on `main` and push there. A push to `main` runs CI and auto-deploys to
  **Cloudflare Workers** once `CLOUDFLARE_API_TOKEN` is set (the app is not
  currently deployed). After a code change confirm CI is green and, once
  deployed, smoke-test the live app. Docs-only changes just need commit + push.
- The gate before pushing is `npm run verify` (prettier, lint, `tsc --noEmit`);
  `npm run check` adds the Playwright e2e suite. `npm run preview` exercises the
  full Workers runtime including the `EventHub` Durable Object.
- All real-time state lives in one `EventHub` Durable Object
  ([`src/server/eventHub.ts`](src/server/eventHub.ts)), the single `global`
  instance — it is the shared-state authority; don't reach for a separate store.
