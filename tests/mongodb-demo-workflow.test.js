import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {checkMongoWorkflow} from '../scripts/demo-meeting-workflow.mjs';
const good='Unverified draft\np95 baseline: 180 ms. Timeout baseline: 0.6%. Compare explain plans in staging. Proposed index rollout checklist. Rollback plan. No database writes or index creation are authorized.';
const plan=text=>({files:[{path:'action-draft.md',content:text}]});
test('demo checker requires supplied baselines, staging comparison, rollback and an explicit no-mutation boundary',()=>{
 assert.ok(checkMongoWorkflow(plan(good)).every(check=>check.passed));
 for(const [needle,replacement,id] of [['180 ms','18 ms','p95-baseline'],['0.6%','6%','timeout-baseline'],['staging','production','staging-explain-comparison'],['Rollback plan','Recovery notes','rollback-plan'],['No database writes or index creation are authorized.','','no-database-mutations']]){
  assert.equal(checkMongoWorkflow(plan(good.replace(needle,replacement))).find(check=>check.id===id).passed,false,id);
 }
 assert.equal(checkMongoWorkflow(plan(good+' We created the index.')).find(check=>check.id==='no-executed-work-claim').passed,false);
 assert.equal(checkMongoWorkflow({files:[]})[0].passed,false);
});
test('prepared example preserves its sample provenance and makes no live-result claim',()=>{
 const text=fs.readFileSync(new URL('../public/evidence/mongodb-example-workflow.md',import.meta.url),'utf8');
 assert.match(text,/Sample data\. Previously prepared example, not a live model result\./);
 assert.match(text,/p95 latency of 180 ms/);assert.match(text,/timeout rate of 0\.6%/);assert.match(text,/No database writes or index creation/);
 assert.match(text,/Rollback plan/);assert.match(text,/no production index changed/);
});

test('shared example sources produce a meeting checklist and a three-week routine with bounded draft input',async()=>{
 const {mongodbDemoSources}=await import('../shared/mongodb-demo.js');
 const {normalizeEvent}=await import('../server/suggestions/history.js');
 const {proactiveOpportunities,proactiveDraft}=await import('../server/suggestions/proactive.js');
 const {meetingActionDraftInput}=await import('../server/suggestions/action-draft.js');
 const now=new Date('2026-09-26T19:00:00Z');
 const rows=mongodbDemoSources(now).map(raw=>({...normalizeEvent(raw),_id:raw.sourceId}));
 assert.ok(rows.every(row=>+row.timestamp<=+now));
 assert.ok(rows.every(row=>row.locator.startsWith('example://')));
 const candidates=proactiveOpportunities(rows,now);
 assert.deepEqual(candidates.map(candidate=>candidate.kind).sort(),['meeting-followup','weekly-routine']);
 const meeting=candidates.find(candidate=>candidate.kind==='meeting-followup');
 const draft=proactiveDraft(meeting,meeting.sources.map(row=>({id:row._id,text:row.text})));
 assert.equal(draft.actionItems.length,1);assert.equal(draft.actionItems[0].draftSupported,true);
 const input=meetingActionDraftInput({run:{},action:draft.actionItems[0],rows:meeting.sources,deadline:+now+600000,budget:20000});
 assert.ok(input.brief.length<=4000);assert.match(input.brief,/180 ms/);assert.match(input.brief,/0\.6%/);assert.deepEqual(input.writeFiles,[]);
});
