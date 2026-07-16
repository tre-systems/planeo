/// <reference types="vite/client" />

// Build-time client env vars (inlined by Vite; set in .env / .env.local).
interface ImportMetaEnv {
  // Write token for gated worlds — trusted-writer builds only (see worldAuth).
  readonly VITE_WORLD_WRITE_TOKEN?: string;
  // "false" disables client-side TTS playback.
  readonly VITE_TTS_ENABLED?: string;
  // "true" exposes the debug store handles for the e2e suite.
  readonly VITE_E2E?: string;
}
