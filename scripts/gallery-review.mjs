import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import { createWorkspace } from "../shared/workspace.js";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 1496, height: 850 },
});
const page = await context.newPage(),
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const s = createWorkspace();
s.profile = { name: "Reviewer", role: "Product team", onboarded: true };
await page.addInitScript(
  (value) =>
    localStorage.setItem("offload.workspace.v1", JSON.stringify(value)),
  s,
);
await page.goto("http://127.0.0.1:5193/app/library");
await page.waitForSelector(".gallery-layout");
const names = await page
  .locator(".gallery-layout nav button")
  .allTextContents();
const report = [];
for (const name of names) {
  const before = errors.length;
  await page
    .locator(".gallery-layout nav")
    .getByRole("button", { name, exact: true })
    .click();
  await page.waitForTimeout(180);
  report.push({
    name,
    errors: errors.slice(before),
    fallback: await page
      .getByText("This upstream preview needs a supporting dependency.", {
        exact: false,
      })
      .count(),
  });
}
await fs.writeFile(
  "test-results/gallery-review.json",
  JSON.stringify(report, null, 2),
);
console.log(
  JSON.stringify(report.filter((x) => x.errors.length || x.fallback)),
);
console.log("Inspected", names.length, "components");
await browser.close();
