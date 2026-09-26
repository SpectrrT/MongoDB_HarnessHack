import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createMemoryDb} from '../rem/db/index.js';
import {createContextCompactor} from '../server/context/compaction.js';
import {createChatContext} from '../server/context/chat.js';
import {createOpenRouter} from '../server/openrouter.js';

const scorer = {name:'typesafe:jev-test-fixture',async score({units}) {
  return {scores:units.map(u=>({id:u.id,probability:0.01})),usage:{inputTokens:20,outputTokens:2,cost:0}};
}};
const tool = (id,name,args) => ({id,type:'function',function:{name,arguments:JSON.stringify(args)}});

test('selection progress is silent under budget and cached scoring does not create a new call',async()=>{
 const db=createMemoryDb(),events=[];let calls=0;
 const compactor=createContextCompactor({db,budgetChars:100,recentCount:0,scorer:{name:'typesafe:jev-test-fixture',async score({units}){calls++;return {scores:units.map(u=>({id:u.id,probability:0})),usage:{inputTokens:1,outputTokens:1,cost:0}};}}});
 const progress=e=>events.push(e);
 await compactor.select({runId:'noop',goal:'Read',units:[{id:'short',text:'small'}],onProgress:progress});
 assert.equal(events.length,0);assert.equal(calls,0);
 const input={runId:'cache',goal:'Read',units:[{id:'a',text:'background '.repeat(20)},{id:'b',text:'old reference '.repeat(20)}],onProgress:progress};
 await compactor.select(input);assert.equal(calls,1);assert.equal(events[0].phase,'scoring');
 const cached=await compactor.select(input);assert.equal(calls,1);assert.equal(events.length,1);assert.equal(cached.metrics.decisionCalls,0);assert.equal(cached.metrics.cacheHits,2);
});

test('native chat compacts real file reads, preserves protocol and recovers exact archived evidence',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'offload-context-'));
  try {
    for(let i=0;i<7;i++) await fs.writeFile(path.join(root,`read-${i}.txt`),`${i===0?'ARCHIVE_KEY_7D91':'reading '+i}\n${'reference data '.repeat(230)}`);
    const db=createMemoryDb(),compactor=createContextCompactor({db,scorer,budgetChars:10000,recentCount:1});
    let calls=0,sawOmission=false,sawRecovery=false;
    const fetcher=async(url,options)=>{
      if(url.endsWith('/auth/keys')) return Response.json({key:'sk-or-test-fixture'});
      if(url.endsWith('/models')) return Response.json({data:[{id:'test/model',name:'fixture',architecture:{output_modalities:['text']},supported_parameters:['tools'],pricing:{prompt:'0',completion:'0'}}]});
      assert.ok(url.endsWith('/chat/completions'));
      const body=JSON.parse(options.body);calls++;
      for(let i=0;i<body.messages.length;i++) {
        const m=body.messages[i];
        if(m.tool_calls) for(const c of m.tool_calls) assert.ok(body.messages.slice(i+1,i+1+m.tool_calls.length).some(r=>r.tool_call_id===c.id));
        if(m.role==='tool') assert.ok(body.messages.slice(0,i).some(a=>a.tool_calls?.some(c=>c.id===m.tool_call_id)));
      }
      assert.ok(body.messages.some(m=>m.role==='user'&&m.content==='Read the files, then recover the original archive key.'));
      sawOmission ||= body.messages.some(m=>String(m.content).includes('earlier read-only tool exchanges were archived'));
      let message;
      if(calls<=7) message={role:'assistant',content:null,tool_calls:[tool('read-'+calls,'read_file',{path:`read-${calls-1}.txt`})]};
      else if(calls===8) {
        assert.equal(body.messages.some(m=>m.role==='tool'&&String(m.content).includes('ARCHIVE_KEY_7D91')),false);
        message={role:'assistant',content:null,tool_calls:[tool('recover','context_read',{id:'exchange-1'})]};
      } else {
        sawRecovery=body.messages.some(m=>m.role==='tool'&&String(m.content).includes('ARCHIVE_KEY_7D91'));
        message={role:'assistant',content:'ARCHIVE_KEY_7D91'};
      }
      return Response.json({choices:[{message}],usage:{prompt_tokens:100,completion_tokens:10,cost:0.001}});
    };
    const router=createOpenRouter({dataDir:root,fetcher,compactor}),auth=router.start('owner','http://localhost:5194');
    await router.complete(auth.state,auth.state,'test');
    const events=[];
    const result=await router.run({onEvent:event=>events.push(event),owner:'owner',runId:'turn',model:'test/model',messages:[{role:'user',text:'Read the files, then recover the original archive key.'}],notes:[],cwd:root});
    assert.equal(result.text,'ARCHIVE_KEY_7D91');assert.ok(sawOmission&&sawRecovery);
    assert.ok(result.usage.compaction.calls>0);
    const compactions=events.filter(e=>e.type==='contextCompaction');
    assert.ok(compactions.some(e=>e.status==='running'&&e.label==='Using Jev for compaction'));
    assert.ok(compactions.some(e=>e.status==='completed'&&e.decisionCalls>0));
    assert.equal(compactions.some(e=>e.status==='under_budget'),false);
    assert.equal(result.usage.input_tokens,calls*100+result.usage.compaction.input_tokens);
    assert.equal(result.usage.output_tokens,calls*10+result.usage.compaction.output_tokens);
    assert.ok((await db.collection('context_archive').countDocuments())>0);
    const other=createChatContext({compactor,owner:'someone-else',runId:'turn',messages:[],goal:'Read'});
    assert.deepEqual((await other.recover('context_list',{})).records,[]);
    assert.match((await other.recover('context_read',{id:'exchange-1'})).error,/No archived context/);
  } finally {await fs.rm(root,{recursive:true,force:true});}
});

test('denied writes stay protected, instructions stay intact, and malformed exchanges stop',async()=>{
  let received;
  const compactor={async select({units}) {received=units;return {units,metrics:{}};}};
  const chat=createChatContext({compactor,owner:'one',runId:'protected',goal:'Draft',messages:[{role:'user',content:'Do not publish.'}]});
  chat.append({role:'assistant',tool_calls:[tool('write','write_file',{path:'draft.txt',content:'Draft'})]},[{role:'tool',tool_call_id:'write',content:'The user declined this file change.'}]);
  assert.throws(()=>chat.append({role:'assistant',tool_calls:[tool('read','read_file',{path:'x'})]},[]),/incomplete/);
  const selected=await chat.select();
  assert.equal(selected.messages[0].content,'Do not publish.');
  assert.equal(received[0].pinned,'failed_or_denied');
  assert.throws(()=>chat.append({role:'assistant',tool_calls:[tool('duplicate','read_file',{path:'x'}),tool('duplicate','read_file',{path:'x'})]},[{role:'tool',tool_call_id:'duplicate',content:'x'},{role:'tool',tool_call_id:'duplicate',content:'x'}]),/malformed/);
});

test('selector failure stops before another paid chat request and preserves known decision usage',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'offload-context-fail-'));
  try {
    let chatCalls=0;
    const fetcher=async url=>{
      if(url.endsWith('/auth/keys')) return Response.json({key:'sk-or-test-fixture'});
      if(url.endsWith('/models')) return Response.json({data:[{id:'test/model',architecture:{output_modalities:['text']},supported_parameters:['tools']}]});
      chatCalls++;throw Error('Chat must not start.');
    };
    const events=[];
    const compactor={async select({onProgress}){onProgress?.({phase:'scoring',source:'typesafe:jev-test-fixture',call:1});throw Object.assign(Error('Context needs review.'),{metrics:{source:'typesafe:jev-test-fixture',inputTokens:17,outputTokens:3,reportedCost:0,decisionCalls:1,usageKnown:true,costKnown:true}});}};
    const router=createOpenRouter({dataDir:root,fetcher,compactor}),auth=router.start('owner','http://localhost:5194');
    await router.complete(auth.state,auth.state,'test');
    await assert.rejects(router.run({onEvent:event=>events.push(event),owner:'owner',model:'test/model',messages:[{role:'user',text:'Work'}],notes:[],cwd:root}),e=>e.usage.input_tokens===17&&e.usage.output_tokens===3);
    assert.equal(chatCalls,0);
    assert.deepEqual(events.filter(e=>e.type==='contextCompaction').map(e=>e.status),['running','failed']);
  } finally {await fs.rm(root,{recursive:true,force:true});}
});

test('image payloads stay intact outside the tool-history selection budget',async()=>{
  const messages=[{role:'system',content:'Preserve instructions.'},{role:'user',content:[{type:'text',text:'Describe this image.'},{type:'image_url',image_url:{url:'data:image/png;base64,'+'a'.repeat(40000)}}]}];
  let decisions=0;
  const compactor=createContextCompactor({db:createMemoryDb(),scorer:{name:'unused',async score(){decisions++;throw Error('No scoring needed.');}},budgetChars:1000});
  const chat=createChatContext({compactor,owner:'one',runId:'image',messages,goal:'Describe this image.'});
  assert.deepEqual((await chat.select()).messages,messages);assert.equal(decisions,0);
});

test('aborting a later selection batch preserves earlier measured spend and unknown in-flight usage',async()=>{
  const controller=new AbortController();let calls=0;
  const compactor=createContextCompactor({db:createMemoryDb(),budgetChars:100,recentCount:0,scorer:{name:'partial',async score({units}) {
    if(++calls===2){controller.abort();controller.signal.throwIfAborted();}
    return {scores:units.map(u=>({id:u.id,probability:0.01})),usage:{inputTokens:100,outputTokens:5,cost:0.002}};
  }}});
  await assert.rejects(compactor.select({runId:'cancel',goal:'Find the fact',signal:controller.signal,units:Array.from({length:9},(_,i)=>({id:String(i),text:'old background '.repeat(25)+i}))}),e=>{
    assert.equal(e.name,'AbortError');assert.equal(e.metrics.inputTokens,100);assert.equal(e.metrics.outputTokens,5);
    assert.equal(e.metrics.reportedCost,0.002);assert.equal(e.metrics.usageKnown,false);assert.equal(e.metrics.decisionCalls,2);return true;
  });
});

test('paid malformed replies retain usage and duplicate tool IDs execute no tools',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'offload-malformed-'));
  try {
    for(const duplicate of [false,true]) {
      let approvals=0;
      const message={role:'assistant',tool_calls:[tool('same','write_file',{path:'draft.txt',content:'one'}),tool('same','write_file',{path:'draft.txt',content:'two'})]};
      const fetcher=async url=>{
        if(url.endsWith('/auth/keys'))return Response.json({key:'sk-or-test-fixture'});
        if(url.endsWith('/models'))return Response.json({data:[{id:'test/model',architecture:{output_modalities:['text']},supported_parameters:['tools']}]});
        return Response.json({choices:duplicate?[{message}]:[],usage:{prompt_tokens:123,completion_tokens:7,cost:0.002}});
      };
      const router=createOpenRouter({dataDir:root,fetcher}),auth=router.start('owner','http://localhost:5194');
      await router.complete(auth.state,auth.state,'test');
      await assert.rejects(router.run({owner:'owner',model:'test/model',messages:[{role:'user',text:'Draft'}],notes:[],cwd:root,onRequest:async()=>{approvals++;return {action:'approve'};}}),e=>{
        assert.equal(e.usage.input_tokens,123);assert.equal(e.usage.output_tokens,7);assert.equal(e.usage.cost,0.002);assert.equal(e.usage.usageKnown,true);return true;
      });
      assert.equal(approvals,0);await assert.rejects(fs.access(path.join(root,'draft.txt')));
    }
  } finally {await fs.rm(root,{recursive:true,force:true});}
});
