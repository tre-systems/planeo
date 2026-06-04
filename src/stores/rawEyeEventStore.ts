import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

import { type Vec3 } from "@/domain";
import { EyeUpdateType } from "@/domain/event";
import { exposeStoreForDebug } from "@/lib/exposeStore";

export interface RawEyeEventState {
  eyes: Record<string, { p?: Vec3; l?: Vec3; t: number }>;
}

interface RawEyeEventActions {
  setEye: (eyeUpdate: EyeUpdateType) => void;
  removeStaleEyes: (thresholdMs: number) => void;
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

exposeStoreForDebug("__rawEyeEventStore", useRawEyeEventStore);
