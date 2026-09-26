import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import {mountModel} from '../server/model.js';
import {retrieveNotes,modelPrompt} from '../shared/retrieval.js';
import {createWorkspace,transition} from '../shared/workspace.js';
const payload={requestId:'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',model:'working-model',messages:[{role:'user',text:'Who are you?'}],notes:[]};
function appWith(run){const app=express();app.use(express.json());app.use((req,res,next)=>{req.workspaceKey=req.get('X-Test-Owner')||'one';next();});mountModel(app,{enabled:true,run,status:async()=>({connected:true,models:[{id:'working-model',efforts:['low','high']}]})});return app;}
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
 assert.equal(started,1);
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
