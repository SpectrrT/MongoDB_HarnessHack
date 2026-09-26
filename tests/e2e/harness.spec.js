import { test, expect } from '@playwright/test';
import { createWorkspace } from '../../shared/workspace.js';
test('durable handoff clearly reports missing configuration', async ({ page }) => {
  const state = createWorkspace(); state.profile.onboarded = true; state.profile.name = 'Tester';
  await page.addInitScript(state => localStorage.setItem('offload.workspace.v1', JSON.stringify(state)), state);
  await page.goto('/app/harness');
  await expect(page.getByRole('heading', { name: 'Durable handoff', exact: true })).toBeVisible();
  await expect(page.getByText('Setup required:', { exact: false })).toBeVisible();
  await page.getByLabel('Project notes, one per line').fill('Release is awaiting review.');
  await expect(page.getByRole('button', { name: 'Create handoff' })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
});
