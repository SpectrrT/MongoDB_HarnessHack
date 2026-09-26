import {createRecurringTasks} from './recurring-tasks.js';
import {mountChatTitles} from './chat-titles.js';
import {createIdleReviews} from "./idle-reviews.js";
import {mountCodexLogin} from "./codex-login-routes.js";
import {createOpenRouter} from "./openrouter.js";
import path from "node:path";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import {sessionFolder} from "./agent-session.js";
import {collectArtifacts} from "./agent-artifacts.js";
import { z } from 'zod';
import { codexStatus, runCodex, clearCodexCache } from './codex.js';
import { modelPrompt } from '../shared/retrieval.js';
import { historyContext, historyNotes } from './activity/context.js';
const localHost=host=>/^(127\.0\.0\.1|localhost):([1-9]\d{0,4})$/.test(host)||host==='offload.ai';
const localOrigin=origin=>/^http:\/\/(127\.0\.0\.1|localhost):([1-9]\d{0,4})$/.test(origin)||origin==='https://offload.ai';
const input=z.object({requestId:z.string().uuid(),conversationId:z.string().uuid().optional(),folder:z.string().max(1000).refine(p=>!p||path.isAbsolute(p)).optional(),images:z.array(z.object({name:z.string().max(120),data:z.string().max(4000000).regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/)})).max(3).default([]),provider:z.enum(["codex","openrouter"]).default("codex"),model:z.string().min(1).max(100),effort:z.enum(["low","medium","high","xhigh","max","ultra"]).default("low"),messages:z.array(z.object({role:z.enum(['user','assistant']),text:z.string().max(20000)})).min(1).max(20),notes:z.array(z.object({id:z.string().max(100),source:z.string().max(80),text:z.string().max(360)})).max(4)}).strict();
export function mountModel(app,{status=codexStatus,run=runCodex,dataDir=path.resolve(".data"),enabled=process.env.NODE_ENV !== 'production',activity=null,compactor=null,idleExecution=null,idleOptions={}}={}) {
  const jobs=new Map(), router=createOpenRouter({dataDir,compactor});
  const busy=(owner,conversationId)=>[...jobs.values()].some(j=>j.status==='running'&&j.owner===owner&&j.conversationId===conversationId);
  const full=()=>[...jobs.values()].filter(j=>j.status==='running').length>=8;
  const jobFolder=(owner,id)=>path.join(dataDir,'agent-jobs',owner,id);
  const jobWrites=new Map();
  const save=async job=>{const key=job.owner+':'+job.id,snapshot=JSON.stringify(publicJob(job));const writing=(jobWrites.get(key)||Promise.resolve()).catch(()=>{}).then(async()=>{const folder=jobFolder(job.owner,job.id);await fs.mkdir(folder,{recursive:true,mode:0o700});const temp=path.join(folder,'job-'+crypto.randomUUID()+'.tmp');await fs.writeFile(temp,snapshot,{mode:0o600});await fs.rename(temp,path.join(folder,'job.json'));});jobWrites.set(key,writing);try{await writing;}finally{if(jobWrites.get(key)===writing)jobWrites.delete(key);}};
  const getJob=async(owner,id)=>{const current=jobs.get(owner+':'+id);if(current)return current;if(!/^[a-f0-9-]{36}$/.test(id))return null;const background=await idleExecution?.getJob(owner,id);if(background)return background;try{const saved=JSON.parse(await fs.readFile(path.join(jobFolder(owner,id),'job.json'),'utf8'));return {...saved,owner,...(saved.status==='running'?{status:'failed',approvals:[],error:'The local service restarted. Continue the conversation to resume its saved agent session.'}:{})};}catch{return null;}};
  app.use('/api/model',(req,res,next)=>{
    const host=req.get('host') || '', origin=req.get('origin');
    if(!enabled || !localHost(host) || (origin && (!localOrigin(origin)||new URL(origin).host!==host)) || req.get('X-Offload-Client')!=='local')return res.status(403).json({error:'The model connection is available only in the local Offload app.'});
    next();
  });
  mountChatTitles(app,{status});
  mountCodexLogin(app,{status,onConnected:clearCodexCache,isBusy:()=>[...jobs.values()].some(j=>j.status==='running')});
  app.get('/api/model/status',async(req,res)=>res.json(await status()));
  app.get('/api/model/openrouter/status',async(req,res)=>{try{res.json(await router.status(req.workspaceKey));}catch{res.status(503).json({error:'OpenRouter is unavailable. Try again.'});}});
  app.post('/api/model/openrouter/start',(req,res)=>{const origin=req.get('origin')||'http://'+req.get('host');const auth=router.start(req.workspaceKey,origin);res.cookie('offload_oauth',auth.state,{httpOnly:true,sameSite:'lax',secure:origin==='https://offload.ai',path:'/api/openrouter/callback',maxAge:600000});res.json({url:auth.url});});
  app.post('/api/model/openrouter/disconnect',async(req,res)=>{await router.disconnect(req.workspaceKey);res.json({connected:false});});
  app.get('/api/openrouter/callback',async(req,res)=>{
    if(!enabled||!localHost(req.get('host')||''))return res.status(403).send('Local connection only.');
    try{const binding=req.headers.cookie?.split(";").map(c=>c.trim()).find(c=>c.startsWith("offload_oauth="))?.slice(14);await router.complete(binding,req.query.state,req.query.code);res.clearCookie("offload_oauth",{path:"/api/openrouter/callback"});res.redirect('/app/connections?connected=openrouter');}catch{res.redirect('/app/connections?connection_error=openrouter');}
  });
  async function launch(owner,p){
    const key=owner+':'+p.requestId;
    const previous=await getJob(owner,p.requestId);if(previous)return {job:publicJob(previous),created:false};
    const conversationId=p.conversationId||p.requestId;
    if(busy(owner,conversationId))throw Object.assign(Error('This conversation already has a running task. Open a new chat to work in parallel.'),{status:409});
    const connection=p.provider==='openrouter'?await router.status(owner):await status();if(!connection.connected)throw Object.assign(Error(connection.message),{status:409});
    if(!connection.models.some(m=>m.id===p.model))throw Object.assign(Error('Choose a model available to your account.'),{status:400});
    if(connection.models.find(m=>m.id===p.model)?.efforts?.length&&!connection.models.find(m=>m.id===p.model)?.efforts?.includes(p.effort))throw Object.assign(Error("This model does not support that reasoning level."),{status:400});
    // Reserve synchronously after authentication: one run per conversation, independent chats in parallel.
    const existing=jobs.get(key);if(existing)return {job:publicJob(existing),created:false};
    if(busy(owner,conversationId))throw Object.assign(Error('This conversation already has a running task.'),{status:409});
    if(full())throw Object.assign(Error('Eight conversations are running. Wait for one to finish or stop it.'),{status:409});
    if(jobs.size>=100){for(const [k,j] of jobs){if(j.status!=='running'){jobs.delete(k);break;}}}
    const job={id:p.requestId,owner:owner,conversationId,status:'running',background:!!p.background,createdAt:Date.now(),controller:new AbortController(),events:[],decisions:[],approvals:new Map(),stream:''};jobs.set(key,job);
    await save(job);
    const onEvent=event=>{
      if(job.status!=='running')return;
      if(event.type==='approvalResolved'){for(const a of job.approvals.values())if(a.rpcId===event.rpcId){job.approvals.delete(a.id);a.reject(Error('Request resolved'));}return;}
      if(event.type==='delta'){job.stream=(job.stream+event.text).slice(-40000);return;}
      if(event.type==='message'){job.stream=event.text.slice(-40000);return;}
      const old=job.events.find(e=>e.id===event.id);
      if(event.type==='output'){if(old)old.output=((old.output||'')+event.text).slice(-16000);return;}
      if(old)Object.assign(old,event);else job.events.push(event);if(job.events.length>80)job.events.shift();
    };
    const onRequest=({method,params,rpcId})=>new Promise((resolve,reject)=>{
      if(job.status!=='running'||job.controller.signal.aborted)return reject(Error('Stopped.'));
      const id=crypto.randomUUID(),request={id,method,params:structuredClone(params),rpcId,resolve,reject};job.approvals.set(id,request);
    });
    const checkpointTimer=setInterval(()=>{if(job.status==='running')void save(job).catch(()=>{});},2000);checkpointTimer.unref();
    job.finished=(async()=>{
      const folder=await sessionFolder(dataDir,job.owner,p.conversationId||p.requestId,p.folder);job.cwd=folder.cwd;await save(job);
      // Computer history that matches the request rides along as reference notes, for either provider.
      const notes=[...p.notes,...historyNotes(await historyContext(activity,p.messages))];
      const args={owner:job.owner,runId:job.id,model:p.model,messages:p.messages,notes,effort:p.effort,images:p.images,cwd:folder.cwd,onEvent,onRequest,signal:job.controller.signal};
      const result=p.provider==='openrouter'?await router.run(args):await run({...args,...folder,prompt:modelPrompt(folder.threadId?p.messages.slice(-1):p.messages,notes)});
      if(result.usage)job.usage=result.usage;
      if(job.status!=='running')return;
      for(const item of result.items||[])if(item.type==='imageGeneration'&&item.status==='completed'&&/^[A-Za-z0-9+/=]+$/.test(item.result||'')&&item.result.length<28000000){await fs.writeFile(path.join(folder.cwd,'generated-'+crypto.randomUUID()+'.png'),Buffer.from(item.result,'base64'),{mode:0o600});}
      const artifacts=await collectArtifacts(folder.cwd,path.join(jobFolder(job.owner,job.id),'files'),job.createdAt);
      job.result={text:result.text.slice(0,20000),usage:result.usage,model:p.model,agent:{jobId:job.id,cwd:folder.cwd,events:job.events,artifacts}};job.status='completed';job.stream='';
    })().catch(e=>{if(e.usage)job.usage=e.usage;if(job.status==='running'){job.status='failed';job.error=e.message;}}).finally(async()=>{clearInterval(checkpointTimer);for(const a of job.approvals.values())a.reject(Error('Run ended.'));job.approvals.clear();await save(job).catch(()=>{});});
    return {job:publicJob(job),created:true};
  }
  const cancel=async(owner,id)=>{await idleExecution?.pause(owner,id);const job=jobs.get(owner+':'+id);if(job?.status==='running'){job.status='cancelled';job.controller.abort();for(const approval of job.approvals.values())approval.reject(Error('Stopped.'));job.approvals.clear();await job.finished;await save(job);}};
  const launchIdle=async(owner,p)=>{if(!idleExecution)throw Error('Connect MongoDB and the bounded Sleep worker before enabling background drafts.');return idleExecution.launch(owner,p);};
  const idle=createIdleReviews({dataDir,launch:launchIdle,getJob,cancel,isBusy:()=>!enabled||[...jobs.values()].some(job=>job.status==='running'),...idleOptions});
  const sleepConfiguration=async owner=>idleExecution?.configuration?idleExecution.configuration(owner):{configured:false,provider:'openrouter',model:null};
  const recurring=createRecurringTasks({dataDir,launch,getJob,isBusy:(owner,id)=>!enabled||full()||busy(owner,id)});
  app.get('/api/model/tasks',async(req,res)=>res.json({tasks:await recurring.list(req.workspaceKey)}));
  app.post('/api/model/tasks',async(req,res)=>{
    const parsed=z.object({title:z.string().trim().min(1).max(100),brief:z.string().trim().min(1).max(4000),repeat:z.enum(['once','daily','weekly','monthly']),nextAt:z.number().finite().min(Date.now()-60000),planningId:z.string().uuid()}).strict().safeParse(req.body);
    if(!parsed.success)return res.status(400).json({error:'Add a task, start date, and repeat schedule.'});
    try{res.status(201).json(await recurring.create(req.workspaceKey,parsed.data));}catch(e){res.status(400).json({error:e.message});}
  });
  app.post('/api/model/tasks/:id',async(req,res)=>{
    if(!z.string().uuid().safeParse(req.params.id).success)return res.status(400).json({error:'Choose a task.'});
    const action=req.body.action;if(!['activate','pause'].includes(action))return res.status(400).json({error:'Choose a task action.'});
    let context;
    if(action==='activate'){const parsed=input.safeParse({...req.body.context,requestId:crypto.randomUUID(),images:[]});if(!parsed.success)return res.status(400).json({error:'The task plan is incomplete.'});context=parsed.data;}
    try{res.json(await recurring.update(req.workspaceKey,req.params.id,action,context));}catch(e){res.status(400).json({error:e.message});}
  });
  app.post('/api/model/sleep/reset',async(req,res)=>{await idle.reset(req.workspaceKey);res.json({ok:true});});
  app.use('/api/model/sleep/:conversationId',(req,res,next)=>{if(!z.string().uuid().safeParse(req.params.conversationId).success)return res.status(400).json({error:'Choose a conversation.'});next();});
  app.get('/api/model/sleep/:conversationId',async(req,res)=>{const execution=await sleepConfiguration(req.workspaceKey);res.json({...await idle.get(req.workspaceKey,req.params.conversationId),configured:execution.configured,execution});});
  app.post('/api/model/sleep/:conversationId',async(req,res)=>{
    // Revocation cannot depend on valid old context or an available provider.
    if(req.body?.enabled===false){await idle.set(req.workspaceKey,req.params.conversationId,false);return res.json(await idle.get(req.workspaceKey,req.params.conversationId));}
    const parsed=z.object({enabled:z.boolean(),consent:z.object({scope:z.literal('isolated-local-drafts'),budget:z.number().int().min(1000).max(20000),durationMs:z.number().int().min(1000).max(3600000),offlinePrototypeChecks:z.boolean().default(false)}).strict().optional(),context:z.unknown().optional()}).strict().safeParse(req.body);
    if(!parsed.success)return res.status(400).json({error:'Choose bounded local draft permission and limits.'});
    const body=parsed.data,execution=await sleepConfiguration(req.workspaceKey);if(body.enabled&&!execution.configured)return res.status(503).json({error:'Sleep needs MongoDB and a configured OpenRouter key. It does not use the selected Codex chat account.'});
    const context=body.context?input.extend({messages:z.array(z.object({role:z.enum(['user','assistant']),text:z.string().max(20000)})).min(1).max(200)}).safeParse({...body.context,requestId:crypto.randomUUID(),conversationId:req.params.conversationId,images:[]}):null;
    if(context&&!context.success)return res.status(400).json({error:'The conversation context is invalid.'});
    try{await idle.set(req.workspaceKey,req.params.conversationId,body.enabled,body.consent);if(context)await idle.observe(req.workspaceKey,context.data);res.json({...await idle.get(req.workspaceKey,req.params.conversationId),configured:execution.configured,execution});}
    catch(e){res.status(400).json({error:e.message});}
  });
  app.post('/api/model/sleep/:conversationId/activity',async(req,res)=>res.json(await idle.touch(req.workspaceKey,req.params.conversationId)));
  app.post('/api/model/jobs',async(req,res)=>{
    const parsed=input.safeParse(req.body);if(!parsed.success)return res.status(400).json({error:'The request is too long or incomplete.'});
    try{
     await idle.activity(req.workspaceKey);
     for(const job of jobs.values())if(job.owner===req.workspaceKey&&job.conversationId===(parsed.data.conversationId||parsed.data.requestId)&&job.background&&job.status==='running')await cancel(job.owner,job.id);
     // Authored stop/continue intent remains authoritative when the provider is unavailable.
     await idle.observe(req.workspaceKey,parsed.data);
     const result=await launch(req.workspaceKey,parsed.data);res.status(result.created?202:200).json(result.job);
    }catch(e){res.status(e.status||500).json({error:e.message});}
  });
  app.get('/api/model/jobs/:id',async(req,res)=>{const job=await getJob(req.workspaceKey,req.params.id);if(!job)return res.status(404).json({error:'Run not found.'});res.json(publicJob(job));});
  app.post('/api/model/jobs/:id/stop',async(req,res)=>{const job=await getJob(req.workspaceKey,req.params.id);if(!job)return res.status(404).json({error:'Run not found.'});await cancel(req.workspaceKey,req.params.id);res.json(publicJob(await getJob(req.workspaceKey,req.params.id)));});
  app.post('/api/model/jobs/:id/approvals/:approvalId',(req,res)=>{
    const job=jobs.get(req.workspaceKey+':'+req.params.id),approval=job?.approvals?.get(req.params.approvalId);
    if(!job||job.status!=='running'||!approval)return res.status(409).json({error:'This approval is no longer pending.'});
    const answer=z.object({action:z.enum(['approve','deny']),answers:z.record(z.string(),z.string().max(8000)).optional(),content:z.record(z.string(),z.unknown()).optional()}).strict().safeParse(req.body);
    if(!answer.success)return res.status(400).json({error:'Choose a response.'});
    job.approvals.delete(approval.id);job.decisions.push({id:approval.id,method:approval.method,action:answer.data.action,at:Date.now()});approval.resolve(answer.data);res.json({ok:true});
  });
  app.get('/api/model/jobs/:id/artifacts/:artifactId',async(req,res)=>{
    const background=await idleExecution?.getArtifact(req.workspaceKey,req.params.id,req.params.artifactId);
    if(background){res.set('Content-Disposition',`attachment; filename="${background.name}"`);return res.type('text/plain').send(background.content);}
    const job=await getJob(req.workspaceKey,req.params.id),artifact=job?.result?.agent?.artifacts?.find(a=>a.id===req.params.artifactId);
    if(!artifact)return res.status(404).json({error:'File not found.'});
    res.set('Content-Disposition',`attachment; filename="${path.basename(artifact.name).replace(/[^a-zA-Z0-9._-]/g,'_')}"`);res.type('application/octet-stream');
    res.sendFile(path.resolve(jobFolder(req.workspaceKey,job.id),'files',artifact.id),{dotfiles:'allow'});
  });
  return {idle};
}
function publicJob(job){const {id,status,createdAt,result,error,events,stream,cwd,decisions,usage}=job;return {id,status,createdAt,result,error,events,stream,cwd,decisions,usage,approvals:job.approvals instanceof Map?[...job.approvals.values()].map(({id,method,params})=>({id,method,params})):[]};}
