import { describe, expect, it } from "vitest";

import { AIResponseSchema } from "./aiAction";

describe("AIResponseSchema", () => {
  it("accepts move / turn / none and a null action", () => {
    expect(
      AIResponseSchema.safeParse({
        action: { type: "move", direction: "forward", distance: 2 },
      }).success,
    ).toBe(true);
    expect(
      AIResponseSchema.safeParse({
        action: { type: "turn", direction: "left", degrees: 30 },
      }).success,
    ).toBe(true);
    expect(
      AIResponseSchema.safeParse({ action: { type: "none" } }).success,
    ).toBe(true);
    expect(
      AIResponseSchema.safeParse({ chatMessage: "hi", action: null }).success,
    ).toBe(true);
  });

  it("clamps turn degrees to 1..45", () => {
    expect(
      AIResponseSchema.safeParse({
        action: { type: "turn", direction: "left", degrees: 0 },
      }).success,
    ).toBe(false);
    expect(
      AIResponseSchema.safeParse({
        action: { type: "turn", direction: "left", degrees: 46 },
      }).success,
    ).toBe(false);
  });

  it("rejects unknown action types and a missing action", () => {
    expect(
      AIResponseSchema.safeParse({ action: { type: "teleport" } }).success,
    ).toBe(false);
    expect(AIResponseSchema.safeParse({ chatMessage: "hi" }).success).toBe(
      false,
    );
  });
});
