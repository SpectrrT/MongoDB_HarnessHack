import fs from 'node:fs/promises';import path from 'node:path';import crypto from 'node:crypto';
export const IDLE_MS=30*60*1000;
export function createIdleReviews({dataDir,launch,getJob,cancel,isBusy,now=Date.now,interval=30000}){
 const rows=new Map(),writes=new Map();let ticking=false;
 const dir=path.join(dataDir,'idle-reviews'),key=(owner,id)=>owner+':'+id;
 const save=async row=>{const id=key(row.owner,row.id),snapshot=JSON.stringify(row),prior=writes.get(id)||Promise.resolve();const task=prior.catch(()=>{}).then(async()=>{await fs.mkdir(dir,{recursive:true,mode:0o700});const name=crypto.createHash('sha256').update(id).digest('hex'),temp=path.join(dir,name+'.'+crypto.randomUUID()+'.tmp');await fs.writeFile(temp,snapshot,{mode:0o600});await fs.rename(temp,path.join(dir,name+'.json'));});writes.set(id,task);try{await task;}finally{if(writes.get(id)===task)writes.delete(id);}};

 const ready=(async()=>{for(const name of await fs.readdir(dir).catch(()=>[])){if(!/^[a-f0-9]{64}\.json$/.test(name))continue;try{const row=JSON.parse(await fs.readFile(path.join(dir,name),'utf8'));if(row.state==='starting')row.state='paused';rows.set(key(row.owner,row.id),row);}catch{}}})();
 const view=row=>row?{enabled:row.enabled,state:row.state,nextAt:row.nextAt,jobId:row.jobId,model:row.latest?.model,effort:row.latest?.effort,error:row.error}: {enabled:false,state:'off'};
 const reconcile=async row=>{if(row?.state==='running'&&row.jobId){const job=await getJob(row.owner,row.jobId);if(job&&job.status!=='running'){row.state=job.status==='completed'?'done':'paused';row.error=job.error;await save(row);}}};
 const api={
  async set(owner,id,enabled){await ready;let row=rows.get(key(owner,id));if(!row){row={owner,id,enabled:false,state:'off',generation:0};rows.set(key(owner,id),row);}row.generation++;row.enabled=enabled;row.nextAt=now()+IDLE_MS;row.state=enabled?'waiting':'off';row.error=null;if(!enabled&&row.jobId)await cancel(owner,row.jobId);await save(row);return view(row);},
  async observe(owner,p){await ready;let row=rows.get(key(owner,p.conversationId));if(!row)return;row.generation++;row.latest={...p,images:[]};row.nextAt=now()+IDLE_MS;row.state=row.enabled?'waiting':'off';row.error=null;await save(row);},
  async touch(owner,id){await ready;const row=rows.get(key(owner,id));if(row?.enabled&&row.state==='waiting'){row.nextAt=now()+IDLE_MS;await save(row);}return view(row);},
  async get(owner,id){await ready;const row=rows.get(key(owner,id));await reconcile(row);return view(row);},
  async reset(owner){await ready;for(const row of rows.values())if(row.owner===owner)await api.set(owner,row.id,false);},
  async tick(){await ready;if(ticking)return;ticking=true;try{for(const row of rows.values()){
   await reconcile(row);if(!row.enabled||row.state!=='waiting'||!row.latest||row.nextAt>now()||isBusy())continue;
   const generation=row.generation;row.state='starting';row.jobId=crypto.randomUUID();await save(row);
   // Exactly one review per idle period; a new user message is needed to arm another.
   const prompt='Sleep review: revisit the user’s goal in this conversation. If useful work remains, do one bounded pass of read-only research or a local draft. Do not invent a new goal, send messages, publish, buy, change accounts, or approve permissions. Stop and report any missing access. If the goal is already satisfied, say so briefly. Summarize what changed and what still needs the user. Keep this review concise.';
   const last=await getJob(row.owner,row.latest.requestId);
   const recent=[...row.latest.messages.slice(-12),...(last?.result?.text?[{role:'assistant',text:last.result.text.slice(0,16000)}]:[])];
   const p={...row.latest,requestId:row.jobId,images:[],background:true,messages:[...recent,{role:'user',text:prompt}]};
   try{await launch(row.owner,p);if(!row.enabled||generation!==row.generation){await cancel(row.owner,row.jobId);continue;}row.state='running';}catch(e){row.state='paused';row.error=e.message;}await save(row);
  }}finally{ticking=false;}},
  close(){clearInterval(timer);},
 };
 const timer=interval?setInterval(()=>{void api.tick().catch(()=>{});},interval):null;timer?.unref();return api;
}
