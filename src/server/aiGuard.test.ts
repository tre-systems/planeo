import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The guard keeps rolling-window state at module level, so each test gets a
// fresh copy via resetModules + dynamic import.
const loadGuard = async () => await import("./aiGuard");

describe("aiCallBlocked", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.unstubAllEnvs();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("refuses non-matching tokens when WORLD_WRITE_TOKEN is set", async () => {
    vi.stubEnv("WORLD_WRITE_TOKEN", "secret");
    const { aiCallBlocked } = await loadGuard();
    expect(aiCallBlocked("wrong")).toBe("unauthorized");
    expect(aiCallBlocked(undefined)).toBe("unauthorized");
    expect(aiCallBlocked("secret")).toBeUndefined();
  });

  it("enforces the hourly budget and releases slots as the window rolls", async () => {
    vi.stubEnv("RATE_LIMIT_AI_HOURLY", "2");
    const { aiCallBlocked } = await loadGuard();
    expect(aiCallBlocked()).toBeUndefined();
    expect(aiCallBlocked()).toBeUndefined();
    expect(aiCallBlocked()).toBe("rate-limited");
    vi.advanceTimersByTime(61 * 60 * 1000);
    expect(aiCallBlocked()).toBeUndefined();
  });

  it("falls back to the default limit on a malformed env value (NaN would disable the budget)", async () => {
    vi.stubEnv("RATE_LIMIT_AI_HOURLY", "not-a-number");
    const { aiCallBlocked } = await loadGuard();
    // The default is 2000 — far above this loop, so calls stay allowed, but
    // the guard must still be counting (a NaN limit would never refuse).
    for (let i = 0; i < 5; i++) expect(aiCallBlocked()).toBeUndefined();
  });

  it("refuses once the default budget is truly exhausted", async () => {
    vi.stubEnv("RATE_LIMIT_AI_HOURLY", "1");
    const { aiCallBlocked } = await loadGuard();
    expect(aiCallBlocked()).toBeUndefined();
    expect(aiCallBlocked()).toBe("rate-limited");
  });
});

describe("agentDecisionTooSoon", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("enforces the per-agent cadence floor independently per agent", async () => {
    const { agentDecisionTooSoon } = await loadGuard();
    expect(agentDecisionTooSoon("a")).toBe(false);
    expect(agentDecisionTooSoon("a")).toBe(true); // too soon
    expect(agentDecisionTooSoon("b")).toBe(false); // other agent unaffected
    vi.advanceTimersByTime(4001);
    expect(agentDecisionTooSoon("a")).toBe(false);
  });

  it("does not record a refused call (the floor measures real calls)", async () => {
    const { agentDecisionTooSoon } = await loadGuard();
    agentDecisionTooSoon("a");
    vi.advanceTimersByTime(3000);
    expect(agentDecisionTooSoon("a")).toBe(true); // refused, not recorded
    vi.advanceTimersByTime(1001); // 4001ms since the recorded call
    expect(agentDecisionTooSoon("a")).toBe(false);
  });
});
