import { test, expect } from "@playwright/test";
async function onboard(page) {
  await page.goto("/app");
  await page.getByRole("textbox", { name: "Your first name" }).fill("Alex");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Open my workspace" }).click();
  await expect(page).toHaveURL(/\/app\/chat$/);
  await expect(page.getByRole("heading", { name: "Hello Alex What can I help you with?" })).toBeVisible();
}
test("landing, onboarding, suggestions and memory persist", async ({
  page,
}, info) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Your agent should finish the job." }),
  ).toBeVisible();
  await page.screenshot({
    path: `test-results/landing-${info.project.name}.png`,
    fullPage: true,
  });
  await onboard(page);
  await page.goto("/app");
  await expect(page).toHaveURL(/\/app\/chat$/);
  await page.goto("/app/overview");
  await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible();
  await expect(page.getByText("No conversations yet. Start a new chat when you have something to work on.")).toBeVisible();
  await expect(page.locator('.overview-stats a[href="/app/memory"] strong')).toHaveText("0");
  await page.locator('.workspace-overview').getByRole("link", { name: "New chat", exact: true }).click();
  await expect(page).toHaveURL(/\/app\/chat$/);
  await expect(
    page.getByRole("heading", { name: "Hello Alex What can I help you with?" }),
  ).toBeVisible();
  await page.goto("/app/memory");
  await page
    .getByRole("textbox", { name: "New memory" })
    .fill("Keep the release note short.");
  await page.getByRole("button", { name: "Save memory" }).click();
  await expect(
    page.locator(".memory-list").getByText("Keep the release note short.", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.locator(".memory-list").getByText("Keep the release note short.", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.goto("/app/overview");
  await expect(page.locator('.overview-stats a[href="/app/memory"] strong')).toHaveText("1");
  await expect(page.locator('.overview-stats a[href="/app/chat"] strong')).toHaveText("0");
  expect(errors).toEqual([]);
});
test("connection setup and unconfigured Sleep preserve existing briefs", async ({ page }) => {
  await onboard(page);
  await page.goto('/app/connections');
  await page.getByRole('textbox',{name:'Search connections'}).fill('Slack');
  await page.locator('.service-row').getByRole('button',{name:'Connect',exact:true}).click();
  await page.getByRole('button',{name:'Add to workspace',exact:true}).click();
  await expect(page.getByText('Added · setup needed')).toBeVisible();
  await page.goto('/app/sleep');
  await expect(page).toHaveURL(/\/app\/memory\?tab=sleep$/);
  await expect(page.getByRole('navigation', { name: 'Memory views' }).getByRole('link', { name: 'Sleep', exact: true })).toHaveAttribute('aria-current', 'page');
  await page.locator('.memory-disclosure > summary').filter({ hasText: 'Overnight queue' }).click();
  await expect(page.getByText('MongoDB task storage is not configured.',{exact:false})).toBeVisible();
  await page.getByRole('button',{name:'Add a task',exact:true}).click();
  await page.getByLabel('Task',{exact:true}).fill('Prepare a project update');
  await page.getByLabel('What should be ready?').fill('Draft the update with unresolved issues.');
  await page.getByLabel('Required exact phrases, one per line').fill('Unresolved issues');
  await expect(page.getByRole('button',{name:'Assign task',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'Close dialog'}).click();
  await page.evaluate(()=>{
    const key='offload.workspace.v1',state=JSON.parse(localStorage.getItem(key));
    state.overnight=[{id:'legacy-brief',title:'Saved before worker integration',brief:'Preserve this unfinished work.',budget:10000,deadline:Date.now()+86400000,status:'queued'}];
    localStorage.setItem(key,JSON.stringify(state));
  });
  await page.reload();
  await page.locator('.memory-disclosure > summary').filter({ hasText: 'Overnight queue' }).click();
  await expect(page.getByRole('heading',{name:'Previously saved briefs'})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Saved before worker integration'})).toBeVisible();
  await page.getByRole('button',{name:'Add output checks to assign'}).click();
  await expect(page.getByLabel('Task',{exact:true})).toHaveValue('Saved before worker integration');
  await expect(page.getByRole('button',{name:'Assign task',exact:true})).toBeDisabled();
});
test("capture modes and chat requires account setup", async ({ page }, info) => {
  await onboard(page);
  await page.addInitScript(() => {
    window.__captureCalls = 0;
    const deny = async () => { window.__captureCalls++; throw new DOMException('Denied in test', 'NotAllowedError'); };
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getDisplayMedia: deny, getUserMedia: deny } });
  });
  await page.reload();
  await page.getByRole('button', { name: 'Start a session', exact: true }).click();
  // Session modes have no in-app consent checkbox; the browser's media permission prompt is the gate.
  await expect(page.getByRole('checkbox', { name: 'Everyone involved agrees to this recording.' })).toHaveCount(0);
  for (const name of ['Screen', 'Microphone', 'Both']) {
    await page.getByRole('button', { name, exact: true }).click();
    await expect(page.getByRole('button', { name, exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: 'Start session', exact: true })).toBeEnabled();
  }
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.goto('/app/chat');
  await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeDisabled();
  await page.screenshot({ path: `test-results/workspace-${info.project.name}.png` });
});

test("sleep cancellation, scheduling, evidence and history persist", async ({ page }) => {
  await page.clock.install({ time: new Date(2026, 8, 25, 12) });
  await onboard(page);
  await page.goto("/app/sleep");
  await expect(page).toHaveURL(/\/app\/memory\?tab=sleep$/);
  await page.locator(".memory-disclosure > summary").filter({ hasText: "Review history and routines" }).click();
  await page.getByRole("checkbox", { name: "Schedule daily review" }).click();
  await expect(page.getByRole("checkbox", { name: "Schedule daily review" })).toBeChecked();
  await page.getByLabel("Local review time").fill("23:59");
  await page.getByRole("checkbox", { name: "Schedule daily review" }).click();
  await expect(page.getByRole("checkbox", { name: "Schedule daily review" })).not.toBeChecked();
  await page.getByRole("button", { name: "Run a sleep review" }).click();
  await page.getByRole("button", { name: "Cancel review" }).click();
  await expect(page.getByText("Review cancelled.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Run a sleep review" }).click();
  await expect(page.getByRole("button", { name: "Approve routine" })).toBeVisible({ timeout: 15000 });
  await page.getByText("Supporting notes (2)", { exact: true }).click();
  await expect(page.locator("blockquote")).toHaveCount(2);
  await page.getByRole("button", { name: "Approve routine" }).click();
  await expect(page.getByRole("button", { name: "Pause routine" })).toBeVisible();
  await page.reload();
  await expect(page).toHaveURL(/\/app\/memory\?tab=sleep$/);
  await page.locator(".memory-disclosure > summary").filter({ hasText: "Review history and routines" }).click();
  await expect(page.getByRole("button", { name: "Pause routine" })).toBeVisible();
  await expect(page.locator(".sleep-history details")).toHaveCount(2);
  await page.getByRole("button", { name: "Needs approval", exact: true }).click();
  await expect(page.getByText("No routines in this view.")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
});
