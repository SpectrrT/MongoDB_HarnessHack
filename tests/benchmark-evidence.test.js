import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=path=>JSON.parse(fs.readFileSync(new URL('../'+path,import.meta.url),'utf8'));
const data=read('src/data/benchmark-evidence.json');
const receipt=result=>read('public'+result.receipt);

test('homepage efficiency charts reconcile all-in usage, source character totals and provider provenance',()=>{
  for(const [result,repeated] of [[data,false],[data.repeated,true]]) {
    const raw=receipt(result),sum=raw.summary;
    assert.equal(result.baselineTokens,sum.baselineTotal);
    assert.equal(result.offloadTokens,sum.compactedTotal);
    assert.equal(result.mainTokens+result.decisionTokens,sum.compactedTotal);
    assert.equal(result.baselinePassed,sum.baselinePassed);
    assert.equal(result.offloadPassed,sum.compactedPassed);
    assert.equal(result.scorer,raw.scorer);
    const metrics=raw.cases.flatMap(c=>repeated?[c.metrics]:c.stages.map(s=>s.metrics));
    assert.equal(result.beforeContextChars,metrics.reduce((n,m)=>n+m.beforeChars,0));
    assert.equal(result.afterContextChars,metrics.reduce((n,m)=>n+m.afterChars,0));
    assert.equal(result.contextSnapshots,metrics.length);
    assert.equal(result.selectionBudgetChars,metrics[0].budgetChars);
  }
});
test('identical-input personal charts never attribute token variation to compaction',()=>{
  for(const result of [data.research,data.onboarding]) {
    const raw=receipt(result),sum=raw.summary;
    assert.equal(result.baselineTokens,sum.baseline.totalTokens);
    assert.equal(result.offloadTokens,sum.compacted.totalTokens);
    assert.equal(result.baselinePassed,sum.baseline.checksPassed);
    assert.equal(result.offloadPassed,sum.compacted.checksPassed);
    assert.equal(result.stages,sum.baseline.checksTotal);
    assert.equal(result.answerModel,raw.model);
    assert.equal(sum.compacted.decisionCalls,0);
    assert.equal(result.decisionTokens,0);
    assert.equal(result.tokenSavingsPercent,null);
    assert.equal(result.noSelection,true);
    assert.equal(raw.pairs[0].baseline.calls[0].requestSha256,raw.pairs[0].compacted.calls[0].requestSha256);
    assert.equal(result.beforeContextChars,result.afterContextChars);
  }
});
test('assigned draft comparison links both measured live runs',()=>{
  const raw=read('public/evidence/assigned-drafts.json');
  assert.deepEqual([raw.initialLiveRun.current.completed,raw.initialLiveRun.current.modelCalls,raw.initialLiveRun.current.tokensUsed],[2,7,1721]);
  assert.deepEqual([raw.refinedLiveRun.current.completed,raw.refinedLiveRun.current.modelCalls,raw.refinedLiveRun.current.tokensUsed],[3,3,815]);
});
