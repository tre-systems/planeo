import { describe, expect, it, vi } from "vitest";

import { retry } from "./retry";

describe("retry", () => {
  it("returns on the first success without retrying", async () => {
    const fn = vi.fn(async () => "ok");
    expect(await retry(fn, { attempts: 3, baseMs: 0 })).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries and then succeeds", async () => {
    let calls = 0;
    const fn = vi.fn(async () => {
      calls += 1;
      if (calls < 2) throw new Error("transient");
      return "ok";
    });
    expect(await retry(fn, { attempts: 3, baseMs: 0 })).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("throws the last error after exhausting attempts", async () => {
    const fn = vi.fn(async () => {
      throw new Error("boom");
    });
    await expect(retry(fn, { attempts: 2, baseMs: 0 })).rejects.toThrow("boom");
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
