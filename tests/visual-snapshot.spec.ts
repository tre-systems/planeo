import { test, expect } from "@playwright/test";

test.describe("Visual Snapshots", () => {
  test("captures image of animation after 3 seconds", async ({ page }) => {
    await page.goto("/");

    // Click the start overlay to reveal the canvas
    await page.locator("text=Click to Start").click();

    await page.waitForTimeout(3000);

    // Diagnostic artifact only — test-results/ is gitignored. (The committed
    // screenshots/ folder holds the README image; tests must not rewrite it.)
    await page.screenshot({
      path: "test-results/loaded.png",
      fullPage: true,
    });

    const canvas = page.locator("canvas");
    await expect(canvas).toBeVisible();
  });
});
