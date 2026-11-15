import { expect, test } from "@playwright/test";
import { enterWithLink, seedEvent, shot, type Seeded } from "./helpers";

let event: Seeded;
test.beforeAll(async () => {
  event = await seedEvent("wedding");
});

test("a personal link opens the invitation, and the code is gone from the URL and history", async ({ page }) => {
  await enterWithLink(page, event, event.codes.personal);
  expect(new URL(page.url()).pathname).toBe(`/i/${event.slug}/ar`);
  expect(page.url()).not.toContain(event.codes.personal);
  expect(page.url()).not.toContain("#");

  const me = await page.evaluate(async (slug) => {
    const response = await fetch(`/api/guest/${slug}/me`);
    return { status: response.status, body: await response.json() };
  }, event.slug);
  expect(me.status).toBe(200);
  expect(me.body.invitation.label).toBe(event.labels.personal);

  // Going back must not land on a URL that carries the code.
  await page.goBack().catch(() => null);
  expect(page.url()).not.toContain(event.codes.personal);
  await page.goForward().catch(() => null);
  expect(page.url()).not.toContain(event.codes.personal);
});

test("a wrong code shows a friendly message and creates no session", async ({ page }) => {
  await page.goto(`/l/${event.slug}#AAAAAAAAAAAAAAAAAAAAAA`);
  await expect(page.locator("h1[role=alert]")).toContainText("الرابط ده مش شغال");
  expect(page.url()).not.toContain("AAAA");
  await page.screenshot({ path: shot("link-invalid-ar") });
  const status = await page.evaluate(async (slug) => (await fetch(`/api/guest/${slug}/me`)).status, event.slug);
  expect(status).toBe(401);
});

test("no code sends the visitor to the public invitation", async ({ page }) => {
  await page.goto(`/l/${event.slug}`);
  await page.waitForURL(new RegExp(`/i/${event.slug}/ar$`));
});

test("a second invitation on the same phone asks before switching", async ({ page }) => {
  await enterWithLink(page, event, event.codes.personal);
  await page.goto(`/l/${event.slug}#${event.codes.group}`);
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText(event.labels.personal);
  await page.screenshot({ path: shot("link-confirm-ar") });
  await dialog.getByRole("button", { name: "بدّل للدعوة دي" }).click();
  await page.waitForURL(new RegExp(`/i/${event.slug}/ar$`));
  const label = await page.evaluate(async (slug) => (await (await fetch(`/api/guest/${slug}/me`)).json()).invitation.label, event.slug);
  expect(label).toBe(event.labels.group);
});

test("a plain GET without JavaScript does nothing", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  const response = await page.goto(`/l/${event.slug}`);
  expect(response?.status()).toBe(200);
  expect((await context.cookies()).filter((cookie) => cookie.name.startsWith("__Host-g_"))).toHaveLength(0);
  await context.close();
});
