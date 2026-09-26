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

test('decisions persist, preparation is idempotent and removed evidence cannot execute', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(),'offload-suggestions-'));
  let sessions=[work];
  const create = () => { const app=express(); app.use(express.json()); app.use((req,res,next)=>{req.workspaceKey='owner';next();}); activitySuggestionRoutes(app,{dataDir:dir,getState:async()=>({sessions}),clock:()=>now}); return app; };
  try {
    let app=create(); const first=await request(app).get('/api/activity/next-actions').expect(200); const id=first.body.actions[0].id;
    const prep=await request(app).post(`/api/activity/next-actions/${id}/decision`).send({decision:'prepare'}).expect(200);
    assert.ok(prep.body.prompt);
    app=create(); assert.equal((await request(app).get('/api/activity/next-actions')).body.actions.length,0);
    const again=await request(app).post(`/api/activity/next-actions/${id}/decision`).send({decision:'prepare'}).expect(200);
    assert.equal(again.body.prompt,null); assert.equal(again.body.alreadyDecided,true);
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
