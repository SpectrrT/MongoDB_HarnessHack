import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {MongoMemoryServer} from 'mongodb-memory-server';
import {MongoClient} from 'mongodb';
import request from 'supertest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {actionDraftSupported} from '../server/suggestions/action-draft.js';
import {SleepExecutionStore} from '../server/sleep/execution-store.js';
import {sleepExecutionTick,taskDirectory} from '../server/sleep/execution.js';
import {createPersonalSuggestions} from '../server/suggestions/service.js';
import {createContextCompactor} from '../server/context/compaction.js';
import {normalizeEvent,authoredRequest} from '../server/suggestions/history.js';
import {comparePolicies,HELD_OUT_OPPORTUNITIES} from '../server/suggestions/evaluation.js';
import {DEFAULT_SUGGESTIONS} from '../shared/suggestion-policy.js';
import {createApp} from '../server/index.js';
let server,client;
before(async()=>{server=await MongoMemoryServer.create();client=await new MongoClient(server.getUri()).connect();});
after(async()=>{await client?.close();await server?.stop();});
const event=(id,text,options={})=>({sourceId:id,sessionId:`session-${id}`,projectId:'harness',projectTitle:'Harness',
  timestamp:'2026-09-24T12:00:00Z',text,kind:'request',origin:'user',locator:`session:${id}`,...options});
const evidence=()=>[event('one','Find the previous session and recover the project context.'),
 event('two','Review the conversation and find what we already decided.',{timestamp:'2026-09-25T12:00:00Z'}),
 event('rule','Never publish without my approval.',{kind:'constraint',timestamp:'2026-07-01T12:00:00Z'})];
async function fixture(options={}){
 const db=client.db(`personal_${randomUUID().replaceAll('-','')}`);let time=new Date('2026-09-26T12:00:00Z');
 const config={db,clock:()=>time,...options};const service=await createPersonalSuggestions(config);
 return {db,service,config,advance:h=>{time=new Date(+time+h*3600000);}};
}

test('history adapters exclude tool results, copied system content and credentials',()=>{
 const config={projectId:'harness',projectTitle:'Harness',origin:'claude',sessionId:'a'};
 assert.equal(authoredRequest({type:'assistant',uuid:'a',message:{content:'Find session'}},config),null);
 assert.equal(authoredRequest({type:'user',uuid:'a',isMeta:true,message:{content:'Find session'}},config),null);
 assert.throws(()=>normalizeEvent(event('x','password=do-not-import-this')),/credential/);
 const parsed=authoredRequest({type:'user',uuid:'a',timestamp:'2026-09-24T12:00:00Z',message:{content:[{type:'tool_result',content:'secret'},{type:'text',text:'Find the previous session context.'}]}},config);
 assert.equal(parsed.family,'recover-context');assert.equal(parsed.text.includes('secret'),false);
});

test('context intent rejects social chat and substring false positives from real history',()=>{
 for(const text of ['Looking forward to chatting','Pull me a list of people for coffee chats','Go through LinkedIn and find people for a coffee chat','Prioritize the chat interface'])
  assert.equal(normalizeEvent(event('negative',text)).family,null,text);
 for(const text of ['Find that session too','Pull that session up and continue working on it','Find our previous chat','Review the conversation and find what we decided'])
  assert.equal(normalizeEvent(event('positive',text)).family,'recover-context',text);
});

test('real source workflow: independent evidence, event timing, verified artifact, retry and restart',async()=>{
 const f=await fixture(),s=f.service;
 await s.importEvents('owner',evidence());
 assert.equal((await s.list('owner')).suggestions.length,0,'no suggestions on a timer or import alone');
 const {suggestion}=await s.openProject('owner','harness');assert.ok(suggestion);
 assert.equal(suggestion.features.independentSessions,2);
 const started=await s.decide('owner',suggestion._id,'accept');assert.equal(started.run.status,'queued');
 const restarted=await createPersonalSuggestions(f.config);
 const again=await restarted.decide('owner',suggestion._id,'accept');assert.equal(again.run._id,started.run._id);
 for(let i=0;i<4;i++)await restarted.workOnce('restarted-worker');
 const run=await restarted.run('owner',started.run._id);assert.equal(run.status,'completed');assert.equal(run.receipts.length,4);
 const artifact=await restarted.getArtifact('owner',run._id);assert.equal(artifact.verification.passed,true);
 assert.match(artifact.text,/Never publish without my approval/);
 assert.equal(artifact.sha256,createHash('sha256').update(artifact.text).digest('hex'));
 assert.equal((await restarted.openProject('owner','harness')).suggestion,null);
 assert.equal(await f.db.collection('personal_task_runs').countDocuments(),1);
});

test('forked duplicate requests cannot manufacture independent support',async()=>{
 const f=await fixture();const [first]=evidence();
 await f.service.importEvents('owner',[first,{...first,sourceId:'copy',sessionId:'fork',timestamp:'2026-09-25T12:00:00Z'}]);
 assert.equal((await f.service.openProject('owner','harness')).suggestion,null);
 assert.equal((await f.service.importEvents('owner',[first])).unchanged,1);
});

test('accepted task survives a failure between acceptance and queue insertion',async()=>{
 const f=await fixture(),s=f.service;await s.importEvents('owner',evidence());
 const {suggestion}=await s.openProject('owner','harness');
 s.runs.enqueue=async()=>{throw Error('simulated connection loss before queue insertion');};
 await assert.rejects(s.decide('owner',suggestion._id,'accept'),/connection loss/);
 const restarted=await createPersonalSuggestions(f.config);
 assert.equal(await restarted.recoverAccepted(),1);
 assert.equal(await restarted.recoverAccepted(),0);
 const linked=await f.db.collection('personal_suggestions').findOne({_id:suggestion._id});
 for(let i=0;i<4;i++)await restarted.workOnce('reconciler');
 assert.ok(await restarted.getArtifact('owner',linked.runId));
 assert.equal(await f.db.collection('personal_task_runs').countDocuments(),1);
});

test('altered source quotations and lost protected constraints never publish artifacts',async()=>{
 for(const mode of ['alter','drop-constraint']){
  const f=await fixture();const s=await createPersonalSuggestions({...f.config,compactor:{name:'fault-injection',select:async({units})=>({
   units:mode==='alter'?units.map((u,i)=>i===0?{...u,text:'Fabricated completion claim.'}:u):units.filter(u=>!u.pinned),metrics:{}})}});
  await s.importEvents('owner',evidence());const {suggestion}=await s.openProject('owner','harness');
  const {run}=await s.decide('owner',suggestion._id,'accept');for(let i=0;i<4;i++)await s.workOnce('checker');
  assert.equal((await s.run('owner',run._id)).status,'failed',mode);
  assert.equal(await s.getArtifact('owner',run._id),null,mode);
 }
});

test('workspace and project boundaries hold through imported sources, runs and downloads',async()=>{
 const f=await fixture(),s=f.service;
 await s.importEvents('alice',[...evidence(),event('other','Private other-project context',{projectId:'other',projectTitle:'Other'})]);
 assert.equal((await s.list('bob')).projects.length,0);
 const {suggestion}=await s.openProject('alice','harness');const {run}=await s.decide('alice',suggestion._id,'accept');
 for(let i=0;i<4;i++)await s.workOnce('worker');
 assert.equal(await s.getArtifact('bob',run._id),null);
 assert.equal((await s.getArtifact('alice',run._id)).text.includes('Private other-project context'),false);
 await assert.rejects(s.decide('bob',suggestion._id,'accept'),/Unknown/);
});

test('snooze and mute persist, and changed sources invalidate stale cards',async()=>{
 const f=await fixture(),s=f.service;await s.importEvents('owner',evidence());
 const {suggestion}=await s.openProject('owner','harness');await s.decide('owner',suggestion._id,'snooze');
 assert.equal((await s.list('owner')).suggestions.length,0);f.advance(25);
 assert.equal((await (await createPersonalSuggestions(f.config)).list('owner')).suggestions.length,1);
 await s.importEvents('owner',[event('new','The project now has a new context note.')]);
 assert.equal((await s.list('owner')).suggestions.length,0);
 const next=(await s.openProject('owner','harness')).suggestion;assert.ok(next);
 await s.decide('owner',next._id,'mute');
 await s.importEvents('owner',[event('new2','Another saved decision.')]);
 assert.equal((await (await createPersonalSuggestions(f.config)).openProject('owner','harness')).suggestion,null);
});

test('withdrawn source cancels queued tasks and invalidates previously produced artifacts',async()=>{
 const f=await fixture(),s=f.service;await s.importEvents('owner',evidence());
 const {suggestion}=await s.openProject('owner','harness');const {run}=await s.decide('owner',suggestion._id,'accept');
 for(let i=0;i<4;i++)await s.workOnce('worker');
 assert.ok(await s.getArtifact('owner',run._id));
 await s.forget('owner',suggestion.sourceIds[0]);
 assert.equal(await s.getArtifact('owner',run._id),null);
 assert.deepEqual((await s.run('owner',run._id)).outputs,{});
 assert.equal((await f.db.collection('personal_events').findOne({_id:suggestion.sourceIds[0]})).text,undefined);
});

test('source context is immutable; validation prevents partial credential imports',async()=>{
 const f=await fixture(),s=f.service;
 await assert.rejects(s.importEvents('owner',[evidence()[0],event('bad','api_key=abc123supersecret')]),/credential/);
 assert.equal(await f.db.collection('personal_events').countDocuments(),0);
 await s.importEvents('owner',evidence());
 await assert.rejects(s.importEvents('owner',[{...evidence()[0],text:'Different contents'}]),/different content/);
});

test('two recorded dismissals can promote a checked policy, persist it, and roll back',async()=>{
 const f=await fixture(),s=f.service;await s.importEvents('owner',evidence());
 const first=(await s.openProject('owner','harness')).suggestion;await s.decide('owner',first._id,'dismiss');
 f.advance(26);await s.importEvents('owner',[event('new','New project decision for the next work period.')]);
 const second=(await s.openProject('owner','harness')).suggestion;await s.decide('owner',second._id,'dismiss');
 const active=await s.policy.active('owner');assert.equal(active.version,2);assert.equal(active.context.suggestions.cooldownHours,48);
 assert.equal(active.evaluation.heldOut.regressions.length,0);assert.equal(active.evaluation.train.improved,true);
 assert.equal((await (await createPersonalSuggestions(f.config)).policy.active('owner'))._id,active._id);
 await s.policy.rollback('owner',active._id);assert.equal((await s.policy.active('owner')).version,1);
 const harmful=comparePolicies(DEFAULT_SUGGESTIONS,{...DEFAULT_SUGGESTIONS,minSupport:3},HELD_OUT_OPPORTUNITIES);
 assert.ok(harmful.regressions.includes('two-real-sessions'),'a stricter rule is rejected if it breaks a useful case');
});

test('source-scoped Jev integration archives omitted data and retains protected notes',async()=>{
 const f=await fixture();const compactor=createContextCompactor({db:f.db,budgetChars:300,recentCount:2,scorer:{name:'fixture-retention',
  score:async({units})=>({scores:units.map(u=>({id:u.id,probability:u.text.includes('Cafeteria')?0:1})),usage:{inputTokens:0,outputTokens:0,cost:0}})}});
 const s=await createPersonalSuggestions({...f.config,compactor});
 await s.importEvents('owner',[...evidence(),...Array.from({length:8},(_,i)=>event(`noise${i}`,`Cafeteria bulletin ${i}. The weekly soup choices are displayed at reception.`,{timestamp:'2026-08-01T12:00:00Z'}))]);
 const {suggestion}=await s.openProject('owner','harness');const {run}=await s.decide('owner',suggestion._id,'accept');
 for(let i=0;i<4;i++)await s.workOnce('worker');
 const done=await s.run('owner',run._id);assert.equal(done.status,'completed');assert.ok(done.outputs.context.metrics.archived>0);
 const artifact=await s.getArtifact('owner',run._id);assert.match(artifact.text,/Never publish/);assert.doesNotMatch(artifact.text,/Cafeteria/);
 const archived=await f.db.collection('context_archive').findOne({runId:run._id});assert.ok(archived);
});

test('HTTP routes keep separate visitors isolated and download the checked artifact',async()=>{
 const f=await fixture();const app=createApp({serveStatic:false,suggestions:f.service});
 const owner=request.agent(app),other=request.agent(app);
 await owner.post('/api/suggestions/import').send({events:evidence()}).expect(200);
 const opened=await owner.post('/api/suggestions/open').send({projectId:'harness'}).expect(200);
 const started=await owner.post(`/api/suggestions/${opened.body.suggestion._id}/decision`).send({decision:'accept'}).expect(200);
 for(let i=0;i<4;i++)await f.service.workOnce('worker');
 await other.get(`/api/suggestions/runs/${started.body.run._id}`).expect(404);
 await other.get(`/api/suggestions/artifacts/${started.body.run._id}`).expect(404);
 const file=await owner.get(`/api/suggestions/artifacts/${started.body.run._id}`).expect(200);
 assert.match(file.headers['content-disposition'],/attachment/);assert.match(file.text,/Source ID:/);
});

const meetingEvent=(id,options={})=>event(id,'Agenda: Launch review.\nAction: Ryan to draft the release brief.\nDecision: Keep billing changes out of this release.',{
 kind:'meeting-note',timestamp:'2026-09-26T11:00:00Z',locator:'https://example.com/meeting-notes',
 meeting:{id:'launch-review',title:'Launch review',startsAt:'2026-09-26T13:00:00Z',endsAt:'2026-09-26T14:00:00Z',status:'scheduled'},...options});

test('one explicitly saved upcoming meeting produces a source-checked local brief without model calls',async()=>{
 const f=await fixture({compactor:{name:'must-not-call',select:()=>{throw Error('No paid model required for this draft');}}}),s=f.service;
 await s.importEvents('owner',[meetingEvent('agenda')]);
 const list=await s.list('owner');assert.equal(list.suggestions.length,1);
 const item=list.suggestions[0];assert.equal(item.kind,'meeting-prep');assert.equal(item.evidence[0].locator,'https://example.com/meeting-notes');
 const started=await s.decide('owner',item._id,'accept');assert.equal(started.run.status,'completed');assert.equal(started.run.receipts.length,4);
 const file=await s.getArtifact('owner',started.run._id);assert.match(file.text,/Launch review/);assert.match(file.text,/Meeting actions have not been executed/);
 assert.match(file.text,/Source ID:/);assert.equal(started.run.outputs.context.metrics.decisionCalls,0);
 const again=await s.decide('owner',item._id,'accept');assert.equal(again.run._id,started.run._id);
 assert.equal(await f.db.collection('personal_task_runs').countDocuments(),1);
 assert.equal((await s.list('other')).suggestions.length,0);
});

test('completed meeting extracts only labeled action lines and never marks them executed',async()=>{
 const f=await fixture(),s=f.service;
 const meeting={id:'launch-review',title:'Launch review',startsAt:'2026-09-26T10:00:00Z',endsAt:'2026-09-26T11:00:00Z',status:'completed'};
 await s.importEvents('owner',[meetingEvent('notes',{meeting,text:'We discussed lunch.\nAction: Ryan to draft the release brief.\nTodo: Confirm the owner.\nMaybe send something someday.'})]);
 const item=(await s.list('owner')).suggestions[0];assert.equal(item.kind,'meeting-followup');
 const {run}=await s.decide('owner',item._id,'accept');assert.equal(run.status,'completed');
 assert.equal(run.outputs.draft.actionItems.length,2);assert.ok(run.outputs.draft.actionItems.every(item=>item.status==='not_started'));
 const artifact=await s.getArtifact('owner',run._id);assert.match(artifact.text,/- \[ \] Action: Ryan/);assert.doesNotMatch(artifact.text,/- \[x\]/);
 assert.match(artifact.text,/Maybe send something someday/,'all source notes remain available');
});

test('meeting corrections, cancellations and stale timing invalidate suggestions and prior drafts',async()=>{
 const f=await fixture(),s=f.service;await s.importEvents('owner',[meetingEvent('initial')]);
 const item=(await s.list('owner')).suggestions[0];const {run}=await s.decide('owner',item._id,'accept');
 await s.importEvents('owner',[meetingEvent('cancel',{timestamp:'2026-09-26T11:30:00Z',meeting:{...meetingEvent('x').meeting,status:'cancelled'}})]);
 assert.equal((await s.list('owner')).suggestions.length,0);
 await assert.rejects(s.getArtifact('owner',run._id),/Source evidence or meeting timing changed/);
 const g=await fixture();await g.service.importEvents('owner',[meetingEvent('initial')]);
 const pending=(await g.service.list('owner')).suggestions[0];g.advance(2);
 assert.equal((await g.service.list('owner')).suggestions.length,0);
 await assert.rejects(g.service.decide('owner',pending._id,'accept'),/expired/);
});

test('weekly routine needs three separate weeks, does not treat duplicate sessions as repetitions, and never schedules itself',async()=>{
 const f=await fixture(),s=f.service;
 const routine=(id,date)=>event(id,'Prepare the weekly launch brief.',{kind:'routine',timestamp:date});
 await s.importEvents('owner',[routine('week1','2026-09-07T13:00:00Z'),routine('week1-copy','2026-09-07T13:00:00Z'),routine('week2','2026-09-14T13:00:00Z')]);
 assert.equal((await s.list('owner')).suggestions.length,0);
 await s.importEvents('owner',[routine('week3','2026-09-21T13:00:00Z')]);
 const item=(await s.list('owner')).suggestions[0];assert.equal(item.kind,'weekly-routine');assert.equal(item.sourceIds.length,3);
 const {run}=await s.decide('owner',item._id,'accept');assert.equal(run.status,'completed');
 assert.match((await s.getArtifact('owner',run._id)).text,/No recurring task has been scheduled/);
 assert.match((await s.getArtifact('owner',run._id)).text,/Times are shown in UTC/);
});

test('new source corrections stop an already accepted context task, and cancellation fences a stale worker',async()=>{
 const f=await fixture(),s=f.service;await s.importEvents('owner',evidence());
 const item=(await s.openProject('owner','harness')).suggestion;const {run}=await s.decide('owner',item._id,'accept');
 await s.importEvents('owner',[event('later','Correction: The release is cancelled.',{kind:'correction',timestamp:'2026-09-26T11:00:00Z'})]);
 await s.workOnce('worker');assert.equal((await s.run('owner',run._id)).status,'failed');
 const g=await fixture();await g.service.importEvents('owner',evidence());
 const next=(await g.service.openProject('owner','harness')).suggestion;const accepted=await g.service.decide('owner',next._id,'accept');
 const claimed=await g.service.runs.claim('stale-worker');
 assert.equal(await g.service.cancel('other',accepted.run._id),null);
 assert.equal((await g.service.cancel('owner',accepted.run._id)).status,'cancelled');
 await assert.rejects(g.service.runs.commit(claimed,'context',{fabricated:true}),/Stale worker/);
 assert.equal(await g.service.getArtifact('owner',accepted.run._id),null);
});

test('meeting sources validate chronological times and immutable metadata',async()=>{
 assert.throws(()=>normalizeEvent(meetingEvent('bad',{meeting:{...meetingEvent('x').meeting,endsAt:'2026-09-26T12:00:00Z'}})),/Meeting end/);
 const f=await fixture();const original=meetingEvent('agenda');await f.service.importEvents('owner',[original]);
 await assert.rejects(f.service.importEvents('owner',[{...original,meeting:{...original.meeting,status:'cancelled'}}]),/different content/);
});

test('concurrent starts commit one meeting artifact and later corrections replace the action checklist',async()=>{
 const f=await fixture(),s=f.service;
 const meeting={id:'launch-review',title:'Launch review',startsAt:'2026-09-26T10:00:00Z',endsAt:'2026-09-26T11:00:00Z',status:'completed'};
 await s.importEvents('owner',[meetingEvent('old',{meeting,text:'Action: Draft an email for Pat.'}),meetingEvent('new',{meeting,timestamp:'2026-09-26T11:30:00Z',text:'Correction: Do not contact Pat.\nAction: Prepare a local checklist only.'})]);
 const item=(await s.list('owner')).suggestions[0];
 const starts=await Promise.all([s.decide('owner',item._id,'accept'),s.decide('owner',item._id,'accept')]);
 const id=starts.find(result=>result.run)?.run._id;
 await s.decide('owner',item._id,'accept');
 const run=await s.run('owner',id);assert.equal(run.status,'completed');assert.equal(run.receipts.length,4);
 assert.equal(new Set(run.receipts.map(receipt=>receipt.key)).size,4);
 assert.equal(await f.db.collection('personal_task_runs').countDocuments(),1);
 assert.deepEqual(run.outputs.draft.actionItems.map(action=>action.text),['Action: Prepare a local checklist only.']);
 assert.match((await s.getArtifact('owner',id)).text,/Do not contact Pat/);
});

test('meeting draft recovers after accepted-before-enqueue crash and HTTP download needs no separate worker',async()=>{
 const f=await fixture(),s=f.service;await s.importEvents('owner',[meetingEvent('agenda')]);
 const item=(await s.list('owner')).suggestions[0];s.runs.enqueue=async()=>{throw Error('crash before enqueue');};
 await assert.rejects(s.decide('owner',item._id,'accept'),/crash before/);
 const restarted=await createPersonalSuggestions(f.config);assert.equal(await restarted.recoverAccepted(),1);
 const stored=await f.db.collection('personal_suggestions').findOne({_id:item._id});assert.equal((await restarted.run('owner',stored.runId)).status,'completed');
 const other=await fixture(),app=createApp({serveStatic:false,suggestions:other.service}),visitor=request.agent(app);
 await visitor.post('/api/suggestions/import').send({events:[meetingEvent('agenda')]}).expect(200);
 const listed=await visitor.get('/api/suggestions').expect(200);
 const started=await visitor.post(`/api/suggestions/${listed.body.suggestions[0]._id}/decision`).send({decision:'accept'}).expect(200);
 assert.equal(started.body.run.status,'completed');
 const artifact=await visitor.get(`/api/suggestions/artifacts/${started.body.run._id}`).expect(200);
 assert.match(artifact.text,/Meeting actions have not been executed/);
});

test('unrelated imports preserve valid meetings, and meeting dismissals never train the context policy',async()=>{
 const f=await fixture(),s=f.service;await s.importEvents('owner',[meetingEvent('agenda')]);
 const first=(await s.list('owner')).suggestions[0];
 await s.importEvents('owner',[event('unrelated','A separate project note.',{timestamp:'2026-09-26T11:30:00Z'})]);
 assert.equal((await s.list('owner')).suggestions[0]._id,first._id);
 await s.decide('owner',first._id,'dismiss');assert.equal((await s.list('owner')).suggestions.length,0);
 await s.importEvents('owner',[meetingEvent('another',{meeting:{...meetingEvent('x').meeting,id:'second-meeting'}})]);
 const second=(await s.list('owner')).suggestions[0];await s.decide('owner',second._id,'dismiss');
 assert.equal((await s.policy.active('owner')).version,1);
});

async function actionFixture(text='Action: Ryan to draft the release brief.'){
 const f=await fixture(),s=f.service;
 const meeting={id:'launch-review',title:'Launch review',startsAt:'2026-09-26T10:00:00Z',endsAt:'2026-09-26T11:00:00Z',status:'completed'};
 await s.importEvents('owner',[meetingEvent('notes',{meeting,text})]);
 const card=(await s.list('owner')).suggestions[0];const {run}=await s.decide('owner',card._id,'accept');
 const store=new SleepExecutionStore(f.db);await store.initialize();
 return {...f,store,run,options:{store,deadline:Date.now()+600000,budget:20000,maxAttempts:2}};
}
const draftExecutor=async({task})=>({plan:{summary:'A proposed local draft, pending review.',files:task.input.checks.map(check=>({path:check.path,
 content:check.contains.join('\n')+'\nProposed draft: review the supplied meeting decisions and keep the rollout limited. This draft still needs factual review. No message has been sent.'}))},
 usage:{input_tokens:100,output_tokens:100},provider:'scripted-test',model:'fixture'});

test('selected meeting action creates one real Sleep task, needs draft approval, and writes checked local artifacts',async()=>{
 const f=await actionFixture(),s=f.service,root=await fs.mkdtemp(path.join(os.tmpdir(),'meeting-action-'));
 try{
  const starts=await Promise.all([s.draftAction('owner',f.run._id,0,f.options),s.draftAction('owner',f.run._id,0,{...f.options,deadline:f.options.deadline+1000})]);
  assert.equal(starts[0]._id,starts[1]._id);assert.equal(starts[0].status,'queued');assert.deepEqual(starts[0].grants,[]);
  assert.equal(starts[0].sourceContract.suggestionRunId,f.run._id);
  const first=await sleepExecutionTick(f.store,draftExecutor,{root});assert.equal(first.status,'approval');assert.equal(first.artifacts.length,0);
  await f.store.control('owner',first._id,'approve');
  const done=await sleepExecutionTick(f.store,()=>{throw Error('Must reuse approved draft');},{root});
  assert.equal(done.status,'completed');assert.equal(done.calls,1);assert.equal(done.artifacts.length,2);assert.ok(done.checkResults.every(check=>check.passed));
  const file=await fs.readFile(path.join(taskDirectory(root,done),done.artifacts[0].directory,'action-draft.md'),'utf8');assert.match(file,/Unverified draft/);
  assert.equal((await s.draftAction('owner',f.run._id,0,{...f.options,deadline:Date.now()+900000}))._id,done._id);
  assert.equal((await s.run('owner',f.run._id)).outputs.draft.actionItems[0].status,'not_started','local draft completion is not the original action completion');
  assert.equal(await f.store.tasks.countDocuments(),1);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('stale meeting sources prevent Sleep model calls, and cancelled handoffs never restart',async()=>{
 const f=await actionFixture(),s=f.service,root=await fs.mkdtemp(path.join(os.tmpdir(),'meeting-stale-'));
 try{
  const task=await s.draftAction('owner',f.run._id,0,f.options);
  await s.importEvents('owner',[event('correction','Do not prepare the release brief.',{kind:'correction',timestamp:'2026-09-26T11:30:00Z'})]);
  let calls=0;const result=await sleepExecutionTick(f.store,()=>{calls++;throw Error('No model call allowed');},{root});
  assert.equal(calls,0);assert.equal(result.status,'cancelled');assert.equal(result._id,task._id);assert.equal(result.tokensReserved,0);
  await assert.rejects(s.draftAction('owner',f.run._id,0,f.options),/Source evidence/);
  const g=await actionFixture();const second=await g.service.draftAction('owner',g.run._id,0,g.options);
  await g.store.control('owner',second._id,'cancel');
  assert.equal((await g.service.draftAction('owner',g.run._id,0,g.options)).status,'cancelled');
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('source revocation during a model reservation cancels the draft and accounts for uncertain billed tokens',async()=>{
 const f=await actionFixture(),task=await f.service.draftAction('owner',f.run._id,0,f.options);
 const claimed=await f.store.claim('worker');await f.store.reserve(claimed,1000);
 await f.service.forget('owner',f.run.input.sourceIds[0]);
 await assert.rejects(f.store.fence(claimed),/Meeting source was revoked/);
 const cancelled=await f.store.get('owner',task._id);assert.equal(cancelled.status,'cancelled');assert.equal(cancelled.tokensUsed,1000);assert.equal(cancelled.tokensReserved,0);assert.equal(cancelled.usageUnknown,1);
 await assert.rejects(f.store.finish(claimed,'completed'),/no longer owns/);
});

test('external-only meeting actions are not offered as executable local drafts',async()=>{
 const f=await actionFixture('Action: Send the draft to Pat.');
 assert.equal(f.run.outputs.draft.actionItems[0].draftSupported,false);
 await assert.rejects(f.service.draftAction('owner',f.run._id,0,f.options),/beyond local drafting/);
 assert.equal(await f.store.tasks.countDocuments(),0);
 await assert.rejects(f.service.draftAction('other',f.run._id,0,f.options),/completed meeting checklist/);
});

test('HTTP action handoff reports worker state, deduplicates, and withdraws a draft after source deletion',async()=>{
 const f=await fixture(),store=new SleepExecutionStore(f.db);await store.initialize();
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'meeting-http-'));
 try{
  const app=createApp({serveStatic:false,suggestions:f.service,sleepTasks:store,sleepTaskRoot:root,sleepTaskWorkerEnabled:false});
  const visitor=request.agent(app),other=request.agent(app);
  const meeting={id:'launch-review',title:'Launch review',startsAt:'2026-09-26T10:00:00Z',endsAt:'2026-09-26T11:00:00Z',status:'completed'};
  await visitor.post('/api/suggestions/import').send({events:[meetingEvent('notes',{meeting})]}).expect(200);
  const list=await visitor.get('/api/suggestions').expect(200);
  const accepted=await visitor.post(`/api/suggestions/${list.body.suggestions[0]._id}/decision`).send({decision:'accept'}).expect(200);
  const url=`/api/suggestions/runs/${accepted.body.run._id}/actions/0/draft`,body={deadline:Date.now()+600000,budget:20000,maxAttempts:1};
  const handoff=await visitor.post(url).send(body).expect(202);assert.equal(handoff.body.task.status,'queued');assert.equal(handoff.body.workerEnabled,false);
  const repeated=await visitor.post(url).send(body).expect(202);assert.equal(repeated.body.task.id,handoff.body.task.id);
  await other.post(url).send(body).expect(409);
  await visitor.post(url).send({...body,maxAttempts:4}).expect(400);
  const review=await sleepExecutionTick(store,draftExecutor,{root});assert.equal(review.status,'approval');
  await visitor.post(`/api/sleep/tasks/${review._id}/control`).send({action:'approve'}).expect(200);
  const completed=await sleepExecutionTick(store,draftExecutor,{root});assert.equal(completed.status,'completed');
  const artifactUrl=`/api/sleep/tasks/${review._id}/artifacts/action-draft.md`;
  await visitor.get(artifactUrl).expect(200);await other.get(artifactUrl).expect(404);
  await visitor.delete(`/api/suggestions/sources/${accepted.body.run.input.sourceIds[0]}`).expect(200);
  await visitor.get(artifactUrl).expect(409);
  assert.equal((await store.tasks.findOne({_id:review._id})).status,'cancelled');
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('draft bridge does not reinterpret denials or completed actions as new work',()=>{
 for(const text of ['Action: Do not draft the brief.','Action: Never write to Pat.','Action: Already drafted the launch note.','Action: Send the draft to Pat.'])assert.equal(actionDraftSupported(text),false,text);
 assert.equal(actionDraftSupported('Action: Ryan to draft the release brief.'),true);
});
