import { z } from 'zod';
import { codexStatus, runCodex } from './codex.js';
import { modelPrompt } from '../shared/retrieval.js';
const input=z.object({requestId:z.string().uuid(),model:z.string().min(1).max(100),effort:z.enum(["low","medium","high","xhigh","max","ultra"]).default("low"),messages:z.array(z.object({role:z.enum(['user','assistant']),text:z.string().max(4000)})).min(1).max(8),notes:z.array(z.object({id:z.string().max(100),source:z.string().max(80),text:z.string().max(360)})).max(4)}).strict();
export function mountModel(app,{status=codexStatus,run=runCodex,enabled=process.env.NODE_ENV !== 'production'}={}) {
  const jobs=new Map();
  app.use('/api/model',(req,res,next)=>{
    const host=req.get('host') || '', origin=req.get('origin');
    const allowed=/^(127\.0\.0\.1|localhost):(5193|5194|5195)$/;
    if(!enabled || !allowed.test(host) || (origin && !/^http:\/\/(127\.0\.0\.1|localhost):(5193|5194|5195)$/.test(origin)) || req.get('X-Offload-Client')!=='local')return res.status(403).json({error:'The model connection is available only in the local Offload app.'});
    next();
  });
  app.get('/api/model/status',async(req,res)=>res.json(await status()));
  app.post('/api/model/jobs',async(req,res)=>{
    const parsed=input.safeParse(req.body);if(!parsed.success)return res.status(400).json({error:'The request is too long or incomplete.'});
    const p=parsed.data,key=req.workspaceKey+':'+p.requestId;
    if(jobs.has(key))return res.json(publicJob(jobs.get(key)));
    if([...jobs.values()].some(j=>j.status==='running'))return res.status(409).json({error:'A task is already running on this Mac. Wait or stop it first.'});
    const connection=await status();if(!connection.connected)return res.status(409).json({error:connection.message});
    if(!connection.models.some(m=>m.id===p.model))return res.status(400).json({error:'Choose a model available to your account.'});
    if(!connection.models.find(m=>m.id===p.model)?.efforts?.includes(p.effort))return res.status(400).json({error:"This model does not support that reasoning level."});
    // Recheck after authentication so concurrent requests cannot start two jobs.
    if([...jobs.values()].some(j=>j.status==='running'))return res.status(409).json({error:'A task is already running.'});
    if(jobs.size>=100){for(const [k,j] of jobs){if(j.status!=='running'){jobs.delete(k);break;}}}
    const job={id:p.requestId,owner:req.workspaceKey,status:'running',createdAt:Date.now(),controller:new AbortController()};jobs.set(key,job);
    res.status(202).json(publicJob(job));
    run({prompt:modelPrompt(p.messages,p.notes),model:p.model,effort:p.effort,signal:job.controller.signal}).then(result=>{if(job.status==='running'){job.status='completed';job.result=result;}}).catch(e=>{if(job.status==='running'){job.status='failed';job.error=e.message;}});
  });
  app.get('/api/model/jobs/:id',(req,res)=>{const job=jobs.get(req.workspaceKey+':'+req.params.id);if(!job)return res.status(404).json({error:'This run is no longer available. It may have stopped when the server restarted.'});res.json(publicJob(job));});
  app.post('/api/model/jobs/:id/stop',(req,res)=>{const job=jobs.get(req.workspaceKey+':'+req.params.id);if(!job)return res.status(404).json({error:'Run not found.'});if(job.status==='running'){job.status='cancelled';job.controller.abort();}res.json(publicJob(job));});
}
function publicJob({id,status,createdAt,result,error}) {return {id,status,createdAt,result,error};}
