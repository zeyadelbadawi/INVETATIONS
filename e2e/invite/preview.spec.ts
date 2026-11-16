import { expect, test, type Page } from "@playwright/test";
import { sampleContent, shot } from "./helpers";

// The editor embeds the preview with sandbox="allow-scripts" (opaque origin). Under `next dev`
// that cannot hydrate: Next's dev-only "instant navigation testing" bootstrap reads
// document.cookie, which throws in an opaque-origin document. So against a dev server the
// harness adds allow-same-origin; against a production server run with PREVIEW_STRICT_SANDBOX=1.
const STRICT = process.env.PREVIEW_STRICT_SANDBOX === "1";
const SANDBOX = STRICT ? "allow-scripts" : "allow-scripts allow-same-origin";

// A stand-in for the editor: a same-origin page that embeds the sandboxed
// preview and posts a draft once the frame says it is ready.
async function host(page: Page, message: Record<string, unknown>) {
  await page.goto("/k"); // any same-origin page will do as the parent
  await page.evaluate(({ draft, sandbox }) => {
    document.body.innerHTML = "";
    const frame = document.createElement("iframe");
    frame.setAttribute("sandbox", sandbox);
    frame.src = "/preview";
    frame.style.cssText = "position:fixed;inset:0;width:100%;height:100%;border:0;background:#fff";
    window.addEventListener("message", (event) => {
      if (event.source === frame.contentWindow && event.data?.type === "lamma:preview-ready") {
        (window as unknown as { readyOrigin: string }).readyOrigin = event.origin;
        frame.contentWindow!.postMessage(draft, "*");
      }
    });
    document.body.appendChild(frame);
  }, { draft: message, sandbox: SANDBOX });
  return page.frameLocator("iframe");
}

test("the preview renders a posted draft: public and guest blocks together, forms disabled", async ({ page }) => {
  const content = sampleContent("wedding");
  const frame = await host(page, { type: "lamma:draft", content, theme: { palette: "garden" }, locale: "ar", templateId: "wedding-draft", templateVersion: 1, kind: "wedding" });
  await expect(frame.getByTestId("preview-root")).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { readyOrigin: string }).readyOrigin)).toBe(STRICT ? "null" : new URL(page.url()).origin);
  await expect(frame.locator(".inv")).toHaveAttribute("data-palette", "garden");
  await expect(frame.locator('[data-block="details"]')).toContainText("قاعة اللوتس");
  await expect(frame.locator('[data-block="location"]')).toBeVisible();
  await expect(frame.locator('[data-block="programme"]')).toBeVisible();
  await expect(frame.getByTestId("rsvp").locator("input").first()).toBeDisabled();
  await expect(frame.getByTestId("join-form").getByRole("button", { name: "انضم" })).toBeDisabled();
  await expect(frame.locator("[data-splash-panel]")).toHaveCount(0);
});

test("the preview ignores malformed drafts and scripts in text stay text", async ({ page }) => {
  const content = sampleContent("wedding");
  content.fields.partner_one = { ar: '<img src=x onerror="window.pwned=1">', en: "" };
  const frame = await host(page, { type: "lamma:draft", content, theme: { palette: "<style>" }, locale: "ar", templateId: "wedding-draft", templateVersion: 1, kind: "wedding" });
  await page.waitForTimeout(1500);
  await expect(frame.getByTestId("preview-waiting")).toBeVisible(); // bad theme id: rejected whole
  await page.evaluate((draft) => document.querySelector("iframe")!.contentWindow!.postMessage(draft, "*"), { type: "lamma:draft", content, theme: {}, locale: "ar", templateId: "wedding-draft", templateVersion: 1, kind: "wedding" } as never);
  await expect(frame.locator(".inv-ov--title").first()).toContainText("<img src=x");
  await expect(frame.locator(".inv-ov img")).toHaveCount(0);
});

// The preview is also the visual harness for states that are hard to reach by hand.
for (const [name, extra] of [
  ["wedding-sections-ar", { kind: "wedding", locale: "ar", demo: { sections: true } }],
  ["wedding-sections-en", { kind: "wedding", locale: "en", demo: { sections: true } }],
  ["reveal-twins-night-ar", { kind: "gender_reveal", locale: "ar", theme: { palette: "night" }, demo: { reveal: "result", answer: ["boy", "girl"], joined: true } }],
  ["reveal-scratch-en", { kind: "gender_reveal", locale: "en", demo: { reveal: "open", revealStyle: "scratch", answer: ["girl"] } }],
  ["corporate-night-en", { kind: "corporate", locale: "en", theme: { palette: "night" }, demo: { joined: true } }],
] as const) {
  test(`harness: ${name}`, async ({ page }) => {
    const kind = extra.kind;
    const templateId = { wedding: "wedding-draft", gender_reveal: "reveal-draft", corporate: "corporate-draft" }[kind];
    const frame = await host(page, { type: "lamma:draft", content: sampleContent(kind), theme: {}, templateId, templateVersion: 1, ...extra });
    await expect(frame.getByTestId("preview-root")).toBeVisible();
    await frame.locator("#details").evaluate((el) => el.scrollIntoView({ block: "start", behavior: "instant" }));
    await page.waitForTimeout(900);
    const height = await frame.locator(".inv").evaluate((el) => el.scrollHeight);
    await page.setViewportSize({ width: 390, height: Math.min(height, 9000) });
    await page.waitForTimeout(400);
    await frame.locator("#details").screenshot({ path: shot(`harness-${name}`) });
  });
}

test("scratch card: scratching the foil away shows the answer", async ({ page }) => {
  const frame = await host(page, { type: "lamma:draft", content: sampleContent("gender_reveal"), theme: {}, locale: "ar", templateId: "reveal-draft", templateVersion: 1, kind: "gender_reveal", demo: { reveal: "open", revealStyle: "scratch", answer: ["girl"], joined: true } });
  const foil = frame.locator(".inv-scratch__foil");
  await foil.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await expect(frame.locator("[data-answer]")).toHaveCount(0);
  await page.screenshot({ path: shot("reveal-scratch-ar") });
  const box = (await foil.boundingBox())!;
  await page.mouse.move(box.x + 10, box.y + 12);
  await page.mouse.down();
  for (let row = 0; row < 6; row++) {
    const y = box.y + 12 + row * (box.height / 6);
    await page.mouse.move(row % 2 ? box.x + 10 : box.x + box.width - 10, y, { steps: 10 });
    await page.mouse.move(row % 2 ? box.x + box.width - 10 : box.x + 10, y + 12, { steps: 10 });
  }
  await page.mouse.up();
  await expect(frame.locator(".inv-scratch__card")).toHaveAttribute("data-cleared", "true");
  await page.waitForTimeout(450);
  await page.screenshot({ path: shot("reveal-scratch-cleared-ar") });
  await expect(frame.getByTestId("reveal-result")).toHaveAttribute("data-answer", "girl", { timeout: 10_000 });
});
