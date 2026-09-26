import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {exactAnswer} from '../scripts/fixtures/evolving-context.mjs';

const read = path => JSON.parse(fs.readFileSync(new URL('../'+path, import.meta.url), 'utf8'));
const summary = read('public/evidence/reference-summary.json');
const page = read('src/data/benchmark-evidence.json');

test('each reference receipt independently reconciles model usage and exact outputs', () => {
  for (const trial of summary.trials) {
    const raw = read('public'+trial.receipt), rows=raw.cases.flatMap(c=>c.stages);
    assert.equal(rows.length,12);
    for (const arm of ['reference','offload']) {
      const receipts=raw.receipts.filter(r=>r.arm===arm);
      const known=receipts.every(r=>r.usage.usageKnown);
      assert.equal(trial.summary[arm].calls,receipts.length);
      assert.equal(trial.summary[arm].totalTokens,known?receipts.reduce((n,r)=>n+r.usage.inputTokens+r.usage.outputTokens,0):null);
      assert.equal(trial.summary[arm+'Passed'],rows.filter(r=>exactAnswer(r[arm]?.answer,r.expected)).length);
    }
    assert.equal(trial.httpFailures,raw.receipts.filter(r=>r.status!==200).length);
    assert.ok(!JSON.stringify(raw).includes('"user_id"'));
  }
});

test('homepage values pool every registered clean trial and count selector overhead', () => {
  for(const item of summary.comparisons) {
    const trials=item.trials.map(receipt=>summary.trials.find(t=>t.receipt===receipt));
    assert.equal(trials.length,item.trialCount);
    assert.ok(trials.every(t=>t.model===item.answerModel));
    assert.equal(item.baselineTokens,trials.reduce((n,t)=>n+t.summary.reference.totalTokens,0));
    assert.equal(item.offloadTokens,trials.reduce((n,t)=>n+t.summary.offload.totalTokens,0));
    assert.equal(item.decisionTokens,trials.reduce((n,t)=>n+t.summary.decisions.totalTokens,0));
    assert.equal(item.offloadPassed,trials.reduce((n,t)=>n+t.summary.offloadPassed,0));
    assert.equal(item.baselinePassed,trials.reduce((n,t)=>n+t.summary.referencePassed,0));
    assert.ok(item.offloadTokens>=item.decisionTokens);
  }
  for(const item of page.presentationComparisons) assert.deepEqual(item,summary.comparisons.find(r=>r.id===item.id));
  const failures=summary.trials.filter(r=>r.httpFailures);
  assert.equal(failures.length,3);
  assert.equal(failures.reduce((n,r)=>n+r.httpFailures,0),25);
  assert.ok(failures.every(r=>r.summary.reference.totalTokens===null || r.summary.offload.totalTokens===null));
});
