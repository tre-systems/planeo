import { defineConfig } from "vitest/config";

// Unit tests live next to the code as `src/**/*.test.ts` (node environment).
// End-to-end tests are Playwright (`tests/*.spec.ts`) and are run separately.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
