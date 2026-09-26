import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import fs from "node:fs/promises";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const report = [];
for (const width of [375, 390, 768, 1496, 1920]) {
  const context = await browser.newContext({
    viewport: { width, height: width < 600 ? 844 : 900 },
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:5193/");
  await page.waitForTimeout(500);
  await page.screenshot({
    path: `test-results/landing-${width}.png`,
    fullPage: true,
  });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > innerWidth,
  );
  const axe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  report.push({
    width,
    overflow,
    errors,
    violations: axe.violations.map((x) => ({
      id: x.id,
      impact: x.impact,
      count: x.nodes.length,
    })),
  });
  await context.close();
}
await fs.writeFile(
  "test-results/layout-review.json",
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report));
await browser.close();
