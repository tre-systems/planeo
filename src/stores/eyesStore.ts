import { ShaderMaterial, Vector3 } from "three";
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

import { EyeUpdateType } from "@/domain/event";
import {
  EyeState,
  EyeStatus,
  INITIAL_SCALE,
  TARGET_SCALE,
  FADE_DURATION,
} from "@/domain/eye";
import { EYE_Y_POSITION } from "@/domain/sceneConstants";

const CONVERSATION_DISTANCE_THRESHOLD = 5; // Example threshold, adjust as needed

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
  removeEye: (id: string) => void;
  setManyManagedEyes: (newEyes: Record<string, EyeState>) => void;
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
              conversationalTargetId: undefined, // Initialize with no target
            };
          }
        }

        // Conversational logic
        const eyeIds = Object.keys(state.managedEyes).filter(
          (id) => id !== myId,
        );
        for (let i = 0; i < eyeIds.length; i++) {
          const eye1 = state.managedEyes[eyeIds[i]];
          if (!eye1 || eye1.status === "disappearing") continue;

          // Clear previous conversational target if the target is gone or too far
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

          // Find a new conversational target if not already in one
          if (!eye1.conversationalTargetId) {
            for (let j = 0; j < eyeIds.length; j++) {
              if (i === j) continue;
              const eye2 = state.managedEyes[eyeIds[j]];
              if (
                !eye2 ||
                eye2.status === "disappearing" ||
                eye2.conversationalTargetId
              )
                continue; // Don't target an eye already in a conversation

              if (
                eye1.position.distanceTo(eye2.position) <
                CONVERSATION_DISTANCE_THRESHOLD
              ) {
                eye1.conversationalTargetId = eye2.id;
                // Optionally, make it a two-way conversation immediately, or let the other eye pick it up in its iteration.
                // For simplicity, we'll let the other eye pick it up.
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
        let changed = false;
        for (const id in state.managedEyes) {
          const eye = state.managedEyes[id];

          if (!eye.position.equals(eye.targetPosition)) {
            eye.position.lerp(eye.targetPosition, 0.05);
            eye.position.y = EYE_Y_POSITION;
            changed = true;
          }

          // Gaze at conversational target if one exists
          if (eye.conversationalTargetId) {
            const targetEye = state.managedEyes[eye.conversationalTargetId];
            if (targetEye && targetEye.status !== "disappearing") {
              // Look at the center of the target eye.
              // For pupil-specific targeting, we'd need pupil position within the eye.
              // This is a simplification.
              eye.targetLookAt.copy(targetEye.position);
            } else {
              // Target is gone or disappearing, clear it
              eye.conversationalTargetId = undefined;
            }
          }

          if (!eye.lookAt.equals(eye.targetLookAt)) {
            eye.lookAt.lerp(eye.targetLookAt, 0.05);
            changed = true;
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
            changed = true;
          } else if (eye.status === "disappearing") {
            eye.opacity -= delta / FADE_DURATION;
            eye.scale =
              INITIAL_SCALE +
              (TARGET_SCALE - INITIAL_SCALE) * Math.max(eye.opacity, 0);

            if (eye.opacity <= 0) {
              delete state.managedEyes[id];
              changed = true;
              continue;
            }
            changed = true;
          }
        }
        if (!changed) {
          return;
        }
      }),

    removeEye: (id: string) =>
      set((state) => {
        delete state.managedEyes[id];
      }),

    setManyManagedEyes: (newEyes) =>
      set((state) => {
        state.managedEyes = newEyes;
      }),

    updateAIAgentTarget: (agentId, targetPosition, targetLookAt) =>
      set((state) => {
        const eye = state.managedEyes[agentId];
        if (eye) {
          if (!eye.targetPosition || !(eye.targetPosition instanceof Vector3)) {
            eye.targetPosition = new Vector3();
          }
          if (!eye.targetLookAt || !(eye.targetLookAt instanceof Vector3)) {
            eye.targetLookAt = new Vector3();
          }
          eye.targetPosition.copy(targetPosition);
          eye.targetLookAt.copy(targetLookAt);
          eye.conversationalTargetId = undefined; // Clear conversational target
        }
      }),
  })),
);
