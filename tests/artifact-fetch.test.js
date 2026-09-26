import test from 'node:test';
import assert from 'node:assert/strict';
import {fetchArtifactBlob} from '../src/components/artifact-fetch.js';

test('temporary artifact service errors recover without a false missing-file message',async()=>{
 let calls=0;
 const result=await fetchArtifactBlob('/artifact',{retryDelays:[0],fetchImpl:async(url,options)=>{calls++;assert.equal(options.headers['X-Offload-Client'],'local');assert.ok(options.signal);return calls===1?new Response('',{status:503}):new Response('report bytes');}});
 assert.equal(calls,2);assert.equal(await result.text(),'report bytes');
});
test('missing artifacts fail immediately and keep the missing-file explanation',async()=>{
 let calls=0;
 await assert.rejects(fetchArtifactBlob('/artifact',{retryDelays:[0,0],fetchImpl:async()=>{calls++;return new Response('',{status:404});}}),/file is no longer available/);
 assert.equal(calls,1);
});
test('exhausted network failures invite retry without claiming the file is gone',async()=>{
 let calls=0;
 await assert.rejects(fetchArtifactBlob('/artifact',{retryDelays:[0],fetchImpl:async()=>{calls++;throw TypeError('Failed to fetch');}}),/service could not be reached.*retry/);
 assert.equal(calls,2);
});
test('unmount cancellation aborts the active artifact request without retrying',async()=>{
 const controller=new AbortController();let calls=0;
 const request=fetchArtifactBlob('/artifact',{signal:controller.signal,retryDelays:[0],fetchImpl:async(url,{signal})=>{calls++;return new Promise((resolve,reject)=>{signal.addEventListener('abort',()=>reject(new DOMException('Cancelled','AbortError')),{once:true});});}});
 controller.abort();await assert.rejects(request,{name:'AbortError'});assert.equal(calls,1);
});
