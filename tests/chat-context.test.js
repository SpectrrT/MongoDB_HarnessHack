import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createMemoryDb} from '../rem/db/index.js';
import {createContextCompactor} from '../server/context/compaction.js';
import {createChatContext} from '../server/context/chat.js';
import {createOpenRouter} from '../server/openrouter.js';

const scorer = {name:'scripted-retention-fixture',async score({units}) {
  return {scores:units.map(u=>({id:u.id,probability:0.01})),usage:{inputTokens:20,outputTokens:2,cost:0}};
}};
const tool = (id,name,args) => ({id,type:'function',function:{name,arguments:JSON.stringify(args)}});

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
    const result=await router.run({owner:'owner',runId:'turn',model:'test/model',messages:[{role:'user',text:'Read the files, then recover the original archive key.'}],notes:[],cwd:root});
    assert.equal(result.text,'ARCHIVE_KEY_7D91');assert.ok(sawOmission&&sawRecovery);
    assert.ok(result.usage.compaction.calls>0);
    assert.equal(result.usage.input_tokens,calls*100+result.usage.compaction.input_tokens);
    assert.equal(result.usage.output_tokens,calls*10+result.usage.compaction.output_tokens);
    assert.ok((await db.collection('context_archive').countDocuments())>0);
    const other=createChatContext({compactor,owner:'someone-else',runId:'turn',messages:[],goal:'Read'});
    assert.deepEqual((await other.recover('context_list',{})).records,[]);
    assert.match((await other.recover('context_read',{id:'exchange-1'})).error,/No archived context/);
  } finally {await fs.rm(root,{recursive:true,force:true});}
});

test('denied writes and unfinished exchanges are protected when read-only data is omitted',async()=>{
  let received;
  const compactor={async select({units}) {received=units;return {units,metrics:{}};}};
  const chat=createChatContext({compactor,owner:'one',runId:'protected',goal:'Draft',messages:[{role:'user',content:'Do not publish.'}]});
  chat.append({role:'assistant',tool_calls:[tool('write','write_file',{path:'draft.txt',content:'Draft'})]},[{role:'tool',tool_call_id:'write',content:'The user declined this file change.'}]);
  chat.append({role:'assistant',tool_calls:[tool('read','read_file',{path:'x'})]},[]);
  await chat.select();
  assert.equal(received[0].pinned,'conversation_instruction');
  assert.equal(received[1].pinned,'failed_or_denied');
  assert.equal(received[2].pinned,'unfinished_exchange');
  assert.equal(received[2].complete,false);
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
    const compactor={async select(){throw Object.assign(Error('Context needs review.'),{metrics:{inputTokens:17,outputTokens:3,reportedCost:0,decisionCalls:1,usageKnown:true,costKnown:true}});}};
    const router=createOpenRouter({dataDir:root,fetcher,compactor}),auth=router.start('owner','http://localhost:5194');
    await router.complete(auth.state,auth.state,'test');
    await assert.rejects(router.run({owner:'owner',model:'test/model',messages:[{role:'user',text:'Work'}],notes:[],cwd:root}),e=>e.usage.input_tokens===17&&e.usage.output_tokens===3);
    assert.equal(chatCalls,0);
  } finally {await fs.rm(root,{recursive:true,force:true});}
});
