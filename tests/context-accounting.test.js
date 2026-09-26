import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeSnapshots} from '../scripts/lib/context-accounting.mjs';
const receipt=(inputTokens,outputTokens,cost=0)=>({inputTokens,outputTokens,cost,pass:true});
test('snapshot totals include initial, restart and repeated decision calls exactly once',()=>{
 const row={metrics:receipt(10,2),restartMetrics:receipt(3,1),repeated:{baseline:[receipt(100,5),receipt(100,5)],compacted:[receipt(20,5),receipt(20,5)],decisionMetrics:[receipt(4,1)]}};
 const result=summarizeSnapshots([row],{answerModel:'fixture',repeats:2});
 assert.equal(result.baselineTotal,210);assert.equal(result.compactedTotal,71);assert.equal(result.decisions.measuredTokens,21);
});
test('missing billed usage and failed paired calls preserve measured receipts without claiming savings',()=>{
 const rows=[{metrics:{...receipt(10,2),usageKnown:false},baseline:receipt(100,5),compacted:receipt(20,null)}];
 const result=summarizeSnapshots(rows,{answerModel:'fixture'});
 assert.equal(result.compactedTotal,null);assert.equal(result.tokenSavingsPercent,null);assert.equal(result.compacted.measuredTokens,20);
 const interrupted=summarizeSnapshots([{metrics:receipt(10,2),baseline:receipt(100,5),answerError:'interrupted'}],{answerModel:'fixture'});
 assert.equal(interrupted.complete,false);assert.equal(interrupted.baseline.measuredTokens,105);assert.equal(interrupted.baselineTotal,null);
 const failedSelection=summarizeSnapshots([{metrics:receipt(10,2),failureMetrics:{...receipt(7,1),usageKnown:false},error:'selection stopped'}],{answerModel:'fixture'});
 assert.equal(failedSelection.decisions.measuredTokens,20);assert.equal(failedSelection.compactedTotal,null);
});
test('missing decision price leaves combined monetary cost unknown',()=>{
 const result=summarizeSnapshots([{metrics:{...receipt(10,2),cost:null,costKnown:false},baseline:receipt(100,5,.01),compacted:receipt(20,5,.002)}],{answerModel:'fixture'});
 assert.equal(result.compactedTotal,37);assert.equal(result.combinedCompactedCost,null);
});
