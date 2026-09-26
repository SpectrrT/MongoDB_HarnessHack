import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeRepeatedEvidence, expandRepeatedEvidence} from '../server/context/repeat-evidence.js';
import {createJevScorer} from '../server/context/jev.js';
import {createContextCompactor} from '../server/context/compaction.js';
import {createMemoryDb} from '../rem/db/index.js';

test('repeat encoding exactly preserves order, whitespace, counts and later corrections', () => {
  const examples = [
    'Event log\n' + 'Worker returned status 200. Receipt: INV-8231.\n'.repeat(12) + 'CORRECTION: final receipt INV-9242.',
    '  café\tmeasurement: 12.500\r\n'.repeat(10),
    'a '.repeat(500),
    'Observation\n' + 'same output'.repeat(100),
    JSON.stringify([{role: 'assistant', tool_calls: [{id: 'r', function: {name: 'read'}}]}, {role: 'tool', tool_call_id: 'r', content: 'Distinct line. '.repeat(40)}]),
    'Unrelated sparse content without repeats.',
  ];
  for (const source of examples) assert.equal(expandRepeatedEvidence(encodeRepeatedEvidence(source)), source);
  assert.equal(typeof encodeRepeatedEvidence(examples[0]), 'object');
});

test('bounded generative round trips retain every character and fail raw when compression is not useful', () => {
  let random = 1789;
  const next = () => {random = (Math.imul(random, 1664525) + 1013904223) >>> 0; return random;};
  for (let i = 0; i < 200; i++) {
    const phrase = Array.from({length: 1 + next() % 24}, () => ['alpha ', 'beta\n', 'gamma\t', ' delta. ', 'x_y-11 ', '\\n'][next() % 6]).join('');
    const source = 'Prefix ' + phrase.repeat(1 + next() % 12) + ` Last unique correction ${i}.`;
    const encoded = encodeRepeatedEvidence(source);
    assert.equal(expandRepeatedEvidence(encoded), source);
    assert.ok(JSON.stringify(encoded).length <= JSON.stringify(source).length);
  }
  const long = 'x '.repeat(4000);
  assert.equal(encodeRepeatedEvidence(long), long);
  assert.throws(() => expandRepeatedEvidence({encoding: 'exact-repeat-v1', segments: [{text: 'x', repeat: 1000000}]}));
});

test('Jev combines up to sixteen bounded candidates and archives unchanged originals', async () => {
  let request;
  const scorer = createJevScorer({apiKey: 'fixture', fetchImpl: async (_, options) => {
    request = JSON.parse(options.body);
    return Response.json({answers: Object.fromEntries(Object.keys(request.questions).map(key => [key, {noul: 0.02}])), usage: {input_tokens: 200, output_tokens: 20}});
  }});
  const units = Array.from({length: 14}, (_, i) => ({id: `item-${i}`, text: `Record ${i}. ` + 'Repeated tool observation of a stable document. '.repeat(10)}));
  const compactor = createContextCompactor({db: createMemoryDb(), scorer, budgetChars: 1000, recentCount: 0});
  const selected = await compactor.select({runId: 'bounded', goal: 'Select useful information', units});
  assert.equal(selected.metrics.decisionCalls, 1);
  assert.equal(Object.keys(request.questions).length, 14);
  assert.ok(Buffer.byteLength(JSON.stringify(request)) < 65536);
  for (const [i, record] of request.state.records.entries()) assert.equal(expandRepeatedEvidence(record.text), units[i].text);
  assert.equal((await compactor.read({runId: 'bounded', id: 'item-0'})).text, units[0].text);
});
