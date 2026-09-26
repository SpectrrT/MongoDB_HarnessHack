import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import express from 'express';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import { createIdleReviews, IDLE_MS, DEFAULT_IDLE_LIMITS } from '../server/idle-reviews.js';
import { SleepExecutionStore } from '../server/sleep/execution-store.js';
import { createIdleExecution, IDLE_SCOPE } from '../server/sleep/idle-execution.js';
import { deriveIdleDraft } from '../server/suggestions/idle-candidates.js';
import { mountModel } from '../server/model.js';

const conversationId = 'a'.repeat(8) + '-aaaa-4aaa-8aaa-' + 'a'.repeat(12);
const payload = { conversationId, requestId: crypto.randomUUID(), provider:'codex',model:'fixture',effort:'low',
  messages:[{role:'user',text:'Build a local HTML counter prototype. Use the supplied idea only. Do not deploy it.'}],
  images:[{data:'never imported'}],notes:[{id:'private-note',source:'history',text:'never imported'}],folder:'/never-use-this-folder' };
const draftPlan = task => ({ summary:'A candidate draft, not a completed goal', files: task.input.checks.map(check => ({ path:check.path,
  content:check.contains.join('\n') + '\n' + 'Unverified proposed candidate. '.repeat(12) })) });

test('Opted-in idle Sleep performs bounded local work through the existing lifecycle', async t => {
  const mongo = await MongoMemoryServer.create(), client = new MongoClient(mongo.getUri()); await client.connect();
  const root = await fs.mkdtemp(path.join(os.tmpdir(),'idle-execution-')); const lifecycles = [];
  let serial = 0;
  async function fixture({ executor, derive=deriveIdleDraft, limits=DEFAULT_IDLE_LIMITS }={}) {
    const dataDir=path.join(root,String(++serial)),store=new SleepExecutionStore(client.db('idle'+serial),{clock:()=>time});
    let time=Date.now(),calls=0; await store.initialize();
    const run=executor|| (async ({task}) => { calls++; return {plan:draftPlan(task),usage:{input_tokens:100,output_tokens:100},provider:'fixture',model:'fixture'}; });
    const bridge=createIdleExecution({store,executor:run,root:path.join(dataDir,'artifacts'),derive,clock:()=>time,tickOptions:{heartbeatMs:5}});
    const options={dataDir,launch:bridge.launch,getJob:bridge.getJob,cancel:bridge.pause,isBusy:()=>false,now:()=>time,interval:0};
    const idle=createIdleReviews(options); lifecycles.push(idle);
    return { dataDir,store,bridge,idle,options,limits,get time(){return time;}, advance:ms=>{time+=ms;},get calls(){return calls;},
      arm:async()=>{await idle.set('owner',conversationId,true,limits);await idle.observe('owner',payload);},
      launch:async()=>{time+=IDLE_MS;await idle.tick();await bridge.settle();return idle.get('owner',conversationId);} };
  }
  try {
    await t.test('opt-in plus idle transition derives work and writes checked files, not just suggestions',async()=>{
      const f=await fixture();await f.idle.observe('owner',payload);f.advance(IDLE_MS);await f.idle.tick();assert.equal(f.calls,0);
      await f.arm();f.advance(IDLE_MS-1);await f.idle.tick();assert.equal(f.calls,0);
      f.advance(1);await f.idle.tick();await f.bridge.settle();
      const state=await f.idle.get('owner',conversationId);assert.equal(state.state,'done');assert.equal(f.calls,1);
      const job=await f.bridge.getJob('owner',state.jobId);assert.equal(job.result.agent.artifacts.length,2);
      assert.match(job.result.text,/not semantic correctness/);
      const artifact=await f.bridge.getArtifact('owner',state.jobId,'0');assert.ok(artifact.content.length>120);
      const task=await f.store.tasks.findOne({origin:'idle'});assert.equal(task.input.budget,10000);assert.equal(task.idle.scope,IDLE_SCOPE);
      assert.ok(task.idle.sourceMessageIds.length);assert.ok(task.idle.hypotheses.length);
      assert.ok(!task.input.brief.includes('never imported'));assert.ok(!task.input.brief.includes('/never-use-this-folder'));
    });
    await t.test('consent must explicitly grant bounded local drafting and old opt-ins do not escalate',async()=>{
      const f=await fixture();await assert.rejects(f.idle.set('owner',conversationId,true),/permission/);
      await assert.rejects(f.idle.set('owner',conversationId,true,{...DEFAULT_IDLE_LIMITS,budget:20001}),/limits/);
      const dir=path.join(f.dataDir,'idle-reviews');await fs.mkdir(dir,{recursive:true});
      await fs.writeFile(path.join(dir,'b'.repeat(64)+'.json'),JSON.stringify({owner:'owner',id:'legacy',enabled:true,state:'waiting',latest:payload,generation:0}));
      const restored=createIdleReviews(f.options);lifecycles.push(restored);assert.equal((await restored.get('owner','legacy')).enabled,false);
    });
    await t.test('typing pauses an active call, charges unknown usage once, and prevents artifacts',async()=>{
      let started;const entering=new Promise(resolve=>{started=resolve;});
      const f=await fixture({executor:async()=>{started();return new Promise(()=>{});}});await f.arm();
      f.advance(IDLE_MS);await f.idle.tick();await entering;await f.idle.touch('owner',conversationId);await f.bridge.settle();
      assert.equal((await f.idle.get('owner',conversationId)).state,'paused');
      const task=await f.store.tasks.findOne({origin:'idle'});assert.equal(task.status,'paused');assert.equal(task.artifacts.length,0);
      assert.equal(task.tokensReserved,0);assert.equal(task.usageUnknown,1);assert.ok(task.tokensUsed>0);
      f.advance(IDLE_MS*2);await f.idle.tick();assert.equal((await f.store.get('owner',task._id)).calls,1);
    });
    await t.test('disable during candidate derivation prevents later generation',async()=>{
      let release,entered;const starting=new Promise(resolve=>{entered=resolve;});
      const f=await fixture({derive:async args=>{entered();await new Promise(resolve=>{release=resolve;});return deriveIdleDraft(args);}});
      await f.arm();f.advance(IDLE_MS);const running=f.idle.tick();await starting;
      await f.idle.set('owner',conversationId,false);release();await running;await f.bridge.settle();
      assert.equal(f.calls,0);assert.equal(await f.store.tasks.countDocuments({origin:'idle'}),0);assert.equal((await f.idle.get('owner',conversationId)).state,'off');
    });
    await t.test('restart reconciles the persisted completed task without duplicate calls or artifacts',async()=>{
      const f=await fixture();await f.arm();const done=await f.launch();f.idle.close();
      const restored=createIdleReviews(f.options);lifecycles.push(restored);await restored.tick();
      assert.equal((await restored.get('owner',conversationId)).jobId,done.jobId);assert.equal(f.calls,1);
      assert.equal(await f.store.tasks.countDocuments({origin:'idle'}),1);
      await restored.observe('owner',{...payload,requestId:crypto.randomUUID()});f.advance(IDLE_MS);await restored.tick();await f.bridge.settle();
      assert.equal(f.calls,1);assert.equal((await restored.get('owner',conversationId)).state,'done');
    });
    await t.test('restart between proposal persistence and execution reuses proposal with no new model call',async()=>{
      const f=await fixture();await f.arm();const done=await f.launch();
      const task=await f.store.tasks.findOne({origin:'idle'});
      await f.store.tasks.updateOne({_id:task._id},{$set:{status:'queued',pending:draftPlan(task),artifacts:[],leaseUntil:new Date(0)}});
      const persisted=JSON.parse(await fs.readFile(path.join(f.dataDir,'idle-reviews',crypto.createHash('sha256').update('owner:'+conversationId).digest('hex')+'.json'),'utf8'));
      persisted.state='starting';await fs.writeFile(path.join(f.dataDir,'idle-reviews',crypto.createHash('sha256').update('owner:'+conversationId).digest('hex')+'.json'),JSON.stringify(persisted));
      f.idle.close();const restored=createIdleReviews(f.options);lifecycles.push(restored);await restored.tick();await f.bridge.settle();
      assert.equal(f.calls,1);assert.equal((await f.bridge.getJob('owner',done.jobId)).result.agent.artifacts.length,2);
    });
    await t.test('scoped idle ticks never claim another owner or assigned work',async()=>{
      const f=await fixture();const candidate=deriveIdleDraft({...payload,generation:0});
      const other=await f.store.enqueue('other','other',{title:candidate.title,brief:candidate.brief,deadline:f.time+IDLE_MS*2,budget:10000,checks:candidate.checks,writeFiles:[]});
      await f.arm();await f.launch();assert.equal((await f.store.get('other',other._id)).status,'queued');
      const assigned=await f.store.claim('assigned-worker');assert.equal(assigned._id,other._id);
      assert.equal(await f.store.claim('wrong-owner',{id:other._id,workspace:'owner'}),null);
    });
    await t.test('budget exhaustion produces incomplete without a model call',async()=>{
      const f=await fixture({limits:{...DEFAULT_IDLE_LIMITS,budget:1000}});await f.arm();await f.launch();
      const task=await f.store.tasks.findOne({origin:'idle'});assert.equal(task.status,'incomplete');assert.equal(task.reason,'budget');assert.equal(f.calls,0);
    });
    await t.test('deadline during generation aborts and preserves an explicit unfinished outcome',async()=>{
      let f;f=await fixture({limits:{...DEFAULT_IDLE_LIMITS,durationMs:1000},executor:async()=>{f.advance(1001);return new Promise(()=>{});}});
      await f.arm();await f.launch();const task=await f.store.tasks.findOne({origin:'idle'});
      assert.equal(task.status,'incomplete');assert.equal(task.reason,'deadline');assert.equal(task.artifacts.length,0);
    });
    await t.test('model routes expose owned idle jobs and downloads; new foreground request pauses Sleep',async()=>{
      const f=await fixture(),app=express();app.use(express.json());app.use((req,_res,next)=>{req.workspaceKey=req.get('x-owner')||'owner';next();});
      const mounted=mountModel(app,{dataDir:f.dataDir,idleExecution:f.bridge,idleOptions:{now:()=>f.time,interval:0},enabled:true,status:async()=>({connected:false,message:'Test account off',models:[]})});lifecycles.push(mounted.idle);
      const api=(method,url)=>request(app)[method](url).set('host','localhost:5194').set('X-Offload-Client','local');
      const context={provider:'codex',model:'fixture',effort:'low',messages:payload.messages,notes:[]};
      await api('post','/api/model/sleep/'+conversationId).send({enabled:true,context}).expect(400);
      await api('post','/api/model/sleep/'+conversationId).send({enabled:true,consent:DEFAULT_IDLE_LIMITS,context}).expect(200);
      f.advance(IDLE_MS);await mounted.idle.tick();await f.bridge.settle();const state=await mounted.idle.get('owner',conversationId);
      const job=await api('get','/api/model/jobs/'+state.jobId).expect(200);assert.equal(job.body.result.agent.artifacts.length,2);
      await api('get','/api/model/jobs/'+state.jobId).set('x-owner','other').expect(404);
      await api('get','/api/model/jobs/'+state.jobId+'/artifacts/0').expect(200);
      await api('get','/api/model/jobs/'+state.jobId+'/artifacts/0').set('x-owner','other').expect(404);
      await api('post','/api/model/sleep/'+conversationId).send({enabled:false}).expect(200);
      assert.equal((await mounted.idle.get('owner',conversationId)).enabled,false);
    });
  } finally { for(const idle of lifecycles)idle.close();await client.close();await mongo.stop();await fs.rm(root,{recursive:true,force:true}); }
});
