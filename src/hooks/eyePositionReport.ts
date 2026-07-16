// Pure payload building for the eye position reporter, extracted so the
// nudge/rounding/change-detection rules are unit-testable and identical for
// the initial and interval sends (they had drifted apart when duplicated).
import type { Vec3 } from "@/domain/common";
import type { EyeUpdateType } from "@/domain/event";
import { EYE_Y_POSITION } from "@/domain/sceneConstants";
import { roundVec3, areVec3sEqual } from "@/lib/utils";

export interface EyeReportInput {
  id: string;
  name: string;
  // Raw camera position and world direction, unrounded.
  position: [number, number, number];
  lookDirection: [number, number, number];
  last: { p?: Vec3 | undefined; l?: Vec3 | undefined };
  // Force both fields regardless of change detection (initial send and the
  // periodic keepalive).
  force: boolean;
  now: number;
}

export interface EyeReport {
  payload: EyeUpdateType;
  sentP?: Vec3;
  sentL?: Vec3;
}

// Returns the payload to send plus the rounded values the caller should
// record as "last sent", or null when nothing changed and no send is due.
export const buildEyeUpdate = (input: EyeReportInput): EyeReport | null => {
  // The eye's Y is fixed in the world; report it pinned so viewers never see
  // vertical jitter from the camera.
  const position = roundVec3([
    input.position[0],
    EYE_Y_POSITION,
    input.position[2],
  ]);

  // Avoid a lookAt that is co-linear with position on XZ when looking
  // straight up/down: nudge horizontally and re-normalize.
  let [dx, dy, dz] = input.lookDirection;
  if (Math.abs(dx) < 0.001 && Math.abs(dz) < 0.001) {
    dx = 0.01;
    const len = Math.hypot(dx, dy, dz);
    dx /= len;
    dy /= len;
    dz /= len;
  }
  const lookAt = roundVec3([
    input.position[0] + dx,
    input.position[1] + dy,
    input.position[2] + dz,
  ]);

  const positionChanged = !areVec3sEqual(input.last.p, position);
  const lookAtChanged = !areVec3sEqual(input.last.l, lookAt);

  if (!positionChanged && !lookAtChanged && !input.force) return null;

  const payload: EyeUpdateType = {
    type: "eyeUpdate",
    id: input.id,
    name: input.name,
    t: input.now,
  };
  const report: EyeReport = { payload };
  if (positionChanged || input.force) {
    payload.p = position;
    report.sentP = position;
  }
  if (lookAtChanged || input.force) {
    payload.l = lookAt;
    report.sentL = lookAt;
  }
  return report;
};
