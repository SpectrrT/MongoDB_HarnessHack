import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeRepeatedEvidence, expandRepeatedEvidence, encodeEvidenceRecords} from '../server/context/repeat-evidence.js';
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
  for (const [i, record] of request.state.records.entries()) {
    assert.equal(request.questions[`keep_${i}`].instructions, `Does record ${i} need retention under retentionPolicy?`);
    assert.equal(record.record, i);
    const decoded = typeof record.text === 'string' ? record.text : {encoding: 'exact-repeat-v1', ...record.text};
    assert.equal(expandRepeatedEvidence(decoded, request.state.dictionary), units[i].text);
    if (typeof record.text !== 'string') assert.equal(record.text.encoding, undefined);
  }
  assert.match(request.state.encoding, /exact-repeat-v1/);
  assert.equal((await compactor.read({runId: 'bounded', id: 'item-0'})).text, units[0].text);
});

test('shared blocks preserve distinct identities, exact counts and unique record corrections', () => {
  const repeated = 'A shared event body with exact receipt id INV-21 and a stable source observation. ';
  const records = Array.from({length: 16}, (_, i) => ({record: i, text: `Unique source ${i}. ` + repeated.repeat(3 + i % 4) + ` Final distinct decision ${i}.`}));
  const encoded = encodeEvidenceRecords(records);
  assert.ok(encoded.dictionary && Object.keys(encoded.dictionary).length > 0);
  const independentlyEncoded = {records: records.map(record => ({...record, text: encodeRepeatedEvidence(record.text)}))};
  assert.ok(JSON.stringify(encoded).length < JSON.stringify(independentlyEncoded).length);
  for (const [i, record] of encoded.records.entries()) {
    assert.equal(record.record, i);
    assert.equal(expandRepeatedEvidence(record.text, encoded.dictionary), records[i].text);
  }
  assert.throws(() => expandRepeatedEvidence({encoding: 'exact-repeat-v1', segments: [{ref: 'missing', repeat: 2}]}));
});

test('batch encoding never expands the wire representation or changes source objects', () => {
  for (let count = 1; count <= 16; count++) {
    const records = Array.from({length: count}, (_, i) => ({id: `record-${i}`, metadata: {position: i}, text:
      i % 3 === 0 ? `Unique observation ${i}.` : `Start ${i}. ` + ('An exact shared observation with whitespace\tand Unicode café.\n').repeat(2 + i) + `Final ${i}.`,
    }));
    const original = JSON.stringify(records);
    const encoded = encodeEvidenceRecords(records);
    assert.equal(JSON.stringify(records), original);
    assert.ok(JSON.stringify(encoded).length <= JSON.stringify({records}).length);
    assert.deepEqual(encoded.records.map(record => ({...record, text: expandRepeatedEvidence(record.text, encoded.dictionary)})), records);
  }
});
