import { expect, test, type Page } from "@playwright/test";
import { admin, enterWithLink, hashForDb, newCode, scrollTo, seedEvent, shot, type Seeded } from "./helpers";

async function sealedEvent(page: Page, answer: ("boy" | "girl")[], baseURL: string): Promise<Seeded> {
  const event = await seedEvent("gender_reveal");
  const keeper = newCode();
  await admin.from("reveals").insert({ event_id: event.id, keeper_code_hash: hashForDb(keeper) });
  const sealed = await page.request.post("/api/keeper", { data: { code: keeper, answer }, headers: { Origin: baseURL, "Content-Type": "application/json" } });
  expect((await sealed.json()).state).toBe("sealed");
  return event;
}

async function startCountdown(event: Seeded, seconds: number): Promise<number> {
  const revealAt = new Date(Date.now() + seconds * 1000);
  await admin.from("reveals").update({ reveal_at: revealAt.toISOString() }).eq("event_id", event.id);
  await admin.from("live_state").update({ phase: "countdown", public_payload: { revealAt: revealAt.toISOString() }, version: 2 }).eq("event_id", event.id);
  return revealAt.getTime();
}

for (const style of ["balloon", "scratch"] as const) {
  test(`reveal (${style}): countdown, nothing leaks before zero, then the right answer`, async ({ page, baseURL }) => {
    test.setTimeout(120_000);
    const event = await sealedEvent(page, ["girl"], baseURL!);
    await admin.from("reveals").update({ style }).eq("event_id", event.id);

    const seen: { at: number; url: string; body: string }[] = [];
    page.on("response", async (response) => {
      const url = response.url();
      if (!url.includes("/api/")) return;
      const at = Date.now();
      seen.push({ at, url, body: await response.text().catch(() => "") });
    });

    await enterWithLink(page, event, event.codes.group);
    await scrollTo(page, "#play");
    await page.getByLabel("اسمك").fill("هدى");
    await page.getByTestId("team-girl").click();
    await page.getByRole("button", { name: "انضم", exact: true }).click();
    await page.getByRole("button", { name: "حفظته" }).click();
    await scrollTo(page, "#reveal");
    await expect(page.getByTestId("reveal-stage")).toHaveAttribute("data-phase", "idle");
    if (style === "balloon") await page.screenshot({ path: shot("reveal-idle-ar") });

    const zero = await startCountdown(event, 9);
    await expect(page.getByTestId("reveal-countdown")).toBeVisible({ timeout: 8000 });
    if (style === "balloon") await page.screenshot({ path: shot("reveal-countdown-ar") });

    // While the clock runs: no marker anywhere in the stage or in the page's HTML attributes.
    while (Date.now() < zero - 1500) {
      await expect(page.locator("[data-answer]")).toHaveCount(0);
      const stage = await page.getByTestId("reveal-stage").innerText();
      expect(stage).not.toMatch(/بنت|ولد|girl|boy/i);
      await page.waitForTimeout(500);
    }

    // After zero the guest opens it themselves.
    const stage = page.getByTestId("reveal-stage");
    await expect(stage).toHaveAttribute("data-phase", "open", { timeout: 20_000 });
    await page.waitForTimeout(600);
    if (style === "balloon") {
      const balloon = stage.locator(".inv-balloon");
      await page.screenshot({ path: shot("reveal-balloon-ar") });
      await balloon.click();
      await balloon.click();
      await balloon.click();
      await page.waitForTimeout(350);
      await page.screenshot({ path: shot("reveal-balloon-popped-ar") });
    } else {
      const foil = stage.locator(".inv-scratch__foil");
      await page.screenshot({ path: shot("reveal-scratch-ar") });
      const box = (await foil.boundingBox())!;
      await page.mouse.move(box.x + 10, box.y + 15);
      await page.mouse.down();
      for (let row = 0; row < 5; row++) {
        const y = box.y + 15 + row * (box.height / 5);
        await page.mouse.move(row % 2 ? box.x + 10 : box.x + box.width - 10, y, { steps: 12 });
        await page.mouse.move(row % 2 ? box.x + box.width - 10 : box.x + 10, y + 10, { steps: 12 });
      }
      await page.mouse.up();
      await page.waitForTimeout(500);
      await page.screenshot({ path: shot("reveal-scratch-cleared-ar") });
    }
    const result = page.getByTestId("reveal-result");
    await expect(result).toHaveAttribute("data-answer", "girl", { timeout: 10_000 });
    await expect(result).toContainText("بنت!");
    await expect(result).toContainText("كنت عارف!");
    await page.waitForTimeout(700);
    await page.screenshot({ path: shot(`reveal-result-${style}-ar`) });

    // Every API response received before database zero is free of the answer.
    const { data: reveal } = await admin.from("reveals").select("revealed_at").eq("event_id", event.id).single();
    const released = new Date(reveal!.revealed_at!).getTime();
    expect(released).toBeGreaterThanOrEqual(zero - 50);
    const before = seen.filter((r) => r.at < zero - 100 && /\/api\/(live|guest|time)/.test(r.url));
    expect(before.filter((r) => r.url.includes("/api/live")).length).toBeGreaterThan(3);
    for (const response of before) {
      if (response.url.includes("/me") || response.url.includes("/join")) continue; // team names "تيم بنت" are public
      expect(response.body, response.url).not.toMatch(/girl|boy/);
    }
    expect(seen.some((r) => /"answer":\["girl"\]/.test(r.body))).toBe(true);

    // A late opener sees the result at once, with no countdown.
    await page.reload();
    await expect(page.getByTestId("reveal-result")).toHaveAttribute("data-answer", "girl");
  });
}

test("twins, opened by someone on the other team", async ({ page, baseURL }) => {
  const event = await sealedEvent(page, ["boy", "girl"], baseURL!);
  await startCountdown(event, 1);
  await page.goto(`/i/${event.slug}/en`);
  const result = page.getByTestId("reveal-result");
  await expect(result).toHaveAttribute("data-answer", "boy,girl", { timeout: 30_000 });
  await expect(result).toContainText("Both teams win!");
});
