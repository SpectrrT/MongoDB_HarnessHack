import test from 'node:test';
import assert from 'node:assert/strict';
import { findFriction, describe, planWorkflow } from '../server/activity/insights.js';

const fixture = (sources) => ({ timeZone:'America/New_York', sessions:{aggregate(pipeline){
  assert.equal(pipeline[0].$match.workspace,'owner');
  assert.deepEqual(pipeline[0].$match.private,{$ne:true});
  assert.equal(pipeline[2].$group.sessions.$push.id,'$_id');
  return {toArray:async()=>[{_id:21,dayCount:2,seconds:3600,switchesPerDay:5,sessions:[sources.map((source,i)=>({id:`s${i}`,label:i?'calendar.google.com':'mail.google.com',title:'Sydney 11:30 PM – customer review',sec:1800,start:new Date(`2026-09-${24+i}T21:00:00Z`),minute:0,source}))]}]};
}}});

test('mixed history remains visibly mixed with source identifiers',async()=>{
 const finding=await findFriction(fixture(['seed','collector']),'owner',{days:7});
 assert.equal(finding.provenance,'mixed');assert.equal(finding.sample,false);
 assert.equal(finding.sampleSessionCount,1);assert.equal(finding.liveSessionCount,1);
 assert.equal(finding.evidence[0].id,'s0');assert.match(finding.evidence[0].timestamp,/2026-09-24/);
 assert.match(describe(finding),/Mixed-source/);assert.match(describe(finding),/last 7 days/);
 assert.deepEqual(finding.meetingTimes,[]);assert.deepEqual(finding.places,[]);
 assert.deepEqual(finding.titleMentions.places,['Sydney']);
 const plan=planWorkflow(finding);
 assert.equal(plan.kind,'scheduling');assert.match(plan.problem,/could be/);
 assert.match(plan.observation,/not been measured/);assert.equal(plan.saves,undefined);assert.match(plan.observation,/Observed:/);
 assert.doesNotMatch(JSON.stringify(plan),/meeting still lands|Stop booking|while you sleep|Sydney/);
 assert.equal(plan.steps.at(-1).ask,true);
});

test('sample-only and live-only evidence stay distinct',async()=>{
 assert.equal((await findFriction(fixture(['seed','seed']),'owner')).provenance,'seed');
 const live=await findFriction(fixture(['collector','collector']),'owner');
 assert.equal(live.provenance,'captured');assert.equal(live.sample,false);
});

test('coding and generic workflow proposals do not invent failed tasks or schedules',()=>{
 const base={apps:[{label:'Codex',name:'Codex'},{label:'Terminal',name:'Terminal'}],minutesPerDay:42,switchesPerDay:9};
 const coding=planWorkflow(base);assert.match(coding.problem,/does not record a failure/);assert.match(coding.trigger,/explicitly choose/);
 const generic=planWorkflow({...base,apps:[{label:'Figma',name:'Figma',visitsPerDay:4}]});
 assert.match(generic.problem,/Confirm whether/);assert.match(generic.trigger,/you choose/);
 assert.match(generic.observation,/not been measured/);
});
