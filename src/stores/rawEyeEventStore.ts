import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

import { type Vec3 } from "@/domain";
import { EyeUpdateType } from "@/domain/event";

export interface RawEyeEventState {
  eyes: Record<string, { p?: Vec3; l?: Vec3; t: number }>;
}

interface RawEyeEventActions {
  setEye: (eyeUpdate: EyeUpdateType) => void;
  removeStaleEyes: (thresholdMs: number) => void;
}

// Augment the Window interface for the debug store
declare global {
  interface Window {
    __rawEyeEventStore?: typeof useRawEyeEventStore;
  }
}

export const useRawEyeEventStore = create<
  RawEyeEventState & RawEyeEventActions
>()(
  immer((set) => ({
    eyes: {},
    setEye: (eyeUpdate) =>
      set((state) => {
        if (eyeUpdate.p || eyeUpdate.l) {
          const newEyeData: { p?: Vec3; l?: Vec3; t: number } = {
            t: eyeUpdate.t,
          };
          if (eyeUpdate.p) {
            newEyeData.p = eyeUpdate.p;
          }
          if (eyeUpdate.l) {
            newEyeData.l = eyeUpdate.l;
          }
          state.eyes[eyeUpdate.id] = newEyeData;
        }
      }),
    removeStaleEyes: (thresholdMs) =>
      set((state) => {
        const now = Date.now();
        for (const id in state.eyes) {
          if (now - state.eyes[id].t > thresholdMs) {
            delete state.eyes[id];
          }
        }
      }),
  })),
);

if (
  typeof window !== "undefined" &&
  (process.env.NODE_ENV !== "production" ||
    process.env["NEXT_PUBLIC_E2E"] === "true")
) {
  window.__rawEyeEventStore = useRawEyeEventStore;
}
