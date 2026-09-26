import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
const receipt=JSON.parse(fs.readFileSync(new URL('../public/evidence/mongodb-live-workflow.json',import.meta.url),'utf8'));
test('published MongoDB demo evidence reconciles usage, source facts, model proposals and exact artifact hashes',()=>{
 assert.equal(receipt.execution.inputTokens+receipt.execution.outputTokens,receipt.execution.totalTokens);
 assert.equal(receipt.execution.totalTokens,1420);assert.equal(receipt.execution.modelCalls,1);assert.equal(receipt.execution.approvalModelCalls,0);
 assert.equal(receipt.sourceType,'synthetic');assert.equal(receipt.suppliedBaseline.measuredOnLiveDatabase,false);
 assert.equal(receipt.modelProposals.approvedForDatabaseExecution,false);
 assert.equal(receipt.checks.declaredContentPassed,8);assert.equal(receipt.checks.fileChecksPassed,2);
 for(const artifact of receipt.artifacts){const bytes=fs.readFileSync(new URL('../public'+artifact.receipt,import.meta.url));assert.equal(bytes.length,artifact.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),artifact.sha256);}
 assert.doesNotMatch(JSON.stringify(receipt),/\/Users\/|user_id|organization_id|Bearer |api_key/);
});
