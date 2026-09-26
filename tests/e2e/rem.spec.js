import { test, expect } from "@playwright/test";
import { createWorkspace } from "../../shared/workspace.js";

// REM has its own shared backend at /api/rem/*, independent of the Offload workspace store.
// We only need the workspace pre-onboarded so Workspace.jsx renders its nav instead of onboarding.
async function openRem(page) {
  const state = createWorkspace();
  state.profile.onboarded = true;
  state.profile.name = "Tester";
  await page.addInitScript((s) => localStorage.setItem("offload.workspace.v1", JSON.stringify(s)), state);
  await page.goto("/app/rem");
  await expect(page.getByRole("heading", { name: "REM", exact: true })).toBeVisible();
}

test("REM: run a task live, sleep, and see the morning brief and diff", async ({ page }, info) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await openRem(page);

  // Day: run the default task (weekly brief) and watch it stream in over SSE.
  await page.getByRole("button", { name: "Run", exact: true }).click();
  const runStatus = page.locator(".rem-live-run .status-label").first();
  await expect(runStatus).toBeVisible({ timeout: 15000 });
  await expect
    .poll(async () => (await runStatus.textContent())?.trim(), { timeout: 15000 })
    .toMatch(/^(done|unverified|paused_for_auth)$/);
  if ((await runStatus.textContent())?.trim() === "paused_for_auth") {
    await page.locator(".notice").getByRole("button", { name: /^Reconnect/ }).click();
    await expect.poll(async () => (await runStatus.textContent())?.trim(), { timeout: 15000 }).toMatch(/^(done|unverified)$/);
  }
  await expect(page.locator(".rem-run-log li").first()).toBeVisible();
  await expect(page.locator(".rem-run-row").first()).toBeVisible();

  // Night: sleep once and see the real phases render (Replay, Merge, Distill, Evolve, asks, brief).
  // The workspace shell has its own Sleep control; target the REM night section.
  await page.getByRole("region", { name: "Night" }).getByRole("button", { name: "Sleep", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Replay", exact: true })).toBeVisible({ timeout: 20000 });
  await expect(page.getByRole("heading", { name: "Merge", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Distill", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Evolve", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Asks queued", exact: true })).toBeVisible();
  await expect(page.locator(".rem-table").first()).toBeVisible();

  // Morning: the brief, the genome diff, the lineage and the open asks are all live API data.
  await expect(page.getByRole("heading", { name: "Morning: brief, diff, and asks" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Night timeline", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: /^Genome: current harness/ })).toBeVisible();
  await expect(page.locator(".rem-genome")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Lineage", exact: true })).toBeVisible();
  await expect(page.locator(".rem-lineage details").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Open asks", exact: true })).toBeVisible();
  const approve = page.locator(".rem-ask").getByRole("button", { name: "Approve", exact: true }).first();
  if (await approve.isVisible().catch(() => false)) await approve.click();

  await page.evaluate(() => document.querySelector(".app-content")?.scrollTo(0, 0));
  await page.screenshot({ path: `test-results/rem-top-${info.project.name}.png` });
  await page.evaluate(() => {
    const el = document.querySelector(".app-content");
    if (el) el.scrollTo(0, el.scrollHeight);
  });
  await page.screenshot({ path: `test-results/rem-bottom-${info.project.name}.png` });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  expect(errors).toEqual([]);
});
