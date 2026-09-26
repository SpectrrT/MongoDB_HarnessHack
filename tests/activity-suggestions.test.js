import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import request from 'supertest';
import { deriveActivitySuggestions, activitySuggestionRoutes } from '../server/activity/suggestions.js';

const now = new Date('2026-09-26T15:00:00Z');
const work = { id:'session-1', name:'Product meeting', status:'ended', startedAt:'2026-09-26T13:00:00Z', endedAt:'2026-09-26T14:00:00Z', notes:['Maya will draft the release note. The deadline is still undecided.'] };

test('saved notes produce cited drafts, not claims from window titles', () => {
  const [action] = deriveActivitySuggestions({ workSessions:[work], now });
  assert.equal(action.kind,'post-meeting');
  assert.match(action.prompt,/session-1:note:0/);
  assert.match(action.prompt,/deadline is still undecided/);
  assert.match(action.prompt,/do not send messages/i);
  assert.equal(deriveActivitySuggestions({workSessions:[{...work,example:true}],now}).length,0);
  assert.equal(deriveActivitySuggestions({workSessions:[{...work,notes:['password: secret']}],now}).length,0);
});

test('premeeting requires actual dated event and asks for missing agenda', () => {
  const actions = deriveActivitySuggestions({ now, meetings:[{id:'m',title:'Planning',startsAt:'2026-09-26T17:00:00Z'}] });
  assert.equal(actions[0].kind,'pre-meeting'); assert.equal(actions[0].needsInput,true);
  assert.match(actions[0].prompt,/title alone/);
  assert.equal(deriveActivitySuggestions({now,meetings:[{title:'Planning'}]}).length,0);
});

test('repeat detection excludes samples and private data; never promises a weekly task', () => {
  const sessions = [12,19,26].map(d=>({_id:`s-${d}`,app:'Chrome',title:'Weekly product document',start:`2026-09-${d}T13:00:00Z`,source:'collector'}));
  const [action] = deriveActivitySuggestions({sessions,now});
  assert.equal(action.kind,'repeat-work'); assert.equal(action.needsInput,true);
  assert.match(action.prompt,/Do not assume repeated visits establish a weekly schedule/);
  assert.equal(deriveActivitySuggestions({sessions:sessions.map(s=>({...s,source:'seed'})),now}).length,0);
  assert.equal(deriveActivitySuggestions({sessions:sessions.map(s=>({...s,private:true})),now}).length,0);
});

test('preparation stays re-openable, later decisions persist and removed evidence cannot execute', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(),'offload-suggestions-'));
  let sessions=[work];
  const create = () => { const app=express(); app.use(express.json()); app.use((req,res,next)=>{req.workspaceKey='owner';next();}); activitySuggestionRoutes(app,{dataDir:dir,getState:async()=>({sessions}),clock:()=>now}); return app; };
  try {
    let app=create(); const first=await request(app).get('/api/activity/next-actions').expect(200); const id=first.body.actions[0].id;
    const prep=await request(app).post(`/api/activity/next-actions/${id}/decision`).send({decision:'prepare'}).expect(200);
    assert.ok(prep.body.prompt);
    app=create(); assert.equal((await request(app).get('/api/activity/next-actions')).body.actions.length,1);
    const again=await request(app).post(`/api/activity/next-actions/${id}/decision`).send({decision:'prepare'}).expect(200);
    assert.equal(again.body.prompt,prep.body.prompt);
    await request(app).post(`/api/activity/next-actions/${id}/decision`).send({decision:'dismiss'}).expect(200);
    assert.equal((await request(app).get('/api/activity/next-actions')).body.actions.length,0);
    const blocked=await request(app).post(`/api/activity/next-actions/${id}/decision`).send({decision:'prepare'}).expect(200);
    assert.equal(blocked.body.prompt,null);assert.equal(blocked.body.alreadyDecided,true);
    sessions=[];
    await request(app).post(`/api/activity/next-actions/${id}/decision`).send({decision:'prepare'}).expect(409);
  } finally { await fs.rm(dir,{recursive:true,force:true}); }
});

test('snooze survives source edits until cooldown expires and is scoped to owner', async () => {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'offload-suggestion-snooze-'));
  let at=new Date(now), notes=[work];
  const app=express(); app.use(express.json()); app.use((req,res,next)=>{req.workspaceKey=req.get('x-test-owner')||'one';next();});
  activitySuggestionRoutes(app,{dataDir:dir,getState:async()=>({sessions:notes}),clock:()=>at});
  try {
    const id=(await request(app).get('/api/activity/next-actions')).body.actions[0].id;
    await request(app).post(`/api/activity/next-actions/${id}/decision`).send({decision:'snooze'}).expect(200);
    notes=[{...work,notes:[...work.notes,'The release is still pending.']}];
    assert.equal((await request(app).get('/api/activity/next-actions')).body.actions.length,0);
    assert.equal((await request(app).get('/api/activity/next-actions').set('x-test-owner','two')).body.actions.length,1);
    at=new Date(+now+86400001);
    assert.equal((await request(app).get('/api/activity/next-actions')).body.actions.length,1);
  } finally { await fs.rm(dir,{recursive:true,force:true}); }
});

test('handled suggestions do not hide later evidence and response remains capped at twelve',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'offload-suggestion-cap-'));
  const sessions=Array.from({length:15},(_,i)=>({...work,id:`session-${i}`,name:`Review ${i}`,notes:[`Recorded decision number ${i}.`]}));
  const app=express();app.use(express.json());app.use((req,res,next)=>{req.workspaceKey='owner';next();});
  activitySuggestionRoutes(app,{dataDir:dir,getState:async()=>({sessions}),clock:()=>now});
  try{
    const first=(await request(app).get('/api/activity/next-actions').expect(200)).body.actions;
    assert.equal(first.length,12);
    for(const [i,action] of first.entries())await request(app).post(`/api/activity/next-actions/${action.id}/decision`).send({decision:i%2?'dismiss':'snooze'}).expect(200);
    const remaining=(await request(app).get('/api/activity/next-actions').expect(200)).body.actions;
    assert.equal(remaining.length,3);
    assert.ok(remaining.every(action=>!first.some(old=>old.id===action.id)));
    const prepared=await request(app).post(`/api/activity/next-actions/${remaining[0].id}/decision`).send({decision:'prepare'}).expect(200);
    assert.match(prepared.body.prompt,/session-12:note:0/);
    assert.equal((await request(app).get('/api/activity/next-actions')).body.actions.length,3);
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('browser session-note sync creates real suggestions, replaces deleted sources and isolates owners',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'offload-session-sync-'));
 const app=express();app.use(express.json());app.use((req,res,next)=>{req.workspaceKey=req.get('x-test-owner')||'one';next();});
 activitySuggestionRoutes(app,{dataDir:dir,getState:async()=>({sessions:[]}),clock:()=>now});
 const note={id:'browser-session',name:'Review',endedAt:work.endedAt,notes:work.notes};
 try{
  await request(app).post('/api/activity/next-actions/session-notes').send({sessions:[note]}).expect(200);
  const actions=(await request(app).get('/api/activity/next-actions')).body.actions;
  assert.equal(actions.length,1);assert.equal(actions[0].evidence[0].id,'browser-session:note:0');assert.match(actions[0].prompt,/Maya/);
  assert.equal((await request(app).get('/api/activity/next-actions').set('x-test-owner','two')).body.actions.length,0);
  await request(app).post('/api/activity/next-actions/session-notes').send({sessions:[]}).expect(200);
  assert.equal((await request(app).get('/api/activity/next-actions')).body.actions.length,0);
  await request(app).post(`/api/activity/next-actions/${actions[0].id}/decision`).send({decision:'prepare'}).expect(409);
  await request(app).post('/api/activity/next-actions/session-notes').send({sessions:[{...note,status:'active'}]}).expect(400);
  await request(app).post('/api/activity/next-actions/session-notes').send({sessions:[{...note,endedAt:'2026-08-01T14:00:00Z'}]}).expect(200);
  assert.equal((await request(app).get('/api/activity/next-actions')).body.actions.length,0);
  const secret=await request(app).post('/api/activity/next-actions/session-notes').send({sessions:[{...note,notes:['password: hidden']}]}).expect(200);
  assert.equal(secret.body.synced,0);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
