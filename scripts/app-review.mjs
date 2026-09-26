import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import fs from "node:fs/promises";
import { createWorkspace } from "../shared/workspace.js";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const report = [];
for (const width of [375, 768, 1496]) {
  const context = await browser.newContext({
    viewport: { width, height: 850 },
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const s = createWorkspace();
  s.profile = { name: "Alex", role: "Product team", onboarded: true };
  await page.addInitScript((value) => {
    if (!localStorage.getItem("offload.workspace.v1"))
      localStorage.setItem("offload.workspace.v1", JSON.stringify(value));
  }, s);
  for (const route of ["", "/memory", "/sleep", "/connections", "/settings"]) {
    await page.goto("http://127.0.0.1:5193/app" + route);
    await page.waitForSelector(".app-content");
    const axe = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    report.push({
      width,
      route,
      overflow: await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      errors: [...errors],
      violations: axe.violations.map((x) => ({
        id: x.id,
        impact: x.impact,
        nodes: x.nodes.map((n) => n.target),
      })),
    });
    if (!route)
      await page.screenshot({ path: `test-results/app-${width}.png` });
  }
  await context.close();
}
await fs.writeFile(
  "test-results/app-review.json",
  JSON.stringify(report, null, 2),
);
console.log(
  JSON.stringify(
    report.filter((x) => x.errors.length || x.overflow || x.violations.length),
  ),
);
await browser.close();
