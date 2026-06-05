import { Vector3 } from "three";
import { describe, expect, it } from "vitest";

import { EYE_Y_POSITION } from "@/domain/sceneConstants";

import { applyAgentAction } from "./aiAgentMovement";

describe("applyAgentAction", () => {
  it("moves forward along the forward vector and locks y to EYE_Y_POSITION", () => {
    // Looking down +X from the origin (held at eye height): forward = (1,0,0).
    const position = new Vector3(0, EYE_Y_POSITION, 0);
    const lookAt = new Vector3(5, EYE_Y_POSITION, 0);

    const result = applyAgentAction(
      position,
      lookAt,
      { type: "move", direction: "forward", distance: 2 },
      10,
    );

    // distance 2 * multiplier 10 = 20 along +X.
    expect(result.position.x).toBeCloseTo(20, 9);
    expect(result.position.y).toBe(EYE_Y_POSITION);
    expect(result.position.z).toBeCloseTo(0, 9);
    expect(result.lookAt.x).toBeCloseTo(25, 9);
    expect(result.lookAt.y).toBeCloseTo(EYE_Y_POSITION, 9);
    expect(result.lookAt.z).toBeCloseTo(0, 9);
  });

  it("moves backward in the opposite direction of forward", () => {
    const position = new Vector3(0, EYE_Y_POSITION, 0);
    const lookAt = new Vector3(5, EYE_Y_POSITION, 0);

    const result = applyAgentAction(
      position,
      lookAt,
      { type: "move", direction: "backward", distance: 2 },
      10,
    );

    expect(result.position.x).toBeCloseTo(-20, 9);
    expect(result.position.y).toBe(EYE_Y_POSITION);
    expect(result.lookAt.x).toBeCloseTo(-15, 9);
  });

  it("locks y to EYE_Y_POSITION even when the forward vector has a vertical component", () => {
    // Forward points diagonally up; the result position.y must still be locked.
    const position = new Vector3(0, 0, 0);
    const lookAt = new Vector3(0, 10, 0);

    const result = applyAgentAction(
      position,
      lookAt,
      { type: "move", direction: "forward", distance: 1 },
      10,
    );

    // forward = (0,1,0); position before the lock would be (0,10,0).
    expect(result.position.y).toBe(EYE_Y_POSITION);
    // lookAt is not y-locked: it rises by the full displacement (10).
    expect(result.lookAt.y).toBeCloseTo(20, 9);
  });

  it("scales the move distance by the distanceMultiplier", () => {
    const position = new Vector3(0, EYE_Y_POSITION, 0);
    const lookAt = new Vector3(1, EYE_Y_POSITION, 0);

    const half = applyAgentAction(
      position,
      lookAt,
      { type: "move", direction: "forward", distance: 3 },
      1,
    );
    const scaled = applyAgentAction(
      position,
      lookAt,
      { type: "move", direction: "forward", distance: 3 },
      10,
    );

    expect(half.position.x).toBeCloseTo(3, 9);
    expect(scaled.position.x).toBeCloseTo(30, 9);
  });

  it("turns left (positive Y rotation) and leaves position unchanged", () => {
    // Looking down +X. Rotating the look direction +90° about Y maps +X -> -Z.
    const position = new Vector3(0, EYE_Y_POSITION, 0);
    const lookAt = new Vector3(1, EYE_Y_POSITION, 0);

    const result = applyAgentAction(
      position,
      lookAt,
      { type: "turn", direction: "left", degrees: 90 },
      10,
    );

    expect(result.position.x).toBe(0);
    expect(result.position.y).toBe(EYE_Y_POSITION);
    expect(result.position.z).toBe(0);
    expect(result.lookAt.x).toBeCloseTo(0, 9);
    expect(result.lookAt.y).toBeCloseTo(EYE_Y_POSITION, 9);
    expect(result.lookAt.z).toBeCloseTo(-1, 9);
  });

  it("turns right (negative Y rotation) and leaves position unchanged", () => {
    // Looking down +X. Rotating -90° about Y maps +X -> +Z.
    const position = new Vector3(0, EYE_Y_POSITION, 0);
    const lookAt = new Vector3(1, EYE_Y_POSITION, 0);

    const result = applyAgentAction(
      position,
      lookAt,
      { type: "turn", direction: "right", degrees: 90 },
      10,
    );

    expect(result.position.x).toBe(0);
    expect(result.position.z).toBe(0);
    expect(result.lookAt.x).toBeCloseTo(0, 9);
    expect(result.lookAt.z).toBeCloseTo(1, 9);
  });

  it("preserves the look distance when turning", () => {
    const position = new Vector3(2, EYE_Y_POSITION, 3);
    const lookAt = new Vector3(7, EYE_Y_POSITION, 3);
    const before = lookAt.distanceTo(position);

    const result = applyAgentAction(
      position,
      lookAt,
      { type: "turn", direction: "left", degrees: 37 },
      10,
    );

    expect(result.lookAt.distanceTo(result.position)).toBeCloseTo(before, 9);
  });

  it("returns the pose unchanged for a none action", () => {
    const position = new Vector3(1, EYE_Y_POSITION, 2);
    const lookAt = new Vector3(4, EYE_Y_POSITION, 6);

    const result = applyAgentAction(position, lookAt, { type: "none" }, 10);

    expect(result.position.x).toBe(1);
    expect(result.position.y).toBe(EYE_Y_POSITION);
    expect(result.position.z).toBe(2);
    expect(result.lookAt.x).toBe(4);
    expect(result.lookAt.z).toBe(6);
  });

  it("does not mutate the input vectors", () => {
    const position = new Vector3(0, EYE_Y_POSITION, 0);
    const lookAt = new Vector3(5, EYE_Y_POSITION, 0);

    applyAgentAction(
      position,
      lookAt,
      { type: "move", direction: "forward", distance: 2 },
      10,
    );

    expect(position.x).toBe(0);
    expect(position.y).toBe(EYE_Y_POSITION);
    expect(lookAt.x).toBe(5);
  });

  it("returns fresh Vector3 instances distinct from the inputs", () => {
    const position = new Vector3(0, EYE_Y_POSITION, 0);
    const lookAt = new Vector3(5, EYE_Y_POSITION, 0);

    const result = applyAgentAction(
      position,
      lookAt,
      { type: "turn", direction: "left", degrees: 10 },
      10,
    );

    expect(result.position).not.toBe(position);
    expect(result.lookAt).not.toBe(lookAt);
  });
});
