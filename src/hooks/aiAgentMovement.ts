import { Vector3 } from "three";

import { EYE_Y_POSITION } from "@/domain/sceneConstants";

import type { AIAction } from "@/domain/aiAction";

// Pure movement math for an AI agent's eye. Given the agent's current pose
// (position + lookAt) and an action, returns the new pose as fresh Vector3s.
// The inputs are never mutated.
//
// - `move` translates both position and lookAt along the forward vector
//   `(lookAt - position).normalize()` (negated for "backward") by
//   `distance * distanceMultiplier`, then locks `position.y` to EYE_Y_POSITION.
// - `turn` rotates `(lookAt - position)` about the Y axis by `±degrees`
//   (left = +, right = -) and sets `lookAt = position + rotated`, leaving
//   position unchanged.
// - any other action (`none`/null) leaves the pose unchanged.
export const applyAgentAction = (
  position: Vector3,
  lookAt: Vector3,
  action: AIAction,
  distanceMultiplier: number,
): { position: Vector3; lookAt: Vector3 } => {
  const currentPosition = position.clone();
  const currentLookAt = lookAt.clone();
  let newPosition = currentPosition.clone();
  const newLookAt = currentLookAt.clone();

  const forwardVector = new Vector3();
  forwardVector.subVectors(currentLookAt, currentPosition).normalize();

  if (action && action.type === "move") {
    const actualMoveDirection = forwardVector.clone();
    if (action.direction === "backward") {
      actualMoveDirection.negate();
    }
    const displacement = actualMoveDirection.multiplyScalar(
      action.distance * distanceMultiplier,
    );

    newPosition.copy(currentPosition).add(displacement);
    newLookAt.copy(currentLookAt).add(displacement);

    newPosition.y = EYE_Y_POSITION;
  } else if (action && action.type === "turn") {
    const angleRad = (action.degrees * Math.PI) / 180;
    const axis = new Vector3(0, 1, 0);
    const directionToLookAt = new Vector3().subVectors(
      currentLookAt,
      currentPosition,
    );
    if (action.direction === "left") {
      directionToLookAt.applyAxisAngle(axis, angleRad);
    } else if (action.direction === "right") {
      directionToLookAt.applyAxisAngle(axis, -angleRad);
    }
    newLookAt.addVectors(currentPosition, directionToLookAt);
    newPosition = currentPosition;
  }

  return { position: newPosition, lookAt: newLookAt };
};
