import { describe, expect, it } from "vitest";

import {
  BOX_COLORS,
  buildAgentSeedEyes,
  buildInitialBoxes,
  findStaleEyeIds,
  mergeBox,
  mergeEye,
  pickHost,
} from "./eventHubLogic";

import type { BoxEventType } from "../domain/box";
import type { EyeUpdateType } from "../domain/event";

const now = 1000;

describe("mergeEye", () => {
  it("creates a new eye from a position", () => {
    expect(mergeEye(undefined, { id: "u1", p: [1, 2, 3] }, now)).toEqual({
      type: "eyeUpdate",
      id: "u1",
      p: [1, 2, 3],
      t: now,
    });
  });

  it("merges absent fields from the existing record (last-write-wins)", () => {
    const existing: EyeUpdateType = {
      type: "eyeUpdate",
      id: "u1",
      p: [1, 2, 3],
      l: [4, 5, 6],
      name: "Ann",
      t: 1,
    };
    // Incoming updates only lookAt; position and name fall back to existing.
    expect(mergeEye(existing, { id: "u1", l: [7, 8, 9] }, now)).toEqual({
      type: "eyeUpdate",
      id: "u1",
      p: [1, 2, 3],
      l: [7, 8, 9],
      name: "Ann",
      t: now,
    });
  });

  it("lets an incoming field override the existing one", () => {
    const existing: EyeUpdateType = {
      type: "eyeUpdate",
      id: "u1",
      p: [1, 1, 1],
      t: 1,
    };
    expect(mergeEye(existing, { id: "u1", p: [9, 9, 9] }, now)?.p).toEqual([
      9, 9, 9,
    ]);
  });

  it("returns null when there is no position anywhere", () => {
    expect(mergeEye(undefined, { id: "u1", l: [1, 2, 3] }, now)).toBeNull();
  });
});

describe("mergeBox", () => {
  const existing: BoxEventType = {
    type: "box",
    id: "b1",
    p: [0, 0, 0],
    o: [0, 0, 0],
    c: "#FF0000",
    t: 1,
  };

  it("updates the pose while preserving the color", () => {
    expect(mergeBox(existing, { id: "b1", p: [1, 2, 3] }, now)).toEqual({
      type: "box",
      id: "b1",
      p: [1, 2, 3],
      o: [0, 0, 0],
      c: "#FF0000",
      t: now,
    });
  });

  it("drops an update for an unknown box (no existing color)", () => {
    expect(
      mergeBox(undefined, { id: "b1", p: [1, 2, 3], o: [0, 0, 0] }, now),
    ).toBeNull();
  });
});

describe("findStaleEyeIds", () => {
  it("returns only eyes older than maxAge", () => {
    const eyes = new Map<string, EyeUpdateType>([
      ["fresh", { type: "eyeUpdate", id: "fresh", p: [0, 0, 0], t: 990 }],
      ["stale", { type: "eyeUpdate", id: "stale", p: [0, 0, 0], t: 100 }],
    ]);
    expect(findStaleEyeIds(eyes, now, 30)).toEqual(["stale"]);
  });
});

describe("pickHost", () => {
  it("picks the first (oldest) client id", () => {
    expect(pickHost(["a", "b", "c"])).toBe("a");
  });

  it("returns undefined when nobody is connected", () => {
    expect(pickHost([])).toBeUndefined();
  });
});

describe("buildInitialBoxes", () => {
  it("lays out N boxes centered along X with palette colors", () => {
    const boxes = buildInitialBoxes(5, now);
    expect(boxes.map((b) => b.id)).toEqual([
      "box_1",
      "box_2",
      "box_3",
      "box_4",
      "box_5",
    ]);
    expect(boxes[0].p).toEqual([-30, 5, -20]);
    expect(boxes[4].p).toEqual([30, 5, -20]);
    expect(boxes[0].c).toBe(BOX_COLORS[0]);
  });

  it("cycles colors past the palette length", () => {
    const boxes = buildInitialBoxes(BOX_COLORS.length + 1, now);
    expect(boxes[BOX_COLORS.length].c).toBe(BOX_COLORS[0]);
  });

  it("returns nothing for zero boxes", () => {
    expect(buildInitialBoxes(0, now)).toEqual([]);
  });
});

describe("buildAgentSeedEyes", () => {
  const agents = [
    { id: "a1", displayName: "Orion" },
    { id: "a2", displayName: "Nova" },
    { id: "a3", displayName: "Vega" },
  ];

  it("seeds up to totalAgents, alternating left/right of the origin", () => {
    const eyes = buildAgentSeedEyes(agents, 2, -11.9, now);
    expect(eyes).toHaveLength(2);
    expect(eyes[0]).toMatchObject({
      id: "a1",
      name: "Orion",
      p: [20, -11.9, 5],
    });
    expect(eyes[1]).toMatchObject({
      id: "a2",
      name: "Nova",
      p: [-40, -11.9, 5],
    });
  });

  it("seeds none when totalAgents is 0", () => {
    expect(buildAgentSeedEyes(agents, 0, -11.9, now)).toEqual([]);
  });
});
