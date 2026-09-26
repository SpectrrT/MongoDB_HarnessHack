import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {MongoMemoryServer} from 'mongodb-memory-server';
import {MongoClient} from 'mongodb';
import request from 'supertest';
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
