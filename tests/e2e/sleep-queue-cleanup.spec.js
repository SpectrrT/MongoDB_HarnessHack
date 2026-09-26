import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createWorkspace } from '../../shared/workspace.js';
for (const theme of ['light', 'monochrome-dark']) test(`Meeting draft queue keeps source instructions collapsed in ${theme}`, async ({ page }, info) => {
  const state = createWorkspace(); state.profile.onboarded = true; state.profile.name = 'Tester'; state.settings.theme = theme;
  await page.addInitScript(value => localStorage.setItem('offload.workspace.v1', JSON.stringify(value)), state);
  const brief = 'Prepare one local text draft. Use only the quoted source notes.\n\nSelected action: Action: Draft an orders query rollout and rollback checklist.\n\n[source:fixture-source-hash] Example notes: compare staging explain plans. No database writes.';
  let approved = false;
  const task = { id: 'meeting-draft-fixture', title: 'Draft: Action: Draft an orders query rollout and rollback checklist.', brief, status: 'approval', tokensUsed: 2400, budget: 10000, deadline: Date.now() + 3600000, calls: 1, pending: { files: [{ path: 'action-draft.md', content: 'Unverified draft\nExample rollout checklist\nNo database writes.' }] } };
  await page.route('**/api/sleep/tasks**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/status')) return route.fulfill({ json: { configured: true, enabled: true } });
    if (path.endsWith('/control')) { approved = route.request().postDataJSON().action === 'approve'; return route.fulfill({ json: task }); }
    return route.fulfill({ json: [task] });
  });
  await page.goto('/app/sleep?view=tasks');
  const card = page.locator('.overnight-task').first();
  await expect(card.getByRole('heading', { name: 'Orders query rollout and rollback checklist', exact: true })).toBeVisible();
  await expect(card.getByText('Draft an orders query rollout and rollback checklist.', { exact: true })).toBeVisible();
  await expect(card.locator('.overnight-instructions pre')).not.toBeVisible();
  await expect(card.getByText('2,400 / 10,000 tokens', { exact: true })).toBeVisible();
  await expect(card.getByText('Approval needed', { exact: true })).toBeVisible();
  await expect(card.getByRole('button', { name: 'Approve displayed files' })).toBeVisible();
  const audit = await new AxeBuilder({ page }).include('.slow-page').withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(audit.violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.screenshot({ path: `test-results/sleep-queue-clean-${theme}-${info.project.name}.png` });
  await card.getByText('Draft instructions and sources', { exact: true }).click();
  await expect(card.locator('.overnight-instructions pre')).toHaveText(brief);
  await card.locator('summary').filter({ hasText: 'action-draft.md' }).click();
  await expect(card.locator('pre').filter({ hasText: 'Example rollout checklist' })).toBeVisible();
  await card.getByRole('button', { name: 'Approve displayed files' }).click();
  expect(approved).toBe(true);
});
