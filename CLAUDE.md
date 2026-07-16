# Claude Code Notes

Read [`AGENTS.md`](AGENTS.md) first — it is the source of truth for workflow,
verification commands, architecture rules, and the code map in this repo.

Key reflexes for Planeo:

- Work on `main` and push there. A push to `main` runs CI; it deploys to
  **Cloudflare Workers** only when the `DEPLOY_ENABLED` repo variable is `true`
  (currently unset, so the app is not presently deployed). After a code change
  confirm CI is green and verify runtime behavior with `npm run preview` (or
  smoke-test the live app if deploy is re-enabled). Docs-only changes just need
  commit + push.
- The gate before pushing is `npm run verify` (eslint, prettier, `tsc --noEmit`,
  diagram check, vitest unit tests); CI runs the non-fixing `verify:ci`.
  `npm run check` adds the Playwright e2e suite. `npm run preview`
  (`vite build && wrangler dev`) exercises the full Workers runtime including
  the `EventHub` Durable Object; plain `npm run dev` is the Vite dev server,
  which proxies `/api` to a separate `npm run dev:worker`.
- All real-time state lives in one `EventHub` Durable Object
  ([`src/server/eventHub.ts`](src/server/eventHub.ts)), the single `global`
  instance — it is the shared-state authority; don't reach for a separate store.
