import type { useEventStore } from "@/stores/eventStore";
import type { useRawEyeEventStore } from "@/stores/rawEyeEventStore";

// Debug handles attached by exposeStoreForDebug() outside production.
declare global {
  interface Window {
    __eventStore?: typeof useEventStore;
    __rawEyeEventStore?: typeof useRawEyeEventStore;
  }
}
