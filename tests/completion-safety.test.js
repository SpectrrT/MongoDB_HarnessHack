import test from 'node:test';
import assert from 'node:assert/strict';
import { createAgent, seedConnections } from '../rem/agent.js';
import { createMemoryDb, ensureIndexes } from '../rem/db/index.js';
import { createLocalEmbedder } from '../rem/embed.js';
import { GEN0 } from '../rem/harness.js';
import { createClock } from '../rem/util.js';

async function runWith({ probabilities = [0.99], checks = [{ pass: true, failures: [] }], stepBudget = 10 } = {}) {
  const db = createMemoryDb();
  await ensureIndexes(db, { search: false });
  const clock = createClock();
  await seedConnections(db, { now: clock.now() });
  let attempts = 0, observations = 0;
  const agent = createAgent({
    db, clock, world: {}, episodes: false,
    embedder: createLocalEmbedder(),
    model: { chat: async () => ({ final: 'Prepared the requested result.', usage: { inputTokens: 10, outputTokens: 5 } }) },
    harness: async () => ({ version: 0, genome: { ...GEN0, contextPolicy: { ...GEN0.contextPolicy, stepBudget } } }),
    completion: { check: async () => ({ p: probabilities[Math.min(attempts++, probabilities.length - 1)], source: 'test' }) },
    evidence: async () => checks[Math.min(observations++, checks.length - 1)],
  });
  const run = await agent.startRun({ runId: 'completion-test', kind: 'test', instruction: 'Prepare a verified result.' });
  return { run, agent, db };
}

test('a confident model cannot override failed deterministic acceptance checks', async () => {
  for (const evidence of [{ pass: false, failures: ['missing required artifact'] }, { pass: false, failures: [] }]) {
    const { run, agent } = await runWith({ checks: [evidence] });
    assert.equal(run.status, 'incomplete');
    assert.equal(run.completion.p, 0.99);
    assert.equal(run.completion.checksPassed, false);
    assert.equal(run.completion.passed, false);
    assert.equal(run.completion.attempts, 2);
    assert.ok(run.completion.reasons.length);
    const retry = await agent.resumeRun(run.runId);
    assert.equal(retry.status, 'incomplete');
    assert.equal(retry.turns, run.turns, 'a generic resume cannot silently reset the repair allowance');
  }
});

test('a repaired result must pass both checks and the completion threshold', async () => {
  const { run } = await runWith({ probabilities: [0.2, 0.95], checks: [{ pass: false, failures: ['missing evidence'] }, { pass: true, failures: [] }] });
  assert.equal(run.status, 'done');
  assert.equal(run.completion.passed, true);
  assert.equal(run.completion.attempts, 2);
  assert.deepEqual(run.completion.reasons, []);
});

test('invalid probabilities fail closed without breaking the repair prompt', async () => {
  for (const p of [NaN, Infinity, -0.1, 1.01, '0.99', undefined]) {
    const { run } = await runWith({ probabilities: [p] });
    assert.equal(run.status, 'incomplete');
    assert.equal(run.completion.p, null);
    assert.equal(run.completion.passed, false);
    assert.match(run.completion.reasons.join(' '), /invalid probability/);
  }
});

test('an exhausted execution budget cannot convert rejected completion into success', async () => {
  const { run } = await runWith({ probabilities: [0.05], stepBudget: 1 });
  assert.equal(run.status, 'incomplete');
  assert.equal(run.completion.attempts, 1);
  assert.equal(run.completion.passed, false);
});
