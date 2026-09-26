import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {MongoMemoryServer} from 'mongodb-memory-server';
import {MongoClient} from 'mongodb';
import {chromium} from '@playwright/test';
import {deriveIdleDraft} from '../server/suggestions/idle-candidates.js';
import {SleepExecutionStore} from '../server/sleep/execution-store.js';
import {sleepExecutionTick,taskDirectory} from '../server/sleep/execution.js';
import {sleepOpenRouterExecutor} from '../server/sleep/execution-provider.js';
const output=path.resolve(process.argv[2]||'.data/idle-candidate-live');await fs.mkdir(output,{recursive:true});
const root=path.resolve('.data/idle-candidate-live-runs');
const candidate=deriveIdleDraft({conversationId:'synthetic-counter-fixture',messages:[
 {id:'goal-counter',role:'user',text:'Build a local HTML counter widget. Show the initial count 0 in an element with id count and data-testid counter-value. Provide a button labeled Increment that increases it by one on each click and a button labeled Reset that restores 0.'},
 {id:'constraint-local',role:'user',text:'Keep everything self-contained. Do not use network resources or deploy it.'},
]});assert.ok(candidate);assert.deepEqual(candidate.writeFiles,[]);
const mongo=await MongoMemoryServer.create(),client=await new MongoClient(mongo.getUri()).connect();
let browser;const providerCalls=[];
const recordedFetch=async(...args)=>{
 const call={startedAt:new Date().toISOString(),usageKnown:false};providerCalls.push(call);
 try{const response=await fetch(...args);call.status=response.status;const body=await response.clone().json();call.generationId=body.id;call.usage=body.usage||null;call.usageKnown=!!body.usage;return response;}
 finally{await fs.writeFile(path.join(output,'idle-candidate-provider-calls.json'),JSON.stringify(providerCalls,null,2)+'\n');}
};
try{
 const store=new SleepExecutionStore(client.db('idle_candidate_live'));await store.initialize();
 // Explicit test consent permits only this synthetic fixture's isolated draft files.
 const task=await store.enqueue('synthetic-test-owner',candidate.id,{title:candidate.title,brief:candidate.brief,
  checks:candidate.checks,writeFiles:candidate.checks.map(c=>c.path),deadline:Date.now()+180000,budget:20000,maxAttempts:3});
 const executor=sleepOpenRouterExecutor({model:'openai/gpt-4.1-mini',fetcher:recordedFetch});
 let done=task;
 for(let i=0;i<3&&done.status==='queued';i++)done=await sleepExecutionTick(store,executor,{root,worker:'synthetic-live-check',maxOutputTokens:2500});
 if(done.status!=='completed')await fs.writeFile(path.join(output,'idle-candidate-live-verification.json'),JSON.stringify({passed:false,status:done.status,reason:done.reason,checks:done.checkResults,calls:done.calls,tokensUsed:done.tokensUsed,cost:done.cost},null,2)+'\n');
 assert.equal(done.status,'completed',JSON.stringify({status:done.status,reason:done.reason,error:done.error,checks:done.checkResults}));
 const htmlArtifact=done.artifacts.find(a=>a.path==='prototype.html');
 const html=await fs.readFile(path.join(taskDirectory(root,done),htmlArtifact.directory,htmlArtifact.path),'utf8');
 const evidenceArtifact=done.artifacts.find(a=>a.path==='evidence.md');
 const evidence=await fs.readFile(path.join(taskDirectory(root,done),evidenceArtifact.directory,evidenceArtifact.path),'utf8');
 assert.match(evidence,/Hypotheses \(unverified\)/);assert.match(evidence,/Checks still needed/);
 browser=await chromium.launch({headless:true,channel:'chrome'});const page=await browser.newPage();
 const requests=[],errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>{requests.push(route.request().url());return route.abort();});
 await page.setContent(html);
 for(const name of ['Increment','Reset']){const button=page.getByRole('button',{name,exact:true});assert.equal(await button.isVisible(),true);assert.equal(await button.evaluate(el=>el.tagName),'BUTTON');}
 assert.equal(await page.getByTestId('counter-value').isVisible(),true);assert.equal(await page.locator('#count').innerText(),'0');
 await page.getByRole('button',{name:'Increment',exact:true}).click();assert.equal(await page.locator('#count').innerText(),'1');
 await page.getByRole('button',{name:'Increment',exact:true}).click();assert.equal(await page.locator('#count').innerText(),'2');
 await page.getByRole('button',{name:'Reset',exact:true}).click();assert.equal(await page.getByTestId('counter-value').innerText(),'0');
 assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
 await fs.writeFile(path.join(output,'idle-counter-prototype.html'),html);
 await fs.writeFile(path.join(output,'idle-counter-evidence.md'),evidence);
 await page.screenshot({path:path.join(output,'idle-counter-prototype.png')});
 const report={createdAt:new Date().toISOString(),source:'Synthetic conversation fixture. No personal history or private files sent to the model.',
  scope:'Candidate derivation plus real Sleep executor and independent browser behavior check. Does not exercise idle timing or toggle lifecycle.',
  candidateId:candidate.id,browserCheck:candidate.browserCheck,providerCalls,artifacts:done.artifacts.map(({path,sha256,bytes})=>({path,sha256,bytes})),sourceMessageIds:candidate.sourceMessageIds,status:done.status,model:done.model,calls:done.calls,
  tokensUsed:done.tokensUsed,usageUnknown:done.usageUnknown,cost:done.cost,checks:done.checkResults,
  costScope:'This run only. The initial failed smoke test has unreported usage and is retained separately.',browser:{initialCount:0,afterClicks:[1,2],afterReset:0,networkRequests:requests.length,pageErrors:errors},passed:true};
 await fs.writeFile(path.join(output,'idle-candidate-live-verification.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{await browser?.close();await client.close();await mongo.stop();}
