import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import request from 'supertest';
import {createApp} from '../server/index.js';

test('prepared Sleep context persists as one user message without starting work',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'offload-prepared-sleep-'));
 try{
  const app=createApp({dataDir:dir,serveStatic:false}),api=request.agent(app),id=crypto.randomUUID();
  const payload={id,title:'Example: Query review',text:'Draft a proposed index from prepared synthetic example context. Do not run database commands.'};
  const send=(type,data)=>api.post('/api/action').send({type,payload:data});
  await send('prepare-conversation',payload).expect(200);
  await send('prepare-conversation',payload).expect(200);
  let state=(await api.get('/api/state').expect(200)).body;
  const conversation=state.conversations.find(c=>c.id===id);
  assert.equal(state.conversations.filter(c=>c.id===id).length,1);
  assert.equal(conversation.messages.length,1);assert.equal(conversation.messages[0].role,'user');
  assert.equal(conversation.messages[0].text,payload.text);assert.ok(!conversation.pending);assert.ok(!conversation.sleepEnabled);
  assert.ok(!(await fs.readdir(dir)).includes('agent-jobs'));
  await send('conversation-sleep',{id,enabled:true,jobId:'observed-first'}).expect(200);
  await send('conversation-sleep-job',{id,jobId:'observed-next'}).expect(200);
  await send('conversation-sleep-skipped',{id,jobId:'no-draft'}).expect(200);
  state=(await api.get('/api/state').expect(200)).body;
  assert.equal(state.conversations.find(c=>c.id===id).sleepObservedJobId,'observed-next');
  assert.equal(state.conversations.find(c=>c.id===id).sleepJobId,'no-draft');
  for(const bad of [{...payload,id:'not-a-uuid'},{...payload,text:''},{...payload,text:'x'.repeat(20001)},{...payload,title:'x'.repeat(71)},{...payload,extra:true}])await send('prepare-conversation',bad).expect(400);
  await send('conversation-sleep-job',{id,jobId:'x'.repeat(101)}).expect(400);
  await send('conversation-sleep-skipped',{id:'invalid',jobId:'job'}).expect(400);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
