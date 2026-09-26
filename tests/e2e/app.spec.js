import { test, expect } from "@playwright/test";
async function onboard(page) {
  await page.goto("/app");
  await page.getByRole("textbox", { name: "Your first name" }).fill("Alex");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Open my workspace" }).click();
  await expect(page.getByText("Good ", { exact: false }).first()).toBeVisible();
}
test("landing, onboarding, suggestions and memory persist", async ({
  page,
}, info) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "You have done this before." }),
  ).toBeVisible();
  await page.screenshot({
    path: `test-results/landing-${info.project.name}.png`,
    fullPage: true,
  });
  await onboard(page);
  await expect(
    page.getByRole("heading", { name: "Make room for the next thing." }),
  ).toBeVisible();
  if (
    await page
      .getByRole("button", { name: "Open suggestions", exact: true })
      .isVisible()
  )
    await page
      .getByRole("button", { name: "Open suggestions", exact: true })
      .click();
  await page
    .getByRole("textbox", { name: "Filter suggestions" })
    .fill("Friday");
  await expect(page.locator(".suggestion")).toHaveCount(1);
  await page.getByRole("button", { name: "Close suggestions panel" }).click();
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
test("task reconnect, draft save, and sleep review", async ({ page }) => {
  await onboard(page);
  await page
    .getByRole("button", {
      name: "Prepare the Friday update You collected project changes on the last four Fridays.",
    })
    .click();
  await expect(page.getByText("Reconnect to keep going.")).toBeVisible({
    timeout: 10000,
  });
  await page.getByRole("button", { name: "Reconnect sample account" }).click();
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "Connect sample account", exact: true })
    .click();
  await page.getByRole("button", { name: "Resume task", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Edit draft" })).toBeVisible({
    timeout: 15000,
  });
  await page.getByRole("button", { name: "Save local draft" }).click();
  await expect(
    page.getByRole("button", { name: "Save changes" }),
  ).toBeVisible();
  await page.goto("/app/sleep");
  await page.getByRole("button", { name: "Run a sleep review" }).click();
  await expect(
    page.getByRole("button", { name: "Approve routine" }),
  ).toBeVisible({ timeout: 15000 });
  await page.getByRole("button", { name: "Approve routine" }).click();
  await expect(
    page.getByRole("button", { name: "Pause routine" }),
  ).toBeVisible();
});
test("notes session and chat work without account access", async ({
  page,
}, info) => {
  await onboard(page);
  await page
    .getByRole("button", { name: "Start a session", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Start session", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Add a decision or detail" })
    .fill("Ask Sam to review the draft.");
  await page.getByRole("button", { name: "Save to memory" }).click();
  await page.getByRole("button", { name: "End session" }).click();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.goto("/app/chat");
  await page
    .getByRole("textbox", { name: "Prompt", exact: true })
    .fill("Help with my weekly update");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.locator(".message.assistant")).toBeVisible();
  await page.screenshot({
    path: `test-results/workspace-${info.project.name}.png`,
  });
});

test("sleep cancellation, scheduling, evidence and history persist", async ({ page }) => {
  await page.clock.install({ time: new Date(2026, 8, 25, 12) });
  await onboard(page);
  await page.goto("/app/sleep");
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
  await expect(page.getByRole("button", { name: "Pause routine" })).toBeVisible();
  await expect(page.locator(".sleep-history details")).toHaveCount(2);
  await page.getByRole("button", { name: "Needs approval", exact: true }).click();
  await expect(page.getByText("No routines in this view.")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
});
