import { expect, test } from "@playwright/test";
import { admin, hashForDb, newCode, seedEvent, shot } from "./helpers";

test("the keeper seals in two steps and the page never shows the value again", async ({ page, browser }) => {
  const event = await seedEvent("gender_reveal");
  const code = newCode();
  await admin.from("reveals").insert({ event_id: event.id, keeper_code_hash: hashForDb(code) });

  const bodies: string[] = [];
  page.on("response", async (response) => {
    if (response.url().includes("/api/keeper")) bodies.push(await response.text().catch(() => ""));
  });

  await page.goto(`/k#${code}`);
  await expect(page.getByRole("heading", { name: "أمين السر" })).toBeVisible();
  expect(page.url()).not.toContain(code);
  await page.screenshot({ path: shot("keeper-choose-ar") });

  await page.getByTestId("baby-1").getByText("بنت").click();
  await page.getByRole("button", { name: /توأم/ }).click();
  await page.getByTestId("baby-2").getByText("ولد").click();
  await page.getByRole("button", { name: "اقفل السر" }).click();
  await expect(page.getByTestId("keeper-confirm")).toContainText("اخترت: بنت وولد");
  await page.screenshot({ path: shot("keeper-confirm-ar") });
  await page.getByRole("button", { name: "أيوه، اقفلها" }).click();

  await expect(page.getByTestId("keeper-sealed")).toBeVisible();
  await page.screenshot({ path: shot("keeper-sealed-ar") });
  const { data: sealed } = await admin.from("reveals").select("sealed_at, seal_count").eq("event_id", event.id).single();
  expect(sealed?.sealed_at).not.toBeNull();

  await page.reload();
  await expect(page.getByTestId("keeper-sealed")).toBeVisible();
  const text = await page.locator("body").innerText();
  expect(text).not.toMatch(/بنت|ولد|girl|boy/i);
  for (const body of bodies) expect(body).not.toMatch(/girl|boy/);

  // Correcting starts from an empty form.
  await page.getByRole("button", { name: "عايز أصحّح الاختيار" }).click();
  await expect(page.locator('input[type="radio"]:checked')).toHaveCount(0);

  // Another device is refused.
  const other = await browser.newContext();
  const second = await other.newPage();
  await second.goto(`/k#${code}`);
  await expect(second.getByTestId("keeper-other_device")).toBeVisible();
  await other.close();

  // Once the countdown has started the page is locked.
  await admin.from("reveals").update({ reveal_at: new Date(Date.now() + 600_000).toISOString() }).eq("event_id", event.id);
  await page.reload();
  await expect(page.getByTestId("keeper-locked")).toBeVisible();
});

test("an invalid keeper link says so", async ({ page }) => {
  await page.goto("/k#AAAAAAAAAAAAAAAAAAAAAA");
  await expect(page.getByTestId("keeper-not_found")).toBeVisible();
});
