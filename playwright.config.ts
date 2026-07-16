import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env["CI"],
  retries: process.env["CI"] ? 2 : 0,
  workers: process.env["CI"] ? 1 : "50%",
  reporter: [["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:8787",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    // The real-time hub (/api/events) lives in the EventHub Durable Object,
    // which only runs under the Workers runtime — so e2e builds the SPA and
    // serves it with `wrangler dev`. VITE_E2E exposes the debug stores the
    // multi-user sync specs read.
    command: "VITE_E2E=true npm run preview",
    url: "http://localhost:8787",
    timeout: 180_000,
    reuseExistingServer: !process.env["CI"],
    stdout: "pipe",
    stderr: "pipe",
  },
});
