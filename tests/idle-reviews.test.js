import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {createIdleReviews,IDLE_MS,DEFAULT_IDLE_LIMITS} from '../server/idle-reviews.js';
const payload={conversationId:'conversation',requestId:'user-turn',model:'model',provider:'codex',effort:'low',images:[{data:'image'}],notes:[],messages:[{role:'user',text:'Finish this draft.'}]};
test('Sleep is opt-in, waits thirty idle minutes, and performs one review per user activity',async()=>{
 const dataDir=await fs.mkdtemp(path.join(os.tmpdir(),'offload-idle-'));let time=0,busy=false;const calls=[],jobs=new Map();
 const options={dataDir,now:()=>time,interval:0,isBusy:()=>busy,getJob:async(_,id)=>jobs.get(id),cancel:async()=>{},launch:async(owner,p)=>{calls.push(p);jobs.set(p.requestId,{status:'completed',result:{text:'Reviewed'}});}};
 const idle=createIdleReviews(options);
 await idle.observe('owner',payload);time=IDLE_MS*2;await idle.tick();assert.equal(calls.length,0);
 await idle.set('owner','conversation',true,DEFAULT_IDLE_LIMITS);await idle.observe('owner',payload);time+=IDLE_MS-1;await idle.tick();assert.equal(calls.length,0);
 await idle.touch('owner','conversation');time+=IDLE_MS-1;await idle.tick();assert.equal(calls.length,0);time+=1;busy=true;await idle.tick();assert.equal(calls.length,0);busy=false;await idle.tick();assert.equal(calls.length,1);assert.deepEqual(calls[0].images,[]);
 await idle.tick();time+=IDLE_MS*3;await idle.tick();assert.equal(calls.length,1);assert.equal((await idle.get('owner','conversation')).state,'done');assert.equal((await idle.get('other','conversation')).enabled,false);
 idle.close();const restored=createIdleReviews(options);await restored.tick();assert.equal(calls.length,1);
 await restored.observe('owner',{...payload,requestId:'next-user-turn'});time+=IDLE_MS;await restored.tick();assert.equal(calls.length,2);
 await restored.reset('owner');assert.equal((await restored.get('owner','conversation')).enabled,false);restored.close();await fs.rm(dataDir,{recursive:true,force:true});
});
test('disabling Sleep while launch is in progress cancels that review',async()=>{
 const dataDir=await fs.mkdtemp(path.join(os.tmpdir(),'offload-idle-race-'));let time=0,resolveLaunch,started;const entering=new Promise(r=>started=r);const cancelled=[];
 const idle=createIdleReviews({dataDir,now:()=>time,interval:0,isBusy:()=>false,getJob:async()=>null,cancel:async(_,id)=>cancelled.push(id),launch:async()=>{started();await new Promise(r=>resolveLaunch=r);}});
 await idle.set('owner','conversation',true,DEFAULT_IDLE_LIMITS);await idle.observe('owner',payload);time=IDLE_MS;const tick=idle.tick();await entering;await idle.set('owner','conversation',false);resolveLaunch();await tick;assert.ok(cancelled.length>0);assert.equal((await idle.get('owner','conversation')).state,'off');idle.close();await fs.rm(dataDir,{recursive:true,force:true});
});
