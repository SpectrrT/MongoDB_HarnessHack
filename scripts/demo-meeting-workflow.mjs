import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {MongoClient} from 'mongodb';
import {createPersonalSuggestions} from '../server/suggestions/service.js';
import {SleepExecutionStore,visibleTask} from '../server/sleep/execution-store.js';
import {sleepExecutionTick,taskDirectory} from '../server/sleep/execution.js';
import {sleepOpenRouterExecutor} from '../server/sleep/execution-provider.js';

export function checkMongoWorkflow(plan){
 const text=plan?.files?.find(file=>file.path==='action-draft.md')?.content;
 if(typeof text!=='string')return [{id:'draft-file',passed:false}];
 const checks=[
  ['draft-status',/^Unverified draft\b/.test(text)],
  ['p95-baseline',/\bp95\b[^\n]{0,70}\b180\s*ms\b/i.test(text)],
  ['timeout-baseline',/\btimeout\w*\b[^\n]{0,70}0\.6\s*%|0\.6\s*%[^\n]{0,70}\btimeout/i.test(text)],
  ['staging-explain-comparison',/\bstaging\b/i.test(text)&&/\bexplain\b/i.test(text)&&/\bcompar(?:e|ison|ing)\b/i.test(text)],
  ['index-rollout',/\bindex\b/i.test(text)&&/\brollout\b/i.test(text)],
  ['rollback-plan',/\brollback\b/i.test(text)],
  ['no-database-mutations',/\b(?:no|not|never|do not|don't|without)\b[^\n.!]{0,70}\b(?:database writes|index(?:es)?|mutations|database changes)\b/i.test(text)],
  ['no-executed-work-claim',! /\b(?:I|we|Offload)\s+(?:have\s+)?(?:created|dropped|deployed|applied|executed|changed|ran|sent)\b/i.test(text)],
 ];
 return checks.map(([id,passed])=>({id,passed}));
}
const digest=text=>createHash('sha256').update(text).digest('hex');
const option=(args,name)=>args.includes(name)?args[args.indexOf(name)+1]:undefined;

export async function runDemo(args=process.argv.slice(2)){
 const out=option(args,'--output');if(!out)throw Error('Pass --output with a fresh receipt directory.');
 const output=path.resolve(out);await fs.mkdir(output,{recursive:true});
 const receiptFile=path.join(output,'receipt.json');
 try{await fs.access(receiptFile);throw Error('Receipt exists. Use a fresh output directory.');}catch(error){if(error.code!=='ENOENT')throw error;}
 const live=args.includes('--live'),approveTask=option(args,'--approve-task'),owner=option(args,'--workspace')||`demo-engineer-${randomUUID()}`;
 if(live&&approveTask)throw Error('Choose generation or exact-draft approval, not both.');
 const receipt={createdAt:new Date().toISOString(),sourceType:'synthetic',sourceLabel:'Pre-given MongoDB engineer example',workspace:owner,
   mode:approveTask?'Approve an existing reviewed local draft':live?'Live model generation from sample data':'Prepare sample inputs only',
   claims:'This is a demonstration from sample data. No computer capture, calendar access, database mutation, index creation or message sending is performed.',
   requests:[],checks:[],sourceFiles:{},status:'preparing'};
 const save=()=>fs.writeFile(receiptFile,JSON.stringify(receipt,null,2)+'\n',{mode:0o600});
 let client;
 try{
  if(!live&&!approveTask){
    const {mongodbDemoSources}=await import('../shared/mongodb-demo.js');
    const events=mongodbDemoSources(new Date());
    await fs.writeFile(path.join(output,'sample-sources.json'),JSON.stringify({events},null,2)+'\n',{flag:'wx'});
    receipt.events=events;receipt.status='prepared';receipt.modelCalls=0;await save();return receipt;
  }
  if(!process.env.MONGODB_URI)throw Error('Configure the existing MongoDB connection privately.');
  if(live&&!process.env.OPENROUTER_API_KEY)throw Error('Configure the existing OpenRouter key privately.');
  client=new MongoClient(process.env.MONGODB_URI,{serverSelectionTimeoutMS:10000});await client.connect();
  const db=client.db(process.env.MONGODB_DATABASE||'offload_hackathon');
  const store=new SleepExecutionStore(db);await store.initialize();
  const root=path.resolve(option(args,'--artifact-root')||process.env.SLEEP_TASK_ROOT||'.data/sleep-artifacts');
  let task;
  if(approveTask){
    task=await store.get(owner,approveTask);if(!task||task.status!=='approval')throw Error('Choose an owned task awaiting exact-draft approval.');
    receipt.checks=checkMongoWorkflow(task.pending);if(receipt.checks.some(check=>!check.passed))throw Error('The pending workflow does not pass the declared demonstration checks. Review it before approval.');
    await store.control(owner,task._id,'approve');
    task=await sleepExecutionTick(store,()=>{throw Error('Approval must reuse the exact pending draft without another model call.');},{root,workspace:owner,taskId:task._id});
    receipt.task=visibleTask(task);receipt.status=task.status;
    if(task.status==='completed')for(const artifact of task.artifacts){
      const bytes=await fs.readFile(path.join(taskDirectory(root,task),artifact.directory,artifact.path));
      if(digest(bytes)!==artifact.sha256)throw Error('Output hash changed after file checks.');
      await fs.writeFile(path.join(output,artifact.path),bytes,{flag:'wx'});
      receipt.sourceFiles[artifact.path]={sha256:artifact.sha256,bytes:bytes.length};
    }
    receipt.modelCalls=0;
  }else{
    const {mongodbDemoSources}=await import('../shared/mongodb-demo.js');
    const events=mongodbDemoSources(new Date());receipt.events=events;
    const suggestions=await createPersonalSuggestions({db});await suggestions.importEvents(owner,events);
    const card=(await suggestions.list(owner)).suggestions.find(item=>item.kind==='meeting-followup');
    if(!card)throw Error('The sample meeting did not produce a due follow-up.');
    const {run}=await suggestions.decide(owner,card._id,'accept');receipt.checklistRunId=run._id;
    const actionIndex=run.outputs.draft.actionItems.findIndex(action=>action.draftSupported);
    if(actionIndex<0)throw Error('The sample meeting has no supported local draft action.');
    task=await suggestions.draftAction(owner,run._id,actionIndex,{store,deadline:Date.now()+20*60000,budget:20000,maxAttempts:1});
    receipt.taskId=task._id;await save();
    const fetcher=async(url,init)=>{
      const request={startedAt:new Date().toISOString(),request:JSON.parse(init.body),status:null,response:null};receipt.requests.push(request);await save();
      try{const response=await fetch(url,init);request.status=response.status;request.response=await response.clone().json();return response;}
      catch(error){request.error=error.name;throw error;}finally{request.completedAt=new Date().toISOString();await save();}
    };
    const executor=sleepOpenRouterExecutor({model:process.env.OFFLOAD_MODEL||'openai/gpt-4.1-mini',fetcher});
    task=await sleepExecutionTick(store,executor,{root,workspace:owner,taskId:task._id,maxOutputTokens:3000});
    receipt.task=visibleTask(task);receipt.status=task.status;receipt.checks=checkMongoWorkflow(task.pending);receipt.modelCalls=receipt.requests.length;
    if(task.pending)await fs.writeFile(path.join(output,'pending-draft.json'),JSON.stringify(task.pending,null,2)+'\n',{flag:'wx',mode:0o600});
  }
  receipt.completedAt=new Date().toISOString();await save();return receipt;
 }catch(error){receipt.status='failed';receipt.error=error.message;receipt.completedAt=new Date().toISOString();await save();throw error;}
 finally{await client?.close();}
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const receipt=await runDemo();
 console.log(JSON.stringify({status:receipt.status,taskId:receipt.task?.id||receipt.taskId,workspace:receipt.workspace,modelCalls:receipt.modelCalls,checks:receipt.checks,
  next:receipt.status==='approval'?'Review pending-draft.json. Approve only this exact local draft using --approve-task, --workspace and a fresh --output.':null},null,2));
}
