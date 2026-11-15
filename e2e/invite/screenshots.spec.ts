import { expect, test } from "@playwright/test";
import { enterWithLink, scrollTo, seedEvent, setScores, shot, splashGone } from "./helpers";

// Not assertions so much as a contact sheet: every palette in both languages,
// for a human (or a reviewer agent) to look at.
for (const palette of ["sand", "night", "garden"] as const) {
  test(`wedding in ${palette}`, async ({ page }) => {
    test.setTimeout(180_000);
    const event = await seedEvent("wedding", { palette });
    await setScores(event, { groom: [64, 9], bride: [58, 7], friends: [37, 5] });
    await enterWithLink(page, event, event.codes.personal);
    await expect(page.getByTestId("greeting")).toHaveAttribute("data-filled", "true");
    await page.screenshot({ path: shot(`wedding-${palette}-ar-01-opening`) });

    // The end of the scene: every overlay in place.
    await page.evaluate(() => {
      const scene = document.getElementById("opening")!;
      window.scrollTo({ top: scene.offsetHeight - window.innerHeight - 4, behavior: "instant" });
    });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: shot(`wedding-${palette}-ar-02-names`) });

    await scrollTo(page, "#details");
    await page.screenshot({ path: shot(`wedding-${palette}-ar-03-details`) });
    await page.locator("#details").screenshot({ path: shot(`wedding-${palette}-ar-04-body`) });

    if (palette === "sand") {
      await page.goto(`/i/${event.slug}/en`);
      await splashGone(page);
      await expect(page.locator(".inv")).toHaveAttribute("dir", "ltr");
      await expect(page.getByTestId("greeting")).toHaveAttribute("data-filled", "true");
      await page.screenshot({ path: shot(`wedding-${palette}-en-01-opening`) });
      await page.evaluate(() => {
        const scene = document.getElementById("opening")!;
        window.scrollTo({ top: scene.offsetHeight - window.innerHeight - 4, behavior: "instant" });
      });
      await page.waitForTimeout(1200);
      await page.screenshot({ path: shot(`wedding-${palette}-en-02-names`) });
      await scrollTo(page, "#details");
      await page.locator("#details").screenshot({ path: shot(`wedding-${palette}-en-04-body`) });
    }
  });
}

test("splash monogram", async ({ page }) => {
  const event = await seedEvent("wedding");
  await page.goto(`/i/${event.slug}/ar`, { waitUntil: "commit" });
  await page.waitForSelector("[data-splash-panel]", { state: "visible" });
  await page.waitForTimeout(1100);
  await page.screenshot({ path: shot("splash-ar") });
});

test("corporate, anonymous visitor", async ({ page }) => {
  const event = await seedEvent("corporate", { palette: "garden" });
  await page.goto(`/i/${event.slug}/en`);
  await splashGone(page);
  await scrollTo(page, "#details");
  await expect(page.getByTestId("locked-card")).toBeVisible();
  await page.locator("#details").screenshot({ path: shot("corporate-garden-en-anon-body") });
});
