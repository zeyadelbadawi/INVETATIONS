import { expect, test } from "@playwright/test";
import { enterWithLink, scrollTo, seedEvent, SENTINEL, setScores, shot, splashGone, type Seeded } from "./helpers";

let event: Seeded;
test.beforeAll(async () => {
  event = await seedEvent("wedding");
  await setScores(event, { groom: [64, 9], bride: [58, 7], friends: [37, 5] });
});

test("personal link: the address appears, the reply is saved, survives a reload and can be changed", async ({ page }) => {
  await enterWithLink(page, event, event.codes.personal);
  await expect(page.getByTestId("greeting")).toContainText(event.labels.personal);

  const location = page.locator('[data-block="location"]');
  await expect(location).toContainText(SENTINEL);
  await expect(location.getByRole("link", { name: "افتح الخريطة" })).toHaveAttribute("href", "https://www.google.com/maps/search/?api=1&query=30.0131,31.4913");

  const rsvp = page.getByTestId("rsvp");
  await scrollTo(page, "#rsvp");
  await rsvp.getByText("جاي إن شاء الله").click();
  await rsvp.getByRole("button", { name: /زوّد: كبار/ }).click();
  await rsvp.getByRole("button", { name: /زوّد: أطفال/ }).click();
  await page.screenshot({ path: shot("rsvp-form-ar") });
  await rsvp.getByRole("button", { name: "ابعت الرد" }).click();
  await expect(page.getByTestId("rsvp-answer")).toContainText("مستنيينك");
  await expect(page.getByTestId("rsvp-answer")).toContainText("2 كبار و1 أطفال");
  await page.screenshot({ path: shot("rsvp-answered-ar") });

  await page.reload();
  await splashGone(page);
  await expect(page.getByTestId("rsvp-answer")).toContainText("مستنيينك");

  await scrollTo(page, "#rsvp");
  await page.getByTestId("rsvp-answer").getByRole("button", { name: "غيّر ردّي" }).click();
  await rsvp.getByText("مش هقدر").click();
  await rsvp.getByRole("button", { name: "ابعت الرد" }).click();
  await expect(page.getByTestId("rsvp-answer")).toContainText("هتوحشنا");
  await page.reload();
  await splashGone(page);
  await expect(page.getByTestId("rsvp-answer")).toHaveAttribute("data-status", "no");
});

test("group link: joining shows the return code once, then the badge and the live score", async ({ page }) => {
  await enterWithLink(page, event, event.codes.group);
  await expect(page.getByTestId("rsvp-join-first")).toBeVisible();
  await scrollTo(page, "#play");

  await page.getByLabel("اسمك").fill("منى");
  await page.getByTestId("team-bride").click();
  await page.screenshot({ path: shot("join-form-ar") });
  await page.getByRole("button", { name: "انضم", exact: true }).click();

  await expect(page.getByTestId("rejoin-code")).toHaveText(/^[0-9]{6}$/);
  await expect(page.getByTestId("badge")).toContainText("منى");
  await expect(page.getByTestId("badge")).toContainText("أهل العروسة");
  await page.screenshot({ path: shot("join-code-ar") });
  await page.getByRole("button", { name: "حفظته" }).click();
  await expect(page.getByTestId("rejoin")).toHaveCount(0);

  await expect(page.getByTestId("score-groom")).toHaveText("64");
  await expect(page.getByTestId("score-bride")).toHaveText("58");
  await setScores(event, { bride: [71, 8] });
  await expect(page.getByTestId("score-bride")).toHaveText("71", { timeout: 20_000 });
  await scrollTo(page, '[data-testid="scoreboard"]');
  await page.screenshot({ path: shot("scoreboard-ar") });

  // The code is not shown again, and a per-person reply now works.
  await page.reload();
  await splashGone(page);
  await expect(page.getByTestId("badge")).toContainText("منى");
  await expect(page.getByTestId("rejoin")).toHaveCount(0);
  await scrollTo(page, "#rsvp");
  await page.getByTestId("rsvp").getByText("جاي إن شاء الله").click();
  await page.getByTestId("rsvp").getByRole("button", { name: "ابعت الرد" }).click();
  await expect(page.getByTestId("rsvp-answer")).toContainText("مستنيينك");
});
