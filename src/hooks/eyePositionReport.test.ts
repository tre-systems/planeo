import { describe, expect, it } from "vitest";

import { EYE_Y_POSITION } from "@/domain/sceneConstants";

import { buildEyeUpdate, type EyeReportInput } from "./eyePositionReport";

const base: EyeReportInput = {
  id: "me",
  name: "Me",
  position: [10.123, 99, -20.456],
  lookDirection: [0, 0, 1],
  last: {},
  force: false,
  now: 1000,
};

describe("buildEyeUpdate", () => {
  it("pins the reported Y to EYE_Y_POSITION regardless of camera Y", () => {
    const report = buildEyeUpdate(base);
    expect(report?.payload.p?.[1]).toBe(EYE_Y_POSITION);
  });

  it("returns null when nothing changed and not forced", () => {
    const first = buildEyeUpdate(base);
    const again = buildEyeUpdate({
      ...base,
      last: { p: first?.sentP, l: first?.sentL },
    });
    expect(again).toBeNull();
  });

  it("forces both fields on a keepalive even when unchanged", () => {
    const first = buildEyeUpdate(base);
    const forced = buildEyeUpdate({
      ...base,
      last: { p: first?.sentP, l: first?.sentL },
      force: true,
    });
    expect(forced?.payload.p).toBeDefined();
    expect(forced?.payload.l).toBeDefined();
  });

  it("sends only the changed field", () => {
    const first = buildEyeUpdate(base);
    const moved = buildEyeUpdate({
      ...base,
      position: [50, 99, -20.456],
      last: { p: first?.sentP, l: first?.sentL },
    });
    expect(moved?.payload.p).toBeDefined();
    // lookAt is derived from position + direction, so it moves too.
    expect(moved?.payload.l).toBeDefined();

    const turned = buildEyeUpdate({
      ...base,
      lookDirection: [1, 0, 0],
      last: { p: first?.sentP, l: first?.sentL },
    });
    expect(turned?.payload.p).toBeUndefined();
    expect(turned?.payload.l).toBeDefined();
  });

  it("nudges a straight-up/down look direction off the vertical", () => {
    const report = buildEyeUpdate({ ...base, lookDirection: [0, 1, 0] });
    const l = report?.payload.l;
    expect(l).toBeDefined();
    // The lookAt must differ from the position on the XZ plane.
    expect(l![0]).not.toBe(report?.payload.p?.[0]);
  });

  it("rounds to 2 decimal places (the wire precision)", () => {
    const report = buildEyeUpdate(base);
    expect(report?.payload.p?.[0]).toBe(10.12);
    expect(report?.payload.p?.[2]).toBe(-20.46);
  });
});
