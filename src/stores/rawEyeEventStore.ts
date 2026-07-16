import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

import { type Vec3 } from "@/domain";
import { EyeUpdateType } from "@/domain/event";
import { exposeStoreForDebug } from "@/lib/exposeStore";

export interface RawEyeEventState {
  eyes: Record<string, { p?: Vec3; l?: Vec3; name?: string; t: number }>;
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
          // Merge over the existing record so a partial update (e.g. lookAt
          // only) keeps the previously known position and name.
          const existing = state.eyes[eyeUpdate.id];
          const newEyeData: { p?: Vec3; l?: Vec3; name?: string; t: number } = {
            t: eyeUpdate.t,
          };
          const p = eyeUpdate.p ?? existing?.p;
          const l = eyeUpdate.l ?? existing?.l;
          const name = eyeUpdate.name ?? existing?.name;
          if (p) {
            newEyeData.p = p;
          }
          if (l) {
            newEyeData.l = l;
          }
          if (name) {
            newEyeData.name = name;
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
