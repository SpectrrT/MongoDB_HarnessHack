import test from 'node:test';
import assert from 'node:assert/strict';
import {createAgent, seedConnections} from '../rem/agent.js';
import {createMemoryDb, ensureIndexes} from '../rem/db/index.js';
import {createLocalEmbedder} from '../rem/embed.js';
import {createStubGate} from '../rem/completion.js';
import {completionRecord} from '../rem/completion-record.js';
import {GEN0} from '../rem/harness.js';
import {costOf, modelFor} from '../rem/models.js';
import {createClock} from '../rem/util.js';

const modelUsage = {inputTokens: 10, outputTokens: 5};
async function fixture({verdicts, completion, compactor, toolFirst = false} = {}) {
  const db = createMemoryDb(), clock = createClock();
  await ensureIndexes(db, {search: false});
  await seedConnections(db, {now: clock.now()});
  let modelCalls = 0, gateCalls = 0, executorCalls = 0;
  const options = {
    db, clock, episodes: false, embedder: createLocalEmbedder(), compactor,
    harness: async () => ({version: 0, genome: GEN0}),
    world: {call: async () => ({events: [{title: 'Local fixture'}]})},
    model: {async chat({messages}) {
      modelCalls++;
      if (messages[0].content.includes('Role: planner')) return {final: 'Inspect and verify.', usage: modelUsage};
      if (++executorCalls === 1 && toolFirst) return {toolCall: {name: 'calendar.list', args: {}}, usage: modelUsage};
      return {final: 'Prepared the requested result.', usage: modelUsage};
    }},
    completion: {async check(input) {
      const attempt = gateCalls++;
      if (completion) return completion.check(input);
      const verdict = verdicts[attempt];
      if (verdict instanceof Error) throw verdict;
      return verdict;
    }},
    evidence: async () => ({pass: true, failures: []}),
  };
  const agent = createAgent(options);
  const run = await agent.startRun({runId: 'accounting', kind: 'test', instruction: 'Prepare a verified result.'});
  return {run, agent, db, options, counts: () => ({modelCalls, gateCalls})};
}

test('failed and unknown gate attempts each contribute once without inventing a token split', async () => {
  const {run, options, counts} = await fixture({verdicts: [
    {p: 0.2, source: 'priced-fixture', inputTokens: 20, outputTokens: 3, tokens: 23, cost: 0.007, usageKnown: true, costKnown: true},
    {p: null, available: false, source: 'unavailable-fixture', tokens: 11, cost: null, usageKnown: false, costKnown: false},
  ]});
  assert.equal(run.status, 'incomplete');
  assert.deepEqual(counts(), {modelCalls: 3, gateCalls: 2});
  assert.equal(run.usage.calls, 3, 'model call counter keeps its existing meaning');
  assert.equal(run.usage.inputTokens, 50);
  assert.equal(run.usage.outputTokens, 18);
  assert.equal(run.usage.unattributedTokens, 11);
  assert.equal(run.usage.totalTokens, 79);
  assert.equal(run.usage.cost, 3 * costOf(modelUsage, modelFor('large')) + 0.007);
  assert.equal(run.usage.allInCost, null);
  assert.match(run.usage.costSource, /estimates.*reported/);
  const completion = run.usage.completion;
  assert.equal(completion.calls, 2);
  assert.equal(completion.tokens, 34);
  assert.equal(completion.cost, 0.007);
  assert.equal(completion.unknownUsageCalls, 1);
  assert.equal(completion.unknownCostCalls, 1);
  assert.equal(completion.usageKnown, false);
  assert.equal(completion.costKnown, false);
  assert.deepEqual(completion.receipts.map(r => [r.attempts, r.tokens, r.cost]), [[1, 23, 0.007], [2, 11, null]]);
  assert.equal(run.completion.inputTokens, null);
  assert.equal(run.completion.outputTokens, null);
  assert.equal(run.completion.cost, null);
  assert.equal(run.completion.usageKnown, false);
  assert.equal(run.completion.available, false);
  const resumed = await createAgent(options).resumeRun(run.runId);
  assert.deepEqual(resumed.usage, run.usage, 'a fresh worker cannot charge terminal attempts again');
  assert.deepEqual(counts(), {modelCalls: 3, gateCalls: 2});
});

test('aggregate subtotal includes model, compaction, and completion receipts together', async () => {
  let selections = 0;
  const compactor = {async select({units}) {
    selections++;
    return {units, decisions: [], metrics: {status: 'compacted', inputTokens: 7, outputTokens: 2,
      reportedCost: 0.003, decisionCalls: 1, usageKnown: true, costKnown: true}};
  }};
  const {run, counts} = await fixture({toolFirst: true, compactor, verdicts: [
    {p: 0.99, source: 'total-only', tokens: 17, cost: 0.002, usageKnown: true, costKnown: true},
  ]});
  assert.equal(run.status, 'done');
  assert.equal(run.step, 1);
  assert.deepEqual(counts(), {modelCalls: 3, gateCalls: 1});
  assert.ok(selections >= 2);
  assert.equal(run.usage.compactionCalls, selections);
  assert.equal(run.usage.inputTokens, 30 + selections * 7);
  assert.equal(run.usage.outputTokens, 15 + selections * 2);
  assert.equal(run.usage.unattributedTokens, 17);
  assert.equal(run.usage.totalTokens, 45 + selections * 9 + 17);
  assert.equal(run.usage.totalTokens, run.usage.inputTokens + run.usage.outputTokens + run.usage.unattributedTokens);
  assert.ok(Math.abs(run.usage.cost - (3 * costOf(modelUsage, modelFor('large')) + selections * 0.003 + 0.002)) < 1e-12);
  assert.equal(run.usage.completion.usageKnown, true);
  assert.equal(run.completion.inputTokens, null);
  assert.equal(run.completion.unattributedTokens, 17);
});

test('successful repair retains the cost of the rejected first answer and its gate', async () => {
  const {run} = await fixture({verdicts: [
    {p: 0.1, source: 'fixture', tokens: 8, cost: 0.001},
    {p: 0.99, source: 'fixture', inputTokens: 4, outputTokens: 2, cost: 0.002},
  ]});
  assert.equal(run.status, 'done');
  assert.equal(run.usage.completion.calls, 2);
  assert.equal(run.usage.completion.tokens, 14);
  assert.equal(run.usage.completion.cost, 0.003);
  assert.equal(run.usage.totalTokens, 45 + 14);
  assert.deepEqual(run.usage.completion.receipts.map(r => r.passed), [false, true]);
  assert.equal(run.usage.completion.unknownUsageCalls, 0);
  assert.equal(run.usage.completion.unknownCostCalls, 0);
});

test('thrown gate errors keep known charges and unknown receipts without exposing error bodies', async () => {
  const paidError = Object.assign(new Error('private provider response'), {
    receipt: {inputTokens: 9, tokens: 9, cost: 0.004, usageKnown: false, costKnown: true},
  });
  const {run} = await fixture({verdicts: [paidError, new Error('private transport details')]});
  assert.equal(run.status, 'incomplete');
  assert.equal(run.usage.totalTokens, 45 + 9);
  assert.equal(run.usage.completion.tokens, 9);
  assert.equal(run.usage.completion.cost, 0.004);
  assert.equal(run.usage.completion.unknownUsageCalls, 2);
  assert.equal(run.usage.completion.unknownCostCalls, 1);
  assert.equal(run.completion.tokens, null);
  assert.equal(run.completion.cost, null);
  assert.doesNotMatch(JSON.stringify(run.usage.completion), /private provider|private transport/);
});

test('offline stub records explicit zero completion usage', async () => {
  const {run} = await fixture({completion: createStubGate()});
  assert.equal(run.status, 'done');
  assert.equal(run.usage.completion.calls, 1);
  assert.equal(run.usage.completion.tokens, 0);
  assert.equal(run.usage.completion.cost, 0);
  assert.equal(run.usage.completion.usageKnown, true);
  assert.equal(run.usage.completion.costKnown, true);
  assert.equal(run.usage.totalTokens, 30);
});

test('receipt validation retains partial amounts but rejects invalid and contradictory usage', () => {
  const record = verdict => completionRecord({verdict, evidence: {pass: true, failures: []}, threshold: 0.5, attempts: 1});
  const partial = record({p: 0.9, inputTokens: 6, cost: 0.1, usageKnown: false, costKnown: false});
  assert.equal(partial.tokens, 6);
  assert.equal(partial.outputTokens, null);
  assert.equal(partial.usageKnown, false);
  assert.equal(partial.cost, 0.1);
  assert.equal(partial.costKnown, false);
  const invalid = record({p: 0.9, tokens: -1, inputTokens: Infinity, outputTokens: '2', cost: NaN});
  assert.equal(invalid.tokens, null);
  assert.equal(invalid.cost, null);
  assert.equal(invalid.usageKnown, false);
  const inconsistent = record({p: 0.9, tokens: 2, inputTokens: 5, outputTokens: 1});
  assert.equal(inconsistent.tokens, 6);
  assert.equal(inconsistent.usageKnown, false);
});
