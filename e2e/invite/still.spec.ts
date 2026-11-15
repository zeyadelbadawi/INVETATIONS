import { expect, test } from "@playwright/test";
import { enterWithLink, seedEvent, SENTINEL, shot } from "./helpers";

test.use({ reducedMotion: "reduce" });

test("reduced motion: the still version, with every word and every block", async ({ page }) => {
  const event = await seedEvent("wedding", { palette: "night" });
  const media: string[] = [];
  page.on("request", (request) => {
    if (request.url().endsWith(".mp4")) media.push(request.url());
  });
  await enterWithLink(page, event, event.codes.personal);

  await expect(page.locator("[data-splash-panel]")).toBeHidden();
  const stage = page.locator("[data-seq-stage]");
  await expect(stage).toHaveAttribute("data-animated", "false");
  // The scene takes one screen, not a long scroll, and the names are already there.
  const height = await page.locator("#opening").evaluate((el) => el.getBoundingClientRect().height);
  expect(height).toBeLessThan(900);
  for (const text of ["ياسمين", "عمر", "نتشرف بدعوتكم"]) {
    const overlay = page.locator(".inv-ov", { hasText: text });
    await expect(overlay).toBeVisible();
    expect(Number(await overlay.evaluate((el) => getComputedStyle(el).opacity))).toBe(1);
  }
  await page.screenshot({ path: shot("still-night-ar-opening") });

  await expect(page.locator('[data-block="details"]')).toBeVisible();
  await expect(page.locator('[data-block="location"]')).toContainText(SENTINEL);
  await expect(page.getByTestId("rsvp")).toBeVisible();
  await expect(page.getByTestId("play")).toBeVisible();
  expect(media).toHaveLength(0);
});
