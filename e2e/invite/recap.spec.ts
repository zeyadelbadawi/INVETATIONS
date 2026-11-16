import { expect, test } from "@playwright/test";
import { admin, enterWithLink, scrollTo, seedEvent, setScores, shot, splashGone, type Seeded } from "./helpers";

// After the event: guests with their link see the final standings, top players
// (first names, approved only) and the highlighted wishes. The public page does not.
let event: Seeded;

test.beforeAll(async () => {
  event = await seedEvent("wedding", { status: "ended" });
  await setScores(event, { groom: [30, 2], bride: [52, 3], friends: [12, 1] });
  const { data: invitation } = await admin.from("invitations").select("id").eq("event_id", event.id).eq("kind", "group").limit(1).single();
  const team = (key: string) => event.teams.find((t) => t.key === key)!.id;
  const { data: players, error } = await admin
    .from("players")
    .insert([
      { event_id: event.id, invitation_id: invitation!.id, name: "هالة فؤاد", team_id: team("bride"), approved: true },
      { event_id: event.id, invitation_id: invitation!.id, name: "كريم منصور", team_id: team("groom"), approved: true },
      { event_id: event.id, invitation_id: invitation!.id, name: "مستخدم مخفي", team_id: team("bride"), approved: false },
    ])
    .select("id, team_id");
  if (error || !players) throw error ?? new Error("players insert failed");
  await admin.from("score_events").insert(players.map((p, i) => ({ event_id: event.id, player_id: p.id, team_id: p.team_id, points: [40, 25, 99][i], reason: "quiz_correct", ref: "e2e" })));
  await admin.from("wall_posts").insert([
    { event_id: event.id, player_id: players[0].id, kind: "text", body: "ألف مبروك يا أحلى عروسين", status: "visible", highlighted: true },
    { event_id: event.id, player_id: players[1].id, kind: "text", body: "أمنية مش مختارة", status: "visible", highlighted: false },
  ]);
});

test("a guest with their link sees the recap", async ({ page }) => {
  await enterWithLink(page, event, event.codes.personal);
  const recap = page.getByTestId("recap");
  await expect(recap).toBeVisible();
  await expect(page.getByTestId("recap-winner")).toContainText("أهل العروسة");
  const top = page.getByTestId("recap-top");
  await expect(top).toContainText("هالة");
  await expect(top).toContainText("كريم");
  await expect(top).not.toContainText("فؤاد");
  await expect(recap).not.toContainText("مخفي");
  await expect(page.getByTestId("recap-highlights")).toContainText("ألف مبروك يا أحلى عروسين");
  await expect(page.getByTestId("recap-highlights")).not.toContainText("أمنية مش مختارة");
  await scrollTo(page, "#recap");
  await page.screenshot({ path: shot("recap-ar") });
});

test("the public page shows no recap", async ({ page }) => {
  await page.goto(`/i/${event.slug}/ar`);
  await splashGone(page);
  await expect(page.getByTestId("locked-card")).toBeVisible();
  await expect(page.getByTestId("recap")).toHaveCount(0);
  expect(await page.content()).not.toContain("هالة");
});
