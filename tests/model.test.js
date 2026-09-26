import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import {mountModel} from '../server/model.js';
import {retrieveNotes,modelPrompt} from '../shared/retrieval.js';
import {createWorkspace,transition} from '../shared/workspace.js';
const payload={requestId:'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',model:'working-model',messages:[{role:'user',text:'Who are you?'}],notes:[]};
function appWith(run,dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'offload-model-test-')),options={}){const app=express();app.use(express.json());app.use((req,res,next)=>{req.workspaceKey=req.get('X-Test-Owner')||'one';next();});mountModel(app,{dataDir,enabled:true,run,status:async()=>({connected:true,models:[{id:'working-model',efforts:['low','high']}]}),...options});return app;}
const post=(app,path,body,owner='one')=>request(app).post(path).set('Host','127.0.0.1:5194').set('X-Offload-Client','local').set('X-Test-Owner',owner).send(body);
test('model requests require local host, valid origin and explicit client header',async()=>{
 const app=appWith(async()=>({text:'ok'}));
 await request(app).post('/api/model/jobs').set('Host','attacker.test:5194').set('X-Offload-Client','local').send(payload).expect(403);
 await request(app).post('/api/model/jobs').set('Host','127.0.0.1:5194').send(payload).expect(403);
 await post(app,'/api/model/jobs',payload).set('Origin','https://evil.example').expect(403);
 await post(app,'/api/model/jobs',{...payload,model:'not-listed'}).expect(400);
});
test('jobs deduplicate, isolate owners and stop the active model',{timeout:5000},async()=>{
 let started=0,aborted=false,notifyStarted;
 const didStart=new Promise(resolve=>{notifyStarted=resolve;});
 const app=appWith(({signal})=>new Promise((resolve,reject)=>{started++;notifyStarted();signal.addEventListener('abort',()=>{aborted=true;reject(Error('Stopped'));});}));
 const a=await post(app,'/api/model/jobs',payload).expect(202);
 await post(app,'/api/model/jobs',payload).expect(200);
 await didStart;assert.equal(started,1);
 await post(app,'/api/model/jobs/'+a.body.id+'/stop',{},'other').expect(404);
 await post(app,'/api/model/jobs/'+a.body.id+'/stop',{}).expect(200);
 assert.equal(aborted,true);
});
test('retrieval is bounded and excludes seeded facts',()=>{
 const memory=Array.from({length:20},(_,i)=>({id:String(i),source:'Work notes',kind:'note',text:'release '.repeat(200)}));
 memory.unshift({id:'seed',example:true,source:'Example project',text:'release'});
 const notes=retrieveNotes('release',memory);
 assert.equal(notes.length,4);assert.ok(notes.every(n=>n.id!=='seed'&&n.text.length<=360));
 assert.equal(retrieveNotes('unrelated',memory).length,0);
 assert.match(modelPrompt([{role:'user',text:'Who are you?'}],notes),/You are Offload/);
});
test('a late or repeated model result cannot duplicate or overwrite a reply',()=>{
 let s=createWorkspace(0);
 s=transition(s,{type:'chat-start',payload:{id:'conversation',jobId:'job',model:'working-model',text:'Who are you?',notes:[]}},1);
 s=transition(s,{type:'chat-finish',payload:{id:'conversation',jobId:'job',text:'I am Offload.'}},2);
 s=transition(s,{type:'chat-finish',payload:{id:'conversation',jobId:'job',text:'Duplicate'}},3);
 assert.equal(s.conversations[0].messages.length,2);assert.equal(s.conversations[0].pending,null);
});

test('local HTTPS and teammate ports work without allowing public origins',async()=>{
 const app=appWith(async()=>({text:'ok'}));
 await request(app).get('/api/model/status').set('Host','offload.ai').set('Origin','https://offload.ai').set('X-Offload-Client','local').expect(200);
 await request(app).get('/api/model/status').set('Host','127.0.0.1:6200').set('Origin','http://127.0.0.1:6200').set('X-Offload-Client','local').expect(200);
 await request(app).get('/api/model/status').set('Host','offload.ai').set('Origin','http://offload.ai').set('X-Offload-Client','local').expect(403);
 await request(app).get('/api/model/status').set('Host','offload.ai.evil.example').set('X-Offload-Client','local').expect(403);
 const production=express();mountModel(production,{enabled:false});
 await request(production).get('/api/model/status').set('Host','offload.ai').set('X-Offload-Client','local').expect(403);
});
const get=(app,id)=>request(app).get('/api/model/jobs/'+id).set('Host','127.0.0.1:5194').set('X-Offload-Client','local');
async function untilJob(app,id,predicate){for(let i=0;i<100;i++){const r=await get(app,id);if(predicate(r.body))return r.body;await new Promise(r=>setTimeout(r,10));}throw Error('Job did not reach expected state');}
test('commentary is separate while running and survives saved job reload',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'offload-commentary-'));let finish;
 const gate=new Promise(resolve=>{finish=resolve;});
 const run=async({onEvent})=>{
  onEvent({type:'messageStart',id:'progress',phase:'commentary'});
  onEvent({type:'delta',id:'progress',text:'Checking the baseline.'});
  onEvent({type:'message',id:'progress',phase:'commentary',text:'Checking the baseline.'});
  onEvent({type:'commandExecution',id:'tool',label:'node scripts/query-demo.mjs --baseline',status:'completed'});
  onEvent({type:'messageStart',id:'final',phase:'final_answer'});
  onEvent({type:'delta',id:'final',text:'Measured '});
  await gate;onEvent({type:'message',id:'final',phase:'final_answer',text:'Measured the query.'});
  return {text:'Measured the query.'};
 };
 try{
  const app=appWith(run,dir);await post(app,'/api/model/jobs',payload).expect(202);
  const partial=await untilJob(app,payload.requestId,j=>j.stream==='Measured ');
  assert.deepEqual(partial.commentary,[{id:'progress',text:'Checking the baseline.'}]);
  assert.equal(partial.events.length,1);finish();
  const done=await untilJob(app,payload.requestId,j=>j.status==='completed');
  assert.equal(done.stream,'');assert.deepEqual(done.result.agent.commentary,partial.commentary);
  const restarted=appWith(async()=>{throw Error('Must not rerun');},dir);
  const saved=await untilJob(restarted,payload.requestId,j=>j.status==='completed');
  assert.deepEqual(saved.commentary,partial.commentary);assert.deepEqual(saved.result.agent.commentary,partial.commentary);
 }finally{finish();fs.rmSync(dir,{recursive:true,force:true});}
});
test('approvals are owner-bound, single-use and invalid after stopping',async()=>{
 const app=appWith(async({onRequest})=>{const answer=await onRequest({method:'item/commandExecution/requestApproval',params:{command:'echo approved'}});return {text:answer.action,usage:{}};});
 await post(app,'/api/model/jobs',payload).expect(202);
 const job=await untilJob(app,payload.requestId,j=>j.approvals?.length);
 const approval='/api/model/jobs/'+job.id+'/approvals/'+job.approvals[0].id;
 await post(app,approval,{action:'approve'},'different-owner').expect(409);
 await post(app,approval,{action:'deny'}).expect(200);
 await post(app,approval,{action:'approve'}).expect(409);
 const ended=await untilJob(app,job.id,j=>j.status==='completed');assert.equal(ended.result.text,'deny');
 const next={...payload,requestId:'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb'};
 await post(app,'/api/model/jobs',next).expect(202);
 const pending=await untilJob(app,next.requestId,j=>j.approvals?.length);
 await post(app,`/api/model/jobs/${pending.id}/stop`,{}).expect(200);
 await post(app,`/api/model/jobs/${pending.id}/approvals/${pending.approvals[0].id}`,{action:'approve'}).expect(409);
});
test('retrying a saved request after restart never executes it twice',async()=>{
 const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'offload-durable-test-'));let runs=0;
 const run=async()=>{runs++;return {text:'One execution',usage:{}}};const first=appWith(run,dataDir);
 await post(first,'/api/model/jobs',payload).expect(202);await untilJob(first,payload.requestId,j=>j.status==='completed');
 await new Promise(r=>setTimeout(r,30));const restarted=appWith(run,dataDir);
 const response=await post(restarted,'/api/model/jobs',payload).expect(200);assert.equal(response.body.status,'completed');assert.equal(runs,1);
});
test('artifact downloads work from private storage and reject another owner',async()=>{
 const app=appWith(async({cwd})=>{fs.writeFileSync(path.join(cwd,'download-check.txt'),'verified');return {text:'Done',usage:{}};},fs.mkdtempSync(path.join(os.tmpdir(),'.offload-download-')));
 const id='bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
 await post(app,'/api/model/jobs',{...payload,requestId:id}).expect(202);
 const job=await untilJob(app,id,j=>j.status==='completed');
 const artifact=job.result.agent.artifacts[0];assert.ok(artifact);
 const route='/api/model/jobs/'+id+'/artifacts/'+artifact.id;
 const response=await request(app).get(route).set('Host','127.0.0.1:5194').set('X-Offload-Client','local').expect(200);
 assert.equal(response.body.toString(),'verified');
 await request(app).get(route).set('Host','127.0.0.1:5194').set('X-Offload-Client','local').set('X-Test-Owner','other').expect(404);
});

test('persisted native reports and artifacts load without an unrelated idle database lookup',async t=>{
 const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'offload-local-artifact-'));t.after(()=>fs.rmSync(dataDir,{recursive:true,force:true}));
 const id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',artifactId='ffffffff-ffff-4fff-8fff-ffffffffffff';
 const folder=path.join(dataDir,'agent-jobs','one',id),cwd=path.join(dataDir,'work');
 fs.mkdirSync(path.join(folder,'files'),{recursive:true});fs.mkdirSync(cwd);
 fs.writeFileSync(path.join(folder,'files',artifactId),'snapshot report');fs.writeFileSync(path.join(cwd,'report.json'),'{"verified":true}');
 const saved={id,status:'completed',createdAt:Date.now()-1000,cwd,result:{text:'Ready',agent:{artifacts:[{id:artifactId,name:'report.txt'}]}}};
 fs.writeFileSync(path.join(folder,'job.json'),JSON.stringify(saved));
 let idleCalls=0;const unavailable=async()=>{idleCalls++;throw Error('Atlas unavailable');};
 const app=appWith(async()=>{throw Error('Must not rerun');},dataDir,{idleExecution:{getJob:unavailable,getArtifact:unavailable}});
 assert.equal((await get(app,id).expect(200)).body.status,'completed');
 const download=url=>request(app).get(url).set('Host','127.0.0.1:5194').set('X-Offload-Client','local');
 assert.equal((await download(`/api/model/jobs/${id}/artifacts/${artifactId}`).expect(200)).body.toString(),'snapshot report');
 assert.equal((await download(`/api/model/jobs/${id}/download?path=report.json`).expect(200)).body.toString(),'{"verified":true}');
 fs.writeFileSync(path.join(folder,'job.json'),JSON.stringify({...saved,status:'running'}));
 const interrupted=(await get(app,id).expect(200)).body;assert.equal(interrupted.status,'failed');assert.match(interrupted.error,/restarted/);
 fs.writeFileSync(path.join(folder,'job.json'),'invalid JSON');await get(app,id).expect(404);
 assert.equal(idleCalls,0);
});

test('missing native jobs still use owner-scoped idle job and artifact fallback',async t=>{
 const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'offload-idle-fallback-'));t.after(()=>fs.rmSync(dataDir,{recursive:true,force:true}));
 const calls=[],id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
 const app=appWith(async()=>({text:'unused'}),dataDir,{idleExecution:{getJob:async(owner,jobId)=>{calls.push(['job',owner,jobId]);return {id:jobId,status:'completed',result:{text:'Sleep draft'}};},getArtifact:async(owner,jobId,artifactId)=>{calls.push(['artifact',owner,jobId,artifactId]);return {name:'draft.txt',content:'Sleep draft'};}}});
 assert.equal((await get(app,id).expect(200)).body.result.text,'Sleep draft');
 const response=await request(app).get(`/api/model/jobs/${id}/artifacts/draft`).set('Host','127.0.0.1:5194').set('X-Offload-Client','local').set('X-Test-Owner','two').expect(200);
 assert.equal(response.text,'Sleep draft');assert.deepEqual(calls,[['job','one',id],['artifact','two',id,'draft']]);
});

test('generated report downloads require completed owner jobs and confined generated paths',async()=>{
 let finish;const gate=new Promise(resolve=>{finish=resolve;});
 const app=appWith(async({cwd})=>{
  fs.mkdirSync(path.join(cwd,'.data/query-demo'),{recursive:true});
  fs.writeFileSync(path.join(cwd,'.data/query-demo/report.csv'),'stage,documents\nIXSCAN,12\n');
  await gate;return {text:'Report ready'};
 });
 const id='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
 const download=(relativePath,owner='one')=>request(app).get('/api/model/jobs/'+id+'/download').query({path:relativePath}).set('Host','127.0.0.1:5194').set('X-Offload-Client','local').set('X-Test-Owner',owner);
 try{
  await post(app,'/api/model/jobs',{...payload,requestId:id}).expect(202);
  await untilJob(app,id,j=>!!j.cwd);
  await download('.data/query-demo/report.csv').expect(404);
  finish();await untilJob(app,id,j=>j.status==='completed');
  const response=await download('.data/query-demo/report.csv').expect(200);
  assert.equal(response.body.toString(),'stage,documents\nIXSCAN,12\n');
  assert.match(response.headers['content-disposition'],/attachment.*report\.csv/);
  assert.equal(response.headers['cache-control'],'no-store');assert.equal(response.headers['x-content-type-options'],'nosniff');
  await download('.data/query-demo/report.csv','other').expect(404);
  await download('../report.csv').expect(404);
  await download('/etc/passwd').expect(404);
  await download('.data/query-demo/missing.csv').expect(404);
 }finally{finish();}
});

test('cancelled jobs retain provider usage returned after the cancellation',async()=>{
 let started;
 const ready=new Promise(resolve=>{started=resolve;});
 const app=appWith(({signal})=>new Promise((resolve,reject)=>{
   started();signal.addEventListener('abort',()=>reject(Object.assign(Error('Stopped'),{usage:{input_tokens:100,output_tokens:5,usageKnown:false}})),{once:true});
 }));
 await post(app,'/api/model/jobs',payload).expect(202);await ready;
 await post(app,`/api/model/jobs/${payload.requestId}/stop`,{}).expect(200);
 const job=await untilJob(app,payload.requestId,j=>j.usage?.input_tokens===100);
 assert.equal(job.status,'cancelled');assert.equal(job.usage.output_tokens,5);assert.equal(job.usage.usageKnown,false);
});

test('different conversations run together; duplicate starts and stop remain isolated',async()=>{
 const runs=new Map();
 const app=appWith(({signal,cwd})=>new Promise((resolve,reject)=>{runs.set(cwd,{signal,resolve});signal.addEventListener('abort',()=>reject(Error('Stopped')));}));
 const first={...payload,conversationId:'11111111-1111-4111-8111-111111111111'};
 const second={...payload,requestId:'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',conversationId:'22222222-2222-4222-8222-222222222222'};
 const [a,b]=await Promise.all([post(app,'/api/model/jobs',first),post(app,'/api/model/jobs',second)]);
 assert.equal(a.status,202);assert.equal(b.status,202);
 await untilJob(app,a.body.id,j=>!!j.cwd&&runs.has(j.cwd));await untilJob(app,b.body.id,j=>!!j.cwd&&runs.has(j.cwd));
 await post(app,'/api/model/jobs',{...first,requestId:'cccccccc-cccc-4ccc-8ccc-cccccccccccc'}).expect(409);
 await post(app,'/api/model/jobs',first).expect(200);
 assert.equal(runs.size,2);
 await post(app,'/api/model/jobs/'+a.body.id+'/stop',{}).expect(200);
 assert.equal((await get(app,b.body.id)).body.status,'running');
 const active=[...runs.values()].filter(r=>!r.signal.aborted);assert.equal(active.length,1);
 active[0].resolve({text:'Second task completed',usage:{}});
 const done=await untilJob(app,b.body.id,j=>j.status==='completed');assert.equal(done.result.text,'Second task completed');
});
