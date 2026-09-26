import test from 'node:test';import assert from 'node:assert/strict';
import express from 'express';import request from 'supertest';
import {titleModel,cleanTitle,generateTitle,mountChatTitles} from '../server/chat-titles.js';
import {createWorkspace,transition} from '../shared/workspace.js';
import {findCodex,inheritedAccess} from '../server/codex-installation.js';
test('naming chooses the available lightweight model and validates output',()=>{
 assert.equal(titleModel([{id:'large',isDefault:true},{id:'gpt-5.6-luna'}]).id,'gpt-5.6-luna');
 assert.equal(cleanTitle('{"title":"Weekly homework deadlines"}'),'Weekly homework deadlines');
 assert.throws(()=>cleanTitle('{"title":null}'));
});
test('naming requests are deduplicated per owner and do not block work',async()=>{
 const app=express();app.use(express.json());app.use((req,res,next)=>{req.workspaceKey=req.get('owner')||'one';next();});
 let calls=0,finish;mountChatTitles(app,{status:async()=>({connected:true,models:[{id:'luna'}]}),generate:()=>{calls++;return new Promise(r=>{finish=r;});}});
 const body={conversationId:'00000000-0000-0000-0000-000000000001',text:'Find my homework'};
 assert.equal((await request(app).post('/api/model/titles').send(body)).status,202);
 assert.equal((await request(app).post('/api/model/titles').send(body)).body.status,'pending');assert.equal(calls,1);
 finish('Weekly homework');await new Promise(r=>setImmediate(r));
 assert.equal((await request(app).post('/api/model/titles').send(body)).body.title,'Weekly homework');
});
test('naming timeout closes its independent Codex client',async()=>{
 let closed=false;await assert.rejects(generateTitle('Hello',[{id:'luna'}],{timeout:10,createClient:()=>({request:()=>new Promise(()=>{}),close:()=>{closed=true;}})}),/timed out/);assert.equal(closed,true);
});
test('archive, trash and restore preserve messages and pending runs; generated titles persist',()=>{
 let s=createWorkspace();s=transition(s,{type:'new-conversation',payload:{id:'qa'}});
 s=transition(s,{type:'chat-start',payload:{id:'qa',jobId:'run',model:'m',text:'Can you find my homework deadlines?',notes:[]}});
 s=transition(s,{type:'conversation-title',payload:{id:'qa',title:'Weekly homework deadlines'}});
 for(const action of ['archive','delete','restore']){s=transition(s,{type:'conversation-state',payload:{id:'qa',action}});assert.equal(s.conversations[0].messages.length,1);assert.equal(s.conversations[0].pending.id,'run');}
 assert.equal(s.conversations[0].listStatus,null);
 s=transition(s,{type:'chat-finish',payload:{id:'qa',jobId:'run',text:'Done'}});
 assert.equal(s.conversations[0].pending,null);assert.equal(s.conversations[0].title,'Weekly homework deadlines');
});
test('teammates use their own Codex path and access policy',()=>{
 assert.equal(findCodex({env:{OFFLOAD_CODEX_BIN:'/custom/codex'}}),'/custom/codex');
 assert.equal(findCodex({env:{PATH:'/one:/two'},home:'/home/teammate',platform:'darwin',executable:p=>p==='/two/codex'}),'/two/codex');
 assert.deepEqual(inheritedAccess({approval_policy:'on-request',sandbox_mode:'read-only'}),{approvalPolicy:'on-request',sandbox:'read-only'});
 assert.deepEqual(inheritedAccess({approval_policy:'never',sandbox_mode:'danger-full-access'}),{approvalPolicy:'never',sandbox:'danger-full-access'});
 assert.deepEqual(inheritedAccess({}),{});
});
