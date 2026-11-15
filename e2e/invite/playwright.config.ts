import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { defineConfig } from "@playwright/test";

// Guest-facing e2e. Run against a dev server started with:
//   APP_ORIGIN=http://localhost:3100 pnpm exec next dev -p 3100
//   pnpm exec playwright test -c e2e/invite/playwright.config.ts
const baseURL = process.env.INVITE_BASE_URL ?? "http://localhost:3100";

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
  timeout: 90_000,
  expect: { timeout: 15_000 },
  workers: 1,
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    baseURL,
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
    locale: "ar-EG",
    timezoneId: "Africa/Cairo",
    launchOptions: { executablePath: installedChromium() },
  },
});
