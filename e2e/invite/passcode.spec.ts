import { expect, test } from "@playwright/test";
import { hashPasscode } from "../../src/features/host/lib/passcode";
import { admin, enterWithLink, scrollTo, seedEvent, SENTINEL, shot, splashGone, type Seeded } from "./helpers";

// A passcode event (security V3, rule 38): the public link shows the opening and
// a passcode form; the passcode unlocks the details; personal links skip it.
const PASSCODE = "lotus-2026";
let event: Seeded;

test.beforeAll(async () => {
  event = await seedEvent("wedding");
  const { error } = await admin.from("events").update({ passcode_hash: await hashPasscode(PASSCODE) }).eq("id", event.id);
  if (error) throw error;
});

test("the public link asks for the passcode, refuses a wrong one, and unlocks the details with the right one", async ({ page, request }) => {
  // The cached shell carries none of the guest-only details.
  const html = await (await request.get(`/i/${event.slug}/ar`)).text();
  expect(html).not.toContain(SENTINEL);

  await page.goto(`/i/${event.slug}/ar`);
  await splashGone(page);
  const card = page.getByTestId("passcode-card");
  await expect(card).toBeVisible();
  await expect(page.getByTestId("locked-card")).toHaveCount(0);
  await expect(page.locator('[data-block="location"]')).toHaveCount(0);
  await scrollTo(page, '[data-testid="passcode-card"]');
  await page.screenshot({ path: shot("passcode-form-ar") });

  await card.getByLabel("الرقم السري").fill("wrong-guess");
  await card.getByRole("button", { name: "افتح التفاصيل" }).click();
  await expect(page.getByTestId("passcode-error")).toContainText("مش مظبوط");
  await page.screenshot({ path: shot("passcode-wrong-ar") });

  await card.getByLabel("الرقم السري").fill(PASSCODE);
  await card.getByRole("button", { name: "افتح التفاصيل" }).click();
  await expect(page.locator('[data-block="location"]')).toContainText(SENTINEL);
  await expect(page.getByTestId("passcode-card")).toHaveCount(0);
  // The passcode unlocks blocks only: no reply form, no game.
  await expect(page.getByTestId("rsvp")).toHaveCount(0);

  // The cookie keeps it unlocked on this device.
  await page.reload();
  await splashGone(page);
  await expect(page.locator('[data-block="location"]')).toContainText(SENTINEL);
  await expect(page.getByTestId("passcode-card")).toHaveCount(0);
});

test("a guest with a personal link never sees the passcode form", async ({ page }) => {
  await enterWithLink(page, event, event.codes.personal);
  await expect(page.getByTestId("greeting")).toContainText(event.labels.personal);
  await expect(page.locator('[data-block="location"]')).toContainText(SENTINEL);
  await expect(page.getByTestId("passcode-card")).toHaveCount(0);
});
