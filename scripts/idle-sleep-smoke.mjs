import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import { createIdleReviews, IDLE_MS, DEFAULT_IDLE_LIMITS } from '../server/idle-reviews.js';
import { SleepExecutionStore } from '../server/sleep/execution-store.js';
import { createIdleExecution } from '../server/sleep/idle-execution.js';
import { sleepOpenRouterExecutor } from '../server/sleep/execution-provider.js';
import { deriveIdleDraft } from '../server/suggestions/idle-candidates.js';

const live=process.argv.includes('--live'),mode=live?'live':'scripted';
const runId=new Date().toISOString().replace(/[:.]/g,'-');
const dataDir=path.resolve('work/idle-sleep-'+mode,runId);
let evidenceFile=path.resolve('docs/evidence/idle-sleep-'+mode+'.json');
try{await fs.access(evidenceFile);evidenceFile=evidenceFile.replace(/\.json$/,'-'+runId+'.json');}catch{}
const journalFile=evidenceFile.replace(/\.json$/,'-calls.jsonl');
await fs.mkdir(path.dirname(evidenceFile),{recursive:true});
const conversationId=randomUUID(),owner='synthetic-idle-smoke',started=performance.now();
const payload={conversationId,requestId:randomUUID(),provider:'codex',model:'chat-model-not-used',effort:'low',notes:[],images:[],messages:[
  {role:'user',text:'Build a local HTML counter prototype with Increment and Reset buttons. It starts at 0, increments once per click, and Reset returns it to 0. Do not deploy or modify any existing project.'},
]};
const html='<!doctype html><html><head><meta charset="utf-8"><title>Counter prototype</title></head><body><output data-testid="counter-value">0</output><button id="inc">Increment</button><button id="reset">Reset</button><script>const value=document.querySelector("output");document.querySelector("#inc").onclick=()=>value.textContent=Number(value.textContent)+1;document.querySelector("#reset").onclick=()=>value.textContent="0";</script></body></html>';
let clockOffset=0,calls=0;const now=()=>Date.now()+clockOffset;
const callLedger=[];
const mongo=await MongoMemoryServer.create(),client=new MongoClient(mongo.getUri());await client.connect();
const store=new SleepExecutionStore(client.db('idle_smoke'),{clock:now});await store.initialize();
const model=live?sleepOpenRouterExecutor({model:process.env.SLEEP_BENCH_MODEL||'openai/gpt-4.1-mini'}):async({task})=>({
  plan:{summary:'Scripted counter fixture',files:task.input.checks.map(check=>({path:check.path,content:check.path==='prototype.html'?html:check.contains.join('\n')+'\nThis synthetic prototype is an unverified draft. The fixed browser check verifies counter behavior only. No deployment or user-project edit was executed.'}))},
  usage:{input_tokens:100,output_tokens:100,cost:0},provider:'scripted-fixture',model:'counter-fixture',
});
const executor=async args=>{
  const call={number:++calls,startedAt:new Date().toISOString(),reservedTokens:args.task.tokensReserved,status:'started'};
  callLedger.push(call);await fs.appendFile(journalFile,JSON.stringify(call)+'\n');
  const callStart=performance.now();
  try{
    const result=await model(args);
    Object.assign(call,{status:'returned',elapsedMs:Math.round(performance.now()-callStart),usage:result.usage,
      provider:result.provider,model:result.model,planParsed:!!result.plan});
    await fs.appendFile(journalFile,JSON.stringify(call)+'\n');return result;
  }catch(error){
    Object.assign(call,{status:'failed',elapsedMs:Math.round(performance.now()-callStart),usage:null,
      error:String(error.message).slice(0,300)});
    await fs.appendFile(journalFile,JSON.stringify(call)+'\n');throw error;
  }
};executor.configuration=model.configuration;executor.retrySafe=model.retrySafe;
const bridge=createIdleExecution({store,executor,root:path.join(dataDir,'artifacts'),derive:deriveIdleDraft,clock:now});
const options={dataDir,launch:bridge.launch,getJob:bridge.getJob,cancel:bridge.pause,isBusy:()=>false,now,interval:0};
const idle=createIdleReviews(options);let restored,state,task,job,beforeRestartCalls,beforeOptIn,beforeIdleThreshold,runError;
const artifacts=[];
try{
  await idle.observe(owner,payload);clockOffset+=IDLE_MS;await idle.tick();
  beforeOptIn={calls,tasks:await store.tasks.countDocuments({})};
  await idle.set(owner,conversationId,true,{...DEFAULT_IDLE_LIMITS,offlinePrototypeChecks:true});await idle.observe(owner,payload);
  // A one-second guard avoids wall-clock overhead crossing the threshold under test.
  clockOffset+=IDLE_MS-1000;await idle.tick();beforeIdleThreshold={calls,tasks:await store.tasks.countDocuments({})};
  clockOffset+=1000;await idle.tick();await bridge.settle();state=await idle.get(owner,conversationId);
  task=await store.tasks.findOne({origin:'idle'});job=await bridge.getJob(owner,state.jobId);beforeRestartCalls=calls;
  idle.close();restored=createIdleReviews(options);await restored.tick();await bridge.settle();
  for(const artifact of job?.result?.agent?.artifacts||[]){const file=await bridge.getArtifact(owner,state.jobId,artifact.id);artifacts.push({name:file.name,content:file.content.toString('utf8')});}
  if(task?.status!=='completed'||!task.checkResults.some(c=>c.id==='browser:counter'&&c.passed)||
    beforeOptIn.calls!==0||beforeOptIn.tasks!==0||beforeIdleThreshold.calls!==0||beforeIdleThreshold.tasks!==0||calls!==beforeRestartCalls)process.exitCode=1;
}catch(error){
  runError=String(error.message).slice(0,500);process.exitCode=1;
}finally{
  // Export the temporary database even on failure. The call journal is written
  // before and immediately after every paid invocation, independently of parsing.
  idle.close();restored?.close();
  try{
    const tasks=await store.tasks.find({}).toArray();task=tasks.find(value=>value.origin==='idle');
    const costComplete=!!task&&task.usageUnknown===0&&callLedger.every(call=>Number.isFinite(call.usage?.cost));
    const evidence={generatedAt:new Date().toISOString(),runId,mode,storage:'temporary-local-mongodb',clock:'injected 30-minute idle threshold plus elapsed wall time',
      beforeOptIn,beforeIdleThreshold,runError,current:{status:task?.status,provider:task?.provider,model:task?.model,calls:task?.calls,
        tokensUsed:task?.tokensUsed,tokensReserved:task?.tokensReserved,usageUnknown:task?.usageUnknown,
        costUSD:costComplete?task.cost:null,knownCostUSD:task?.cost,costComplete,
        wallTimeMs:Math.round(performance.now()-started),tasks:tasks.length,artifacts:artifacts.length,
        extraCallsAfterRestart:beforeRestartCalls===undefined?null:calls-beforeRestartCalls,checks:task?.checkResults},
      conversation:payload.messages,hypotheses:task?.idle.hypotheses,sourceMessageIds:task?.idle.sourceMessageIds,
      events:task?.events,callLedger,artifacts,tasks,limitations:['One synthetic counter task. This is not a long-horizon or general quality benchmark.',
        'The injected clock verifies scheduling decisions; no claim of 30 minutes actual waiting.',
        'Browser checks verify 0 -> 1 -> 2 -> Reset -> 0 only. Broader goal completion remains unverified.',
        ...(live?[]:['The scripted mode reports fixture token counts, not measured model usage.']),
        'Unknown provider usage is conservatively charged against the task budget. Unknown cost is not represented as measured zero cost.'],
    };
    await fs.writeFile(evidenceFile,JSON.stringify(evidence,null,2)+'\n');
    console.log(JSON.stringify({evidenceFile,journalFile,mode,beforeOptIn,beforeIdleThreshold,runError,current:evidence.current},null,2));
  }finally{await client.close();await mongo.stop();}
}
