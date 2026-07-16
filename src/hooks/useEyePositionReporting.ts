import { useEffect, useRef } from "react";
import { Vector3 } from "three";

import { ValidatedEyeUpdatePayloadSchema } from "@/domain/event";
import { EYE_Y_POSITION } from "@/domain/sceneConstants";
import { postWorldEvent } from "@/lib/eventEgress";
import { log } from "@/lib/log";
import { roundVec3, areVec3sEqual } from "@/lib/utils";

import type { EyeUpdateType } from "@/domain";
import type { Camera } from "@react-three/fiber";

const FORCE_POSITION_UPDATE_INTERVAL_MS = 20000;
const LOCAL_INTERVAL_MS = 100;

export const useEyePositionReporting = (
  myId: string,
  myName: string | undefined,
  camera: Camera | undefined,
) => {
  const lastSentPositionRef = useRef<[number, number, number] | undefined>(
    undefined,
  );
  const lastSentLookAtRef = useRef<[number, number, number] | undefined>(
    undefined,
  );
  const forcePositionUpdateCounterRef = useRef(0);

  useEffect(() => {
    if (!camera) return;

    const checksPerForcePositionUpdate =
      FORCE_POSITION_UPDATE_INTERVAL_MS / LOCAL_INTERVAL_MS;

    const userName = myName || myId;

    const initialPositionRaw: [number, number, number] = [
      camera.position.x,
      EYE_Y_POSITION,
      camera.position.z,
    ];
    const initialPositionRounded = roundVec3(initialPositionRaw);

    const lookAtDirection = new Vector3();
    camera.getWorldDirection(lookAtDirection);

    // Avoid a lookAt that is co-linear with position on XZ when looking
    // straight up/down: nudge horizontally and re-normalize.
    if (
      Math.abs(lookAtDirection.x) < 0.001 &&
      Math.abs(lookAtDirection.z) < 0.001
    ) {
      lookAtDirection.x = 0.01;
      lookAtDirection.normalize();
    }

    const initialLookAtRaw: [number, number, number] = [
      camera.position.x + lookAtDirection.x,
      camera.position.y + lookAtDirection.y,
      camera.position.z + lookAtDirection.z,
    ];
    const initialLookAtRounded = roundVec3(initialLookAtRaw);

    const initialPayload: EyeUpdateType = {
      type: "eyeUpdate",
      id: myId,
      name: userName,
      p: initialPositionRounded,
      l: initialLookAtRounded,
      t: Date.now(),
    };
    const parsedInitial =
      ValidatedEyeUpdatePayloadSchema.safeParse(initialPayload);
    if (!parsedInitial.success) {
      log.error("sse", "Invalid eye update payload before sending", {
        details: parsedInitial.error.flatten(),
      });
    } else {
      postWorldEvent(parsedInitial.data);
      lastSentPositionRef.current = initialPositionRounded;
      lastSentLookAtRef.current = initialLookAtRounded;
      forcePositionUpdateCounterRef.current = 0;
    }

    const intervalId = setInterval(() => {
      const currentPositionRaw: [number, number, number] = [
        camera.position.x,
        camera.position.y,
        camera.position.z,
      ];
      const currentPositionRounded = roundVec3(currentPositionRaw);

      const currentLookAtDirection = new Vector3();
      camera.getWorldDirection(currentLookAtDirection);

      // Same straight-up/down guard as the initial payload above.
      if (
        Math.abs(currentLookAtDirection.x) < 0.001 &&
        Math.abs(currentLookAtDirection.z) < 0.001
      ) {
        currentLookAtDirection.x = 0.01;
        currentLookAtDirection.normalize();
      }

      const currentLookAtRaw: [number, number, number] = [
        camera.position.x + currentLookAtDirection.x,
        camera.position.y + currentLookAtDirection.y,
        camera.position.z + currentLookAtDirection.z,
      ];
      const currentLookAtRounded = roundVec3(currentLookAtRaw);

      forcePositionUpdateCounterRef.current += 1;

      const positionActuallyChanged = !areVec3sEqual(
        lastSentPositionRef.current,
        currentPositionRounded,
      );

      const lookAtActuallyChanged = !areVec3sEqual(
        lastSentLookAtRef.current,
        currentLookAtRounded,
      );

      const isTimeForForcePositionUpdate =
        forcePositionUpdateCounterRef.current >= checksPerForcePositionUpdate;

      if (
        positionActuallyChanged ||
        lookAtActuallyChanged ||
        isTimeForForcePositionUpdate
      ) {
        const payload: EyeUpdateType = {
          type: "eyeUpdate",
          id: myId,
          name: userName,
          t: Date.now(),
        };
        if (positionActuallyChanged || isTimeForForcePositionUpdate) {
          payload.p = currentPositionRounded;
          lastSentPositionRef.current = currentPositionRounded;
        }
        if (lookAtActuallyChanged || isTimeForForcePositionUpdate) {
          payload.l = currentLookAtRounded;
          lastSentLookAtRef.current = currentLookAtRounded;
        }

        if (payload.p || payload.l) {
          const parsed = ValidatedEyeUpdatePayloadSchema.safeParse(payload);
          if (!parsed.success) {
            log.error("sse", "Invalid eye update payload before sending", {
              details: parsed.error.flatten(),
            });
          } else {
            postWorldEvent(parsed.data);
          }
        }

        if (isTimeForForcePositionUpdate) {
          forcePositionUpdateCounterRef.current = 0;
        }
      }
    }, LOCAL_INTERVAL_MS);

    return () => {
      clearInterval(intervalId);
    };
  }, [camera, myId, myName]);
};
