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

test('Memory keeps legacy destinations, persistent views and keyboard navigation', async ({ page }, info) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await workspace(page);
  await page.goto('/app/memory');
  await expect(page).toHaveURL(/\/app\/memory$/);
  await expect(page.getByRole('textbox', { name: 'New memory' })).toBeVisible();
  await page.goto('/app/sleep?view=memory&memory=review');
  await expect(page.getByRole('button', { name: 'Run a sleep review' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('navigation', { name: 'Memory views' }).getByRole('link', { name: 'Notes', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('button', { name: 'Run a sleep review' })).toBeVisible();
  const views = page.getByRole('navigation', { name: 'Memory views' });
  await views.getByRole('link', { name: 'Notes', exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(views.getByRole('link', { name: 'Sleep', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await page.getByText('Context memory', { exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Context memory', exact: true })).toBeVisible();
  await page.goto('/app/rem');
  await expect(page).toHaveURL(/\/app\/memory\?tab=rem$/);
  await expect(views.getByRole('link', { name: 'Learning', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('heading', { name: 'Run a task', exact: true })).toBeVisible();
  await views.getByRole('link', { name: 'Learning', exact: true }).focus();
  await page.keyboard.press('Shift+Tab');
  await expect(views.getByRole('link', { name: 'Sleep', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Sleeping conversations', exact: true })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Run a task', exact: true })).toBeVisible();
  await page.screenshot({ path: `test-results/unified-sleep-${info.project.name}.png` });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.querySelector('.app-content').scrollWidth <= document.querySelector('.app-content').clientWidth)).toBeTruthy();
  expect(errors).toEqual([]);
});

for (const theme of ['light', 'monochrome-dark']) {
  test(`Sleep navigation uses accessible ${theme} palette`, async ({ page }) => {
    await workspace(page, theme);
    await page.goto('/app/sleep?view=memory');
    await expect(page.getByRole('textbox', { name: 'New memory' })).toBeVisible();
    const results = await new AxeBuilder({ page }).include('.memory-hub-nav').withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(results.violations).toEqual([]);
  });
}

test('Sleep explains unavailable hosted services without parser errors', async ({ page }) => {
  await workspace(page);
  await page.route('**/api/{rem,sleep,suggestions}/**', route => route.fulfill({ contentType: 'text/html', body: '<html>Static site</html>' }));
  await page.route('**/api/suggestions', route => route.fulfill({ contentType: 'text/html', body: '<html>Static site</html>' }));
  await page.goto('/app/sleep?view=tasks');
  await expect(page.getByRole('alert')).toContainText('Overnight tasks need the local Offload service');
  await page.goto('/app/sleep?view=suggestions');
  await expect(page.getByRole('alert')).toContainText('Next actions need the local Offload service');
  await page.goto('/app/sleep?view=memory&memory=context');
  await expect(page.getByRole('alert')).toContainText('Context memory needs the local Offload service');
  await expect(page.locator('main')).not.toContainText('Unexpected token');
});

for (const theme of ['light', 'monochrome-dark']) {
  test(`Sleep views stay readable and navigable in ${theme}`, async ({ page }, info) => {
    await workspace(page, theme);
    const views = [
      ['conversations', '/app/sleep'],
      ['tasks', '/app/sleep?view=tasks'],
      ['suggestions', '/app/sleep?view=suggestions'],
      ['notes', '/app/sleep?view=memory'],
      ['review', '/app/sleep?view=memory&memory=review'],
      ['context', '/app/sleep?view=memory&memory=context'],
    ];
    for (const [name, url] of views) {
      await page.goto(url);
      await expect(page.getByRole('heading', { name: 'Memory', exact: true })).toBeVisible();
      await expect(page.locator('.workspace')).toHaveAttribute('data-palette', theme);
      const navigation = await page.locator('[aria-label="Memory views"] a').evaluateAll(tabs => tabs.map(tab => {
        const box = tab.getBoundingClientRect();
        return { visible: box.left >= 0 && box.right <= innerWidth, height: box.height };
      }));
      expect(navigation.every(tab => tab.visible && tab.height >= 44)).toBeTruthy();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.querySelector('.app-content').scrollWidth <= document.querySelector('.app-content').clientWidth)).toBeTruthy();
      const audit = await new AxeBuilder({ page }).include('.memory-hub').withTags(['wcag2a', 'wcag2aa']).analyze();
      expect(audit.violations, `${name}: ${theme}`).toEqual([]);
      await page.screenshot({ path: `test-results/sleep-${name}-${theme}-${info.project.name}.png` });
    }
  });
}

test('Sleep retries an unavailable worker and removes the stale service error', async ({ page }) => {
  await workspace(page);
  let unavailable = true;
  await page.route('**/api/sleep/tasks/status', route => unavailable
    ? route.fulfill({ contentType: 'text/html', body: '<html>Static site</html>' })
    : route.fulfill({ json: { configured: false, enabled: false } }));
  await page.goto('/app/sleep?view=tasks');
  await expect(page.getByRole('alert')).toContainText('Overnight tasks need the local Offload service');
  unavailable = false;
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByText('MongoDB task storage is not configured.', { exact: false })).toBeVisible();
});
