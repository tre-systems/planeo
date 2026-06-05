import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

// Unit tests live next to the code as `src/**/*.test.ts` (node environment).
// End-to-end tests are Playwright (`tests/*.spec.ts`) and are run separately.
export default defineConfig({
  resolve: {
    // Resolve the project's `@/` alias (from tsconfig paths) in tests too, so a
    // module under test can use it the same way the rest of the app does.
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
