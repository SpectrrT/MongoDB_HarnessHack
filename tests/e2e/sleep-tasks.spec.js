import { test, expect } from '@playwright/test';
import { createWorkspace } from '../../shared/workspace.js';

test('Sleep assignment, exact file approval and verified artifact render on desktop and mobile', async ({ page }, info) => {
  const state = createWorkspace(); state.profile.onboarded = true; state.profile.name = 'Tester';
  await page.addInitScript(s => localStorage.setItem('offload.workspace.v1', JSON.stringify(s)), state);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  let tasks = [], submitted, controls = [];
  // Explicit UI fixtures. Live execution and durable ownership have separate tests.
  await page.route('**/api/sleep/tasks**', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.pathname.endsWith('/status')) return route.fulfill({ json: { configured: true, enabled: true, scope: 'isolated-local-files', provider: 'fixture' } });
    if (url.pathname.includes('/artifacts/')) return route.fulfill({ body: 'Release blocked\nOwner Maya\n', headers: {
      'content-type': 'text/plain', 'content-disposition': 'attachment; filename="report.md"' } });
    if (url.pathname.endsWith('/control')) {
      const action = request.postDataJSON().action; controls.push(action);
      tasks[0] = { ...tasks[0], status: 'completed', reason: 'All required file checks passed.', pending: null,
        checkResults: [{ path: 'report.md', passed: true, failed: [] }], artifacts: [{ path: 'report.md', bytes: 27 }] };
      return route.fulfill({ json: tasks[0] });
    }
    if (request.method() === 'POST') {
      submitted = request.postDataJSON(); tasks = [{ id: 'render-task', ...submitted.input, status: 'approval', tokensUsed: 150,
        calls: 1, usageUnknown: 0, reason: 'Review the exact draft before allowing these local file changes.',
        checkResults: [], artifacts: [], pending: { files: [{ path: 'report.md', content: 'Release blocked\nOwner Maya\n' }] } }];
      return route.fulfill({ status: 202, json: tasks[0] });
    }
    return route.fulfill({ json: tasks });
  });
  await page.goto('/app/sleep');
  await page.getByRole('tab', { name: 'Overnight tasks', exact: true }).click();
  await page.getByRole('button', { name: 'Add a task', exact: true }).click();
  await page.getByLabel('Task', { exact: true }).fill('Prepare checked handoff');
  await page.getByLabel('What should be ready?').fill('Draft these facts: Release blocked. Owner Maya.');
  await page.getByLabel('Required exact phrases, one per line').fill('Release blocked\nOwner Maya');
  await expect(page.getByRole('checkbox', { name: /Allow Sleep to create/ })).not.toBeChecked();
  await page.getByRole('button', { name: 'Assign task', exact: true }).click();
  await expect(page.getByText('Approval needed', { exact: true })).toBeVisible();
  expect(submitted.input.writeFiles).toEqual([]);
  expect(submitted.input.checks[0].contains).toEqual(['Release blocked', 'Owner Maya']);
  await page.reload();
  await page.getByRole('tab', { name: 'Overnight tasks', exact: true }).click();
  await page.locator('summary').filter({ hasText: 'report.md' }).click();
  await expect(page.locator('pre').filter({ hasText: 'Owner Maya' })).toBeVisible();
  await page.getByRole('button', { name: 'Approve displayed files', exact: true }).click();
  await expect(page.getByText('Checks passed', { exact: true })).toBeVisible();
  expect(controls).toEqual(['approve']);
  const download = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Download report.md' }).click();
  expect((await download).suggestedFilename()).toBe('report.md');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  expect(errors).toEqual([]);
  await page.screenshot({ path: `test-results/sleep-task-${info.project.name}.png`, fullPage: true });
});
