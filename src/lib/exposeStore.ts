// Attach a Zustand store to `window[name]` for debugging — only outside
// production (or under NEXT_PUBLIC_E2E for e2e). No-op on the server. The
// window types live in src/types/global.d.ts.
export const exposeStoreForDebug = (name: string, store: unknown): void => {
  if (typeof window === "undefined") return;
  if (import.meta.env.PROD && import.meta.env["VITE_E2E"] !== "true") {
    return;
  }
  (window as unknown as Record<string, unknown>)[name] = store;
};
