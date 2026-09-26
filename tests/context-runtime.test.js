import test from 'node:test';
import assert from 'node:assert/strict';
import {createMemoryDb, ensureIndexes} from '../rem/db/index.js';
import {createContextCompactor} from '../server/context/compaction.js';
import {createAgent, seedConnections} from '../rem/agent.js';
import {GEN0, commitHarness, currentHarness} from '../rem/harness.js';
import {createLocalEmbedder} from '../rem/embed.js';
import {createClock} from '../rem/util.js';
import {createWorld} from '../rem/world.js';
import {LIVE_WORKSPACE} from '../rem/fixtures.js';
const scorer={name:'fixture',async score({units}){return {scores:units.map(u=>({id:u.id,probability:0.01})),usage:{inputTokens:40,outputTokens:4,cost:0}};}};
const usage={inputTokens:10,outputTokens:5};
async function setup({scoring=scorer,budget=4000}={}){
 const db=createMemoryDb(),clock=createClock();await ensureIndexes(db);await seedConnections(db,{now:clock.now()});
 await commitHarness(db,{parent:null,genome:GEN0,now:clock.now()});
 const compactor=createContextCompactor({db,scorer:scoring,budgetChars:budget,recentCount:1});
 return {db,clock,compactor,options:{db,clock,compactor,embedder:createLocalEmbedder(),world:createWorld(LIVE_WORKSPACE),harness:()=>currentHarness(db),episodes:false}};
}
function checkPairs(messages){
 for(let i=0;i<messages.length;i++){
  const m=messages[i];
  if(m.tool_calls)assert.equal(messages[i+1]?.tool_call_id,m.tool_calls[0].id);
  if(m.role==='tool')assert.ok(messages[i-1]?.tool_calls?.some(t=>t.id===m.tool_call_id));
 }
}

test('runtime compacts complete exchanges, recovers omitted context and persists decision tokens',async()=>{
 const s=await setup();let executorCalls=0,sawOmission=false,sawRecovery=false;
 const model={async chat({messages,tools}){
  checkPairs(messages);
  assert.ok(tools.some(t=>t.function.name==='context.read'));
  if(messages[0].content.includes('Role: planner'))return {final:'Read records, recover evidence, report.',usage};
  executorCalls++;
  if(executorCalls<=7)return {toolCall:{name:'calendar.list',args:{week:`W${executorCalls}`}},usage};
  if(executorCalls===8){
   sawOmission=messages.some(m=>m.role==='system'&&m.content?.includes('Sleep context compaction omitted'));
   assert.ok(!messages.some(m=>m.content?.includes('long observation 1')));
   return {toolCall:{name:'context.read',args:{id:'step-1'}},usage};
  }
  sawRecovery=messages.some(m=>m.role==='tool'&&m.content?.includes('long observation 1'));
  return {final:'Recovered original evidence.',usage};
 }};
 let count=0;s.options.world={call:async()=>({events:[{description:`long observation ${++count}: ${'archive-only detail '.repeat(55)}`}]}),findEffect:()=>null};
 const agent=createAgent({...s.options,model});const run=await agent.startRun({kind:'test',instruction:'Inspect records and recover the first observation.',runId:'runtime'});
 assert.equal(run.status,'done');assert.ok(sawOmission);assert.ok(sawRecovery);
 assert.equal(run.transcript.length,8,'canonical trace still contains every executed action');
 assert.ok(run.usage.compactionInputTokens>0);
 assert.ok(run.usage.inputTokens>=run.usage.compactionInputTokens+10*10);
 assert.ok((await s.db.collection('context_archive').countDocuments({runId:'runtime'}))>0);
});

test('runtime pauses without another model call when Jev is down and context cannot fit',async()=>{
 const s=await setup({scoring:{name:'offline',score:async()=>{throw Error('network');}},budget:200});let calls=0;
 const model={async chat({messages}){calls++;return messages[0].content.includes('Role: planner')?{final:'Read.',usage}:{toolCall:{name:'calendar.list',args:{}},usage};}};
 s.options.world={call:async()=>({events:[{description:'x'.repeat(1000)}]})};
 const run=await createAgent({...s.options,model}).startRun({kind:'test',instruction:'Inspect the event.',runId:'paused'});
 assert.equal(run.status,'needs_review');assert.equal(calls,2);assert.match(run.final,/Protected or uncertain/);
 assert.equal(run.compaction.status,'needs_review');
});

test('a reviewed context pause resumes on a fresh worker with a larger explicit budget',async()=>{
 const s=await setup({budget:200});let calls=0;
 const model={async chat({messages}){
  if(messages[0].content.includes('Role: planner'))return {final:'Read then finish.',usage};
  calls++;return calls===1?{toolCall:{name:'calendar.list',args:{}},usage}:{final:'Finished after review.',usage};
 }};
 s.options.world={call:async()=>({events:[{description:'x'.repeat(1000)}]})};
 const first=await createAgent({...s.options,model}).startRun({kind:'test',instruction:'Inspect the event.',runId:'reviewed'});
 assert.equal(first.status,'needs_review');
 const next=createAgent({...s.options,model,compactor:createContextCompactor({db:s.db,scorer,budgetChars:4000})});
 const resumed=await next.resumeRun('reviewed');
 assert.equal(resumed.status,'done');assert.equal(resumed.transcript.length,1);assert.equal(calls,2);
});
