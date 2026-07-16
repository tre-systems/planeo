import type { useEventStore } from "@/stores/eventStore";
import type { useRawEyeEventStore } from "@/stores/rawEyeEventStore";

// Debug handles attached by exposeStoreForDebug() outside production.
declare global {
  interface Window {
    __eventStore?: typeof useEventStore;
    __rawEyeEventStore?: typeof useRawEyeEventStore;
  }
}

// Allows dot access under noPropertyAccessFromIndexSignature for the one env
// var that MUST be read as `process.env.NODE_ENV` (Vite's static define).
declare global {
  namespace NodeJS {
    interface ProcessEnv {
      NODE_ENV?: "development" | "production" | "test";
    }
  }
}
