import { describe, expect, it } from "vitest";

import { AgentSelfStateSchema, AIResponseSchema } from "./aiAction";

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

describe("AgentSelfStateSchema", () => {
  const base = {
    position: [10.5, -20],
    headingDeg: 130,
    lastActions: [{ type: "turn", direction: "left", degrees: 30 }],
  };

  it("accepts a valid self state, including an empty action history", () => {
    expect(AgentSelfStateSchema.safeParse(base).success).toBe(true);
    expect(
      AgentSelfStateSchema.safeParse({ ...base, lastActions: [] }).success,
    ).toBe(true);
  });

  it("caps the action history at 5 (billable endpoint input)", () => {
    const six = Array.from({ length: 6 }, () => ({ type: "none" }));
    expect(
      AgentSelfStateSchema.safeParse({ ...base, lastActions: six }).success,
    ).toBe(false);
  });

  it("bounds headingDeg to -180..180 and requires an [x, z] pair", () => {
    expect(
      AgentSelfStateSchema.safeParse({ ...base, headingDeg: 200 }).success,
    ).toBe(false);
    expect(
      AgentSelfStateSchema.safeParse({ ...base, position: [1] }).success,
    ).toBe(false);
  });
});
