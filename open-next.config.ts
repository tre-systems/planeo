import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Default cache (in-memory). This app has minimal SSG/ISR, so no R2 incremental
// cache is configured.
export default defineCloudflareConfig({});
