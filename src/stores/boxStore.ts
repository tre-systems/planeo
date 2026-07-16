import { enableMapSet } from "immer";
import { Vector3, Euler, MathUtils } from "three";
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

import {
  type BoxEventType,
  type ValidatedBoxUpdatePayloadType,
} from "@/domain/box";
import { log } from "@/lib/log";

enableMapSet(); // Immer needs this to mutate the boxes Map in place.

// The Vector3/Euler fields are class instances immer does not draft: mutations
// to them are in-place and non-reactive — only safe to read from frame loops,
// never through selectors expecting re-renders. (Same caveat as eyesStore.)
export interface AnimatedBoxState {
  id: string;
  // Current animated values, lerped toward the server target each frame.
  currentP: Vector3;
  currentO: Euler; // Euler (not Quaternion) so each axis lerps independently.
  // Latest authoritative target from the server.
  targetP: Vector3;
  targetO: Euler;
  c: string;
  t: number;
}

interface BoxStoreState {
  boxes: Map<string, AnimatedBoxState>;
  handleBoxEvent: (boxData: BoxEventType) => void;
  updateBoxAnimations: (delta: number, lerpFactor?: number) => void;
  optimisticallySetBoxState: (update: ValidatedBoxUpdatePayloadType) => void;
}

const DEFAULT_LERP_FACTOR = 0.1;

export const useBoxStore = create<BoxStoreState>()(
  immer((set) => ({
    boxes: new Map(),

    handleBoxEvent: (boxData) => {
      if (!boxData || !boxData.p || !boxData.o || !boxData.c) {
        log.warn("box", "Ignoring incomplete box event", { boxData });
        return;
      }

      set((state) => {
        const existingBox = state.boxes.get(boxData.id);
        const targetPosition = new Vector3(...boxData.p);
        const targetOrientation = new Euler(
          boxData.o[0],
          boxData.o[1],
          boxData.o[2],
          existingBox?.currentO.order || "XYZ",
        );

        if (existingBox) {
          existingBox.targetP.copy(targetPosition);
          existingBox.targetO.copy(targetOrientation);
          existingBox.c = boxData.c;
          existingBox.t = boxData.t;
        } else {
          state.boxes.set(boxData.id, {
            id: boxData.id,
            currentP: targetPosition.clone(),
            currentO: targetOrientation.clone(),
            targetP: targetPosition.clone(),
            targetO: targetOrientation.clone(),
            c: boxData.c,
            t: boxData.t,
          });
        }
      });
    },

    updateBoxAnimations: (delta, lerpFactor = DEFAULT_LERP_FACTOR) => {
      set((state) => {
        // Scale by delta*60 so the visual speed matches `lerpFactor` at 60 FPS
        // regardless of the actual frame rate.
        const adjustedLerpFactor = Math.min(lerpFactor * delta * 60, 1);

        for (const box of state.boxes.values()) {
          if (!box.currentP.equals(box.targetP)) {
            box.currentP.lerp(box.targetP, adjustedLerpFactor);
          }
          if (!box.currentO.equals(box.targetO)) {
            box.currentO.x = MathUtils.lerp(
              box.currentO.x,
              box.targetO.x,
              adjustedLerpFactor,
            );
            box.currentO.y = MathUtils.lerp(
              box.currentO.y,
              box.targetO.y,
              adjustedLerpFactor,
            );
            box.currentO.z = MathUtils.lerp(
              box.currentO.z,
              box.targetO.z,
              adjustedLerpFactor,
            );
          }
        }
      });
    },

    optimisticallySetBoxState: (update) => {
      set((state) => {
        const box = state.boxes.get(update.id);
        if (box) {
          if (update.p) {
            const newPos = new Vector3(...update.p);
            box.currentP.copy(newPos);
            box.targetP.copy(newPos);
          }
          if (update.o) {
            // Preserve the box's existing Euler order so copy() stays consistent.
            const newEuler = new Euler(
              update.o[0],
              update.o[1],
              update.o[2],
              box.currentO.order || "XYZ",
            );
            box.currentO.copy(newEuler);
            box.targetO.copy(newEuler);
          }
          box.t = Date.now();
        }
      });
    },
  })),
);
