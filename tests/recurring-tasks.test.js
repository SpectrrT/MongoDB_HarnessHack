import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {createRecurringTasks,nextOccurrence} from '../server/recurring-tasks.js';
test('schedules skip missed intervals and clamp short months',()=>{
 const at=new Date(2026,0,31,9).getTime();assert.equal(new Date(nextOccurrence(at,'monthly',at)).getDate(),28);
 assert.equal(nextOccurrence(at,'once',at),null);
 const next=nextOccurrence(at,'daily',at+3*86400000);assert(next>at+3*86400000);assert(next<=at+4*86400000);
});
test('recurring tasks persist, isolate owners, pause, avoid overlap, and use the real job launcher',async()=>{
 const dataDir=await fs.mkdtemp(path.join(os.tmpdir(),'offload-schedule-'));let clock=1000,calls=0;const jobs=new Map();
 const options={dataDir,interval:0,now:()=>clock,isBusy:()=>false,getJob:async(owner,id)=>jobs.get(id),launch:async(owner,p)=>{calls++;assert.equal(owner,'alice');assert.equal(p.provider,'codex');assert.match(p.messages.at(-1).text,/Run the scheduled task/);jobs.set(p.requestId,{id:p.requestId,status:'running'});}};
 let api=createRecurringTasks(options);
 try{
 const task=await api.create('alice',{title:'Weekly homework',brief:'List due dates',repeat:'daily',nextAt:2000,planningId:'plan'});
 assert.equal((await api.list('bob')).length,0);assert.equal(task.status,'paused');clock=3000;await api.tick();assert.equal(calls,0);
 await api.update('alice',task.id,'activate',{provider:'codex',model:'m',effort:'high',messages:[{role:'user',text:'Agreed plan'}],notes:[]});await Promise.all([api.tick(),api.tick()]);assert.equal(calls,1);
 clock+=2*86400000;await api.tick();assert.equal(calls,1);
 const running=(await api.list('alice'))[0];jobs.set(running.jobId,{id:running.jobId,status:'completed'});await api.tick();assert.equal(calls,2);
 await api.update('alice',task.id,'pause');clock+=2*86400000;await api.tick();assert.equal(calls,2);
 api.close();api=createRecurringTasks(options);assert.equal((await api.list('alice'))[0].status,'paused');
 }finally{api.close();await fs.rm(dataDir,{recursive:true,force:true});}
});
test('failed scheduled jobs pause instead of silently repeating',async()=>{
 const dataDir=await fs.mkdtemp(path.join(os.tmpdir(),'offload-schedule-'));
 const api=createRecurringTasks({dataDir,interval:0,now:()=>1000,isBusy:()=>false,getJob:async(owner,id)=>({id,status:'failed',error:'Access needed'}),launch:async()=>{}});
 try{const task=await api.create('a',{title:'Check',brief:'Check',repeat:'daily',nextAt:1000,planningId:'p'});await api.update('a',task.id,'activate',{messages:[{role:'user',text:'Check'}]});await api.tick();await api.tick();const row=(await api.list('a'))[0];assert.equal(row.status,'paused');assert.equal(row.error,'Access needed');}finally{api.close();await fs.rm(dataDir,{recursive:true,force:true});}
});
