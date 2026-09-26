import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createOpenRouter} from '../server/openrouter.js';
test('PKCE binds the callback, consumes it once and keeps credentials out of status',async()=>{
 const dataDir=await fs.mkdtemp(path.join(os.tmpdir(),'offload-oauth-test-'));
 let exchange;
 const fetcher=async(url,options)=>{
  if(url.endsWith('/auth/keys')){exchange=JSON.parse(options.body);return Response.json({key:'sk-or-test-fixture'});}
  if(url.endsWith('/key'))return Response.json({data:{label:'Offload',limit_remaining:10}});
  if(url.endsWith('/models'))return Response.json({data:[{id:'test/model',name:'Test model',architecture:{output_modalities:['text']},supported_parameters:['reasoning'],pricing:{prompt:'0',completion:'0'}}]});
  throw Error('Unexpected endpoint');
 };
 try{
  const router=createOpenRouter({dataDir,fetcher}),start=router.start('owner-a','http://127.0.0.1:5193');
  const auth=new URL(start.url),callback=new URL(auth.searchParams.get('callback_url'));
  assert.equal(auth.searchParams.get('code_challenge_method'),'S256');assert.equal(callback.searchParams.get('state'),start.state);
  await assert.rejects(router.complete('other-browser',start.state,'code'),/expired/);
  await router.complete(start.state,start.state,'code');assert.equal(exchange.code_challenge_method,'S256');assert.ok(exchange.code_verifier.length>=43);
  await assert.rejects(router.complete(start.state,start.state,'code'),/expired/);
  const status=await router.status('owner-a');assert.equal(status.connected,true);assert.equal(status.remaining,10);assert.ok(!JSON.stringify(status).includes('sk-or-'));
  assert.equal((await router.status('owner-b')).connected,false);
  const file=path.join(dataDir,'openrouter','owner-a.json');assert.equal((await fs.stat(file)).mode&0o777,0o600);
  await router.disconnect('owner-a');assert.equal((await router.status('owner-a')).connected,false);
 }finally{await fs.rm(dataDir,{recursive:true,force:true});}
});
