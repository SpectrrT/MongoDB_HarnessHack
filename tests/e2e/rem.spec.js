import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createRem } from "../../rem/index.js";
import { createStubGate } from "../../rem/completion.js";
import { createWorkspace } from "../../shared/workspace.js";

async function completedNightFixture() {
  const engine = await createRem({ completion: createStubGate(), compactor: null });
  try {
    await engine.runTask("weekly-brief");
    await engine.sleep();
    return JSON.parse(JSON.stringify(await engine.state()));
  } finally { await engine.close(); }
}

// REM has its own shared backend at /api/rem/*, independent of the Offload workspace store.
// We only need the workspace pre-onboarded so Workspace.jsx renders its nav instead of onboarding.
async function openRem(page, theme = "light") {
  const state = createWorkspace();
  state.settings.theme = theme;
  state.profile.onboarded = true;
  state.profile.name = "Tester";
  await page.addInitScript((s) => localStorage.setItem("offload.workspace.v1", JSON.stringify(s)), state);
  await page.goto("/app/rem");
  await expect(page).toHaveURL(/\/app\/memory\?tab=rem$/, { timeout: 15000 });
  await expect(page.getByRole("heading", { name: "Memory", exact: true })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Memory views" }).getByRole("link", { name: "Learning", exact: true })).toHaveAttribute("aria-current", "page");
}

async function openSection(page, title) {
  const summary = page.locator("summary").filter({ hasText: title }).first();
  if (await summary.locator("..").getAttribute("open") === null) await summary.click();
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
    .toMatch(/^(done|incomplete|paused_for_auth)$/);
  if ((await runStatus.textContent())?.trim() === "paused_for_auth") {
    await page.locator(".notice").getByRole("button", { name: /^Reconnect/ }).click();
    await expect.poll(async () => (await runStatus.textContent())?.trim(), { timeout: 15000 }).toMatch(/^(done|incomplete)$/);
  }
  await expect(page.locator(".rem-run-log li").first()).toBeVisible();
  await expect(page.locator(".rem-run-row").first()).toBeVisible();

  // Night: sleep once and see the real phases render (Replay, Merge, Distill, Evolve, asks, brief).
  await page.getByRole("region", { name: "Night", exact: true }).getByRole("button", { name: "Run sleep cycle", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Replay", exact: true })).toBeVisible({ timeout: 20000 });
  await expect(page.getByRole("heading", { name: "Merge", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Distill", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Evolve", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Asks queued", exact: true })).toBeVisible();
  await openSection(page, /^Harness and morning review/);
  await expect(page.getByRole("region", { name: "Whole gym", exact: true })).toBeVisible();

  // Morning: the brief, the genome diff, the lineage and the open asks are all live API data.
  await expect(page.getByRole("heading", { name: "Morning: brief, diff, and asks" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Night timeline", exact: true })).toBeVisible();
  await page.getByText("Current harness settings", { exact: true }).click();
  await expect(page.getByRole("heading", { name: /^Genome: current harness/ })).toBeVisible();
  await expect(page.locator(".rem-genome")).toBeVisible();
  await page.getByText("Harness version history", { exact: true }).click();
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


test("REM: keyboard navigation, structured policy, and simulation validation", async ({ page }) => {
  await openRem(page);
  const morning = page.locator("summary").filter({ hasText: /^Harness and morning review/ }).first();
  await morning.focus();
  await expect(morning).toBeFocused();
  if (await morning.locator("..").getAttribute("open") !== null) await morning.press("Enter");
  await morning.press("Enter");
  await expect(page.getByRole("heading", { name: "Morning: brief, diff, and asks" })).toBeVisible();
  await page.getByText("Current harness settings", { exact: true }).click();
  await expect(page.locator(".rem-policy-values").first()).toBeVisible();
  await expect(page.locator(".rem-page")).not.toContainText("[object Object]");
  await openSection(page, /Engine controls/);
  const input = page.getByRole("spinbutton", { name: "Days to simulate" });
  for (const value of ["", "0", "11", "1.5"]) {
    await input.fill(value);
    await expect(page.getByRole("button", { name: "Run simulated days" })).toBeDisabled();
    await expect(input).toHaveAttribute("aria-invalid", "true");
  }
  await input.fill("1");
  await expect(page.getByRole("button", { name: "Run simulated days" })).toBeEnabled();
  await page.getByRole("button", { name: "Reset engine", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Every browser using this engine is affected");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
});

test("REM: a failed first load has a working retry", async ({ page }) => {
  await page.route("**/api/rem/state", route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({error:"Engine temporarily unavailable"}) }));
  await openRem(page);
  await expect(page.getByRole("alert")).toContainText("Engine temporarily unavailable");
  await expect(page.getByText("Loading the harness", {exact:true})).not.toBeVisible();
  await page.unroute("**/api/rem/state");
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.getByRole("button", {name:"Run", exact:true})).toBeVisible();
  await expect(page.getByRole("alert")).not.toBeVisible();
});

test("REM: owner asks require an answer and submit it with the decision", async ({ page }) => {
  const state = await completedNightFixture();
  state.asks = [{ _id: "owner-fixture", kind: "owner", text: "Who owns the release checklist?", status: "open" }];
  let decision;
  await page.route("**/api/rem/state", route => route.fulfill({ json: state }));
  await page.route("**/api/rem/asks/owner-fixture", async route => {
    decision = route.request().postDataJSON();
    state.asks = [];
    await route.fulfill({ json: { ask: { status: "approved" } } });
  });
  await openRem(page);
  await openSection(page, /^Harness and morning review/);
  const save = page.getByRole("button", { name: "Save answer" });
  await expect(save).toBeDisabled();
  await page.getByRole("textbox", { name: "Owner name" }).fill("   ");
  await expect(save).toBeDisabled();
  await page.getByRole("textbox", { name: "Owner name" }).fill("  Alex  ");
  await save.click();
  await expect(page.locator(".rem-ask")).toHaveCount(0);
  await openSection(page, /^Harness and morning review/);
  await expect(page.getByText("No open asks.", { exact: true })).toBeVisible();
  expect(decision).toEqual({ decision: "approve", answer: "Alex" });
});

test("REM: simulation updates a prior night and reset clears stale results", async ({ page }) => {
  const initial = await completedNightFixture();
  let state = structuredClone(initial);
  let resets = 0;
  await page.route("**/api/rem/state", route => route.fulfill({ json: state }));
  await page.route("**/api/rem/sleep", route => route.fulfill({ json: { brief: state.brief } }));
  await page.route("**/api/rem/simulate", route => {
    state = { ...state, day: 99, brief: { ...state.brief, night: 98 } };
    return route.fulfill({ json: { day: 99, days: [] } });
  });
  await page.route("**/api/rem/reset", route => {
    resets += 1;
    state = { ...state, day: 1, brief: null, runs: [], asks: [], skills: [], harness: { ...state.harness, version: 0, lineage: [] } };
    return route.fulfill({ json: { ok: true, day: 1 } });
  });
  await openRem(page);
  await openSection(page, /^Run details/);
  await page.locator(".rem-run-row").first().click();
  await expect(page.locator(".rem-live-run")).toBeVisible();
  await page.getByRole("region", { name: "Night", exact: true }).getByRole("button", { name: "Run sleep cycle", exact: true }).click();
  await expect(page.getByRole("region", { name: "Night", exact: true }).getByRole("button", { name: "Run sleep cycle", exact: true })).toBeEnabled();
  await openSection(page, /Engine controls/);
  await page.getByRole("button", { name: "Run simulated days" }).click();
  await expect(page.getByText("night 98", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Reset engine", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Reset engine", exact: true }).click();
  await expect(page.locator(".rem-run-row")).toHaveCount(0);
  await openSection(page, /^Night results$/);
  await expect(page.getByText("No night has run yet.", { exact: true })).toBeVisible();
  await expect(page.locator(".rem-brief")).not.toBeVisible();
  await expect(page.locator(".rem-live-run")).not.toBeVisible();
  await openSection(page, /^Run details/);
  await expect(page.getByText("No runs yet. Pick a task and click Run.")).toBeVisible();
  expect(resets).toBe(1);
});


for (const theme of ["light", "monochrome-dark"]) {
  test(`REM: ${theme} accessibility and contained mobile tables`, async ({ page }, info) => {
    const state = await completedNightFixture();
    await page.route("**/api/rem/state", route => route.fulfill({ json: state }));
    await openRem(page, theme);
    await expect(page.locator(".workspace")).toHaveAttribute("data-palette", theme);
    await openSection(page, /^Harness and morning review/);
    await page.getByText("Current harness settings", { exact: true }).click();
    const results = await new AxeBuilder({ page }).include(".rem-page").withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(results.violations.map(({id, nodes}) => ({id, targets:nodes.map(node=>node.target)}))).toEqual([]);
    expect(await page.locator(".app-content").evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBeTruthy();
    await page.getByRole("heading", { name: "Consolidate and improve" }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: `test-results/rem-night-${theme}-${info.project.name}.png` });
  });
}


test("REM: static hosting explains the missing service instead of a JSON parser error", async ({ page }) => {
  await page.route("**/api/rem/state", route => route.fulfill({status:404,contentType:"text/html",body:"<!doctype html><title>Not found</title>"}));
  await openRem(page);
  await expect(page.getByRole("alert")).toContainText("REM needs the local Offload service");
  await expect(page.getByRole("alert")).not.toContainText("Unexpected token");
  await expect(page.getByRole("button", {name:"Run", exact:true})).not.toBeVisible();
});
