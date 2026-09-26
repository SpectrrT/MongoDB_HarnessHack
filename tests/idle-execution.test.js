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
import { sleepOpenRouterExecutor } from '../server/sleep/execution-provider.js';

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
  async function fixture({ executor, derive=deriveIdleDraft, limits=DEFAULT_IDLE_LIMITS, tickOptions={} }={}) {
    const dataDir=path.join(root,String(++serial)),store=new SleepExecutionStore(client.db('idle'+serial),{clock:()=>time});
    let time=Date.now(),calls=0; await store.initialize();
    const run=executor|| (async ({task}) => { calls++; return {plan:draftPlan(task),usage:{input_tokens:100,output_tokens:100},provider:'fixture',model:'fixture'}; });
    const bridge=createIdleExecution({store,executor:run,root:path.join(dataDir,'artifacts'),derive,clock:()=>time,tickOptions:{heartbeatMs:5,...tickOptions}});
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
    await t.test('older constraints survive rolling chat snapshots without importing saved notes',async()=>{
      let source;
      const f=await fixture({derive:args=>{source=args;return null;}});
      await f.idle.set('owner',conversationId,true,DEFAULT_IDLE_LIMITS);
      const first={role:'user',text:'Never modify my existing project or publish any prototype.'};
      const messages=[first,...Array.from({length:19},(_,i)=>({role:i%2?'assistant':'user',text:'Clarification '+i}))];
      await f.idle.observe('owner',{...payload,messages});
      await f.idle.observe('owner',{...payload,messages:[...messages.slice(-16),{role:'user',text:'Build a draft counter prototype.'}]});
      await f.launch();assert.equal(source.messages[0].text,first.text);assert.equal(source.messages.length,21);
    });
    await t.test('counter verification requires additional scoped consent and failed behavior repairs with measured evidence',async()=>{
      const derive=args=>({...deriveIdleDraft(args),browserCheck:'counter'});
      let tested=0;
      const noGrant=await fixture({derive,tickOptions:{verifyPrototype:async()=>{throw Error('Must not run without consent');}}});
      await noGrant.arm();await noGrant.launch();assert.equal((await noGrant.store.tasks.findOne({origin:'idle'})).input.browserCheck,undefined);
      const f=await fixture({derive,limits:{...DEFAULT_IDLE_LIMITS,offlinePrototypeChecks:true},tickOptions:{verifyPrototype:async options=>{
        assert.equal(options.kind,'counter');assert.equal(options.requireReset,true);assert.ok(options.html.startsWith('<!doctype html>'));
        tested++;return {passed:tested>1,checks:[{id:'increment',passed:tested>1}],observed:(tested>1?['0','1','2','0']:['0','0']).map(actual=>({actual})),isolation:{offline:true},cleanup:{closed:true},elapsedMs:1};
      }}});
      await f.arm();await f.launch();const task=await f.store.tasks.findOne({origin:'idle'});
      assert.equal(task.input.browserCheck,'counter');assert.equal(task.status,'completed');assert.equal(task.calls,2);assert.equal(tested,2);
      assert.deepEqual(task.checkResults.at(-1).verification.observed.map(state=>state.actual),['0','1','2','0']);
      assert.equal(task.checkResults.at(-1).passed,true);assert.equal(task.repairs,1);
    });
    await t.test('real offline browser failure is supplied to the repair and verified again',async()=>{
      const derive=args=>({...deriveIdleDraft(args),browserCheck:'counter'});
      const counter=working=>'<!doctype html><html><head><title>Counter</title></head><body><output data-testid="counter-value">0</output><button id="inc">Increment</button><button id="reset">Reset</button><script>const value=document.querySelector("output");document.querySelector("#inc").onclick=()=>value.textContent=Number(value.textContent)+'+(working?'1':'0')+';document.querySelector("#reset").onclick=()=>value.textContent="0";</script></body></html>';
      let calls=0;
      const f=await fixture({derive,limits:{...DEFAULT_IDLE_LIMITS,offlinePrototypeChecks:true},executor:async({task,prompt})=>{
        calls++;
        if(calls===2){
          const failed=JSON.parse(prompt).priorFailedChecks.find(check=>check.id==='browser:counter');
          assert.equal(failed.passed,false);assert.ok(failed.verification.observed.some(state=>state.expected==='1'&&state.actual==='0'));
          assert.equal(failed.verification.cleanup.processExited,true);
        }
        return {plan:{summary:'Counter repair fixture',files:task.input.checks.map(check=>({path:check.path,content:check.path==='prototype.html'?counter(calls>1):draftPlan(task).files.find(file=>file.path===check.path).content}))},
          usage:{input_tokens:100,output_tokens:100},provider:'scripted',model:'counter-repair-fixture'};
      }});
      await f.arm();const state=await f.launch();const task=await f.store.tasks.findOne({origin:'idle'});
      assert.equal(task.status,'completed');assert.equal(calls,2);assert.equal(task.repairs,1);assert.equal(task.tokensUsed,400);
      const verification=task.checkResults.find(check=>check.id==='browser:counter').verification;
      assert.deepEqual(verification.observed.map(state=>state.actual),['0','1','2','0']);assert.equal(verification.cleanup.processGroupExited,true);
      assert.match((await f.bridge.getJob('owner',state.jobId)).result.text,/"observedStates":\["0","1","2","0"\]/);
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
    await t.test('less than the minimum browser timeout ends incomplete without retrying generation',async()=>{
      let f,calls=0;
      const executor=async({task})=>{calls++;f.advance(950);return {plan:draftPlan(task),usage:{input_tokens:100,output_tokens:100}};};executor.retrySafe=true;
      f=await fixture({derive:args=>({...deriveIdleDraft(args),browserCheck:'counter'}),limits:{...DEFAULT_IDLE_LIMITS,durationMs:1000,offlinePrototypeChecks:true},
        executor,tickOptions:{verifyPrototype:async()=>{throw Error('Must not invoke a verifier with an invalid time allowance');}}});
      await f.arm();await f.launch();const task=await f.store.tasks.findOne({origin:'idle'});
      assert.equal(task.status,'incomplete');assert.equal(task.reason,'deadline');assert.equal(calls,1);
      assert.match(task.error,/Insufficient time/);
    });
    await t.test('resending the paused goal resumes the same task under a new bounded idle window',async()=>{
      let calls=0,entered;const entering=new Promise(resolve=>{entered=resolve;});
      const f=await fixture({executor:async({task})=>{if(++calls===1){entered();return new Promise(()=>{});}return {plan:draftPlan(task),usage:{input_tokens:100,output_tokens:100},provider:'fixture',model:'fixture'};}});
      await f.arm();f.advance(IDLE_MS);await f.idle.tick();await entering;
      const first=await f.idle.get('owner',conversationId);await f.idle.touch('owner',conversationId);await f.bridge.settle();
      const paused=await f.store.tasks.findOne({origin:'idle'});assert.equal(paused.status,'paused');
      await f.idle.observe('owner',{...payload,requestId:crypto.randomUUID()});await f.launch();
      const finished=await f.store.tasks.findOne({origin:'idle'}),current=await f.idle.get('owner',conversationId);
      assert.equal(finished._id,paused._id);assert.equal(await f.store.tasks.countDocuments({origin:'idle'}),1);
      assert.equal(finished.status,'completed');assert.equal(finished.calls,2);assert.equal(calls,2);
      assert.notEqual(current.jobId,first.jobId);assert.equal((await f.bridge.getJob('owner',current.jobId)).status,'completed');
      assert.equal(finished.idle.windows.length,2);assert.equal(finished.input.budget,paused.tokensUsed+DEFAULT_IDLE_LIMITS.budget);
      assert.ok(finished.input.deadline>paused.input.deadline);assert.equal(finished.artifacts.length,2);
    });
    await t.test('compound stop survives rearming and restart, then explicit continue resumes the original goal',async()=>{
      let calls=0,entered;const entering=new Promise(resolve=>{entered=resolve;});
      const f=await fixture({executor:async({task})=>{if(++calls===1){entered();return new Promise(()=>{});}return {plan:draftPlan(task),usage:{input_tokens:100,output_tokens:100}};}});
      await f.arm();f.advance(IDLE_MS);await f.idle.tick();await entering;
      await f.idle.touch('owner',conversationId);await f.bridge.settle();
      const paused=await f.store.tasks.findOne({origin:'idle'});
      const stopped={...payload,requestId:crypto.randomUUID(),messages:[...payload.messages,{role:'user',text:"Let's stop here and then evaluate what everyone has been doing. What needs to be done and progress."}]};
      await f.idle.observe('owner',stopped);await f.launch();assert.equal(calls,1);
      f.idle.close();const restored=createIdleReviews(f.options);lifecycles.push(restored);
      f.advance(IDLE_MS);await restored.tick();await f.bridge.settle();assert.equal(calls,1);
      assert.equal((await f.store.get('owner',paused._id)).status,'paused');assert.equal(await f.store.tasks.countDocuments({origin:'idle'}),1);
      await restored.observe('owner',{...stopped,requestId:crypto.randomUUID(),messages:[...stopped.messages,{role:'user',text:'Continue the counter prototype.'}]});
      f.advance(IDLE_MS);await restored.tick();await f.bridge.settle();
      const resumed=await f.store.tasks.findOne({origin:'idle'});
      assert.equal(calls,2);assert.equal(resumed._id,paused._id);assert.equal(resumed.status,'completed');
      assert.equal(resumed.idle.goalKey,paused.idle.goalKey);assert.ok(resumed.idle.provenance.some(item=>item.excerpt===payload.messages[0].text));
      assert.equal(await f.store.tasks.countDocuments({origin:'idle'}),1);
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
    await t.test('a missing provider key pauses recovered work without a new call',async()=>{
      let configured=true,calls=0;
      const executor=async({task})=>{calls++;return {plan:draftPlan(task),usage:{input_tokens:100,output_tokens:100}};};
      executor.configuration=async()=>({configured,provider:'openrouter',model:'fixture'});
      const f=await fixture({executor});await f.arm();const done=await f.launch();
      const task=await f.store.tasks.findOne({origin:'idle'});await f.store.tasks.updateOne({_id:task._id},{$set:{status:'queued',leaseUntil:new Date(0)}});
      configured=false;
      await assert.rejects(f.bridge.launch('owner',{scope:IDLE_SCOPE,requestId:done.jobId}),/connection is unavailable/);
      await f.bridge.settle();assert.equal(calls,1);assert.equal((await f.store.get('owner',task._id)).status,'paused');
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
    await t.test('model routes expose owned idle jobs and downloads',async()=>{
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
    await t.test('run-now endpoint requires local consent, complete foreground output and preserves draft bounds',async()=>{
      const f=await fixture(),app=express();let finish,entered;
      const starting=new Promise(resolve=>{entered=resolve;});
      app.use(express.json());app.use((req,_res,next)=>{req.workspaceKey=req.get('x-owner')||'owner';next();});
      const mounted=mountModel(app,{dataDir:f.dataDir,idleExecution:f.bridge,idleOptions:{now:()=>f.time,interval:0},enabled:true,
        status:async()=>({connected:true,models:[{id:'fixture',efforts:['low']}]}),
        run:async({onEvent})=>{onEvent({type:'messageStart',id:'partial',phase:'final_answer'});onEvent({type:'delta',id:'partial',text:'Partial reply'});entered();await new Promise(resolve=>{finish=resolve;});return{text:'Foreground result: counter starts at zero.'};}});
      lifecycles.push(mounted.idle);
      const api=(method,url)=>request(app)[method](url).set('host','localhost:5194').set('X-Offload-Client','local');
      const endpoint='/api/model/sleep/'+conversationId+'/run-now';
      await api('post',endpoint).send({}).expect(409);
      await request(app).post(endpoint).set('host','localhost:5194').send({}).expect(403);
      const requestId=crypto.randomUUID();
      await api('post','/api/model/jobs').send({requestId,conversationId,provider:'codex',model:'fixture',effort:'low',messages:payload.messages,notes:[]}).expect(202);
      await starting;
      // Opting in while the foreground reply streams must still retain the final result.
      await api('post','/api/model/sleep/'+conversationId).send({enabled:true,consent:DEFAULT_IDLE_LIMITS,
        context:{provider:'codex',model:'fixture',effort:'low',messages:payload.messages,notes:[]}}).expect(200);
      await api('post',endpoint).send({}).expect(409);assert.equal(f.calls,0);
      finish();for(let n=0;n<100;n++){const job=await api('get','/api/model/jobs/'+requestId);if(job.body.status==='completed')break;await new Promise(resolve=>setTimeout(resolve,5));}
      await api('post',endpoint).send({budget:999999}).expect(400);
      await api('post',endpoint).set('x-owner','other').send({}).expect(409);
      await api('post',endpoint).send({}).expect(202);await f.bridge.settle();
      await api('post',endpoint).send({}).expect(202);assert.equal(f.calls,1);
      const task=await f.store.tasks.findOne({origin:'idle'});assert.match(task.input.brief,/Foreground result: counter starts at zero/);
      assert.doesNotMatch(task.input.brief,/Partial reply/);assert.equal(task.input.budget,10000);assert.equal(task.status,'completed');
    });
    await t.test('Codex chat connectivity cannot enable Sleep without its own configured provider',async()=>{
      const f=await fixture(),app=express();app.use(express.json());app.use((req,_res,next)=>{req.workspaceKey='owner';next();});
      const bridge=createIdleExecution({store:f.store,executor:sleepOpenRouterExecutor({dataDir:f.dataDir,apiKey:'',model:'chosen-sleep-model'}),root:path.join(f.dataDir,'artifacts'),derive:deriveIdleDraft});
      const mounted=mountModel(app,{dataDir:f.dataDir,idleExecution:bridge,idleOptions:{interval:0},enabled:true,status:async()=>({connected:true,models:[{id:'codex-model',efforts:['low']}]})});lifecycles.push(mounted.idle);
      const api=(method,url)=>request(app)[method](url).set('host','localhost:5194').set('X-Offload-Client','local');
      const view=await api('get','/api/model/sleep/'+conversationId).expect(200);
      assert.deepEqual(view.body.execution,{configured:false,provider:'openrouter',model:'chosen-sleep-model'});
      const denied=await api('post','/api/model/sleep/'+conversationId).send({enabled:true,consent:DEFAULT_IDLE_LIMITS}).expect(503);
      assert.match(denied.body.error,/does not use the selected Codex/);assert.equal((await mounted.idle.get('owner',conversationId)).enabled,false);
    });
    await t.test('failed foreground stop persists through restart and a stale UI assessment snapshot',async()=>{
      let calls=0,entered;const entering=new Promise(resolve=>{entered=resolve;});
      const f=await fixture({executor:async()=>{calls++;entered();return new Promise(()=>{});}}),app=express();
      app.use(express.json());app.use((req,_res,next)=>{req.workspaceKey='owner';next();});
      const mounted=mountModel(app,{dataDir:f.dataDir,idleExecution:f.bridge,idleOptions:{now:()=>f.time,interval:0},enabled:true,status:async()=>({connected:false,message:'Provider unavailable',models:[]})});lifecycles.push(mounted.idle);
      await mounted.idle.set('owner',conversationId,true,DEFAULT_IDLE_LIMITS);await mounted.idle.observe('owner',payload);
      f.advance(IDLE_MS);await mounted.idle.tick();await entering;
      const stop="Let's stop here and then evaluate what everyone has been doing. What needs to be done and progress.";
      await request(app).post('/api/model/jobs').set('host','localhost:5194').set('X-Offload-Client','local')
        .send({requestId:crypto.randomUUID(),conversationId,provider:'codex',model:'fixture',messages:[...payload.messages,{role:'user',text:stop}],notes:[]}).expect(409);
      await f.bridge.settle();mounted.idle.close();
      const restored=createIdleReviews(f.options);lifecycles.push(restored);
      // The failed send was not appended by the client. Its old goal is context, not new authorization.
      await restored.observe('owner',{...payload,requestId:crypto.randomUUID(),messages:[...payload.messages,{role:'user',text:'What is the current progress?'}]});
      f.advance(IDLE_MS);await restored.tick();await f.bridge.settle();
      assert.equal(calls,1);assert.equal(await f.store.tasks.countDocuments({origin:'idle'}),1);
      assert.equal((await f.store.tasks.findOne({origin:'idle'})).status,'paused');
      const filename=crypto.createHash('sha256').update('owner:'+conversationId).digest('hex')+'.json';
      const persisted=JSON.parse(await fs.readFile(path.join(f.dataDir,'idle-reviews',filename),'utf8'));
      assert.deepEqual(persisted.latest.messages.map(message=>message.text),[payload.messages[0].text,stop,'What is the current progress?']);
    });
    await t.test('revoking Sleep ignores invalid context and consent even if provider configuration fails',async()=>{
      const f=await fixture(),app=express();app.use(express.json());app.use((req,_res,next)=>{req.workspaceKey='owner';next();});
      const bridge={...f.bridge,configuration:async()=>{throw Error('Provider config unavailable');}};
      const mounted=mountModel(app,{dataDir:f.dataDir,idleExecution:bridge,idleOptions:{interval:0},enabled:true,status:async()=>({connected:false,models:[]})});lifecycles.push(mounted.idle);
      await mounted.idle.set('owner',conversationId,true,DEFAULT_IDLE_LIMITS);
      const response=await request(app).post('/api/model/sleep/'+conversationId).set('host','localhost:5194').set('X-Offload-Client','local')
        .send({enabled:false,consent:{scope:'invalid'},context:{messages:Array.from({length:201},()=>({role:'invalid',text:42}))}}).expect(200);
      assert.equal(response.body.enabled,false);assert.equal((await mounted.idle.get('owner',conversationId)).state,'off');
    });
    await t.test('a submitted foreground message fences active Sleep before trying the user model',async()=>{
      let entered;const entering=new Promise(resolve=>{entered=resolve;});
      const f=await fixture({executor:async()=>{entered();return new Promise(()=>{});}}),app=express();
      app.use(express.json());app.use((req,_res,next)=>{req.workspaceKey='owner';next();});
      const mounted=mountModel(app,{dataDir:f.dataDir,idleExecution:f.bridge,idleOptions:{now:()=>f.time,interval:0},enabled:true,status:async()=>({connected:false,message:'Test account off',models:[]})});lifecycles.push(mounted.idle);
      await mounted.idle.set('owner',conversationId,true,DEFAULT_IDLE_LIMITS);await mounted.idle.observe('owner',payload);
      f.advance(IDLE_MS);await mounted.idle.tick();await entering;
      await request(app).post('/api/model/jobs').set('host','localhost:5194').set('X-Offload-Client','local')
        .send({requestId:crypto.randomUUID(),conversationId,provider:'codex',model:'fixture',messages:[{role:'user',text:'I am back.'}],notes:[]}).expect(409);
      await f.bridge.settle();assert.equal((await mounted.idle.get('owner',conversationId)).state,'waiting');
      assert.equal((await f.store.tasks.findOne({origin:'idle'})).status,'paused');
    });
  } finally { for(const idle of lifecycles)idle.close();await client.close();await mongo.stop();await fs.rm(root,{recursive:true,force:true}); }
});
