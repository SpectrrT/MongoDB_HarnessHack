import test from 'node:test';
import assert from 'node:assert/strict';
import {createMemoryDb, ensureIndexes} from '../rem/db/index.js';
import {createContextCompactor, ContextBudgetError} from '../server/context/compaction.js';
import {createJevScorer} from '../server/context/jev.js';
const noise = i => ({id: `n${i}`, text: `Cafeteria menu ${i}: ${'sandwiches, soup, fruit. '.repeat(12)}`});
const fixtureScorer = (fn = () => 0.03) => ({name: 'fixture', score: async ({units}) => ({scores: units.map(u => ({id: u.id, probability: fn(u)})), usage: {inputTokens: 90, outputTokens: 10, cost: 0.001}})});
const fixture = () => [{id:'old', text:'BLOCKER: Release is waiting on security signoff. Owner Priya. Never publish before approval.'}, ...Array.from({length:12}, (_,i) => noise(i)), {id:'recent', text:'Prepare the release report.'}];

test('keeps old blockers, preserves originals, and reuses durable decisions after restart', async () => {
  const db = createMemoryDb(); await ensureIndexes(db);
  const options = {db, scorer: fixtureScorer(), budgetChars: 650, recentCount: 1};
  const first = await createContextCompactor(options).select({runId:'r', goal:'Report release readiness', units:fixture()});
  assert.deepEqual(first.units.map(u=>u.id), ['old','recent']);
  assert.equal(first.metrics.decisionCalls, 2);
  assert.equal(first.metrics.inputTokens, 180);
  assert.equal(first.metrics.archived, 12);
  assert.equal(first.decisions.find(d=>d.id==='n0').distribution.omit, 0.97);
  const restarted = createContextCompactor(options);
  const next = await restarted.select({runId:'r', goal:'Report release readiness', units:fixture()});
  assert.equal(next.metrics.decisionCalls, 0); assert.equal(next.metrics.cacheHits, 12);
  assert.equal((await restarted.read({runId:'r',id:'n0'})).text, noise(0).text);
  assert.match((await restarted.read({runId:'other',id:'n0'})).error, /No archived/);
  assert.equal((await restarted.list({runId:'r'})).records.length, 14);
});

test('does no scoring below pressure and re-evaluates when the goal or state changes', async () => {
  const db = createMemoryDb(), compactor = createContextCompactor({db, scorer:fixtureScorer(), budgetChars:650, recentCount:1});
  assert.equal((await compactor.select({runId:'r',goal:'A',units:[noise(0)]})).metrics.decisionCalls, 0);
  await compactor.select({runId:'r',goal:'A',units:fixture()});
  assert.equal((await compactor.select({runId:'r',goal:'B',units:fixture()})).metrics.cacheHits, 0);
  assert.equal((await compactor.select({runId:'r',goal:'B',revision:'New task phase',units:fixture()})).metrics.cacheHits, 0);
});

test('retains uncertain scores and pauses on protected overflow instead of silently dropping requirements', async () => {
  for (const p of [null, NaN, -0.1, 1.1, 0.5]) {
    const c = createContextCompactor({db:createMemoryDb(), scorer:fixtureScorer(()=>p), budgetChars:650});
    await assert.rejects(c.select({runId:'r',goal:'release',units:fixture()}), e => e instanceof ContextBudgetError && e.metrics.status==='needs_review');
  }
  const c = createContextCompactor({db:createMemoryDb(), scorer:{name:'outage',score:async()=>{throw Error('secret-should-not-leak');}}, budgetChars:650});
  await assert.rejects(c.select({runId:'r',goal:'release',units:fixture()}), e=>e.metrics.errors[0]==='Jev unavailable' && e.metrics.usageKnown===false);
});

test('chunks large source records and enforces archive pagination and cancellation', async () => {
  const db = createMemoryDb(), c = createContextCompactor({db,scorer:fixtureScorer(),budgetChars:20000,recentCount:0});
  const large = {id:'large', text:'x'.repeat(35000),pinned:'constraint'};
  await assert.rejects(c.select({runId:'r',goal:'g',units:[large]}), ContextBudgetError);
  assert.equal((await c.read({runId:'r',id:'large',part:0})).text.length,16000);
  assert.equal((await c.read({runId:'r',id:'large',part:2})).text.length,3000);
  await c.select({runId:'pages',goal:'g',units:Array.from({length:80},(_,i)=>noise(i))});
  const page1=await c.list({runId:'pages'}),page2=await c.list({runId:'pages',offset:page1.nextOffset});
  assert.equal(new Set([...page1.records,...page2.records].map(r=>r.id)).size,40);
  const controller=new AbortController();controller.abort();
  await assert.rejects(c.select({runId:'r',goal:'g',units:fixture(),signal:controller.signal}),/abort/i);
});

test('Jev wire contract validates probabilities, usage and HTTP failures', async () => {
  let request;
  const scorer=createJevScorer({provider:'typesafe',apiKey:'test',fetchImpl:async(url,init)=>{
    request={url,body:JSON.parse(init.body)};
    return Response.json({answers:{keep_0:{noul:0.08},keep_1:{noul:2}},usage:{input_tokens:100,output_tokens:8}});
  }});
  const result=await scorer.score({goal:'release',units:[noise(0),noise(1)]});
  assert.equal(request.url,'https://api.typesafe.ai/v1/systemone');
  assert.equal(request.body.model,'jev-1.13.0');
  assert.deepEqual(result.scores.map(s=>s.probability),[0.08,null]);
  assert.equal(result.usage.cost,null);
  const denied=createJevScorer({apiKey:'test',fetchImpl:async()=>new Response('',{status:402})});
  await assert.rejects(denied.score({goal:'g',units:[noise(0)]}),/Jev HTTP 402/);
});

test('identical idempotent reads collapse before Jev and unfinished exchanges stay protected', async () => {
  const db=createMemoryDb();let calls=0;
  const scorer={name:'spy',async score(){calls++;throw Error('Should not be needed');}};
  const c=createContextCompactor({db,scorer,budgetChars:650,recentCount:1});
  const units=Array.from({length:20},(_,i)=>({id:`read-${i}`,text:`call ${i}: ${'same observation '.repeat(20)}`,dedupeKey:'same-read-result'}));
  const result=await c.select({runId:'duplicates',goal:'Inspect this observation',units});
  assert.equal(calls,0);assert.equal(result.metrics.duplicateOmissions,19);
  assert.deepEqual(result.units.map(u=>u.id),['read-19']);
  assert.equal((await c.read({runId:'duplicates',id:'read-0'})).text,units[0].text);
  await assert.rejects(c.select({runId:'unfinished',goal:'g',units:[{id:'pending',text:'x'.repeat(1000),complete:false}]}),ContextBudgetError);
});
