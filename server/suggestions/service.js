import { createHash, randomUUID } from 'node:crypto';
import { meetingActionDraftInput, sourceFingerprint } from './action-draft.js';
import { HarnessStore, RunConflict } from '../harness/store.js';
import { PolicyStore } from '../harness/policy.js';
import { tick } from '../harness/worker.js';
import { digest, normalizeEvent } from './history.js';
import { suggestionSettings, eligibleOpportunity } from '../../shared/suggestion-policy.js';
import { proactiveOpportunities, proactiveDraft, proactiveArtifactLines } from './proactive.js';
import { comparePolicies, HELD_OUT_OPPORTUNITIES, proposeSuggestionEdit } from './evaluation.js';

class PersonalRuns extends HarnessStore {
  constructor(db, options) { super(db,options); this.runs=db.collection('personal_task_runs'); }
  async claimSelected(worker,workspace,id){
    const at=new Date();
    return this.runs.findOneAndUpdate({_id:id,workspace,status:{$in:['queued','running']},availableAt:{$lte:at},leaseUntil:{$lte:at}},
      {$set:{status:'running',worker,leaseToken:randomUUID(),leaseUntil:new Date(+at+this.leaseMs)},$inc:{attempts:1}},
      {returnDocument:'after',includeResultMetadata:false});
  }
}
const hours=(a,b)=>b?Math.max(0,(+a-+b)/3600000):1e9;
const visibleRun = run => {
  if(!run)return null;
  const {worker,leaseToken,fingerprint,workspace,...visible}=run;return visible;
};

export async function createPersonalSuggestions({db,clock=()=>new Date(),compactor=null,leaseMs=30000}={}) {
  const events=db.collection('personal_events'), cards=db.collection('personal_suggestions'),
    prefs=db.collection('personal_suggestion_preferences'), feedback=db.collection('personal_suggestion_feedback'),
    projects=db.collection('personal_projects');
  const policy=new PolicyStore(db), runs=new PersonalRuns(db,{leaseMs});
  await policy.initialize();await runs.initialize();
  await events.createIndex({workspace:1,projectId:1,active:1,timestamp:-1});
  await events.createIndex({workspace:1,family:1,active:1,timestamp:-1});
  await events.createIndex({workspace:1,textHash:1});
  await cards.createIndex({workspace:1,status:1,createdAt:-1});
  await feedback.createIndex({workspace:1,kind:1,at:-1});
  const now=()=>new Date(clock());
  const scoped=(workspace,projectId)=>digest([workspace,projectId]);
  async function importEvents(workspace,raw) {
    if(!Array.isArray(raw)||raw.length>500)throw Error('Import at most 500 events per batch.');
    // Validate the entire batch before writing anything.
    const normalized=raw.map(normalizeEvent);
    if(normalized.some(e=>e.timestamp>new Date(+now()+300000)))throw Error('Source timestamp is in the future.');
    let inserted=0,unchanged=0;const touched=new Set();
    for(const e of normalized){
      const id=digest([workspace,e.origin,e.sourceId]);
      const existing=await events.findOne({_id:id});
      if(existing){if(existing.textHash!==e.textHash||existing.projectId!==e.projectId||existing.kind!==e.kind||+existing.timestamp!==+e.timestamp||existing.locator!==e.locator||existing.sessionId!==e.sessionId)throw Error('Source ID already exists with different content.');unchanged++;continue;}
      const duplicate=await events.findOne({workspace,textHash:e.textHash,active:true});
      await events.updateOne({_id:id},{$setOnInsert:{...e,_id:id,workspace,active:true,duplicateOf:duplicate?._id||null,importedAt:now()}},{upsert:true});
      await projects.updateOne({_id:scoped(workspace,e.projectId)},{$set:{workspace,projectId:e.projectId,title:e.projectTitle,updatedAt:now()}},{upsert:true});
      inserted++;touched.add(e.projectId);
    }
    for(const projectId of touched)await cards.updateMany({workspace,projectId,status:{$in:['pending','snoozed']}},{$set:{status:'expired',reason:'Source evidence changed.'}});
    return {inserted,unchanged,projects:[...touched]};
  }
  async function sourceSnapshot(workspace,projectId,limit=20){
    const filter={workspace,projectId,active:true};
    const [protectedRows,recent]=await Promise.all([
      events.find({...filter,protectedRecord:true},{sort:{timestamp:-1,_id:1},limit:31}).toArray(),
      events.find(filter,{sort:{timestamp:-1,_id:1},limit}).toArray(),
    ]);
    if(protectedRows.length>30)throw Error('Too many protected sources. Narrow the project before running.');
    const rows=[...new Map([...protectedRows,...recent].map(e=>[e._id,e])).values()].sort((a,b)=>+a.timestamp-+b.timestamp||a._id.localeCompare(b._id));
    return {rows,revision:digest(rows.map(e=>[e._id,e.textHash]))};
  }
  async function facts(workspace,projectId,settings){
    const [snapshot,support,recent,preference]=await Promise.all([
      sourceSnapshot(workspace,projectId,settings.evidenceLimit),
      events.find({workspace,family:'recover-context',active:true,duplicateOf:null},{sort:{timestamp:-1},limit:500}).toArray(),
      feedback.findOne({workspace,projectId,kind:'recover-context'},{sort:{at:-1}}),
      prefs.findOne({_id:scoped(workspace,projectId)}),
    ]);
    const distinctSupport=[...new Map(support.map(e=>[e.textHash,e])).values()];
    return {snapshot,support:distinctSupport,features:{kind:'recover-context',trigger:'project-reopened',sourceCount:snapshot.rows.length,
      sameProject:true,active:true,completed:false,muted:preference?.muted===true,snoozed:preference?.snoozedUntil>now(),
      independentSessions:new Set(distinctSupport.map(e=>e.sessionId)).size,independentDays:new Set(distinctSupport.map(e=>e.timestamp.toISOString().slice(0,10))).size,
      hoursSinceDecision:hours(now(),recent?.at)}};
  }
  async function openProject(workspace,projectId){
    const [project,active]=await Promise.all([projects.findOne({_id:scoped(workspace,projectId)}),policy.active(workspace)]);
    if(!project)throw Error('Unknown project.');
    const settings=suggestionSettings(active);
    const {snapshot,support,features}=await facts(workspace,projectId,settings);
    const id=digest([workspace,projectId,'recover-context',snapshot.revision]);
    const existing=await cards.findOne({_id:id});
    if(existing)return {suggestion:['pending','snoozed'].includes(existing.status)&&existing.visibleAt<=now()&&existing.expiresAt>now()&&eligibleOpportunity(features,settings)?existing:null,policyVersion:active.version};
    if(!eligibleOpportunity(features,settings))return {suggestion:null,policyVersion:active.version};
    const doc={_id:id,workspace,projectId,projectTitle:project.title,kind:'recover-context',title:`Recover context for ${project.title}`,
      reason:`You requested context recovery in ${features.independentSessions} distinct sessions. This project has ${snapshot.rows.length} saved source notes.`,
      features,revision:snapshot.revision,sourceIds:snapshot.rows.map(e=>e._id),
      evidence:support.slice(0,8).map(e=>({id:e._id,sessionId:e.sessionId,date:e.timestamp,locator:e.locator})),
      requiredScopes:['saved-context.read','artifact.write'],policyId:active._id,policyVersion:active.version,
      status:'pending',createdAt:now(),visibleAt:now(),expiresAt:new Date(+now()+86400000)};
    await cards.updateOne({_id:id},{$setOnInsert:doc},{upsert:true});
    return {suggestion:await cards.findOne({_id:id}),policyVersion:active.version};
  }
  async function proactiveFor(workspace,projectId,{preferences=true}={}){
    const rows=await events.find({workspace,projectId,active:true},{sort:{timestamp:-1,_id:1},limit:501}).toArray();
    if(rows.length>500)return [];
    const preference=await prefs.findOne({_id:scoped(workspace,projectId)});
    if(preferences&&(preference?.muted||preference?.snoozedUntil>now()))return [];
    return proactiveOpportunities(rows,now());
  }
  async function refreshProactive(workspace){
    const active=await policy.active(workspace);
    const projectList=await projects.find({workspace},{sort:{updatedAt:-1},limit:100}).toArray();
    for(const project of projectList)for(const candidate of await proactiveFor(workspace,project.projectId)){
      const id=digest([workspace,project.projectId,candidate.kind,candidate.triggerId,candidate.revision]);
      const {sources,...details}=candidate;
      await cards.updateOne({_id:id},{$setOnInsert:{...details,_id:id,workspace,projectId:project.projectId,projectTitle:project.title,
        sourceIds:sources.map(row=>row._id),requiredScopes:['saved-context.read','artifact.write'],
        policyId:active._id,policyVersion:active.version,status:'pending',createdAt:now(),visibleAt:now()}},{upsert:true});
      await cards.updateOne({_id:id,status:'expired',reason:'Source evidence changed.'},{$set:{status:'pending',visibleAt:now(),expiresAt:candidate.expiresAt},$unset:{reason:''}});
    }
  }
  async function list(workspace){
    await refreshProactive(workspace);
    const active=await policy.active(workspace),settings=suggestionSettings(active);
    const suggestions=await cards.find({workspace,status:{$in:['pending','snoozed']},visibleAt:{$lte:now()},expiresAt:{$gt:now()}},{sort:{createdAt:-1},limit:settings.maxCards}).toArray();
    const projectList=await projects.find({workspace},{sort:{updatedAt:-1},limit:100}).toArray();
    const runList=await runs.runs.find({workspace},{sort:{createdAt:-1},limit:20}).toArray();
    return {suggestions,projects:projectList,policy:{id:active._id,version:active.version,settings},runs:runList.map(visibleRun),compaction:compactor?.name||'off'};
  }
  async function feedbackOnce(item,decision){
    await feedback.updateOne({_id:digest([item._id,decision])},{$setOnInsert:{workspace:item.workspace,projectId:item.projectId,kind:item.kind,
      suggestionId:item._id,decision,features:item.features,at:now()}},{upsert:true});
  }
  async function decide(workspace,id,decision){
    if(!['accept','dismiss','snooze','mute'].includes(decision))throw Error('Unknown decision.');
    let item=await cards.findOne({_id:id,workspace});if(!item)throw Error('Unknown suggestion.');
    if(item.status==='accepted'&&decision==='accept')return enqueue(item);
    if(!['pending','snoozed'].includes(item.status))return {suggestion:item,run:null};
    if(item.expiresAt<=now())throw Error('Suggestion expired. Reopen the project.');
    if(decision==='accept'){
      const active=await policy.active(workspace),settings=suggestionSettings(active);
      if(item.kind==='recover-context'){
        const {snapshot,features}=await facts(workspace,item.projectId,settings);
        if(snapshot.revision!==item.revision||!eligibleOpportunity(features,settings))throw Error('Suggestion evidence or policy changed. Reopen the project.');
      } else if(!(await proactiveFor(workspace,item.projectId)).some(candidate=>candidate.kind===item.kind&&candidate.triggerId===item.triggerId&&candidate.revision===item.revision)){
        throw Error('Suggestion evidence or timing changed. Refresh the suggested tasks.');
      }
      item=await cards.findOneAndUpdate({_id:id,workspace,status:{$in:['pending','snoozed']}},{$set:{status:'accepted',acceptedAt:now(),
        executionInput:{kind:item.kind,title:item.title,triggerId:item.triggerId,actionSourceId:item.actionSourceId,meeting:item.meeting,nextAt:item.nextAt,
          completionMeaning:item.completionMeaning,outputLabel:item.outputLabel,evidenceLimit:settings.evidenceLimit,projectId:item.projectId,projectTitle:item.projectTitle,sourceIds:item.sourceIds,revision:item.revision,
          suggestionId:item._id,policyId:active._id,policyVersion:active.version}}},{returnDocument:'after'});
      if(!item)return {suggestion:await cards.findOne({_id:id,workspace}),run:null};
      return enqueue(item);
    }
    const status={dismiss:'dismissed',snooze:'snoozed',mute:'muted'}[decision];
    item=await cards.findOneAndUpdate({_id:id,workspace,status:{$in:['pending','snoozed']}},{$set:{status,decidedAt:now(),
      ...(decision==='snooze'?{visibleAt:new Date(+now()+86400000),expiresAt:item.kind==='recover-context'?new Date(+now()+172800000):item.expiresAt}:{})}},{returnDocument:'after'});
    if(!item)return {suggestion:await cards.findOne({_id:id,workspace}),run:null};
    if(decision==='mute')await cards.updateMany({workspace,projectId:item.projectId,status:{$in:['pending','snoozed']}},{$set:{status:'muted'}});
    if(decision==='mute')await prefs.updateOne({_id:scoped(workspace,item.projectId)},{$set:{workspace,projectId:item.projectId,muted:true}},{upsert:true});
    if(decision==='snooze')await prefs.updateOne({_id:scoped(workspace,item.projectId)},{$set:{workspace,projectId:item.projectId,snoozedUntil:new Date(+now()+86400000)}},{upsert:true});
    await feedbackOnce(item,decision);if(decision==='dismiss'&&item.kind==='recover-context')await evolve(workspace);
    return {suggestion:item,run:null};
  }
  async function enqueue(item){
    const run=await runs.enqueue(item.workspace,item._id,item.executionInput);
    await cards.updateOne({_id:item._id},{$set:{runId:run._id}});
    if(item.kind!=='recover-context'){
      // These bounded drafts use no model, network, file writes or external effects.
      // A retry resumes the same four fenced checkpoints, including after process restart.
      for(let i=0;i<4;i++){
        const current=await runs.get(item.workspace,run._id);
        if(current.status!=='queued')break;
        await workOnce(`local-draft:${randomUUID()}`,{workspace:item.workspace,id:run._id});
      }
    }
    return {suggestion:await cards.findOne({_id:item._id}),run:visibleRun(await runs.get(item.workspace,run._id))};
  }
  async function sourceRows(run){
    const rows=await events.find({workspace:run.workspace,projectId:run.input.projectId,active:true,_id:{$in:run.input.sourceIds}},{sort:{timestamp:1,_id:1}}).toArray();
    if(rows.length!==run.input.sourceIds.length)throw Error('A source was withdrawn. Reopen the project to create a new task.');
    if(run.input.kind!=='recover-context'){
      const candidates=await proactiveFor(run.workspace,run.input.projectId,{preferences:false});
      if(!candidates.some(candidate=>candidate.kind===run.input.kind&&candidate.triggerId===run.input.triggerId&&candidate.revision===run.input.revision))
        throw Error('Source evidence or meeting timing changed. Start a fresh suggestion.');
    } else {
      const snapshot=await sourceSnapshot(run.workspace,run.input.projectId,run.input.evidenceLimit||20);
      if(snapshot.revision!==run.input.revision)throw Error('Source evidence changed. Reopen the project to create a new task.');
    }
    return rows;
  }
  const workflow={steps:['context','draft','verify','artifact'],async executeStep(run){
    const rows=await sourceRows(run),step=this.steps[run.checkpoint];
    if(step==='context'){
      const units=rows.map(e=>({id:e._id,text:e.text,pinned:e.protectedRecord?'user_constraint':null}));
      const selected=compactor&&run.input.kind==='recover-context'?await compactor.select({runId:run._id,goal:`Recover saved decisions and requests for ${run.input.projectTitle}; preserve constraints and corrections.`,units,revision:run.input.revision}):{units,metrics:{source:'extractive',decisionCalls:0,inputTokens:0,outputTokens:0}};
      return {records:selected.units.map(u=>({id:u.id,text:u.text})),metrics:selected.metrics,policyVersion:run.input.policyVersion};
    }
    if(step==='draft'&&run.input.kind!=='recover-context')return proactiveDraft(run.input,run.outputs.context.records);
    if(step==='draft')return {title:`Recovered context: ${run.input.projectTitle}`,claims:run.outputs.context.records.map(r=>({text:r.text,sourceId:r.id}))};
    if(step==='verify'){
      const draft=run.outputs.draft,byId=new Map(rows.map(r=>[r._id,r]));
      const sourceIntegrity=draft.claims.length>0&&draft.claims.every(c=>byId.get(c.sourceId)?.text===c.text);
      const protectedRecall=rows.filter(r=>r.protectedRecord).every(r=>draft.claims.some(c=>c.sourceId===r._id&&c.text===r.text));
      if(run.input.kind!=='recover-context'){
        const expected=proactiveDraft(run.input,rows.map(row=>({id:row._id,text:row.text})));
        if(JSON.stringify(draft.actionItems)!==JSON.stringify(expected.actionItems)||draft.claims.length!==rows.length)
          throw Error('Action checklist failed its source checks.');
      }
      const unique=new Set(draft.claims.map(c=>c.sourceId)).size===draft.claims.length;
      if(!sourceIntegrity||!protectedRecall||!unique)throw Error('Recovered context failed its source or constraint checks.');
      return {passed:true,sourceIntegrity,protectedRecall,unique,claims:draft.claims.length,checker:'exact-source-quotes-v1'};
    }
    if(step==='artifact'){
      if(run.outputs.verify.passed!==true)throw Error('Cannot publish an unverified artifact.');
      const byId=new Map(rows.map(r=>[r._id,r]));
      const text=[...(run.input.kind==='recover-context'?[`# ${run.outputs.draft.title}`,'','These are recovered source notes. Requests are not claims of completed work.','']:proactiveArtifactLines(run.input,run.outputs.draft)),
        ...run.outputs.draft.claims.flatMap(c=>{const s=byId.get(c.sourceId);return [`## ${s.timestamp.toISOString().slice(0,10)}: ${s.kind}`,'',c.text,'',`Source: ${s.locator}`,`Source ID: ${c.sourceId}`,''];})].join('\n');
      const artifact={_id:run._id,workspace:run.workspace,runId:run._id,projectId:run.input.projectId,
        sourceIds:run.input.sourceIds,filename:`${run.input.kind}-${run.input.projectId}.md`,text,sha256:createHash('sha256').update(text).digest('hex'),verification:run.outputs.verify,createdAt:now()};
      return artifact;
    }
    throw Error('Unknown context workflow step.');
  }};
  async function workOnce(worker,selected){
    const store=selected?Object.assign(Object.create(runs),{claim:worker=>runs.claimSelected(worker,selected.workspace,selected.id)}):runs;
    const run=await tick(store,null,worker,{},workflow);
    if(run?.status==='completed'&&run.input.kind==='recover-context')await feedback.updateOne({_id:digest([run.input.suggestionId,'verified'])},{$setOnInsert:{workspace:run.workspace,
      projectId:run.input.projectId,kind:run.input.kind,decision:'verified',suggestionId:run.input.suggestionId,runId:run._id,at:now(),
      features:(await cards.findOne({_id:run.input.suggestionId}))?.features}},{upsert:true});
    return run;
  }
  async function recoverAccepted(){
    const pending=await cards.find({status:'accepted',runId:{$exists:false}},{limit:100}).toArray();
    for(const item of pending)await enqueue(item);
    return pending.length;
  }
  async function getArtifact(workspace,id){
    const run=await runs.get(workspace,id);
    if(!run||run.status!=='completed')return null;
    const artifact=run.outputs.artifact;if(!artifact)return null;
    await sourceRows(run);
    const active=await events.countDocuments({workspace,projectId:artifact.projectId,active:true,_id:{$in:artifact.sourceIds}});
    if(active!==artifact.sourceIds.length)throw Error('Artifact withdrawn because a source was removed.');
    return artifact;
  }
  async function draftAction(workspace,id,index,{store,deadline,budget,maxAttempts=2}){
    if(!store)throw new RunConflict('Sleep task storage is unavailable. Connect MongoDB before creating a local draft.');
    const run=await runs.get(workspace,id);
    if(!run||run.status!=='completed'||run.input.kind!=='meeting-followup')throw new RunConflict('Choose a completed meeting checklist first.');
    await sourceRows(run);
    const action=run.outputs.draft.actionItems[index];
    if(!Number.isSafeInteger(index)||index<0||!action)throw new RunConflict('Unknown meeting action.');
    const requestKey=`meeting-action:${digest([id,index])}`;
    const existing=await store.tasks.findOne({workspace,requestKey});
    if(existing){await store.validateSource(existing);return await store.get(workspace,existing._id);}
    const rows=await sourceRows(run);
    const snapshot=await events.find({workspace,projectId:run.input.projectId,active:true},{sort:{timestamp:1,_id:1},limit:501}).toArray();
    if(snapshot.length>500)throw new RunConflict('Too many project sources. Narrow the meeting project first.');
    const input=meetingActionDraftInput({run,action,rows,deadline,budget,maxAttempts});
    let task;
    try{task=await store.enqueue(workspace,requestKey,input,{sourceContract:{type:'meeting-action',suggestionRunId:id,actionIndex:index,
      projectId:run.input.projectId,sourceIds:rows.map(row=>row._id),revision:sourceFingerprint(snapshot)}});}
    catch(error){
      if(!(error instanceof RunConflict))throw error;
      task=await store.tasks.findOne({workspace,requestKey});if(!task)throw error;
    }
    await store.validateSource(task);
    return await store.get(workspace,task._id);
  }
  async function cancel(workspace,id){
    const run=await runs.runs.findOneAndUpdate({_id:id,workspace,status:{$in:['queued','running','paused_for_auth']}},
      {$set:{status:'cancelled',error:'Cancelled by owner.',outputs:{},updatedAt:now()},$unset:{worker:'',leaseToken:'',leaseUntil:''}},{returnDocument:'after'});
    return visibleRun(run||await runs.get(workspace,id));
  }
  async function forget(workspace,id){
    const event=await events.findOne({_id:id,workspace});if(!event)return false;
    await events.updateOne({_id:id,workspace},{$set:{active:false,withdrawnAt:now()},$unset:{text:''}});
    await cards.updateMany({workspace,sourceIds:id,status:{$in:['pending','snoozed']}},{$set:{status:'expired'}});
    const affected=await runs.runs.find({workspace,'input.sourceIds':id},{projection:{_id:1}}).toArray();
    await runs.runs.updateMany({workspace,'input.sourceIds':id},{$set:{status:'cancelled',error:'Source withdrawn.',outputs:{}}});
    const ids=affected.map(r=>r._id);
    await db.collection('context_archive').deleteMany({runId:{$in:ids}});
    await db.collection('context_decisions').deleteMany({runId:{$in:ids}});
    return true;
  }
  async function evolve(workspace){
    const parent=await policy.active(workspace),settings=suggestionSettings(parent);
    const training=await feedback.find({workspace,kind:'recover-context',decision:'dismiss'},{sort:{at:-1},limit:20}).toArray();
    const next=proposeSuggestionEdit(settings,training);if(!next)return {skipped:'Need two recorded dismissals or policy is already at its bound.'};
    const sleepId=`suggestions:${digest([parent._id,training.map(f=>f._id)])}`;
    const candidate=await policy.propose(workspace,parent,{context:{suggestions:next}},
      {sleepId,evidence:training.map(f=>f._id),reason:'Repeated dismissals propose a longer suggestion cooldown.'});
    const trainCases=training.map(f=>({id:f._id,features:f.features,useful:false}));
    const train=comparePolicies(settings,next,trainCases),heldOut=comparePolicies(settings,next,HELD_OUT_OPPORTUNITIES);
    const accepted=train.improved&&heldOut.improved;
    await policy.policies.updateOne({_id:candidate._id},{$set:{prediction:{fewerUnwantedSuggestions:true,noUsefulSuggestionRegression:true},
      evaluation:{train,heldOut,accepted,method:'Recorded feedback train split; fixed evaluator-only held-out opportunities.'}}});
    if(accepted)await policy.promote(workspace,candidate._id,parent._id);
    else await policy.reject(candidate._id,'Candidate did not improve both splits without regressions.');
    return {accepted,candidateId:candidate._id,parentVersion:parent.version,candidateVersion:candidate.version,train,heldOut};
  }
  return {db,runs,policy,importEvents,openProject,list,decide,workOnce,recoverAccepted,getArtifact,forget,evolve,cancel,draftAction,
    run:async(workspace,id)=>visibleRun(await runs.get(workspace,id))};
}
