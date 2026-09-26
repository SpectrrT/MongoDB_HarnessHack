import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createWorkspace } from '../../shared/workspace.js';

async function workspace(page, theme = 'light') {
  const state = createWorkspace();
  state.settings.theme = theme;
  state.profile.onboarded = true;
  state.profile.name = 'Tester';
  await page.addInitScript(value => localStorage.setItem('offload.workspace.v1', JSON.stringify(value)), state);
}

test('Sleep keeps legacy destinations, persistent memory views and keyboard navigation', async ({ page }, info) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await workspace(page);
  await page.goto('/app/memory');
  await expect(page).toHaveURL(/\/app\/sleep\?view=memory$/);
  await expect(page.getByRole('textbox', { name: 'New memory' })).toBeVisible();
  await page.getByRole('tab', { name: 'Memory review', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Run a sleep review' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('tab', { name: 'Memory review', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('tab', { name: 'Memory review', exact: true }).press('End');
  await expect(page.getByRole('tab', { name: 'Context memory', exact: true })).toBeFocused();
  await expect(page.getByRole('heading', { name: 'Context memory', exact: true })).toBeVisible();
  await page.goto('/app/rem');
  await expect(page).toHaveURL(/\/app\/sleep\?view=rem$/);
  await expect(page.getByRole('heading', { name: 'REM', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'REM', exact: true }).press('Home');
  await expect(page.getByRole('tab', { name: 'Conversations', exact: true })).toBeFocused();
  await expect(page.getByRole('heading', { name: 'No sleeping conversations yet.' })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'REM', exact: true })).toBeVisible();
  await page.screenshot({ path: `test-results/unified-sleep-${info.project.name}.png` });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.querySelector('.app-content').scrollWidth <= document.querySelector('.app-content').clientWidth)).toBeTruthy();
  expect(errors).toEqual([]);
});

for (const theme of ['light', 'monochrome-dark']) {
  test(`Sleep navigation uses accessible ${theme} palette`, async ({ page }) => {
    await workspace(page, theme);
    await page.goto('/app/sleep?view=memory');
    await expect(page.getByRole('textbox', { name: 'New memory' })).toBeVisible();
    const results = await new AxeBuilder({ page }).include('.slow-tabs').withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(results.violations).toEqual([]);
  });
}

test('Sleep explains unavailable hosted services without parser errors', async ({ page }) => {
  await workspace(page);
  await page.route('**/api/{rem,sleep,suggestions}/**', route => route.fulfill({ contentType: 'text/html', body: '<html>Static site</html>' }));
  await page.route('**/api/suggestions', route => route.fulfill({ contentType: 'text/html', body: '<html>Static site</html>' }));
  await page.goto('/app/sleep?view=tasks');
  await expect(page.getByRole('alert')).toContainText('Overnight tasks need the local Offload service');
  await page.getByRole('tab', { name: 'Next actions' }).click();
  await expect(page.getByRole('alert')).toContainText('Next actions need the local Offload service');
  await page.getByRole('tab', { name: 'Memory', exact: true }).click();
  await page.getByRole('tab', { name: 'Context memory', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Context memory needs the local Offload service');
  await expect(page.locator('main')).not.toContainText('Unexpected token');
});
