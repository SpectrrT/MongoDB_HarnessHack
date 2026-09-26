import test from 'node:test';
import assert from 'node:assert/strict';
import {createMemoryDb} from '../rem/db/index.js';
import {createContextCompactor, ContextBudgetError, contextEvidenceKey, contextEvidenceWindow} from '../server/context/compaction.js';
import {createJevScorer} from '../server/context/jev.js';

const noise = Array.from({length: 12}, (_, i) => ({id: `noise-${i}`, text: `Newsletter ${i}: ${'Cafeteria soup and film club announcements. '.repeat(10)}`}));
const usage = {inputTokens: 100, outputTokens: 5, cost: 0.001};
const scorer = fn => ({name: 'evolution-fixture', async score(args) {return {scores: args.units.map(unit => ({id: unit.id, probability: fn(unit, args)})), usage};}});

test('new evidence revives an omitted dependency without a caller revision change', async () => {
  const db = createMemoryDb();
  const options = {db, budgetChars: 900, recentCount: 1, scorer: scorer((unit, args) => unit.id === 'routing' && JSON.stringify(args.currentEvidence).includes('migration follows plan J17') ? 0.99 : 0.03)};
  const initial = [{id: 'routing', text: 'Plan J17 routes traffic to eu-central-1.'}, ...noise, {id: 's1', text: 'Atlas migration region: us-west-2.'}];
  const first = await createContextCompactor(options).select({runId: 'r', goal: 'Report the Atlas migration region.', units: initial});
  assert.ok(!first.units.some(u => u.id === 'routing'));
  const second = await createContextCompactor(options).select({runId: 'r', goal: 'Report the Atlas migration region.', units: [...initial, {id: 's2', text: 'Atlas migration follows plan J17.'}]});
  assert.notEqual(first.metrics.evidenceKey, second.metrics.evidenceKey);
  assert.equal(second.metrics.cacheHits, 0);
  assert.ok(second.units.some(u => u.id === 'routing'));
  assert.equal((await createContextCompactor(options).read({runId: 'r', id: 'routing'})).text, initial[0].text);
});

test('exact idempotent rereads retain economical durable cache reuse', async () => {
  const db = createMemoryDb(), options = {db, budgetChars: 800, recentCount: 1, scorer: scorer(() => 0.02)};
  const units = [...noise, {id: 'read-1', text: 'Result: region eu-central-1.', dedupeKey: 'read:route:eu-central-1'}];
  const first = await createContextCompactor(options).select({runId: 'r', goal: 'Report region', units});
  const next = await createContextCompactor(options).select({runId: 'r', goal: 'Report region', units: [...units, {...units.at(-1), id: 'read-2'}]});
  assert.equal(next.metrics.evidenceKey, first.metrics.evidenceKey);
  assert.equal(next.metrics.decisionCalls, 0);
  assert.equal(next.metrics.cacheHits, noise.length);
  assert.equal(next.metrics.duplicateOmissions, 1);
});

test('content, ordering and protection changes alter the evidence fingerprint', () => {
  const units = [{id: 'a', text: 'Region east'}, {id: 'b', text: 'Region west'}];
  const key = contextEvidenceKey(units);
  for (const changed of [units.slice().reverse(), [{...units[0], text: 'Region north'}, units[1]], [{...units[0], pinned: 'constraint'}, units[1]], [units[0]]]) {
    assert.notEqual(contextEvidenceKey(changed), key);
  }
});

test('a revised scoring prompt does not reuse decisions from the older policy', async () => {
  const db = createMemoryDb();
  const options = {db, budgetChars: 800, recentCount: 0};
  await createContextCompactor({...options, scorer: {...scorer(() => 0.02), policyVersion: 'v1'}}).select({runId: 'r', goal: 'g', units: noise});
  const next = await createContextCompactor({...options, scorer: {...scorer(() => 0.02), policyVersion: 'v2'}}).select({runId: 'r', goal: 'g', units: noise});
  assert.equal(next.metrics.cacheHits, 0);
  assert.equal(next.metrics.decisionCalls, 2);
});

test('bounded evidence windows carry late observations without truncating records', () => {
  const units = [...noise, {id: 'old', text: 'Plan J17 uses eu-central-1.'}, {id: 'latest', text: 'The active migration follows plan J17.'}];
  const state = contextEvidenceWindow(units, 1000);
  assert.ok(state.chars <= 1000);
  assert.ok(state.partial);
  assert.ok(state.records.some(u => u.id === 'latest'));
  assert.ok(state.records.some(u => u.id === 'old'));
  assert.ok(state.records.every(u => units.find(source => source.id === u.id)?.text === u.text));
});

test('unfinished serialized tool exchanges stay protected', async () => {
  const c = createContextCompactor({db: createMemoryDb(), scorer: scorer(() => 0), budgetChars: 1500, recentCount: 0});
  const pending = {id: 'call', text: JSON.stringify([{role: 'assistant', content: null, tool_calls: [{id: 'q', type: 'function', function: {name: 'read', arguments: '{}'}}]}])};
  const orphan = {id: 'orphan', text: JSON.stringify([{role: 'tool', tool_call_id: 'missing', content: 'result'}])};
  const result = await c.select({runId: 'r', goal: 'g', units: [pending, orphan, ...noise]});
  assert.deepEqual(result.units.map(u => u.id), ['call', 'orphan']);
  assert.ok(result.decisions.filter(d => d.kept).every(d => d.reason === 'unfinished_exchange'));
});

test('metadata lookups are limited to current IDs and bounded query batches', async () => {
  const db = createMemoryDb(), find = db.collection.bind(db), queries = [];
  db.collection = name => {
    const collection = find(name), original = collection.find.bind(collection);
    if (!collection.observed) {
      collection.observed = true;
      collection.find = (query, options) => { queries.push({name, query}); return original(query, options); };
    }
    return collection;
  };
  const c = createContextCompactor({db, scorer: scorer(() => 0.01), budgetChars: 1000, maxDecisionCalls: 1, recentCount: 0});
  const units = Array.from({length: 270}, (_, i) => ({id: `record-${i}`, text: `Record ${i}: ${'neutral observation '.repeat(12)}`}));
  await assert.rejects(c.select({runId: 'bounded', goal: 'g', units}), error => {
    assert.ok(error instanceof ContextBudgetError);
    assert.equal(error.metrics.decisionCalls, 1);
    assert.equal(error.metrics.unscored, 262);
    return true;
  });
  assert.ok(queries.length > 2);
  assert.ok(queries.every(({query}) => query.runId === 'bounded' && query._id.$in.length <= 128));
});

test('conflicting scores and invalid accounting fail closed without fabricated savings', async () => {
  const c = createContextCompactor({db: createMemoryDb(), budgetChars: 500, recentCount: 0, scorer: {name: 'malformed', async score({units}) {
    return {scores: units.flatMap(u => [{id: u.id, probability: 0.01}, {id: u.id, probability: 0.99}]), usage: {inputTokens: -10, outputTokens: NaN, cost: -1}};
  }}});
  await assert.rejects(c.select({runId: 'r', goal: 'g', units: noise}), error => {
    assert.equal(error.metrics.usageKnown, false);
    assert.equal(error.metrics.costKnown, false);
    assert.equal(error.metrics.inputTokens, 0);
    assert.equal(error.metrics.retained, noise.length);
    return error instanceof ContextBudgetError;
  });
});

test('Jev rejects oversized request contexts before a paid call and forwards current evidence', async () => {
  let calls = 0, body;
  const j = createJevScorer({apiKey: 'test', fetchImpl: async (_, request) => {
    calls++; body = JSON.parse(request.body);
    return Response.json({answers: {keep_0: {noul: 0.9}}, usage: {input_tokens: 10, output_tokens: 0, cost: -1}});
  }});
  await assert.rejects(j.score({goal: 'g', revision: 'x'.repeat(4001), units: [noise[0]]}), /bounded request/);
  await assert.rejects(j.score({goal: 'g', units: noise}), /bounded request/);
  assert.equal(calls, 0);
  const currentEvidence = {records: [{id: 'new', text: 'The active migration follows plan J17.'}], partial: true};
  const result = await j.score({goal: 'g', units: [noise[0]], currentEvidence});
  assert.deepEqual(body.state.currentEvidence, currentEvidence);
  assert.equal(result.usage.cost, null);
});
