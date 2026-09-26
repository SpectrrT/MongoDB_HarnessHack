import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {randomUUID} from 'node:crypto';
import {createMemoryDb, ensureIndexes} from '../rem/db/index.js';
import {createContextCompactor} from '../server/context/compaction.js';
import {createJevScorer} from '../server/context/jev.js';
const args=process.argv.slice(2), live=args.includes('--live'), atlas=args.includes('--atlas');
const value=flag=>args.includes(flag)?args[args.indexOf(flag)+1]:null;
const output=value('--output');
if(live&&!process.env.TYPESAFE_API_KEY&&!process.env.OPENROUTER_API_KEY){
  try{process.env.TYPESAFE_API_KEY=(await fs.readFile(path.join(os.homedir(),'.typesafe/key'),'utf8')).trim();}catch{}
}
if(live&&!process.env.TYPESAFE_API_KEY&&!process.env.OPENROUTER_API_KEY)throw Error('Configure a Jev API key.');
const db=atlas?await (await import('../rem/db/mongo.js')).createMongoDb({dbName:'sleep_context_eval'}):createMemoryDb();
await ensureIndexes(db,{search:false});
const scorer=live?createJevScorer():{name:'fixture scorer, not Jev',async score({units}){return {scores:units.map(u=>({id:u.id,probability:u.id.startsWith('noise')?0.02:0.98})),usage:{inputTokens:0,outputTokens:0,cost:0}};}};
const noise=Array.from({length:12},(_,i)=>({id:`noise-${i}`,text:`Office social newsletter ${i}. ${'The cafeteria serves lentil soup and fresh bread on Tuesdays. The gardening group has arranged flowers in the lobby. Weekend film club recommendations include comedies and documentaries. '.repeat(3)}`}));
// Required record ids and expected answers belong only to the evaluator, never to Jev.
const cases=[
  {id:'release',goal:'Return JSON with owner and ready for the Orion release. A release awaiting a security signature is not ready.',facts:[{id:'f1',text:'Orion release coordinator: Priya Raman.'},{id:'f2',text:'The Orion security signature is still awaiting review.'}],expected:{owner:'Priya Raman',ready:false}},
  {id:'meeting',goal:'Return JSON with start and timezone for the customer review meeting.',facts:[{id:'f1',text:'The customer review starts at 09:30.'},{id:'f2',text:'For the customer review, the time zone is America/New_York.'}],expected:{start:'09:30',timezone:'America/New_York'}},
  {id:'retry',goal:'Return JSON with key and delivered from the invoice delivery receipt. Reuse its key when reconciling delivery.',facts:[{id:'f1',text:'Invoice delivery receipt uses idempotency key INV-4827.'},{id:'f2',text:'Delivery receipt for INV-4827 confirms delivered=true.'}],expected:{key:'INV-4827',delivered:true}},
  {id:'correction',goal:'Return JSON with region and approval for the data export.',facts:[{id:'f1',text:'CORRECTION: The export must use eu-west-1, never us-east-1.'},{id:'f2',text:'The export approval status is pending.'}],expected:{region:'eu-west-1',approval:'pending'}},
];
if(args.includes('--stress')) cases.splice(0,cases.length,
  {id:'cross-batch-reference',goal:'Return JSON with region for the Atlas migration, following its routing plan.',facts:[{id:'f1',text:'The Atlas migration follows routing plan J17.'},{id:'f2',text:'Routing plan J17 assigns eu-central-1.'}],expected:{region:'eu-central-1'}},
  {id:'updated-decision',goal:'Return JSON with owner for ticket Q62 using the most recent dated assignment.',facts:[{id:'f1',text:'2026-09-24: Q62 is assigned to Rowan.'},{id:'f2',text:'2026-09-26: Q62 is assigned to Avery.'}],expected:{owner:'Avery'}},
  {id:'negative-permission',required:['f2'],goal:'Return JSON with canSend for the draft. Use the permission record.',facts:[{id:'f1',text:'The email draft is ready for proofreading.'},{id:'f2',text:'Permission record: sending email is not authorized.'}],expected:{canSend:false}},
  {id:'exact-identifier',goal:'Return JSON with artifact and sha for the approved rollback bundle.',facts:[{id:'f1',text:'Approved rollback artifact: bundle-a41.zip.'},{id:'f2',text:'Approved rollback bundle sha: 7b31a90c4d20.'}],expected:{artifact:'bundle-a41.zip',sha:'7b31a90c4d20'}}
);
const report={createdAt:new Date().toISOString(),mode:live?'live Jev':'deterministic fixtures',database:atlas?'Atlas sleep_context_eval':'in-memory',scope:'Synthetic retention and paired exact-answer evaluation. No billion-token or overnight claim.',scorer:scorer.name,cases:[]};
const model=value('--answer-model');
const repeats=Number(value('--repeats')||1);
if(!Number.isInteger(repeats)||repeats<1||repeats>10)throw Error('Repeats must be between 1 and 10.');
async function answer(goal,units){
 const start=performance.now();
 const response=await fetch('https://openrouter.ai/api/v1/chat/completions',{method:'POST',signal:AbortSignal.timeout(60000),headers:{Authorization:`Bearer ${process.env.OPENROUTER_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model,max_tokens:200,temperature:0,messages:[{role:'system',content:'Answer using only the supplied records. Output only the requested JSON object, without markdown.'},{role:'user',content:JSON.stringify({goal,records:units.map(u=>u.text)})}]})});
 if(!response.ok)throw Error(`Answer model HTTP ${response.status}`);
 const body=await response.json();let result;
 try{result=JSON.parse(body.choices?.[0]?.message?.content);}catch{result=null;}
 return {answer:result,inputTokens:body.usage?.prompt_tokens??null,outputTokens:body.usage?.completion_tokens??null,cost:body.usage?.cost??null,latencyMs:Math.round(performance.now()-start)};
}
function exact(actual,expected){return actual&&Object.keys(actual).length===Object.keys(expected).length&&Object.entries(expected).every(([k,v])=>actual[k]===v);}
try{
 for(const scenario of cases){
  const units=[scenario.facts[0],...noise.slice(0,6),scenario.facts[1],...noise.slice(6),{id:'recent',text:'Prepare the requested result from the recorded evidence.'}];
  const runId=`context-eval-${scenario.id}-${randomUUID()}`, options={db,scorer,budgetChars:1600,recentCount:1};
  const started=performance.now();
  try{
   const selected=await createContextCompactor(options).select({runId,goal:scenario.goal,units});
   const elapsed=Math.round(performance.now()-started);
   const restarted=createContextCompactor(options), again=await restarted.select({runId,goal:scenario.goal,units});
   const recovered=await restarted.read({runId,id:'noise-0'});
   const full=units.map(u=>u.id),selectedIds=selected.units.map(u=>u.id),tail=units.slice(-3).map(u=>u.id);
   const required=scenario.required||scenario.facts.map(f=>f.id);
   const row={id:scenario.id,runId,goal:scenario.goal,requiredIds:required,retainedIds:selectedIds,fullRecall:required.every(id=>full.includes(id)),tailRecall:required.every(id=>tail.includes(id)),jevRecall:required.every(id=>selectedIds.includes(id)),metrics:selected.metrics,latencyMs:elapsed,restartDecisionCalls:again.metrics.decisionCalls,archiveRecovery:recovered.text===noise[0].text,decisions:selected.decisions};
   if(model){
    try{
     if(!process.env.OPENROUTER_API_KEY)throw Error('Answer model key unavailable');
     row.baseline=await answer(scenario.goal,units);row.compacted=await answer(scenario.goal,selected.units);
     row.baseline.pass=Boolean(exact(row.baseline.answer,scenario.expected));row.compacted.pass=Boolean(exact(row.compacted.answer,scenario.expected));
     const measured=selected.metrics.usageKnown&&[row.baseline,row.compacted].every(r=>Number.isFinite(r.inputTokens)&&Number.isFinite(r.outputTokens));
     row.baselineTotal=measured?row.baseline.inputTokens+row.baseline.outputTokens:null;
     row.compactedTotal=measured?row.compacted.inputTokens+row.compacted.outputTokens+selected.metrics.inputTokens+selected.metrics.outputTokens:null;
     if(repeats>1){
      row.repeated={callsPerPath:repeats,baseline:[row.baseline],compacted:[row.compacted],decisionCallsAfterFirst:0};
      for(let i=1;i<repeats;i++){
       const reuse=await restarted.select({runId,goal:scenario.goal,units});
       row.repeated.decisionCallsAfterFirst+=reuse.metrics.decisionCalls;
       const base=await answer(scenario.goal,units),small=await answer(scenario.goal,reuse.units);
       base.pass=Boolean(exact(base.answer,scenario.expected));small.pass=Boolean(exact(small.answer,scenario.expected));
       row.repeated.baseline.push(base);row.repeated.compacted.push(small);
      }
      row.repeated.baselineTotal=row.repeated.baseline.reduce((n,r)=>n+r.inputTokens+r.outputTokens,0);
      row.repeated.compactedTotal=row.repeated.compacted.reduce((n,r)=>n+r.inputTokens+r.outputTokens,selected.metrics.inputTokens+selected.metrics.outputTokens);
      row.repeated.allPassed=[...row.repeated.baseline,...row.repeated.compacted].every(r=>r.pass);
     }
     row.repeatedFiveCalls=measured?{baseline:5*row.baselineTotal,compacted:5*(row.compacted.inputTokens+row.compacted.outputTokens)+selected.metrics.inputTokens+selected.metrics.outputTokens,label:'Projection from one paired call and verified zero-call decision reuse, not five live answers'}:null;
    }catch(error){row.answerError=error.message;}
   }
   report.cases.push(row);
   console.log(JSON.stringify({case:row.id,retained:row.jevRecall,chars:`${row.metrics.beforeChars} -> ${row.metrics.afterChars}`,decisionTokens:row.metrics.inputTokens+row.metrics.outputTokens,latencyMs:elapsed,baselineTokens:row.baselineTotal,compactedTokens:row.compactedTotal,repeated:row.repeated?{baseline:row.repeated.baselineTotal,compacted:row.repeated.compactedTotal,allPassed:row.repeated.allPassed}:null,answerError:row.answerError}));
  }catch(error){report.cases.push({id:scenario.id,error:error.message,metrics:error.metrics});console.log(JSON.stringify({case:scenario.id,error:error.message}));}
 }
 if(output){await fs.mkdir(path.dirname(output),{recursive:true});await fs.writeFile(output,JSON.stringify(report,null,2)+'\n');}
 if(report.cases.some(c=>c.error||!c.jevRecall||!c.archiveRecovery))process.exitCode=1;
}finally{await db.close?.();}
