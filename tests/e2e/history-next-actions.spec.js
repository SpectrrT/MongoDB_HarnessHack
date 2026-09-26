import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createWorkspace } from '../../shared/workspace.js';

async function prepare(page, theme = 'light') {
  const state = createWorkspace(); state.profile.onboarded = true; state.profile.name = 'Tester'; state.settings.theme = theme;
  await page.addInitScript(value => localStorage.setItem('offload.workspace.v1', JSON.stringify(value)), state);
}

// Only synthetic rendering fixtures. No collector or private history is accessed.
test('History distinguishes samples and saving a routine from running a task', async ({ page }, info) => {
  await prepare(page);
  let approved = false, requestHeader;
  const start = new Date(); start.setHours(9, 0, 0, 0); const end = new Date(+start + 1800000);
  const routine = { _id: 'fixture-routine', steps: ['calendar.google.com', 'docs.google.com'], titles: ['Fixture meeting', 'Fixture notes'], source: 'seed', count: 3, dayCount: 3, weekdays: [1, 2, 3], typicalHour: 9, minutes: 30 };
  await page.route('**/api/activity/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/stream')) return route.fulfill({ contentType: 'text/event-stream', body: ': fixture\n\n' });
    if (path.endsWith('/status')) return route.fulfill({ json: { configured: true, devices: [{ source: 'seed', lastSeen: start.toISOString() }], search: 'local', retentionDays: 7, workspace: 'fixture' } });
    if (path.endsWith('/settings')) return route.fulfill({ json: { paused: false, captureTitles: true, captureUrls: true, excludedApps: [] } });
    if (path.endsWith('/routines/fixture-routine')) { approved = true; requestHeader = route.request().headers()['x-offload-client']; return route.fulfill({ json: { routine: { ...routine, status: 'approved' } } }); }
    if (path.endsWith('/routines')) return route.fulfill({ json: { routines: [{ ...routine, status: approved ? 'approved' : 'candidate' }] } });
    if (path.endsWith('/timeline')) return route.fulfill({ json: { sessions: [{ _id: 'seed', start: start.toISOString(), end: end.toISOString(), durationSec: 1800, app: 'Chrome', label: 'docs.google.com', title: 'Fixture notes', source: 'seed' }] } });
    if (path.endsWith('/stats')) return route.fulfill({ json: { totalSec: 1800, sessions: 1, focusBlocks: 1, switches: 0, first: start.toISOString(), last: end.toISOString(), byApp: [{ app: 'Chrome', seconds: 1800 }] } });
    return route.fulfill({ json: {} });
  });
  await page.goto('/app/history');
  await expect(page.getByText('No samples from this computer yet.')).toBeVisible();
  await expect(page.getByText('Sample week', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: /^Save routine:/ }).click();
  expect(requestHeader).toBe('local');
  await expect(page.getByText('Routine saved. No task has run.', { exact: false })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Review next actions' })).toHaveAttribute('href', '/app/sleep?view=suggestions');
  const audit = await new AxeBuilder({ page }).include('.history-page').withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(audit.violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.screenshot({ path: `test-results/history-actions-${info.project.name}.png` });
});

test('History explains a missing hosted service and retries the connection', async ({ page }) => {
  await prepare(page);
  let offline = true;
  await page.route('**/api/activity/status', route => offline ? route.fulfill({ contentType: 'text/html', body: '<html>Static website</html>' }) : route.fulfill({ json: { configured: false } }));
  await page.goto('/app/history');
  await expect(page.getByText('Computer history needs the local Offload service.', { exact: false })).toBeVisible();
  await expect(page.locator('main')).not.toContainText('HTTP 200');
  offline = false;
  await page.getByRole('button', { name: 'Check connection' }).click();
  await expect(page.getByText('Computer history uses the local Offload service and a connected MongoDB workspace.')).toBeVisible();
});

test('Next actions imports explicit meeting notes and shows a draft without claiming action completion', async ({ page }, info) => {
  await prepare(page, 'monochrome-dark');
  let imported, decided, suggestion = null, runs = [];
  await page.route('**/api/suggestions**', route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (path.endsWith('/import')) {
      imported = request.postDataJSON().events[0];
      suggestion = { _id: 'meeting-fixture', kind: 'meeting-followup', title: 'Review follow-up for Test meeting', reason: 'Uses the notes you just saved.', outputLabel: 'Source-linked action checklist', completionMeaning: 'Only a local draft. Action items remain not started.', evidence: [{ id: 'note', date: imported.timestamp, locator: imported.locator }] };
      return route.fulfill({ json: { inserted: 1 } });
    }
    if (path.endsWith('/decision')) {
      decided = request.postDataJSON(); suggestion = null;
      const run = { _id: 'draft-fixture', status: 'completed', input: { title: 'Test meeting follow-up' }, outputs: { artifact: { filename: 'follow-up.md' } } };
      runs = [run]; return route.fulfill({ json: { run } });
    }
    return route.fulfill({ json: { projects: [], suggestions: suggestion ? [suggestion] : [], runs, policy: null } });
  });
  await page.goto('/app/sleep?view=suggestions');
  await page.getByRole('button', { name: 'Add meeting notes', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Meeting title').fill('Test meeting');
  await dialog.getByLabel('Meeting status').selectOption('completed');
  await dialog.getByLabel('Starts', { exact: true }).fill('2026-09-25T10:00');
  await dialog.getByLabel('Ends', { exact: true }).fill('2026-09-25T11:00');
  await dialog.getByLabel('Agenda or meeting notes').fill('Decision: keep the current launch date.\nAction: Casey to draft the launch brief by Friday.');
  await dialog.getByLabel('Source link (optional)').fill('https://example.com/meeting-notes');
  await dialog.getByRole('button', { name: 'Save meeting notes' }).click();
  await expect(dialog).not.toBeVisible();
  expect(imported.origin).toBe('user'); expect(imported.kind).toBe('meeting-note'); expect(imported.meeting.status).toBe('completed');
  expect(imported.text).toContain('Action: Casey to draft the launch brief by Friday.');
  await page.getByText('Why this task?', { exact: true }).click();
  await expect(page.getByRole('link', { name: 'Open source' })).toHaveAttribute('href', 'https://example.com/meeting-notes');
  await page.getByRole('button', { name: 'Start once', exact: true }).click();
  expect(decided).toEqual({ decision: 'accept' });
  await expect(page.getByText('Draft ready', { exact: true })).toBeVisible();
  await expect(page.getByText('Review the draft before acting on it. Listed action items are not marked complete.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Download draft' })).toHaveAttribute('href', '/api/suggestions/artifacts/draft-fixture');
  const audit = await new AxeBuilder({ page }).include('.personal-suggestions').withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(audit.violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.screenshot({ path: `test-results/meeting-draft-${info.project.name}.png` });
});

test('Floyd Memory links resolve into the unified Sleep views', async ({ page }) => {
  await prepare(page);
  await page.goto('/app/memory?tab=sleep');
  await expect(page).toHaveURL(/\/app\/sleep\?view=conversations$/);
  await expect(page.getByRole('tab', { name: 'Conversations', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.goto('/app/memory?tab=rem');
  await expect(page).toHaveURL(/\/app\/sleep\?view=rem$/);
  await expect(page.getByRole('heading', { name: 'REM', exact: true })).toBeVisible();
});
