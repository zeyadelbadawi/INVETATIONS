import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { defineConfig } from "@playwright/test";

// Marketing-site e2e. Run against a production server started with:
//   pnpm exec next build
//   APP_ORIGIN=http://localhost:3300 pnpm exec next start -p 3300
//   pnpm exec playwright test -c e2e/marketing/playwright.config.ts
const baseURL = process.env.MARKETING_BASE_URL ?? "http://localhost:3300";

// Machines that ship a Chromium for a different Playwright version: use whichever build is installed.
function installedChromium(): string | undefined {
  if (process.env.PW_CHROMIUM_PATH) return process.env.PW_CHROMIUM_PATH;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!root || !existsSync(root)) return undefined;
  for (const dir of readdirSync(root).filter((name) => name.startsWith("chromium_headless_shell-")).sort().reverse()) {
    const binary = path.join(root, dir, "chrome-headless-shell-linux64", "chrome-headless-shell");
    if (existsSync(binary)) return binary;
  }
  return undefined;
}

export default defineConfig({
  testDir: ".",
  outputDir: "./.results",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  workers: 1,
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    baseURL,
    deviceScaleFactor: 1,
    timezoneId: "Africa/Cairo",
    launchOptions: { executablePath: installedChromium() },
  },
  projects: [
    {
      name: "mobile",
      use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: "ar-EG" },
    },
    {
      name: "desktop",
      use: { viewport: { width: 1280, height: 800 }, locale: "en-US" },
    },
  ],
});
