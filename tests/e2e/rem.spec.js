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
    .toMatch(/^(done|incomplete|paused_for_auth)$/);
  if ((await runStatus.textContent())?.trim() === "paused_for_auth") {
    await page.locator(".notice").getByRole("button", { name: /^Reconnect/ }).click();
    await expect.poll(async () => (await runStatus.textContent())?.trim(), { timeout: 15000 }).toMatch(/^(done|incomplete)$/);
  }
  await expect(page.locator(".rem-run-log li").first()).toBeVisible();
  await expect(page.locator(".rem-run-row").first()).toBeVisible();

  await page.getByRole("tab", { name: /^Night/ }).click();
  // Night: sleep once and see the real phases render (Replay, Merge, Distill, Evolve, asks, brief).
  await page.getByRole("region", { name: "Night", exact: true }).getByRole("button", { name: "Sleep", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Replay", exact: true })).toBeVisible({ timeout: 20000 });
  await expect(page.getByRole("heading", { name: "Merge", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Distill", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Evolve", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Asks queued", exact: true })).toBeVisible();
  await page.getByRole("tab", { name: /^Morning/ }).click();
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

  await page.getByRole("tab", { name: /^Day/ }).click();
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
  const day = page.getByRole("tab", { name: /^Day/ });
  await day.focus();
  await day.press("ArrowRight");
  await expect(page.getByRole("tab", { name: /^Night/ })).toBeFocused();
  await expect(page.getByRole("region", { name: "Night", exact: true })).toBeVisible();
  await page.getByRole("tab", { name: /^Night/ }).press("End");
  await expect(page.getByRole("tab", { name: /^Morning/ })).toBeFocused();
  await page.getByText("Current harness settings", { exact: true }).click();
  await expect(page.locator(".rem-policy-values").first()).toBeVisible();
  await expect(page.locator(".rem-page")).not.toContainText("[object Object]");
  await page.getByText("Simulation tools", { exact: false }).first().click();
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
  await expect(page.getByRole("tab", {name:/^Day/})).toBeVisible();
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
  await page.getByRole("button", { name: /Review asks/ }).click();
  const save = page.getByRole("button", { name: "Save answer" });
  await expect(save).toBeDisabled();
  await page.getByRole("textbox", { name: "Owner name" }).fill("   ");
  await expect(save).toBeDisabled();
  await page.getByRole("textbox", { name: "Owner name" }).fill("  Alex  ");
  await save.click();
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
  await page.locator(".rem-run-row").first().click();
  await expect(page.locator(".rem-live-run")).toBeVisible();
  await page.getByRole("tab", { name: /^Night/ }).click();
  await page.getByRole("region", { name: "Night", exact: true }).getByRole("button", { name: "Sleep", exact: true }).click();
  await expect(page.getByRole("region", { name: "Night", exact: true }).getByRole("button", { name: "Sleep", exact: true })).toBeEnabled();
  await page.getByText("Simulation tools", { exact: false }).first().click();
  await page.getByRole("button", { name: "Run simulated days" }).click();
  await expect(page.getByText("night 98", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Reset engine", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Reset engine", exact: true }).click();
  await expect(page.getByText("No night has run yet.", { exact: true })).toBeVisible();
  await expect(page.locator(".rem-brief")).not.toBeVisible();
  await page.getByRole("tab", { name: /^Day/ }).click();
  await expect(page.locator(".rem-live-run")).not.toBeVisible();
  await expect(page.getByText("No runs yet. Pick a task and click Run.")).toBeVisible();
  expect(resets).toBe(1);
});


for (const theme of ["light", "monochrome-dark"]) {
  test(`REM: ${theme} accessibility and contained mobile tables`, async ({ page }, info) => {
    const state = await completedNightFixture();
    await page.route("**/api/rem/state", route => route.fulfill({ json: state }));
    await openRem(page, theme);
    await expect(page.locator(".workspace")).toHaveAttribute("data-palette", theme);
    await page.getByRole("tab", { name: /^Morning/ }).click();
    await page.getByText("Current harness settings", { exact: true }).click();
    const results = await new AxeBuilder({ page }).include(".rem-page").withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(results.violations.map(({id, nodes}) => ({id, targets:nodes.map(node=>node.target)}))).toEqual([]);
    expect(await page.locator(".app-content").evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBeTruthy();
    await page.getByRole("tab", { name: /^Night/ }).click();
    await page.getByRole("heading", { name: "Night: consolidate and evolve" }).scrollIntoViewIfNeeded();
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
