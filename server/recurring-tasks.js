import fs from 'node:fs/promises';import path from 'node:path';import crypto from 'node:crypto';
export function nextOccurrence(at,repeat,now){
 if(repeat==='once')return null;
 const date=new Date(at);let count=0;
 do{if(repeat==='daily')date.setDate(date.getDate()+1);else if(repeat==='weekly')date.setDate(date.getDate()+7);else{const day=date.getDate();date.setDate(1);date.setMonth(date.getMonth()+1);const end=new Date(date.getFullYear(),date.getMonth()+1,0).getDate();date.setDate(Math.min(day,end));}}while(date.getTime()<=now&&++count<4000);
 return date.getTime();
}
export function createRecurringTasks({dataDir,launch,getJob,isBusy,now=Date.now,interval=15000}){
 const rows=new Map(),dir=path.join(dataDir,'recurring-tasks');let ticking=false;let writes=Promise.resolve();
 const key=(owner,id)=>owner+':'+id;
 const save=row=>{const snapshot=JSON.stringify(row);writes=writes.catch(()=>{}).then(async()=>{await fs.mkdir(dir,{recursive:true,mode:0o700});const target=path.join(dir,crypto.createHash('sha256').update(key(row.owner,row.id)).digest('hex')+'.json'),temp=target+'.tmp';await fs.writeFile(temp,snapshot,{mode:0o600});await fs.rename(temp,target);});return writes;};
 const ready=(async()=>{for(const name of await fs.readdir(dir).catch(()=>[])){if(!/^[a-f0-9]{64}\.json$/.test(name))continue;try{const row=JSON.parse(await fs.readFile(path.join(dir,name),'utf8'));if(row.status==='starting'){row.status='paused';row.error='The service restarted before the run was confirmed. Review before resuming.';}rows.set(key(row.owner,row.id),row);}catch{}}})();
 const view=row=>{const {owner,context,...value}=row;return value;};
 const api={
  async list(owner){await ready;return [...rows.values()].filter(r=>r.owner===owner).map(view).sort((a,b)=>b.createdAt-a.createdAt);},
  async create(owner,input){await ready;if([...rows.values()].filter(r=>r.owner===owner).length>=40)throw Error('Keep up to 40 scheduled tasks.');const row={...input,id:crypto.randomUUID(),owner,status:'paused',createdAt:now(),history:[]};rows.set(key(owner,row.id),row);await save(row);return view(row);},
  async update(owner,id,action,context){await ready;const row=rows.get(key(owner,id));if(!row)throw Error('Task not found.');if(action==='activate'){if(!context?.messages?.length)throw Error('Finish planning the task first.');row.context=context;row.status='scheduled';row.error=null;if(row.nextAt<now())row.nextAt=now();}else row.status='paused';await save(row);return view(row);},
  async tick(){await ready;if(ticking)return;ticking=true;try{for(const row of rows.values()){
   if(row.jobId){const job=await getJob(row.owner,row.jobId);if(job&&job.status!=='running'&&row.history[0]?.id!==job.id){row.history.unshift({id:job.id,status:job.status,at:now(),error:job.error});row.history=row.history.slice(0,20);if(job.status!=='completed'){row.status='paused';row.error=job.error||'The run stopped. Review before resuming.';}row.jobId=null;await save(row);}}
   if(row.status!=='scheduled'||row.jobId||!row.context||row.nextAt>now()||isBusy(row.owner,row.id))continue;
   row.status='starting';row.jobId=crypto.randomUUID();await save(row);
   try{await launch(row.owner,{...row.context,conversationId:row.id,requestId:row.jobId,background:true,images:[],messages:[...row.context.messages.slice(-12),{role:'user',text:'Run the scheduled task now using the agreed plan. Do not invent data. Report results and any missing access. Do not send messages, buy, publish or change external accounts unless the agreed plan explicitly authorizes that action. Task: '+row.brief}]});row.nextAt=nextOccurrence(row.nextAt,row.repeat,now());if(row.status==='starting')row.status=row.nextAt?'scheduled':'finished';}catch(e){row.status='paused';row.error=e.message;row.jobId=null;}await save(row);
  }}finally{ticking=false;}},
  close(){clearInterval(timer);},
 };
 const timer=interval?setInterval(()=>void api.tick().catch(()=>{}),interval):null;timer?.unref();return api;
}
