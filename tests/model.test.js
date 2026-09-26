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
function appWith(run,dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'offload-model-test-'))){const app=express();app.use(express.json());app.use((req,res,next)=>{req.workspaceKey=req.get('X-Test-Owner')||'one';next();});mountModel(app,{dataDir,enabled:true,run,status:async()=>({connected:true,models:[{id:'working-model',efforts:['low','high']}]})});return app;}
const post=(app,path,body,owner='one')=>request(app).post(path).set('Host','127.0.0.1:5194').set('X-Offload-Client','local').set('X-Test-Owner',owner).send(body);
test('model requests require local host, valid origin and explicit client header',async()=>{
 const app=appWith(async()=>({text:'ok'}));
 await request(app).post('/api/model/jobs').set('Host','attacker.test:5194').set('X-Offload-Client','local').send(payload).expect(403);
 await request(app).post('/api/model/jobs').set('Host','127.0.0.1:5194').send(payload).expect(403);
 await post(app,'/api/model/jobs',payload).set('Origin','https://evil.example').expect(403);
 await post(app,'/api/model/jobs',{...payload,model:'not-listed'}).expect(400);
});
test('jobs deduplicate, isolate owners and stop the active model',async()=>{
 let started=0,aborted=false;
 const app=appWith(({signal})=>new Promise((resolve,reject)=>{started++;signal.addEventListener('abort',()=>{aborted=true;reject(Error('Stopped'));});}));
 const a=await post(app,'/api/model/jobs',payload).expect(202);
 await post(app,'/api/model/jobs',payload).expect(200);
 await new Promise(resolve=>setTimeout(resolve,40));assert.equal(started,1);
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
