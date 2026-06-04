import { describe, expect, it } from "vitest";

import { DEFAULT_AGENTS, parseAgentsConfig, parseConfigInt } from "./config";

describe("parseConfigInt", () => {
  it("parses valid integers", () => {
    expect(parseConfigInt("5", 0)).toBe(5);
    expect(parseConfigInt("0", 9)).toBe(0);
  });

  it("falls back on missing, invalid, or negative values", () => {
    expect(parseConfigInt(undefined, 5)).toBe(5);
    expect(parseConfigInt("", 5)).toBe(5);
    expect(parseConfigInt("abc", 5)).toBe(5);
    expect(parseConfigInt("-3", 5)).toBe(5);
  });
});

describe("parseAgentsConfig", () => {
  it("returns the defaults when unset or empty", () => {
    expect(parseAgentsConfig(undefined)).toEqual(DEFAULT_AGENTS);
    expect(parseAgentsConfig("")).toEqual(DEFAULT_AGENTS);
  });

  it("parses a valid config array", () => {
    const json = JSON.stringify([{ id: "a", displayName: "Ada" }]);
    expect(parseAgentsConfig(json)).toEqual([{ id: "a", displayName: "Ada" }]);
  });

  it("falls back on malformed JSON, an empty array, or a bad shape", () => {
    expect(parseAgentsConfig("{not json")).toEqual(DEFAULT_AGENTS);
    expect(parseAgentsConfig("[]")).toEqual(DEFAULT_AGENTS);
    expect(parseAgentsConfig(JSON.stringify([{ id: "x" }]))).toEqual(
      DEFAULT_AGENTS,
    );
  });
});
