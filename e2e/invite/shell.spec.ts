import { expect, test } from "@playwright/test";
import { enterWithLink, seedEvent, SENTINEL, splashGone, type Seeded } from "./helpers";

let event: Seeded;
test.beforeAll(async () => {
  event = await seedEvent("wedding");
});

test("the shell is byte-identical with and without the guest cookie and holds nothing guest-only", async ({ page, playwright, baseURL }) => {
  await enterWithLink(page, event, event.codes.personal);
  const cookies = (await page.context().cookies()).filter((cookie) => cookie.name.startsWith("__Host-g_"));
  expect(cookies).toHaveLength(1);
  // The guest API does return the sentinel to this session: the test data is really there.
  const me = await page.evaluate(async (slug) => await (await fetch(`/api/guest/${slug}/me`)).text(), event.slug);
  expect(me).toContain(SENTINEL);

  const anonymous = await playwright.request.newContext({ baseURL });
  const guest = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { Cookie: cookies.map((c) => `${c.name}=${c.value}`).join("; ") } });
  for (const locale of ["ar", "en"]) {
    const path = `/i/${event.slug}/${locale}`;
    await anonymous.get(path); // warm, so both reads see the same compiled page
    const plain = await (await anonymous.get(path)).text();
    const withCookie = await (await guest.get(path)).text();
    expect(plain.length).toBeGreaterThan(5000);
    expect(withCookie).toBe(plain);
    expect(plain).not.toContain(SENTINEL);
    expect(plain).not.toContain(event.labels.personal);
    expect(plain).not.toContain("90th Street");
    expect(plain).not.toContain("برنامج اليوم");
    expect(plain).toContain(locale === "ar" ? "ياسمين" : "Yasmine");
  }
  await anonymous.dispose();
  await guest.dispose();
});

test("Arabic is right-to-left and English left-to-right, with a switch between them", async ({ page }) => {
  await page.goto(`/i/${event.slug}/ar`);
  await splashGone(page);
  await expect(page.locator(".inv")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await page.locator(".inv-lang").click();
  await page.waitForURL(`**/i/${event.slug}/en`);
  await splashGone(page);
  await expect(page.locator(".inv")).toHaveAttribute("dir", "ltr");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
});

test("an event written in one language hides the switch", async ({ page }) => {
  const single = await seedEvent("wedding", { arabicOnly: true });
  await page.goto(`/i/${single.slug}/ar`);
  await splashGone(page);
  await expect(page.locator(".inv-lang")).toHaveCount(0);
});

test("unknown slug or locale is not found; anonymous visitors get one calm card", async ({ page }) => {
  await page.goto(`/i/${event.slug}/fr`);
  await expect(page.locator(".inv")).toHaveCount(0);
  await page.goto(`/i/nope-nope-000000/ar`);
  await expect(page.locator(".inv")).toHaveCount(0);

  await page.goto(`/i/${event.slug}/ar`);
  await splashGone(page);
  await expect(page.getByTestId("locked-card")).toHaveCount(1);
  await expect(page.getByTestId("rsvp")).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText(SENTINEL);
});
