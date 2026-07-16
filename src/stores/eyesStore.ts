import { ShaderMaterial, Vector3 } from "three";
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

import { EyeUpdateType } from "@/domain/event";
import { EYE_Y_POSITION } from "@/domain/sceneConstants";

// Render state for one eye. The Vector3/ShaderMaterial fields are class
// instances immer does not draft: .copy()/.lerp() mutate them in place,
// produce no new state, and notify no subscriber — they are only safe to
// read from frame loops, never through selectors expecting re-renders.
export type EyeStatus = "appearing" | "visible" | "disappearing";

export interface EyeState {
  id: string;
  name?: string | undefined;
  position: Vector3;
  targetPosition: Vector3;
  lookAt: Vector3;
  targetLookAt: Vector3;
  opacity: number;
  scale: number;
  status: EyeStatus;
  material: ShaderMaterial;
  conversationalTargetId?: string | undefined;
}

export const INITIAL_SCALE = 0.01;
export const TARGET_SCALE = 1.0;
export const FADE_DURATION = 1.0;

const CONVERSATION_DISTANCE_THRESHOLD = 5;

type EyesState = {
  managedEyes: Record<string, EyeState>;
};

type EyesActions = {
  syncEyes: (
    eyes: EyeUpdateType[],
    myId: string,
    baseShaderMaterial: ShaderMaterial,
  ) => void;
  updateEyeAnimations: (delta: number) => void;
  updateAIAgentTarget: (
    agentId: string,
    targetPosition: Vector3,
    targetLookAt: Vector3,
  ) => void;
};

export type { EyeState as ManagedEye };

export const useEyesStore = create<EyesState & EyesActions>()(
  immer((set) => ({
    managedEyes: {},

    syncEyes: (eyes, myId, baseShaderMaterial) =>
      set((state) => {
        const incomingEyeIds = new Set(eyes.map((eye) => eye.id));

        for (const eyeData of eyes) {
          if (eyeData.id === myId) continue;

          const existingEye = state.managedEyes[eyeData.id];

          if (existingEye) {
            if (eyeData.p) {
              const positionVec = new Vector3(...eyeData.p);
              positionVec.y = EYE_Y_POSITION;
              existingEye.targetPosition.copy(positionVec);
            }
            if (eyeData.l) {
              const lookAtVec = new Vector3(...eyeData.l);
              existingEye.targetLookAt.copy(lookAtVec);
            }
            if (eyeData.name) {
              existingEye.name = eyeData.name;
            }
            if (existingEye.status === "disappearing") {
              existingEye.status = "appearing";
            }
          } else {
            const positionVec = eyeData.p
              ? new Vector3(...eyeData.p)
              : new Vector3();
            positionVec.y = EYE_Y_POSITION;
            const lookAtVec = eyeData.l
              ? new Vector3(...eyeData.l)
              : new Vector3(0, EYE_Y_POSITION, 1);
            state.managedEyes[eyeData.id] = {
              id: eyeData.id,
              name: eyeData.name,
              position: positionVec.clone(),
              targetPosition: positionVec.clone(),
              lookAt: lookAtVec.clone(),
              targetLookAt: lookAtVec.clone(),
              opacity: 0,
              scale: INITIAL_SCALE,
              status: "appearing" as EyeStatus,
              material: baseShaderMaterial.clone(),
              conversationalTargetId: undefined,
            };
          }
        }

        // Pair up nearby eyes so each gazes at a conversational partner.
        const eyeIds = Object.keys(state.managedEyes).filter(
          (id) => id !== myId,
        );
        for (let i = 0; i < eyeIds.length; i++) {
          const eye1 = state.managedEyes[eyeIds[i]];
          if (!eye1 || eye1.status === "disappearing") continue;

          // Drop the current partner if it left or drifted out of range.
          if (eye1.conversationalTargetId) {
            const targetEye = state.managedEyes[eye1.conversationalTargetId];
            if (
              !targetEye ||
              targetEye.status === "disappearing" ||
              eye1.position.distanceTo(targetEye.position) >
                CONVERSATION_DISTANCE_THRESHOLD
            ) {
              eye1.conversationalTargetId = undefined;
            }
          }

          // Otherwise pick the first free, in-range eye as a new partner. The
          // pairing is one-way here; the partner links back on its own pass.
          if (!eye1.conversationalTargetId) {
            for (let j = 0; j < eyeIds.length; j++) {
              if (i === j) continue;
              const eye2 = state.managedEyes[eyeIds[j]];
              if (
                !eye2 ||
                eye2.status === "disappearing" ||
                eye2.conversationalTargetId
              )
                continue;

              if (
                eye1.position.distanceTo(eye2.position) <
                CONVERSATION_DISTANCE_THRESHOLD
              ) {
                eye1.conversationalTargetId = eye2.id;
                break;
              }
            }
          }
        }

        for (const id in state.managedEyes) {
          if (id === myId) continue;
          if (!incomingEyeIds.has(id)) {
            if (state.managedEyes[id].status !== "disappearing") {
              state.managedEyes[id].status = "disappearing";
            }
          }
        }
      }),

    updateEyeAnimations: (delta) =>
      set((state) => {
        // Scale by delta*60 so the visual speed matches the base factor at
        // 60 FPS regardless of actual frame rate (same normalization as
        // boxStore.updateBoxAnimations).
        const lerpFactor = Math.min(0.05 * delta * 60, 1);

        for (const id in state.managedEyes) {
          const eye = state.managedEyes[id];

          if (!eye.position.equals(eye.targetPosition)) {
            eye.position.lerp(eye.targetPosition, lerpFactor);
            eye.position.y = EYE_Y_POSITION;
          }

          // Gaze at the conversational partner's centre, or drop a partner that
          // is gone or fading out.
          if (eye.conversationalTargetId) {
            const targetEye = state.managedEyes[eye.conversationalTargetId];
            if (targetEye && targetEye.status !== "disappearing") {
              eye.targetLookAt.copy(targetEye.position);
            } else {
              eye.conversationalTargetId = undefined;
            }
          }

          if (!eye.lookAt.equals(eye.targetLookAt)) {
            eye.lookAt.lerp(eye.targetLookAt, lerpFactor);
          }

          if (eye.status === "appearing") {
            eye.opacity += delta / FADE_DURATION;
            eye.scale =
              INITIAL_SCALE +
              (TARGET_SCALE - INITIAL_SCALE) * Math.min(eye.opacity, 1);

            if (eye.opacity >= 1) {
              eye.opacity = 1;
              eye.scale = TARGET_SCALE;
              eye.status = "visible";
            }
          } else if (eye.status === "disappearing") {
            eye.opacity -= delta / FADE_DURATION;
            eye.scale =
              INITIAL_SCALE +
              (TARGET_SCALE - INITIAL_SCALE) * Math.max(eye.opacity, 0);

            if (eye.opacity <= 0) {
              // The material is a per-eye clone rendered via <primitive>, so
              // R3F won't dispose it — release the GPU program reference here.
              eye.material.dispose();
              delete state.managedEyes[id];
              continue;
            }
          }
        }
      }),

    updateAIAgentTarget: (agentId, targetPosition, targetLookAt) =>
      set((state) => {
        const eye = state.managedEyes[agentId];
        if (eye) {
          eye.targetPosition.copy(targetPosition);
          eye.targetLookAt.copy(targetLookAt);
          eye.conversationalTargetId = undefined;
        }
      }),
  })),
);
