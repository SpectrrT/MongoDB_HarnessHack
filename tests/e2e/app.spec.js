import { test, expect } from "@playwright/test";
async function onboard(page) {
  await page.goto("/app");
  await page.getByRole("textbox", { name: "Your first name" }).fill("Alex");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Open my workspace" }).click();
  // Onboarding lands on the Overview; the chat greeting lives at /app/chat.
  await expect(page.getByRole("heading", { name: "Your workspace, at a glance." })).toBeVisible();
  await expect(page.getByText(/^Good (morning|afternoon|evening), Alex\.$/)).toBeVisible();
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
  // The Overview shows the first two personal suggestions; "View all" opens the chat.
  await expect(page.locator(".home-tasks > button")).toHaveCount(2);
  await expect(page.getByRole("heading", { name: "Find my homework for the week" })).toBeVisible();
  await page.getByRole("button", { name: "View all" }).click();
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
  expect(errors).toEqual([]);
});
test("connection setup and overnight tasks persist", async ({ page }) => {
  await onboard(page);
  await page.goto('/app/connections');
  await page.getByRole('textbox',{name:'Search connections'}).fill('Slack');
  await page.locator('.service-row').getByRole('button',{name:'Connect',exact:true}).click();
  await page.getByRole('button',{name:'Add to workspace',exact:true}).click();
  await expect(page.getByText('Added · setup needed')).toBeVisible();
  await page.goto('/app/sleep');
  await page.getByRole('button',{name:'Add a task',exact:true}).click();
  await page.getByLabel('Task',{exact:true}).fill('Prepare a project update');
  await page.getByLabel('What should be ready?').fill('Draft the update with unresolved issues.');
  await page.getByRole('button',{name:'Save to queue',exact:true}).click();
  await expect(page.getByText('Runner needed')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading',{name:'Prepare a project update'})).toBeVisible();
  await page.getByRole('button',{name:'Pause task',exact:true}).click();
  await expect(page.getByText('Paused',{exact:true})).toBeVisible();
});
test("capture modes and chat requires account setup", async ({ page }, info) => {
  await onboard(page);
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
  await page.getByRole("button", { name: "Memory review" }).click();
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
  await page.getByRole("button", { name: "Memory review" }).click();
  await expect(page.getByRole("button", { name: "Pause routine" })).toBeVisible();
  await expect(page.locator(".sleep-history details")).toHaveCount(2);
  await page.getByRole("button", { name: "Needs approval", exact: true }).click();
  await expect(page.getByText("No routines in this view.")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
});
