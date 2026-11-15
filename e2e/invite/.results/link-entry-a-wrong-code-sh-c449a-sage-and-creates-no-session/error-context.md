# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: link-entry.spec.ts >> a wrong code shows a friendly message and creates no session
- Location: e2e/invite/link-entry.spec.ts:29:1

# Error details

```
Error: expect(locator).toContainText(expected) failed

Locator: getByRole('alert')
Expected substring: "الرابط ده مش شغال"
Error: strict mode violation: getByRole('alert') resolved to 2 elements:
    1) <h1 role="alert" class="inv-gate__title">الرابط ده مش شغال</h1> aka getByText('الرابط ده مش شغال')
    2) <div role="alert" aria-live="assertive" id="__next-route-announcer__"></div> aka locator('[id="__next-route-announcer__"]')

Call log:
  - Expect "toContainText" getByRole('alert') with timeout 15000ms
  - waiting for getByRole('alert')
    2 × locator resolved to <div role="alert" aria-live="assertive" id="__next-route-announcer__"></div>
      - unexpected value ""

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - main [ref=e3]:
    - generic [ref=e4]:
      - alert [ref=e8]: الرابط ده مش شغال
      - paragraph [ref=e9]: ممكن يكون اتلغى أو اتنسخ ناقص. اطلب رابط جديد من صاحب الدعوة.
      - link "شوف الدعوة" [ref=e11] [cursor=pointer]:
        - /url: /i/e2e-wedding-afe4a3/ar
  - button "Open Next.js Dev Tools" [ref=e17] [cursor=pointer]
  - alert [ref=e21]
```

# Test source

```ts
  1  | import { expect, test } from "@playwright/test";
  2  | import { enterWithLink, seedEvent, shot, type Seeded } from "./helpers";
  3  | 
  4  | let event: Seeded;
  5  | test.beforeAll(async () => {
  6  |   event = await seedEvent("wedding");
  7  | });
  8  | 
  9  | test("a personal link opens the invitation, and the code is gone from the URL and history", async ({ page }) => {
  10 |   await enterWithLink(page, event, event.codes.personal);
  11 |   expect(new URL(page.url()).pathname).toBe(`/i/${event.slug}/ar`);
  12 |   expect(page.url()).not.toContain(event.codes.personal);
  13 |   expect(page.url()).not.toContain("#");
  14 | 
  15 |   const me = await page.evaluate(async (slug) => {
  16 |     const response = await fetch(`/api/guest/${slug}/me`);
  17 |     return { status: response.status, body: await response.json() };
  18 |   }, event.slug);
  19 |   expect(me.status).toBe(200);
  20 |   expect(me.body.invitation.label).toBe(event.labels.personal);
  21 | 
  22 |   // Going back must not land on a URL that carries the code.
  23 |   await page.goBack().catch(() => null);
  24 |   expect(page.url()).not.toContain(event.codes.personal);
  25 |   await page.goForward().catch(() => null);
  26 |   expect(page.url()).not.toContain(event.codes.personal);
  27 | });
  28 | 
  29 | test("a wrong code shows a friendly message and creates no session", async ({ page }) => {
  30 |   await page.goto(`/l/${event.slug}#AAAAAAAAAAAAAAAAAAAAAA`);
> 31 |   await expect(page.getByRole("alert")).toContainText("الرابط ده مش شغال");
     |                                         ^ Error: expect(locator).toContainText(expected) failed
  32 |   expect(page.url()).not.toContain("AAAA");
  33 |   await page.screenshot({ path: shot("link-invalid-ar") });
  34 |   const status = await page.evaluate(async (slug) => (await fetch(`/api/guest/${slug}/me`)).status, event.slug);
  35 |   expect(status).toBe(401);
  36 | });
  37 | 
  38 | test("no code sends the visitor to the public invitation", async ({ page }) => {
  39 |   await page.goto(`/l/${event.slug}`);
  40 |   await page.waitForURL(new RegExp(`/i/${event.slug}/ar$`));
  41 | });
  42 | 
  43 | test("a second invitation on the same phone asks before switching", async ({ page }) => {
  44 |   await enterWithLink(page, event, event.codes.personal);
  45 |   await page.goto(`/l/${event.slug}#${event.codes.group}`);
  46 |   const dialog = page.getByRole("alertdialog");
  47 |   await expect(dialog).toContainText(event.labels.personal);
  48 |   await page.screenshot({ path: shot("link-confirm-ar") });
  49 |   await dialog.getByRole("button", { name: "بدّل للدعوة دي" }).click();
  50 |   await page.waitForURL(new RegExp(`/i/${event.slug}/ar$`));
  51 |   const label = await page.evaluate(async (slug) => (await (await fetch(`/api/guest/${slug}/me`)).json()).invitation.label, event.slug);
  52 |   expect(label).toBe(event.labels.group);
  53 | });
  54 | 
  55 | test("a plain GET without JavaScript does nothing", async ({ browser }) => {
  56 |   const context = await browser.newContext({ javaScriptEnabled: false });
  57 |   const page = await context.newPage();
  58 |   const response = await page.goto(`/l/${event.slug}`);
  59 |   expect(response?.status()).toBe(200);
  60 |   expect((await context.cookies()).filter((cookie) => cookie.name.startsWith("__Host-g_"))).toHaveLength(0);
  61 |   await context.close();
  62 | });
  63 | 
```