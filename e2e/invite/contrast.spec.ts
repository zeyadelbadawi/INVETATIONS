import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";
import { seedEvent } from "./helpers";

// Copy over footage must stay readable on the frame it ends on. The still version
// shows the last frame with every line in its final place, the same picture a
// scrolling guest holds on. Each line's box is measured against the footage and
// scrim behind it (the text itself hidden), and the light text colour is compared
// with the brighter pixels there: 4.5:1 for the small lines, 3:1 for the names.
test.use({ reducedMotion: "reduce" });

const screens = {
  phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
  desktop: { viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false },
} as const;

type Line = { role: string; text: string; x: number; y: number; w: number; h: number; color: [number, number, number] };

const channel = (value: number) => {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const luminance = ([r, g, b]: [number, number, number]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
const ratio = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

async function measure(page: Page) {
  const lines: Line[] = await page.locator(".inv-ov").evaluateAll((elements) =>
    elements.map((element) => {
      const text = element.querySelector(".inv-ov__text")!;
      const box = text.getBoundingClientRect();
      const color = getComputedStyle(element).color.match(/\d+(\.\d+)?/g)!.slice(0, 3).map(Number) as [number, number, number];
      const role = [...element.classList].find((name) => name.startsWith("inv-ov--"))!.slice(8);
      return { role, text: text.textContent ?? "", x: box.x, y: box.y, w: box.width, h: box.height, color };
    }),
  );
  await page.addStyleTag({ content: ".inv-ov { color: transparent !important; } .inv-cta { visibility: hidden !important; }" });
  await page.waitForTimeout(100);
  const { data, info } = await sharp(await page.screenshot()).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return lines.map((line) => {
    const values: number[] = [];
    for (let y = Math.max(0, Math.floor(line.y)); y < Math.min(info.height, Math.ceil(line.y + line.h)); y++) {
      for (let x = Math.max(0, Math.floor(line.x)); x < Math.min(info.width, Math.ceil(line.x + line.w)); x++) {
        const i = (y * info.width + x) * 3;
        values.push(luminance([data[i], data[i + 1], data[i + 2]]));
      }
    }
    values.sort((a, b) => a - b);
    const text = luminance(line.color);
    const at = (share: number) => ratio(text, values[Math.min(values.length - 1, Math.floor(values.length * share))]);
    return { role: line.role, text: line.text, median: at(0.5), p95: at(0.95), p99: at(0.99) };
  });
}

for (const [screenName, screen] of Object.entries(screens)) {
  test.describe(screenName, () => {
    test.use(screen);
    for (const kind of ["wedding", "gender_reveal", "corporate"] as const) {
      for (const palette of ["sand", "night", "garden"] as const) {
        test(`${kind} on ${palette}: copy over the last frame is readable`, async ({ page }) => {
          const event = await seedEvent(kind, { palette });
          for (const locale of ["ar", "en"] as const) {
            await page.goto(`/i/${event.slug}/${locale}`);
            await expect(page.locator("[data-seq-stage]")).toHaveAttribute("data-animated", "false");
            await page.evaluate(() => document.fonts.ready);
            await page.waitForTimeout(500);
            const results = await measure(page);
            expect(results.length).toBeGreaterThanOrEqual(3);
            for (const result of results) {
              console.log(`${screenName} ${kind} ${palette} ${locale} ${result.role.padEnd(8)} median ${result.median.toFixed(1)}  p95 ${result.p95.toFixed(1)}  p99 ${result.p99.toFixed(1)}  ${result.text}`);
              expect(result.p95, `${result.role} "${result.text}"`).toBeGreaterThanOrEqual(result.role === "title" ? 3 : 4.5);
            }
          }
        });
      }
    }
  });
}
