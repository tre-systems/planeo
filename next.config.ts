import type { NextConfig } from "next";

import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {};

// Gives `next dev` access to Cloudflare bindings (e.g. the EVENT_HUB Durable
// Object) via getCloudflareContext(). The full Workers runtime — including the
// real-time hub at /api/events — is exercised by `npm run preview`.
initOpenNextCloudflareForDev();

export default nextConfig;
