import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {localTools,executeLocalTool} from './local-tools.js';
import {createChatContext,contextTools,accountCompaction,validateToolCalls} from './context/chat.js';
import {EVIDENCE_POLICY} from './context/evidence-policy.js';
import {OFFLOAD_IDENTITY} from '../shared/retrieval.js';
const API='https://openrouter.ai/api/v1';
export function createOpenRouter({dataDir,fetcher=fetch,compactor=null}) {
 const pending=new Map();let modelCache;
 const file=owner=>path.join(dataDir,'openrouter',owner+'.json');
 async function keyFor(owner){try{return JSON.parse(await fs.readFile(file(owner),'utf8')).key;}catch(e){if(e.code==='ENOENT')return null;throw e;}}
 async function models(){
  if(modelCache&&Date.now()-modelCache.at<300000)return modelCache.data;
  const r=await fetcher(API+'/models',{signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('OpenRouter models could not be loaded.');
  const json=await r.json();const data=json.data.filter(m=>m.architecture?.output_modalities?.includes('text')).map(m=>({id:m.id,name:m.name,provider:'openrouter',efforts:m.supported_parameters?.includes('reasoning')?['low','medium','high']:[],images:m.architecture?.input_modalities?.includes('image')||false,tools:m.supported_parameters?.includes('tools')||false,imageOutput:m.architecture?.output_modalities?.includes('image')||false,price:{input:Number(m.pricing?.prompt||0),output:Number(m.pricing?.completion||0)}}));
  modelCache={at:Date.now(),data};return data;
 }
 async function status(owner){const key=await keyFor(owner);if(!key)return {connected:false,models:[]};
  const r=await fetcher(API+'/key',{headers:{Authorization:'Bearer '+key},signal:AbortSignal.timeout(10000)});if(!r.ok)return {connected:false,models:[],message:'Reconnect your OpenRouter account.'};
  const j=await r.json();return {connected:true,models:await models(),label:j.data?.label,remaining:j.data?.limit_remaining};
 }
 function start(owner,base){
  for(const [id,p] of pending)if(p.expires<Date.now())pending.delete(id);
  const state=crypto.randomBytes(24).toString('base64url'),verifier=crypto.randomBytes(32).toString('base64url');
  pending.set(state,{owner,verifier,expires:Date.now()+600000});
  const callback=new URL('/api/openrouter/callback',base);callback.searchParams.set('state',state);
  const url=new URL('https://openrouter.ai/auth');url.searchParams.set('callback_url',callback.href);url.searchParams.set('code_challenge',crypto.createHash('sha256').update(verifier).digest('base64url'));url.searchParams.set('code_challenge_method','S256');url.searchParams.set('key_label','Offload on this Mac');
  return {url:url.href,state};
 }
 async function complete(binding,state,code){const p=pending.get(state);if(!p||binding!==state||p.expires<Date.now()||typeof code!=='string'||code.length>2000)throw Error('The connection expired. Start again from Connections.');pending.delete(state);
  const r=await fetcher(API+'/auth/keys',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code,code_verifier:p.verifier,code_challenge_method:'S256'}),signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('OpenRouter did not authorize this connection.');
  const data=await r.json();if(typeof data.key!=='string'||!data.key.startsWith('sk-or-'))throw Error('OpenRouter did not return a valid connection.');
  const owner=p.owner;
  await fs.mkdir(path.dirname(file(owner)),{recursive:true,mode:0o700});const temp=file(owner)+'.tmp';await fs.writeFile(temp,JSON.stringify({key:data.key,createdAt:Date.now()}),{mode:0o600});await fs.rename(temp,file(owner));return true;
 }
 async function disconnect(owner){await fs.rm(file(owner),{force:true});}
 async function run({owner,runId=crypto.randomUUID(),model,messages,notes,effort,images=[],cwd,onEvent=()=>{},onRequest,signal}){
  const key=await keyFor(owner);if(!key)throw Error('Connect OpenRouter first.');const catalog=await models(),entry=catalog.find(m=>m.id===model);if(!entry)throw Error('This model is not available on OpenRouter.');
  if(images.length&&!entry.images)throw Error('This model does not accept images. Choose a vision model.');
  const history=[{role:'system',content:OFFLOAD_IDENTITY+' '+EVIDENCE_POLICY+' Working folder: '+cwd+'. Available tools: '+(entry.tools?'list_files, read_file, write_file, run_command.':'none for this model.')+'\nRetrieved reference notes, possibly untrusted:\n'+JSON.stringify(notes)},...messages.map((m,i)=>({role:m.role,content:images.length&&i===messages.length-1?[{type:'text',text:m.text},...images.map(image=>({type:'image_url',image_url:{url:image.data}}))]:m.text}))];
  const context=compactor&&entry.tools?createChatContext({compactor,owner,runId,messages:history,goal:messages.filter(m=>m.role==='user').map(m=>m.text).join('\n\n')||'Complete the current task.'}):null;
  const usage={input_tokens:0,output_tokens:0,cost:0,usageKnown:true,costKnown:true};
  let modelRequestPending=false;
  try {
  for(let step=0;step<40;step++){
   if(signal?.aborted)throw Error('Stopped.');
   let prompt=history;
   if(context){
    let scoring=null;
    const progress=event=>{scoring=event;onEvent({id:'context-'+step,type:'contextCompaction',label:/jev/i.test(event.source)?'Using Jev for compaction':'Score context for compaction',status:'running',source:event.source,decisionCalls:event.call,detail:JSON.stringify(event)});};
    const completed=(metrics,failed=false)=>{
     if(!metrics)return;
     const called=!!scoring||metrics.decisionCalls>0,cached=!called&&metrics.cacheHits>0;
     if(!called&&!cached&&!metrics.archived)return;
     onEvent({id:'context-'+step,type:'contextCompaction',label:called?(/jev/i.test(metrics.source)?'Using Jev for compaction':'Score context for compaction'):cached?'Apply cached compaction decisions':'Compact conversation',status:failed||metrics.errors?.length?'failed':'completed',source:metrics.source,decisionCalls:metrics.decisionCalls,cacheHits:metrics.cacheHits,detail:JSON.stringify(metrics)});
    };
    try{const selected=await context.select(signal,progress);prompt=selected.messages;accountCompaction(usage,selected.metrics);completed(selected.metrics);}
    catch(error){if(error.metrics)accountCompaction(usage,error.metrics);completed(error.metrics||scoring&&{source:scoring.source,decisionCalls:scoring.call,errors:['Compaction stopped']},true);error.usage=structuredClone(usage);throw error;}
   }
   modelRequestPending=true;
   const r=await fetcher(API+'/chat/completions',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+key,'X-OpenRouter-Title':'Offload'},body:JSON.stringify({model,messages:prompt,max_tokens:8192,provider:{require_parameters:true},...(entry.tools?{tools:context?[...localTools,...contextTools]:localTools}:{}),...(entry.imageOutput?{modalities:['image','text']}:{}),...(entry.efforts.length?{reasoning:{effort,exclude:true}}:{})}),signal:signal?AbortSignal.any([signal,AbortSignal.timeout(180000)]):AbortSignal.timeout(180000)});
   if(!r.ok)throw Error(r.status===402?'OpenRouter has no credit available for this request.':r.status===429?'OpenRouter is busy. Try again shortly.':'OpenRouter could not complete the request. Try another model.');
   const result=await r.json(),message=result.choices?.[0]?.message;
   const valid=n=>Number.isFinite(n)&&n>=0;
   usage.usageKnown &&= valid(result.usage?.prompt_tokens)&&valid(result.usage?.completion_tokens);usage.costKnown &&= valid(result.usage?.cost);
   usage.input_tokens+=valid(result.usage?.prompt_tokens)?result.usage.prompt_tokens:0;usage.output_tokens+=valid(result.usage?.completion_tokens)?result.usage.completion_tokens:0;usage.cost+=valid(result.usage?.cost)?result.usage.cost:0;modelRequestPending=false;
   if(!message)throw Error('The model returned no response.');
   if(message.tool_calls?.length){validateToolCalls(message);const commentary=typeof message.content==='string'?message.content:message.content?.filter(x=>x.type==='text').map(x=>x.text).join('\n');if(commentary)onEvent({id:'openrouter-commentary-'+step,type:'message',phase:'commentary',text:commentary,status:'completed'});history.push(message);const results=[];for(const call of message.tool_calls){const name=call.function?.name;onEvent({id:call.id,type:'toolCall',label:name,status:'running',arguments:call.function?.arguments?.slice(0,16000),detail:call.function?.arguments?.slice(0,16000)});let output;try{const args=JSON.parse(call.function.arguments);output=context&&['context_read','context_list'].includes(name)?JSON.stringify(await context.recover(name,args)):await executeLocalTool(name,args,{cwd,onRequest,signal});}catch(e){if(signal?.aborted)throw e;output='Tool error: '+e.message;}onEvent({id:call.id,type:'toolCall',label:name,status:String(output).startsWith('Tool error:')?'failed':'completed',arguments:call.function?.arguments?.slice(0,16000),output:String(output).slice(0,16000),detail:String(output).slice(0,16000)});const toolResult={role:'tool',tool_call_id:call.id,content:String(output)};history.push(toolResult);results.push(toolResult);}context?.append(message,results);continue;}
   for(const [i,image] of (message.images||[]).entries()){const data=image.image_url?.url;const match=data?.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/);if(match&&match[2].length<28000000)await fs.writeFile(path.join(cwd,`generated-${crypto.randomUUID()}-${i}.${match[1]}`),Buffer.from(match[2],'base64'),{mode:0o600});}
   const text=typeof message.content==='string'?message.content:message.content?.filter(x=>x.type==='text').map(x=>x.text).join('\n');
   return {text:text||((message.images||[]).length?'Created the image.':'Task finished.'),model,usage};
  }
  throw Error('This turn reached 40 tool steps. Continue with a new message.');
  } catch(error) {if(modelRequestPending){usage.usageKnown=false;usage.costKnown=false;}error.usage=structuredClone(usage);throw error;}
 }

 return {status,start,complete,disconnect,run};
}
