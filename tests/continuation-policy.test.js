import test from 'node:test';
import assert from 'node:assert/strict';
import { assessContinuation } from '../server/harness/continuation.js';

const now = Date.parse('2026-09-26T20:00:00Z');
const snapshot = overrides => ({ objective: 'Prepare a verified handoff.', deadlineAt: '2026-09-26T21:00:00Z',
  attempts: 1, maxAttempts: 3, tokensUsed: 100, tokenBudget: 1000, nextTokenReservation: 300,
  stalledAttempts: 0, maxStalledAttempts: 2, requiredCheckIds: ['artifact', 'citations'],
  checks: [{ id: 'artifact', passed: true }], nextStep: 'Verify citations.', ...overrides });
const assess = overrides => assessContinuation(snapshot(overrides), { now });

test('continuation describes unmet work and remaining limits without claiming success', () => {
  const state = snapshot();
  const before = JSON.stringify(state);
  const result = assessContinuation(state, { now });
  assert.equal(result.action, 'continue');
  assert.match(result.prompt, /"unmetChecks":\["citations"\]/);
  assert.match(result.prompt, /"attemptsRemaining":2/);
  assert.match(result.prompt, /does not grant additional permissions/);
  assert.equal(JSON.stringify(state), before);
});

test('only all required checks and no failures establish completion', () => {
  assert.deepEqual(assess({ checks: [{ id: 'artifact', passed: true }, { id: 'citations', passed: true }] }), { action: 'stop', reason: 'completed' });
  assert.equal(assess({ checks: [] }).action, 'continue');
  assert.equal(assess({ checks: [{ id: 'artifact', passed: true }, { id: 'citations', passed: true }, { id: 'collateral', passed: false }] }).action, 'continue');
  for (const requiredCheckIds of [undefined, [], ['artifact', 'artifact'], ['']])
    assert.equal(assess({ requiredCheckIds }).reason, 'missing_acceptance_contract');
  for (const checks of [[{ id: 'artifact', passed: 'true' }], [null], [{ id: 'artifact', passed: true }, { id: 'artifact', passed: false }]])
    assert.equal(assess({ checks }).reason, 'invalid_evidence');
});

test('cancellation, deadline and persisted attempt budget stop continuation', () => {
  assert.equal(assess({ cancelled: true }).reason, 'cancelled');
  assert.equal(assess({ deadlineAt: now }).reason, 'deadline_reached');
  assert.equal(assess({ attempts: 3 }).reason, 'attempt_budget_exhausted');
  assert.equal(assess({ attempts: 4 }).reason, 'attempt_budget_exhausted');
});

test('reserve the entire next call budget before permitting continuation', () => {
  assert.equal(assess({ tokensUsed: 701 }).reason, 'token_budget_exhausted');
  assert.equal(assess({ tokensUsed: 700 }).action, 'continue');
  assert.equal(assess({ tokensUsed: 1001 }).reason, 'token_budget_exhausted');
});

test('missing or malformed limits never imply unlimited execution', () => {
  for (const override of [{ deadlineAt: undefined }, { deadlineAt: 'invalid' }, { deadlineAt: 1e100 }, { maxAttempts: Infinity },
    { maxAttempts: 0 }, { attempts: -1 }, { tokensUsed: NaN }, { tokenBudget: undefined },
    { nextTokenReservation: 0 }, { stalledAttempts: undefined }, { maxStalledAttempts: 0 }])
    assert.equal(assess(override).reason, 'invalid_limits');
});

test('approval, external blockers and repeated stalls require intervention', () => {
  assert.equal(assess({ awaitingApproval: true }).reason, 'approval_required');
  assert.equal(assess({ blockedReason: 'Missing input.' }).reason, 'dependency_blocked');
  assert.equal(assess({ stalledAttempts: 2 }).reason, 'no_verified_progress');
  assert.equal(assess({ stalledAttempts: 1 }).action, 'continue');
});

test('serializing and restoring the snapshot preserves its stopping decision', () => {
  const state = snapshot({ attempts: 3 });
  assert.deepEqual(assessContinuation(JSON.parse(JSON.stringify(state)), { now }), assessContinuation(state, { now }));
});
