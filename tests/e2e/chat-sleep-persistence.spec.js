import { test, expect } from '@playwright/test';
import { createWorkspace } from '../../shared/workspace.js';
const conversationId = '11111111-1111-4111-8111-111111111111';
const jobId = '22222222-2222-4222-8222-222222222222';
async function prepare(page, pending = null) {
  const state = createWorkspace(); state.profile.onboarded = true; state.profile.name = 'Tester'; state.settings.modelSelection = 'fixture';
  state.conversations = [{ id: conversationId, title: 'Prepared query review', generatedTitle: true, createdAt: Date.now(), pending, messages: [{ id: 'source', role: 'user', text: 'Prepared example: draft a query rollout checklist. Preserve the constraint: no database writes.', at: Date.now() }] }];
  await page.addInitScript(value => { if (!localStorage.getItem('offload.workspace.v1')) localStorage.setItem('offload.workspace.v1', JSON.stringify(value)); }, state);
}
for (const outcome of ['completed', 'paused']) test(`Chat Sleep stays in place and persists ${outcome} work while viewing Sleep`, async ({ page }, info) => {
  await prepare(page);
  let sleep = { enabled: false, state: 'off', configured: true }, runCalls = 0, consent, context;
  await page.route('**/api/model/**', route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (path === '/api/model/status') return route.fulfill({ json: { connected: true, models: [{ id: 'fixture', name: 'Fixture', efforts: ['low'] }] } });
    if (path === '/api/model/openrouter/status') return route.fulfill({ json: { connected: false, models: [] } });
    if (path.endsWith('/run-now')) { runCalls++; sleep = { ...sleep, state: 'running', jobId }; return route.fulfill({ status: 202, json: sleep }); }
    if (path.includes('/sleep/')) {
      if (request.method() === 'POST' && !path.endsWith('/activity')) {
        const body = request.postDataJSON(); if (body.enabled) { consent = body.consent; context = body.context; }
        sleep = { ...sleep, enabled: body.enabled, state: body.enabled ? 'waiting' : 'off' };
      }
      return route.fulfill({ json: sleep });
    }
    if (path.endsWith('/jobs/' + jobId)) return route.fulfill({ json: { id: jobId, status: outcome, background: true, ...(outcome === 'paused' ? { error: 'Review is needed before continuing.' } : {}), result: { text: outcome === 'completed' ? 'Saved candidate: compare staging explain plans before proposing an index.' : 'Saved partial review: query shape still needs confirmation.', model: 'fixture', usage: { total_tokens: 720 }, agent: { jobId, artifacts: [], events: [] } } } });
    return route.fulfill({ status: 404, json: { error: 'Unexpected fixture request.' } });
  });
  await page.goto('/app/chat/' + conversationId);
  const toggle = page.getByRole('button', { name: 'Sleep for this conversation', exact: true });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(page).toHaveURL('/app/chat/' + conversationId);
  await expect(page.locator('.chat-composer textarea')).toBeEnabled();
  expect(consent.scope).toBe('isolated-local-drafts'); expect(context.messages[0].text).toContain('no database writes');
  expect(runCalls).toBe(0);
  await page.getByRole('button', { name: 'Run Sleep now' }).click();
  expect(runCalls).toBe(1);
  await expect(page).toHaveURL('/app/chat/' + conversationId);
  await page.getByRole('link', { name: 'View in Sleep' }).click();
  await expect(page.getByRole('link', { name: 'Prepared query review Working in the background' })).toBeVisible();
  sleep = { ...sleep, state: outcome === 'completed' ? 'done' : 'paused', ...(outcome === 'paused' ? { error: 'Review is needed before continuing.' } : {}) };
  const resultLink = page.locator('.sleeping-chat a');
  await expect(resultLink).toContainText(outcome === 'completed' ? 'Review available' : 'Paused. Review progress', { timeout: 10000 });
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('offload.workspace.v1')).conversations[0].messages.filter(message => message.sleep).length)).toBe(1);
  await page.reload();
  await expect(resultLink).toContainText('Prepared query review');
  await resultLink.click();
  await expect(page.getByText(outcome === 'completed' ? 'Saved candidate: compare staging explain plans before proposing an index.' : 'Saved partial review: query shape still needs confirmation.', { exact: true })).toBeVisible();
  await expect(page.getByText('720 total tokens', { exact: true })).toBeVisible();
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(page).toHaveURL('/app/chat/' + conversationId);
  await page.goto('/app/sleep?view=conversations');
  await expect(resultLink).toContainText('Review available');
  await expect(page.locator('.sleeping-chat').getByRole('button', { name: 'Wake', exact: true })).toHaveCount(0);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('offload.workspace.v1')).conversations[0]);
  expect(saved.sleepEnabled).toBe(false); expect(saved.messages.filter(message => message.sleep)).toHaveLength(1);
  expect(saved.messages.at(-1).usage.total_tokens).toBe(720);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.screenshot({ path: `test-results/chat-sleep-${outcome}-${info.project.name}.png` });
});

test('Sleep waits for foreground work and reports rejected manual runs without false progress', async ({ page }) => {
  const foregroundId = '33333333-3333-4333-8333-333333333333';
  await prepare(page, { id: foregroundId, model: 'fixture', effort: 'low', notes: [] });
  let sleep = { enabled: false, state: 'off', configured: true }, foregroundDone = false, runs = 0;
  await page.route('**/api/model/**', route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (path === '/api/model/status') return route.fulfill({ json: { connected: true, models: [{ id: 'fixture', name: 'Fixture', efforts: ['low'] }] } });
    if (path === '/api/model/openrouter/status') return route.fulfill({ json: { connected: false, models: [] } });
    if (path.endsWith('/run-now')) { runs++; return route.fulfill({ status: 503, json: { error: 'Sleep provider is unavailable. Try again after connecting it.' } }); }
    if (path.includes('/sleep/')) { if (request.method() === 'POST') sleep = { ...sleep, enabled: request.postDataJSON().enabled, state: 'waiting' }; return route.fulfill({ json: sleep }); }
    if (path.endsWith('/jobs/' + foregroundId)) return route.fulfill({ json: foregroundDone ? { id: foregroundId, status: 'completed', result: { text: 'Foreground notes ready.', model: 'fixture' } } : { id: foregroundId, status: 'running', events: [], approvals: [] } });
    return route.fulfill({ status: 404, json: { error: 'Unexpected request.' } });
  });
  await page.goto('/app/chat/' + conversationId);
  await page.getByRole('button', { name: 'Sleep for this conversation', exact: true }).click();
  const run = page.getByRole('button', { name: 'Run Sleep now', exact: true });
  await expect(run).toBeDisabled();
  await expect(page.getByText('Available after this reply finishes.')).toBeVisible();
  expect(runs).toBe(0);
  foregroundDone = true;
  await expect(run).toBeEnabled({ timeout: 6000 });
  await run.click();
  await expect(page.getByRole('alert')).toContainText('Sleep provider is unavailable.');
  await expect(page).toHaveURL('/app/chat/' + conversationId);
  await expect(page.getByRole('button', { name: 'Sleep for this conversation', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(runs).toBe(1);
});

test('Turning Sleep off retains an unconsumed result through failed fetch and refresh', async ({ page }) => {
  await prepare(page);
  let sleep = { enabled: false, state: 'off', configured: true }, allowResult = false, missingIdleJob = false;
  await page.route('**/api/model/**', route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (path === '/api/model/status') return route.fulfill({ json: { connected: true, models: [{ id: 'fixture', name: 'Fixture', efforts: ['low'] }] } });
    if (path === '/api/model/openrouter/status') return route.fulfill({ json: { connected: false, models: [] } });
    if (path.includes('/sleep/')) {
      if (request.method() === 'POST') { const { enabled } = request.postDataJSON(); sleep = { ...sleep, enabled, state: enabled ? 'waiting' : 'off', ...(!enabled ? { jobId } : {}) }; }
      return route.fulfill({ json: missingIdleJob ? { enabled: false, state: 'off' } : sleep });
    }
    if (path.endsWith('/jobs/' + jobId)) return allowResult ? route.fulfill({ json: { id: jobId, status: 'completed', result: { text: 'Recovered review after waking.', usage: { total_tokens: 432 }, model: 'fixture' } } }) : route.fulfill({ status: 503, json: { error: 'Temporary unavailable result.' } });
    return route.fulfill({ status: 404, json: { error: 'Unexpected request.' } });
  });
  await page.goto('/app/chat/' + conversationId);
  const toggle = page.getByRole('button', { name: 'Sleep for this conversation', exact: true });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  // Disable before the background poll has seen the completed job.
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('offload.workspace.v1')).conversations[0].sleepObservedJobId)).toBe(jobId);
  missingIdleJob = true; allowResult = true;
  await page.reload();
  await expect(page.getByText('Recovered review after waking.', { exact: true })).toBeVisible({ timeout: 10000 });
  await page.goto('/app/sleep?view=conversations');
  await expect(page.locator('.sleeping-chat a')).toContainText('Review available');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('offload.workspace.v1')).conversations[0]);
  expect(saved.sleepEnabled).toBe(false); expect(saved.messages.filter(message => message.sleep)).toHaveLength(1);
});

test('Skipped Sleep pass does not invent a review or fetch a nonexistent job', async ({ page }) => {
  await prepare(page);
  let sleep = { enabled: false, state: 'off', configured: true }, jobReads = 0;
  await page.route('**/api/model/**', route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (path === '/api/model/status') return route.fulfill({ json: { connected: true, models: [{ id: 'fixture', name: 'Fixture', efforts: ['low'] }] } });
    if (path === '/api/model/openrouter/status') return route.fulfill({ json: { connected: false, models: [] } });
    if (path.endsWith('/run-now')) { sleep = { enabled: true, state: 'done', skipped: true, jobId, error: 'No supported unfinished local draft remains.' }; return route.fulfill({ status: 202, json: sleep }); }
    if (path.includes('/sleep/')) { if (request.method() === 'POST') sleep = { ...sleep, enabled: true, state: 'waiting' }; return route.fulfill({ json: sleep }); }
    if (path.includes('/jobs/')) jobReads++;
    return route.fulfill({ status: 404, json: { error: 'No job exists.' } });
  });
  await page.goto('/app/chat/' + conversationId);
  await page.getByRole('button', { name: 'Sleep for this conversation', exact: true }).click();
  await page.getByRole('button', { name: 'Run Sleep now', exact: true }).click();
  await expect(page.locator('.sleep-chat-hint')).toContainText('Sleep found no unfinished local draft');
  await page.getByRole('link', { name: 'View in Sleep' }).click();
  await expect(page.locator('.sleeping-chat a')).toContainText('No unfinished draft found');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('offload.workspace.v1')).conversations[0].sleepJobId)).toBe(jobId);
  expect(jobReads).toBe(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('offload.workspace.v1')).conversations[0].messages.filter(message => message.sleep).length)).toBe(0);
});

test('Sleep example prepares context without enabling Sleep or starting a model', async ({ page }) => {
  await prepare(page);
  await page.addInitScript(() => { const state = JSON.parse(localStorage.getItem('offload.workspace.v1')); state.settings.modelProvider = 'openrouter'; delete state.settings.openrouterModel; localStorage.setItem('offload.workspace.v1', JSON.stringify(state)); });
  let mutations = 0, enabledContext;
  await page.route('**/api/model/**', route => {
    if (route.request().method() === 'POST') { mutations++; enabledContext = route.request().postDataJSON().context; return route.fulfill({ json: { enabled: true, state: 'waiting' } }); }
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/model/status') return route.fulfill({ json: { connected: false, models: [] } });
    if (path === '/api/model/openrouter/status') return route.fulfill({ json: { connected: false, models: [] } });
    return route.fulfill({ json: { enabled: false, state: 'off' } });
  });
  await page.goto('/app/sleep?view=conversations');
  await page.getByRole('button', { name: 'Try Sleep example', exact: true }).click();
  await expect(page).toHaveURL(/\/app\/chat\/[a-f0-9-]+$/);
  await expect(page.getByRole('button', { name: 'Sleep for this conversation', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.user-bubble')).toContainText('fictional checkout-api incident with synthetic data');
  const state = await page.evaluate(() => JSON.parse(localStorage.getItem('offload.workspace.v1')));
  expect(state.conversations[0].title).toBe('Example: Query review');
  expect(state.conversations[0].messages).toHaveLength(1);
  expect(state.conversations[0].messages[0].role).toBe('user');
  expect(state.conversations[0].pending).toBeUndefined();
  await expect(page.getByRole('button', { name: 'Sleep for this conversation', exact: true })).toBeEnabled();
  expect(mutations).toBe(0);
  await page.getByRole('button', { name: 'Sleep for this conversation', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sleep for this conversation', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(enabledContext.model).toBe('prepared-example');
  expect(enabledContext.messages[0].text).toContain('Do not run database commands');
  expect(mutations).toBe(1);
});
