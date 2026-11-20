import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { seedEvent, splashGone } from "./helpers";

// A contact sheet of the opening scenes, for a person to look at: every kind,
// phone and desktop, both languages, at four points of the scroll, plus the
// still version. Written to e2e/invite/.results/scenes (not committed); set
// SCENE_SHOTS to put them elsewhere.
const OUT =
  process.env.SCENE_SHOTS ?? path.join(__dirname, ".results", "scenes");
const kinds = ["wedding", "gender_reveal", "corporate"] as const;
const screens = {
  phone: {
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  },
  desktop: {
    viewport: { width: 1440, height: 900 },
    isMobile: false,
    hasTouch: false,
  },
} as const;

// Scroll to a point of the opening: a share of the move, or of the hold after it.
async function seek(page: Page, part: "move" | "hold", share: number) {
  await page.evaluate(
    ({ part, share }) => {
      const scene = document.getElementById("opening")!;
      const travel = scene.offsetHeight - window.innerHeight;
      const stage = scene.querySelector<HTMLElement>("[data-seq-stage]")!;
      // The scene's own lengths: scroll 260 + hold 80 (lvh) for every launch template.
      const holdShare = 80 / (260 + 80 - 100);
      const at =
        part === "move"
          ? travel * (1 - holdShare) * share
          : travel * (1 - holdShare) + travel * holdShare * share;
      window.scrollTo({ top: scene.offsetTop + at - 1, behavior: "instant" });
      return stage.dataset.animated;
    },
    { part, share },
  );
  await page.waitForTimeout(1400);
}

for (const [screenName, screen] of Object.entries(screens)) {
  test.describe(screenName, () => {
    test.use(screen);
    for (const kind of kinds) {
      test(`${kind} scene`, async ({ page }) => {
        test.setTimeout(240_000);
        const event = await seedEvent(kind, {
          palette:
            kind === "corporate"
              ? "garden"
              : kind === "wedding"
                ? "sand"
                : "night",
        });
        for (const locale of ["ar", "en"] as const) {
          const name = (step: string) =>
            path.join(OUT, `${kind}-${screenName}-${locale}-${step}.png`);
          await page.goto(`/i/${event.slug}/${locale}`);
          await splashGone(page);
          await page.waitForFunction(() =>
            Object.values(
              (
                window as unknown as {
                  __ss?: { scenes: Record<string, { ready: boolean }> };
                }
              ).__ss?.scenes ?? {},
            ).every((s) => s.ready),
          );
          await page.screenshot({ path: name("1-start") });
          await seek(page, "move", 0.5);
          await page.screenshot({ path: name("2-move") });
          await seek(page, "hold", 0.3);
          await page.screenshot({ path: name("3-hold-entering") });
          await seek(page, "hold", 1);
          await page.screenshot({ path: name("4-hold") });
          await page
            .locator("#details")
            .evaluate((el) =>
              el.scrollIntoView({ block: "start", behavior: "instant" }),
            );
          await page.waitForTimeout(600);
          await page.screenshot({ path: name("5-after") });
        }
      });
    }
  });
}

for (const [screenName, screen] of Object.entries(screens)) {
  test.describe(`${screenName} still`, () => {
    test.use({ ...screen, reducedMotion: "reduce" });
    for (const kind of kinds) {
      test(`${kind} still`, async ({ page }) => {
        const event = await seedEvent(kind, { palette: "night" });
        for (const locale of ["ar", "en"] as const) {
          await page.goto(`/i/${event.slug}/${locale}`);
          await expect(page.locator("[data-seq-stage]")).toHaveAttribute(
            "data-animated",
            "false",
          );
          await page.waitForTimeout(800);
          await page.screenshot({
            path: path.join(OUT, `${kind}-${screenName}-${locale}-0-still.png`),
          });
        }
      });
    }
  });
}
