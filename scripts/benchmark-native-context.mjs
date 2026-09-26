import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createMemoryDb} from '../rem/db/index.js';
import {createContextCompactor} from '../server/context/compaction.js';
import {createOpenRouter} from '../server/openrouter.js';

const evidence={schema:1,at:new Date().toISOString(),mode:'scripted provider and retention scores; real local file tools',tasks:1,
  criterion:'Return exact ARCHIVE_KEY_7D91 after seven file reads, recovering the archive if the first read was omitted.',
  limits:'Serialized prompt characters are measured. Fixture token counters only test overhead accounting and are not actual model usage or token savings. This does not benchmark reasoning quality or cross-turn recovery.'};
async function run(compacted) {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'offload-native-benchmark-'));
  try {
    for(let i=0;i<7;i++) await fs.writeFile(path.join(root,`read-${i}.txt`),`${i===0?'ARCHIVE_KEY_7D91':'reading '+i}\n${'reference data '.repeat(230)}`);
    let calls=0,recoveries=0;const promptChars=[];
    const scorer={name:'scripted-retention-fixture',async score({units}){return {scores:units.map(u=>({id:u.id,probability:0.01})),usage:{inputTokens:20,outputTokens:2,cost:0}};}};
    const compactor=compacted?createContextCompactor({db:createMemoryDb(),scorer,budgetChars:10000,recentCount:1}):null;
    const fetcher=async(url,options)=>{
      if(url.endsWith('/auth/keys')) return Response.json({key:'sk-or-test-fixture'});
      if(url.endsWith('/models')) return Response.json({data:[{id:'scripted/model',architecture:{output_modalities:['text']},supported_parameters:['tools']}]});
      if(!url.endsWith('/chat/completions')) throw Error('Unexpected endpoint');
      const {messages}=JSON.parse(options.body);calls++;promptChars.push(JSON.stringify(messages).length);
      const call=(name,args)=>({role:'assistant',content:null,tool_calls:[{id:'call-'+calls,type:'function',function:{name,arguments:JSON.stringify(args)}}]});
      let message;
      if(calls<=7) message=call('read_file',{path:`read-${calls-1}.txt`});
      else if(messages.some(m=>m.role==='tool'&&String(m.content).includes('ARCHIVE_KEY_7D91'))) message={role:'assistant',content:'ARCHIVE_KEY_7D91'};
      else {recoveries++;message=call('context_read',{id:'exchange-1'});}
      return Response.json({choices:[{message}],usage:{prompt_tokens:100,completion_tokens:10,cost:0}});
    };
    const router=createOpenRouter({dataDir:root,fetcher,compactor}),auth=router.start('fixture','http://localhost:5194');
    await router.complete(auth.state,auth.state,'fixture');
    const result=await router.run({owner:'fixture',runId:'paired',model:'scripted/model',messages:[{role:'user',text:'Read the files, then recover the original archive key.'}],notes:[],cwd:root});
    return {passed:result.text==='ARCHIVE_KEY_7D91',calls,recoveries,promptChars,totalPromptChars:promptChars.reduce((a,b)=>a+b,0),maxPromptChars:Math.max(...promptChars),fixtureUsage:result.usage};
  } finally {await fs.rm(root,{recursive:true,force:true});}
}
evidence.baseline=await run(false);evidence.compacted=await run(true);
evidence.promptCharacterReductionPct=100*(1-evidence.compacted.totalPromptChars/evidence.baseline.totalPromptChars);
const out=process.argv[2];if(out){await fs.mkdir(path.dirname(out),{recursive:true});await fs.writeFile(out,JSON.stringify(evidence,null,2)+'\n');}
console.log(JSON.stringify(evidence,null,2));
if(!evidence.baseline.passed||!evidence.compacted.passed)process.exitCode=1;
