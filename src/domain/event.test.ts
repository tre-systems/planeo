import { describe, expect, it } from "vitest";

import { EventSchema, ValidatedEyeUpdatePayloadSchema } from "./event";

const t = 1;

describe("EventSchema", () => {
  it("accepts the valid event variants", () => {
    expect(
      EventSchema.safeParse({ type: "eyeUpdate", id: "u1", p: [1, 2, 3], t })
        .success,
    ).toBe(true);
    expect(
      EventSchema.safeParse({
        type: "chatMessage",
        id: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
        userId: "u",
        text: "hi",
        timestamp: t,
      }).success,
    ).toBe(true);
    expect(
      EventSchema.safeParse({
        type: "box",
        id: "b1",
        p: [0, 0, 0],
        o: [0, 0, 0],
        c: "#fff",
        t,
      }).success,
    ).toBe(true);
    expect(
      EventSchema.safeParse({ type: "boxUpdate", id: "b1", p: [0, 0, 0] })
        .success,
    ).toBe(true);
    expect(
      EventSchema.safeParse({ type: "host", hostId: "client-1" }).success,
    ).toBe(true);
  });

  it("rejects unknown types and bad shapes", () => {
    expect(
      EventSchema.safeParse({ type: "aiVision", userId: "u" }).success,
    ).toBe(false);
    expect(EventSchema.safeParse({ type: "nope" }).success).toBe(false);
    // missing id
    expect(
      EventSchema.safeParse({ type: "eyeUpdate", p: [1, 2, 3], t }).success,
    ).toBe(false);
    // p is not a 3-tuple
    expect(
      EventSchema.safeParse({ type: "eyeUpdate", id: "u", p: [1, 2], t })
        .success,
    ).toBe(false);
    // host without a hostId
    expect(EventSchema.safeParse({ type: "host" }).success).toBe(false);
  });
});

describe("ValidatedEyeUpdatePayloadSchema", () => {
  it("requires at least a position or a lookAt", () => {
    expect(
      ValidatedEyeUpdatePayloadSchema.safeParse({
        type: "eyeUpdate",
        id: "u",
        t,
      }).success,
    ).toBe(false);
    expect(
      ValidatedEyeUpdatePayloadSchema.safeParse({
        type: "eyeUpdate",
        id: "u",
        l: [0, 0, 0],
        t,
      }).success,
    ).toBe(true);
  });
});
