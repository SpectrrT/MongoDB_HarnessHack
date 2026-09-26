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
  const routine = { _id: 'fixture-routine', steps: ['calendar.google.com', 'docs.google.com'], titles: ['Fixture meeting', 'Fixture notes'], source: 'seed', cadence: 'weekly', timeZone: 'America/New_York', count: 3, dayCount: 3, weekdays: [1], typicalHour: 9, minutes: 30 };
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
  await expect(page.locator('.hx-status').getByRole('status')).toHaveText('Not recording');
  await expect(page.getByText('Demo history', { exact: true }).first()).toBeVisible();
  await page.locator('summary').filter({ hasText: /^Repeated work$/ }).click();
  await expect(page.getByText('Weekly pattern', { exact: true })).toBeVisible();
  await expect(page.getByText('Inferred from app activity across at least three weeks. No task is scheduled.')).toBeVisible();
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
  await expect(page.getByText('The local history service needs a MongoDB connection. Once connected, you can start recording here.')).toBeVisible();
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
  await expect(page).toHaveURL(/\/app\/memory\?view=suggestions&tab=sleep$/);
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

test('Legacy Sleep and REM links resolve into the Memory hub', async ({ page }) => {
  await prepare(page);
  await page.goto('/app/sleep?view=conversations');
  await expect(page).toHaveURL(/\/app\/memory\?view=conversations&tab=sleep$/);
  await expect(page.getByRole('navigation', { name: 'Memory views' }).getByRole('link', { name: 'Sleep', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('heading', { name: 'Sleeping conversations', exact: true })).toBeVisible();
  await page.goto('/app/rem');
  await expect(page).toHaveURL(/\/app\/memory\?tab=rem$/);
  await expect(page.getByRole('navigation', { name: 'Memory views' }).getByRole('link', { name: 'Learning', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('.rem-compact')).toBeVisible();
});

test('An action needs explicit budget and deadline before it becomes a Sleep draft task', async ({ page }, info) => {
  await prepare(page);
  let submissions = [], reject = true, task = null;
  const text = 'Action: Casey to draft the launch brief by Friday.';
  await page.route('**/api/suggestions**', route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (path.endsWith('/actions/0/draft')) {
      submissions.push(request.postDataJSON());
      if (reject) return route.fulfill({ status: 409, json: { error: 'The meeting source changed. Review the newest notes.' } });
      task = { id: 'sleep-draft-fixture', title: 'Draft the launch brief', brief: text, status: 'queued', deadline: submissions.at(-1).deadline, budget: submissions.at(-1).budget, tokensUsed: 0, calls: 0 };
      return route.fulfill({ status: 202, json: { task, workerEnabled: false, completionMeaning: 'Local draft only; original action not completed' } });
    }
    return route.fulfill({ json: { projects: [], suggestions: [], policy: null, runs: [{ _id: 'meeting-run', status: 'completed', input: { title: 'Launch follow-up', kind: 'meeting-followup' }, outputs: { artifact: { filename: 'meeting-followup.md' }, draft: { actionItems: [
      { text, sourceId: 'note1', status: 'not_started', draftSupported: true },
      { text: 'Action: Casey to send the contract.', sourceId: 'note1', status: 'not_started', draftSupported: false },
    ] } } }] } });
  });
  await page.route('**/api/sleep/tasks**', route => new URL(route.request().url()).pathname.endsWith('/status')
    ? route.fulfill({ json: { configured: true, enabled: false } }) : route.fulfill({ json: task ? [task] : [] }));
  await page.goto('/app/sleep?view=suggestions');
  await expect(page.getByText('Recorded action items', { exact: true })).toBeVisible();
  expect(submissions).toHaveLength(0);
  await expect(page.getByRole('button', { name: /^Draft this:/ })).toHaveCount(1);
  await page.getByRole('button', { name: `Draft this: ${text}` }).click();
  const dialog = page.getByRole('dialog', { name: 'Draft an action item' });
  await expect(dialog.getByText(text, { exact: true })).toBeVisible();
  const ready = new Date(Date.now() + 2 * 86400000); ready.setMinutes(0, 0, 0);
  const localReady = new Date(+ready - ready.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  await dialog.getByLabel('Ready by').fill(localReady);
  await dialog.getByLabel('Total token budget').fill('8000');
  await dialog.getByLabel('Maximum attempts').selectOption('2');
  expect(submissions).toHaveLength(0);
  const audit = await new AxeBuilder({ page }).include('dialog').withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(audit.violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.screenshot({ path: `test-results/action-handoff-${info.project.name}.png` });
  await dialog.getByRole('button', { name: 'Queue draft task' }).click();
  await expect(dialog.getByRole('alert')).toHaveText('The meeting source changed. Review the newest notes.');
  await expect(page).toHaveURL(/\/app\/memory\?view=suggestions&tab=sleep$/);
  expect(submissions[0]).toEqual({ deadline: +ready, budget: 8000, maxAttempts: 2 });
  reject = false;
  await dialog.getByRole('button', { name: 'Queue draft task' }).click();
  await expect(page).toHaveURL(/\/app\/memory\?view=tasks&tab=sleep$/);
  await expect(page.getByText('Waiting for the local Sleep worker to be enabled.', { exact: false })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Draft the launch brief', exact: true })).toBeVisible();
  await expect(page.getByText('0 / 8,000 tokens')).toBeVisible();
  expect(submissions).toHaveLength(2);
});

test('A repeated action handoff shows its existing completed task without claiming it was queued again', async ({ page }) => {
  await prepare(page);
  const task = { id: 'existing-draft', title: 'Existing launch draft', brief: 'Draft the brief.', status: 'completed', deadline: Date.now() + 3600000, budget: 10000, tokensUsed: 1200, calls: 1 };
  await page.route('**/api/suggestions**', route => new URL(route.request().url()).pathname.endsWith('/draft')
    ? route.fulfill({ status: 202, json: { task, workerEnabled: false } })
    : route.fulfill({ json: { projects: [], suggestions: [], runs: [{ _id: 'existing-run', input: { kind: 'meeting-followup', title: 'Saved meeting' }, status: 'completed', outputs: { draft: { actionItems: [{ text: 'Action: Draft the brief.', sourceId: 'note', draftSupported: true }] } } }], policy: null } }));
  await page.route('**/api/sleep/tasks**', route => new URL(route.request().url()).pathname.endsWith('/status')
    ? route.fulfill({ json: { configured: true, enabled: false } }) : route.fulfill({ json: [task] }));
  await page.goto('/app/sleep?view=suggestions');
  await page.getByRole('button', { name: /^Draft this:/ }).click();
  await page.getByRole('button', { name: 'Queue draft task' }).click();
  await expect(page).toHaveURL(/\/app\/memory\?view=tasks&tab=sleep$/);
  await expect(page.getByRole('heading', { name: 'Existing launch draft' })).toBeVisible();
  await expect(page.getByText('Checks passed', { exact: true })).toBeVisible();
  await expect(page.locator('.slow-page .suggestion-notice')).not.toContainText('Waiting for');
  await expect(page.locator('.slow-page .suggestion-notice')).not.toContainText('Queued for');
});
