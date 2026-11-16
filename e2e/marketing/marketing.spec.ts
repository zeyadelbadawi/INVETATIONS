import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

const shots = path.join(__dirname, "__screenshots__");
mkdirSync(shots, { recursive: true });

// Fail on any console error or uncaught exception on the page.
function watchConsole(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

// Scroll through the page so lazy images load, then wait for every visible image.
async function loadAllImages(page: Page) {
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 500) {
      window.scrollTo(0, y);
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    document.querySelectorAll<HTMLImageElement>("img[loading=lazy]").forEach((img) => (img.loading = "eager"));
    window.scrollTo(0, 0);
  });
  await page.waitForFunction(() => [...document.images].filter((i) => i.offsetParent).every((i) => i.complete && i.naturalWidth > 0));
}

async function noHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

for (const lang of ["ar", "en"] as const) {
  const dir = lang === "ar" ? "rtl" : "ltr";

  for (const route of ["", "/pricing", "/how-it-works"] as const) {
    test(`${lang}${route || "/"} renders ${dir} without errors`, async ({ page }, info) => {
      const errors = watchConsole(page);
      const response = await page.goto(`/${lang}${route}`);
      expect(response?.status()).toBe(200);
      await expect(page.locator("html")).toHaveAttribute("dir", dir);
      await expect(page.locator("html")).toHaveAttribute("lang", lang);
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
      await expect(page.locator("main#main")).toBeVisible();
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", new RegExp(`/${lang}${route}$`));
      await expect(page.locator('link[rel="alternate"][hreflang="ar"]')).toHaveCount(1);
      await expect(page.locator('link[rel="alternate"][hreflang="en"]')).toHaveCount(1);
      await expect(page.locator('meta[property="og:image"]')).toHaveCount(1);
      await noHorizontalOverflow(page);
      // Let the load sequence finish, then capture the whole page.
      await page.waitForTimeout(2600);
      await loadAllImages(page);
      const name = `${route ? route.slice(1) : "home"}-${lang}-${info.project.name}.png`;
      await page.screenshot({ path: path.join(shots, name), fullPage: true });
      expect(errors).toEqual([]);
    });
  }

  test(`${lang}: header links reach login and signup`, async ({ page }, info) => {
    await page.goto(`/${lang}`);
    const header = page.locator("header");
    if (info.project.name === "mobile") {
      await header.getByRole("button", { expanded: false }).click();
      await page.locator("header nav").getByRole("link", { name: lang === "ar" ? "تسجيل الدخول" : "Log in" }).click();
    } else {
      await header.getByRole("link", { name: lang === "ar" ? "تسجيل الدخول" : "Log in" }).click();
    }
    await expect(page).toHaveURL(new RegExp(`/${lang}/login$`));
    await page.goto(`/${lang}`);
    await header.getByRole("link", { name: lang === "ar" ? /^ابدأ/ : /^Start/ }).first().click();
    await expect(page).toHaveURL(new RegExp(`/${lang}/signup$`));
  });

  test(`${lang}: language switch keeps the page`, async ({ page }) => {
    await page.goto(`/${lang}/pricing`);
    const other = lang === "ar" ? "en" : "ar";
    await page.locator(`footer a[hreflang="${other}"]`).click();
    await expect(page).toHaveURL(new RegExp(`/${other}/pricing$`));
    await expect(page.locator("html")).toHaveAttribute("lang", other);
  });
}

test("mobile menu opens and closes with the keyboard", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile", "The menu button exists on phones only.");
  await page.goto("/ar");
  await page.waitForTimeout(2600);
  const button = page.locator("header").getByRole("button", { name: "القائمة" });
  await expect(button).toHaveAttribute("aria-expanded", "false");
  await button.focus();
  await page.keyboard.press("Enter");
  await expect(button).toHaveAttribute("aria-expanded", "true");
  const panel = page.locator(`#${await button.getAttribute("aria-controls")}`.replace(/:/g, "\\:"));
  await expect(panel).toBeVisible();
  // Focus moves into the panel.
  await expect(panel.getByRole("link").first()).toBeFocused();
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(shots, "menu-open-ar-mobile.png") });
  await page.keyboard.press("Escape");
  await expect(button).toHaveAttribute("aria-expanded", "false");
  await expect(panel).toBeHidden();
  await expect(button).toBeFocused();
  // Space toggles it too.
  await page.keyboard.press(" ");
  await expect(button).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
});

test("no horizontal overflow at 360px", async ({ page }) => {
  for (const url of ["/ar", "/en", "/ar/pricing", "/en/pricing", "/ar/how-it-works", "/en/how-it-works"]) {
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto(url);
    await page.waitForTimeout(300);
    await noHorizontalOverflow(page);
  }
});

test("demo vote shows the room's answer", async ({ page }) => {
  await page.goto("/en");
  const him = page.getByRole("button", { name: "Him", exact: true });
  await him.scrollIntoViewIfNeeded();
  await him.click();
  await expect(him).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("The couple says: him.")).toBeVisible();
});

test("FAQ answers open", async ({ page }) => {
  await page.goto("/en");
  const first = page.locator("#faq details").first();
  await first.locator("summary").click();
  await expect(first).toHaveAttribute("open", "");
  await expect(page.locator("#faq details")).toHaveCount(10);
});

test("robots.txt keeps private paths out of search", async ({ request }) => {
  const response = await request.get("/robots.txt");
  expect(response.status()).toBe(200);
  const body = await response.text();
  for (const p of ["/i/", "/l/", "/k", "/preview", "/api/", "/*/app", "/*/admin"]) {
    expect(body).toContain(`Disallow: ${p}\n`);
  }
  expect(body).toMatch(/Sitemap: .*\/sitemap\.xml/);
});

test("pricing shows the launch prices", async ({ page }) => {
  await page.goto("/en/pricing");
  const main = page.locator("main");
  await expect(main.getByText("350", { exact: true }).first()).toBeVisible();
  await expect(main.getByText("750", { exact: true }).first()).toBeVisible();
  await expect(main.getByText("+1,000", { exact: true }).first()).toBeVisible();
});
