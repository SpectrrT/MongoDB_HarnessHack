import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createWorkspace } from '../../shared/workspace.js';
async function prepare(page, theme = 'light') {
  const state = createWorkspace(); state.profile.onboarded = true; state.profile.name = 'Tester'; state.settings.theme = theme;
  await page.addInitScript(value => localStorage.setItem('offload.workspace.v1', JSON.stringify(value)), state);
}
for (const theme of ['light', 'monochrome-dark']) test(`Prepared example works without local APIs in ${theme}`, async ({ page }, info) => {
  await prepare(page, theme);
  let mutationCount = 0;
  await page.route('**/api/**', route => { if (route.request().method() !== 'GET') mutationCount++; return route.fulfill({ status: 503, json: { error: 'Local service unavailable.' } }); });
  await page.goto('/example');
  await expect(page.getByRole('heading', { name: "A database engineer's next step." })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Proposed workflow' })).toBeVisible();
  await expect(page.getByText('Sample data. Previously prepared example, not a live model result.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Download example' })).toHaveAttribute('href', '/evidence/mongodb-example-workflow.md');
  expect(mutationCount).toBe(0);
  const audit = await new AxeBuilder({ page }).include('.example-workflow').withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(audit.violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.screenshot({ path: `test-results/example-${theme}-${info.project.name}.png`, fullPage: true });
});
test('Example imports require an explicit click and never start a task automatically', async ({ page }) => {
  await prepare(page);
  const posts = [];
  await page.route('**/api/suggestions**', route => {
    if (route.request().method() === 'POST') { posts.push({ path: new URL(route.request().url()).pathname, body: route.request().postDataJSON() }); return route.fulfill({ json: { inserted: 5 } }); }
    return route.fulfill({ json: { projects: [], runs: [], suggestions: [], policy: null } });
  });
  await page.goto('/app/sleep?view=suggestions');
  await page.getByRole('button', { name: 'Try an example' }).click();
  const dialog = page.getByRole('dialog', { name: 'Try an example' });
  await expect(dialog.getByText('Sample meeting notes for a MongoDB engineer.', { exact: false })).toBeVisible();
  expect(posts).toHaveLength(0);
  await dialog.getByRole('button', { name: 'Load sample notes' }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('status')).toContainText('Example notes loaded.');
  expect(posts).toHaveLength(1); expect(posts[0].path).toBe('/api/suggestions/import');
  expect(posts[0].body.events).toHaveLength(5);
  expect(posts[0].body.events.every(event => event.text.includes('Example') && event.locator.startsWith('example://'))).toBeTruthy();
  expect(posts[0].body.events.find(event => event.kind === 'meeting-note').text).toContain('Action: Draft an orders query rollout and rollback checklist.');
});
test('Unavailable local service keeps its error and offers a prepared example separately', async ({ page }) => {
  await prepare(page);
  await page.route('**/api/suggestions**', route => route.fulfill({ contentType: 'text/html', body: '<html>Static site</html>' }));
  await page.goto('/app/sleep?view=suggestions');
  await expect(page.getByRole('alert')).toContainText('Next actions need the local Offload service.');
  await expect(page.getByRole('link', { name: 'Example workflow', exact: true })).toHaveAttribute('href', '/example');
  await page.getByRole('button', { name: 'Try an example' }).click();
  await expect(page.getByRole('button', { name: 'Load sample notes' })).toBeDisabled();
  await page.getByRole('dialog').getByRole('link', { name: 'Example workflow' }).click();
  await expect(page).toHaveURL(/\/example$/);
  await expect(page.getByRole('heading', { name: 'Proposed workflow' })).toBeVisible();
});
test('Homepage links to the prepared example without starting a demo', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Example workflow', exact: true }).click();
  await expect(page).toHaveURL(/\/example$/);
  await expect(page.getByRole('heading', { name: 'Proposed workflow' })).toBeVisible();
});
