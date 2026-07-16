import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Builds the SPA into dist/, which the Worker serves via its assets binding.
// `vite dev` proxies /api to a running `wrangler dev` (port 8787) so the UI
// hot-reloads against the real EventHub Durable Object.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    proxy: {
      "/api": "http://localhost:8787",
    },
  },
});
