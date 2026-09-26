import test from 'node:test';
import assert from 'node:assert/strict';
import { createJevGate, createStubGate, decisionUsage } from '../rem/completion.js';
import { createJevRehearsalJudge, rehearse } from '../rem/rehearse.js';
import { createRem } from '../rem/index.js';
import { TRAIN_IDS } from '../rem/gym.js';

const input = { cp: { instruction: 'Verify the result', transcript: [], plan: [] }, final: 'Draft', evidence: { pass: true, failures: [] } };
const usage = { input_tokens: 12, output_tokens: 3, cost: 0.02 };
const response = (p, reported = usage, ok = true) => ({ ok, status: ok ? 200 : 402,
  json: async () => ({ answers: { satisfied: { noul: p }, breaks: { noul: p } }, usage: reported, privateProviderDetail: 'never publish this body' }) });

test('completion retains reported charges when HTTP or probability validation fails', async () => {
  for (const [p, ok] of [[0.9, false], [NaN, true], [Infinity, true], [-0.1, true], [1.1, true], ['0.8', true]]) {
    const result = await createJevGate({ apiKey: 'fixture', fetchImpl: async () => response(p, usage, ok) }).check(input);
    assert.equal(result.available, false); assert.equal(result.p, null);
    assert.equal(result.tokens, 15); assert.equal(result.cost, 0.02);
    assert.equal(result.usageKnown, true); assert.equal(result.costKnown, true);
    assert.ok(!JSON.stringify(result).includes('privateProviderDetail'));
  }
});

test('completion distinguishes missing or partial usage from explicit no-call stub usage', async () => {
  const missing = await createJevGate({ apiKey: 'fixture', fetchImpl: async () => response(0.8, null) }).check(input);
  assert.equal(missing.p, 0.8); assert.equal(missing.tokens, null); assert.equal(missing.cost, null);
  assert.equal(missing.usageKnown, false); assert.equal(missing.costKnown, false);
  const partial = await createJevGate({ apiKey: 'fixture', fetchImpl: async () => response(0.8, { input_tokens: 7, cost: 0.01 }) }).check(input);
  assert.equal(partial.tokens, 7); assert.equal(partial.inputTokens, 7); assert.equal(partial.outputTokens, null);
  assert.equal(partial.usageKnown, false); assert.equal(partial.costKnown, true);
  const offline = await createStubGate().check(input);
  assert.equal(offline.tokens, 0); assert.equal(offline.cost, 0); assert.equal(offline.usageKnown, true); assert.equal(offline.costKnown, true);
  for (const invalid of [-1, NaN, Infinity, '7', 1.2]) {
    const receipt = decisionUsage({ input_tokens: invalid, output_tokens: 2, cost: -1 });
    assert.equal(receipt.tokens, 2); assert.equal(receipt.usageKnown, false); assert.equal(receipt.cost, null);
  }
});

test('network failures and unreadable completion responses stay unavailable with unknown usage', async () => {
  for (const fetchImpl of [async () => { throw Error('PRIVATE PROVIDER TEXT'); }, async () => ({ ok: true, json: async () => { throw Error('PRIVATE BODY'); } })]) {
    const result = await createJevGate({ apiKey: 'fixture', fetchImpl }).check(input);
    assert.equal(result.available, false); assert.equal(result.tokens, null); assert.equal(result.usageKnown, false); assert.equal(result.costKnown, false);
    assert.ok(!JSON.stringify(result).includes('PRIVATE'));
  }
});

test('rehearsal numeric judge API stays compatible and failed scores retain a receipt', async () => {
  const recipe = { taskId: TRAIN_IDS[0], attacks: ['reorder'], level: 1 }, context = { genome: {}, history: [] };
  const { score } = createJevRehearsalJudge({ apiKey: 'fixture', fetchImpl: async () => response(0.7896) });
  assert.equal(await score(recipe, context), 0.79);
  for (const p of [NaN, Infinity, -1, 2, '0.5']) {
    const judge = createJevRehearsalJudge({ apiKey: 'fixture', fetchImpl: async () => response(p) });
    await assert.rejects(judge.score(recipe, context), error => error.receipt.available === false && error.receipt.tokens === 15 && error.receipt.cost === 0.02);
  }
});

test('rehearsal counts every ranking charge, including invalid, failed and unchosen candidates', async () => {
  const rem = await createRem({}); let calls = 0;
  const judge = createJevRehearsalJudge({ apiKey: 'fixture', fetchImpl: async () => {
    const call = calls++;
    if (call === 0) return response(0.9, { input_tokens: 8, output_tokens: 2, cost: 0.5 }, false);
    if (call === 1) return response(Infinity, { input_tokens: 11, output_tokens: 1, cost: 0.25 });
    if (call === 2) throw Error('SECRET PROVIDER DETAIL');
    return response(0.1, { input_tokens: 5, output_tokens: 0, cost: 0.1 });
  } });
  const result = await rehearse(rem.ctx, { night: 1, count: 1, judge, runTask: async task => ({ taskId: task.id, pass: true, failures: [], collateral: [], cost: 2, tokens: 20, modelCalls: 1 }) });
  assert.ok(result.imagined > result.tried); assert.equal(calls, result.imagined);
  const ranking = result.accounting.ranking;
  assert.equal(ranking.calls, calls); assert.equal(ranking.tokens, 22 + (calls - 3) * 5);
  assert.ok(Math.abs(ranking.cost - (0.75 + (calls - 3) * 0.1)) < 1e-9);
  assert.equal(ranking.unknownUsageCalls, 1); assert.equal(ranking.unknownCostCalls, 1);
  assert.equal(ranking.usageKnown, false); assert.equal(ranking.costKnown, false);
  assert.equal(ranking.receipts.filter(receipt => !receipt.available).length, 3);
  assert.equal(await rem.ctx.db.collection('rehearsal_rankings').countDocuments({}), calls);
  assert.equal(result.cost, result.accounting.gym.estimatedCost + ranking.cost); assert.equal(result.allInCost, null);
  assert.ok(!JSON.stringify(result).includes('SECRET'));
});

test('failed variants charge the plain-task verification run once and keep its cost even when it fails', async () => {
  const rem = await createRem({});
  await rem.ctx.db.collection('briefs').insertOne({ calibration: { passing: [TRAIN_IDS[0]] }, createdAt: new Date() });
  let baselines = 0, variants = 0;
  const result = await rehearse(rem.ctx, { night: 2, count: 2, judge: null, runTask: async task => {
    const variant = task.id.includes('~'); variant ? variants++ : baselines++;
    return { taskId: task.id, pass: false, failures: ['synthetic failure'], collateral: [], cost: variant ? 2 : 3, tokens: variant ? 20 : 30, modelCalls: 1 };
  } });
  assert.equal(variants, 2); assert.equal(baselines, 1); assert.equal(result.cost, 7);
  assert.equal(result.accounting.gym.tokens, 70); assert.equal(result.accounting.gym.modelCalls, 3);
  assert.equal(result.accounting.gym.baselineRuns, 1); assert.equal(result.alreadyFailing, 2);
  assert.equal(result.accounting.ranking.calls, 0); assert.equal(result.accounting.ranking.costKnown, true);
  const stored = await rem.ctx.db.collection('rehearsals').find({}).toArray();
  assert.equal(stored.reduce((sum, row) => sum + row.baselineCost, 0), 3);
});
