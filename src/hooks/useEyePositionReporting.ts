import { useEffect, useRef } from "react";
import { Vector3 } from "three";

import type { Vec3 } from "@/domain/common";
import {
  ValidatedEyeUpdatePayloadSchema,
  type EyeUpdateType,
} from "@/domain/event";
import { postWorldEvent } from "@/lib/eventEgress";
import { log } from "@/lib/log";

import { buildEyeUpdate } from "./eyePositionReport";

import type { Camera } from "@react-three/fiber";

const FORCE_POSITION_UPDATE_INTERVAL_MS = 20000;
const LOCAL_INTERVAL_MS = 100;

// Polls the camera and reports this client's eye over the wire: rounded
// change-detection every 100 ms, with a forced keepalive every 20 s so the
// hub's stale purge never reaps a merely-idle player. The payload rules
// (rounding, vertical-look nudge, field selection) live in buildEyeUpdate.
export const useEyePositionReporting = (
  myId: string,
  myName: string | undefined,
  camera: Camera | undefined,
) => {
  const lastSentRef = useRef<{ p?: Vec3 | undefined; l?: Vec3 | undefined }>(
    {},
  );
  const forceCounterRef = useRef(0);

  useEffect(() => {
    if (!camera) return;

    const checksPerForceUpdate =
      FORCE_POSITION_UPDATE_INTERVAL_MS / LOCAL_INTERVAL_MS;
    const userName = myName || myId;
    const direction = new Vector3();

    const report = (force: boolean) => {
      camera.getWorldDirection(direction);
      const built = buildEyeUpdate({
        id: myId,
        name: userName,
        position: [camera.position.x, camera.position.y, camera.position.z],
        lookDirection: [direction.x, direction.y, direction.z],
        last: lastSentRef.current,
        force,
        now: Date.now(),
      });
      if (!built) return;

      const parsed = ValidatedEyeUpdatePayloadSchema.safeParse(built.payload);
      if (!parsed.success) {
        log.error("sse", "Invalid eye update payload before sending", {
          details: parsed.error.flatten(),
        });
        return;
      }
      postWorldEvent(parsed.data as EyeUpdateType);
      if (built.sentP) lastSentRef.current.p = built.sentP;
      if (built.sentL) lastSentRef.current.l = built.sentL;
    };

    lastSentRef.current = {};
    forceCounterRef.current = 0;
    report(true); // announce immediately on mount/camera change

    const intervalId = setInterval(() => {
      forceCounterRef.current += 1;
      const force = forceCounterRef.current >= checksPerForceUpdate;
      if (force) forceCounterRef.current = 0;
      report(force);
    }, LOCAL_INTERVAL_MS);

    return () => {
      clearInterval(intervalId);
    };
  }, [camera, myId, myName]);
};
