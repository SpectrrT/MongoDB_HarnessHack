import test from 'node:test';import assert from 'node:assert/strict';
import {watchModelJob} from '../src/watch-model-job.js';
import {modelRequest} from '../src/model-api.js';
const turn=()=>new Promise(resolve=>setImmediate(resolve));
test('a lost connection retains the pending job and recovers its real answer',async()=>{
 let reads=0,next,finished=[],connection=[],updates=[];
 const stop=watchModelJob({read:async()=>{if(++reads===1)throw Object.assign(Error('offline'),{retryable:true});return {status:'completed',result:{text:'Verified reply'}};},onUpdate:j=>updates.push(j),onFinish:j=>finished.push(j),onConnection:s=>connection.push(s),schedule:fn=>{next=fn;return 1;},unschedule:()=>{}});
 await turn();assert.equal(finished.length,0);assert.match(connection[0],/Reconnecting/);
 await next();assert.equal(finished[0].result.text,'Verified reply');assert.equal(updates.length,1);assert.equal(connection.at(-1),'');stop();
});
test('stopping a watcher prevents a late request from updating another chat',async()=>{
 let resolve,updates=0;const stop=watchModelJob({read:()=>new Promise(r=>resolve=r),onUpdate:()=>updates++,onFinish:()=>updates++,onConnection:()=>{},unschedule:()=>{}});
 stop();resolve({status:'completed',result:{text:'late'}});await turn();assert.equal(updates,0);
});
test('proxy errors are retryable and never tell the user to run a command',async()=>{
 const original=globalThis.fetch;globalThis.fetch=async()=>new Response('Bad gateway',{status:502});
 try{await assert.rejects(modelRequest('jobs/test'),e=>e.retryable===true&&!e.message.includes('npm'));}finally{globalThis.fetch=original;}
});
