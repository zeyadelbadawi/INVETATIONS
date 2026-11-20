import { expect, test } from "@playwright/test";
import { admin, enterWithLink, scrollTo, seedEvent, SENTINEL, setScores, shot, splashGone, type Seeded } from "./helpers";

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
  await rsvp.locator("label", { hasText: "جاي إن شاء الله" }).click();
  await rsvp.getByRole("button", { name: /زوّد: كبار/ }).click();
  await rsvp.getByRole("button", { name: /زوّد: أطفال/ }).click();
  await page.screenshot({ path: shot("rsvp-form-ar") });
  await rsvp.getByRole("button", { name: "ابعت الرد" }).click();
  await expect(page.getByTestId("rsvp-answer")).toContainText("مستنيينك");
  await expect(page.getByTestId("rsvp-answer")).toContainText("عدد الأفراد: اتنين كبار وطفل واحد");
  await page.screenshot({ path: shot("rsvp-answered-ar") });

  await page.reload();
  await splashGone(page);
  await expect(page.getByTestId("rsvp-answer")).toContainText("مستنيينك");

  await scrollTo(page, "#rsvp");
  await page.getByTestId("rsvp-answer").getByRole("button", { name: "غيّر ردّي" }).click();
  await rsvp.locator("label", { hasText: "مش هقدر" }).click();
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
  await page.getByTestId("rsvp").locator("label", { hasText: "جاي إن شاء الله" }).click();
  await page.getByTestId("rsvp").getByRole("button", { name: "ابعت الرد" }).click();
  await expect(page.getByTestId("rsvp-answer")).toContainText("مستنيينك");
});

test("basic plan (no games): a shared link replies with a name in the reply form itself", async ({ page }) => {
  const basic = await seedEvent("wedding", { plan: "essential" });
  await enterWithLink(page, basic, basic.codes.group);
  await expect(page.getByTestId("play")).toHaveCount(0);
  await expect(page.getByTestId("rsvp-join-first")).toHaveCount(0);

  const rsvp = page.getByTestId("rsvp");
  await scrollTo(page, "#rsvp");
  // A reply without a name is refused on the page, before anything is sent.
  await rsvp.locator("label", { hasText: "جاي إن شاء الله" }).click();
  await rsvp.getByRole("button", { name: "ابعت الرد" }).click();
  await expect(rsvp.getByRole("alert")).toContainText("حرفين");

  await rsvp.getByTestId("rsvp-name").fill("سلمى");
  await page.screenshot({ path: shot("rsvp-basic-ar") });
  await rsvp.getByRole("button", { name: "ابعت الرد" }).click();
  await expect(page.getByTestId("rsvp-answer")).toContainText("مستنيينك");
  // The return code is shown once, as when joining the games.
  await expect(page.getByTestId("rejoin-code")).toHaveText(/^[0-9]{6}$/);
  await page.getByRole("button", { name: "حفظته" }).click();

  await page.reload();
  await splashGone(page);
  await expect(page.getByTestId("greeting")).toContainText("سلمى");
  await expect(page.getByTestId("rsvp-answer")).toHaveAttribute("data-status", "yes");
  const { data: rows } = await admin.from("rsvps").select("status, player_id").eq("event_id", basic.id);
  expect(rows).toHaveLength(1);
  expect(rows![0].player_id).not.toBeNull();
});

test("a new live version refreshes the guest's own data without a reload", async ({ page }) => {
  await enterWithLink(page, event, event.codes.other);
  await scrollTo(page, "#play");
  await page.getByLabel("اسمك").fill("هالة");
  await page.getByTestId("team-groom").click();
  await page.getByRole("button", { name: "انضم", exact: true }).click();
  await page.getByRole("button", { name: "حفظته" }).click();
  await expect(page.getByTestId("greeting")).toContainText("هالة");

  // The hosts rename the player; nothing changes until the live version moves.
  const { data: player } = await admin.from("players").select("id").eq("event_id", event.id).eq("name", "هالة").single();
  await admin.from("players").update({ name: "هالة سامي" }).eq("id", player!.id);
  const { data: live } = await admin.from("live_state").select("version").eq("event_id", event.id).single();
  await admin.from("live_state").update({ version: (live?.version ?? 0) + 1 }).eq("event_id", event.id);
  await expect(page.getByTestId("badge")).toContainText("هالة سامي", { timeout: 20_000 });
});
