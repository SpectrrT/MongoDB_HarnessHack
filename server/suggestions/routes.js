import { z } from 'zod';
import { RunConflict } from '../harness/store.js';
import { visibleTask } from '../sleep/execution-store.js';
import { eventSchema, identifier } from './history.js';
export function suggestionRoutes(app,{suggestions,sleepTasks=null,sleepTaskWorkerEnabled=false}) {
  const handle=fn=>async(req,res,next)=>{
    if(!suggestions)return res.status(503).json({error:'Connect MongoDB to use saved-session suggestions.'});
    try{await fn(req,res);}catch(error){
      if(error instanceof RunConflict)return res.status(409).json({error:error.message});
      if(error instanceof z.ZodError)return res.status(400).json({error:'Invalid suggestion request.'});
      if(/^(Unknown|Import|Source|Suggestion|Too many|Artifact|Candidate|Active|No earlier)/.test(error.message))return res.status(409).json({error:error.message});
      next(error);
    }
  };
  app.get('/api/suggestions/status',(req,res)=>res.json({configured:!!suggestions,workflow:'recover-context',workflows:['recover-context','meeting-prep','meeting-followup','weekly-routine']}));
  app.get('/api/suggestions',handle(async(req,res)=>res.json(await suggestions.list(req.workspaceKey))));
  app.post('/api/suggestions/import',handle(async(req,res)=>{
    const {events}=z.object({events:z.array(eventSchema).min(1).max(500)}).strict().parse(req.body);
    res.json(await suggestions.importEvents(req.workspaceKey,events));
  }));
  app.post('/api/suggestions/open',handle(async(req,res)=>{
    const {projectId}=z.object({projectId:identifier}).strict().parse(req.body);
    res.json(await suggestions.openProject(req.workspaceKey,projectId));
  }));
  app.post('/api/suggestions/:id/decision',handle(async(req,res)=>{
    const {decision}=z.object({decision:z.enum(['accept','dismiss','snooze','mute'])}).strict().parse(req.body);
    res.json(await suggestions.decide(req.workspaceKey,req.params.id,decision));
  }));
  app.delete('/api/suggestions/sources/:id',handle(async(req,res)=>res.json({removed:await suggestions.forget(req.workspaceKey,req.params.id)})));
  app.get('/api/suggestions/runs/:id',handle(async(req,res)=>{
    const run=await suggestions.run(req.workspaceKey,req.params.id);
    if(!run)return res.status(404).json({error:'Run not found.'});res.json(run);
  }));
  app.post('/api/suggestions/runs/:id/actions/:index/draft',handle(async(req,res)=>{
    const options=z.object({deadline:z.number().finite(),budget:z.number().int().min(1000).max(100000),maxAttempts:z.number().int().min(1).max(3).default(2)}).strict().parse(req.body);
    if(!/^\d+$/.test(req.params.index))return res.status(400).json({error:'Choose a valid action.'});
    const task=await suggestions.draftAction(req.workspaceKey,req.params.id,Number(req.params.index),{...options,store:sleepTasks});
    res.status(202).json({task:visibleTask(task),workerEnabled:sleepTaskWorkerEnabled,
      completionMeaning:'Local draft task created. The original meeting action has not been completed.'});
  }));
  app.post('/api/suggestions/runs/:id/cancel',handle(async(req,res)=>{
    const run=await suggestions.cancel(req.workspaceKey,req.params.id);
    if(!run)return res.status(404).json({error:'Run not found.'});res.json(run);
  }));
  app.get('/api/suggestions/artifacts/:id',handle(async(req,res)=>{
    const artifact=await suggestions.getArtifact(req.workspaceKey,req.params.id);
    if(!artifact)return res.status(404).json({error:'Artifact not found.'});
    res.set({'Content-Type':'text/markdown; charset=utf-8','Content-Disposition':`attachment; filename="${artifact.filename}"`}).send(artifact.text);
  }));
  app.get('/api/suggestions/policy',handle(async(req,res)=>res.json(await suggestions.policy.list(req.workspaceKey))));
  app.post('/api/suggestions/policy/evolve',handle(async(req,res)=>res.json(await suggestions.evolve(req.workspaceKey))));
  app.post('/api/suggestions/policy/rollback',handle(async(req,res)=>{
    const {expectedActiveId}=z.object({expectedActiveId:z.string().uuid()}).strict().parse(req.body);
    res.json(await suggestions.policy.rollback(req.workspaceKey,expectedActiveId));
  }));
}
