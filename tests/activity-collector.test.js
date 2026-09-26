import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import {createActivityCollector} from '../server/activity/collector.js';
import {sample} from '../server/activity/capture.js';
import {normalizeSample} from '../server/activity/store.js';
import {activityRoutes} from '../server/activity/routes.js';

const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check){for(let i=0;i<100;i++){if(check())return;await delay(5);}throw Error('Collector did not reach expected state');}
function fixture(patch={}){
 let settings={paused:false,collectorEnabled:false,captureTitles:true,captureUrls:true,excludedApps:['Passwords'],...patch};
 const saved=[],calls=[];
 return {saved,calls,get settings(){return settings;},async settingsFor(){return {...settings};},activity:{
  settings:async workspace=>{calls.push(['settings',workspace]);return {...settings};},
  updateSettings:async(workspace,update)=>{calls.push(['settings-write',workspace]);settings={...settings,...update};return {...settings};},
  ingest:async(workspace,device,batch)=>{calls.push(['ingest',workspace,device]);if(settings.paused)return {inserted:0,paused:true};saved.push(...batch);return {inserted:batch.length};},
  sessionize:async(workspace,device)=>{calls.push(['sessions',workspace,device]);},
  status:async workspace=>({configured:true,workspace,paused:settings.paused,devices:[]}),
 }};
}
const record=()=>({ts:new Date().toISOString(),app:'Test Editor',title:'Fixture document',url:null,idle:false,source:'collector'});

test('app startup stays idle without prior consent; explicit start persists safe scope and pause stops sampling',async t=>{
 const data=fixture();let samples=0,options;
 const collector=createActivityCollector({activity:data.activity,workspace:'owner-a',device:'mac-a',platform:'darwin',intervalMs:15,flushMs:15,sampleFn:async opts=>{samples++;options=opts;return record();}});t.after(()=>collector.stop());
 await collector.resume();await delay(25);assert.equal(samples,0);assert.equal(collector.status().running,false);
 await collector.start();await until(()=>data.saved.length>0);
 assert.equal(data.settings.collectorEnabled,true);assert.equal(data.settings.captureUrls,false);
 assert.deepEqual(options,{titles:true,urls:false,excludedApps:['Passwords']});
 assert.ok(collector.status().lastSavedAt);assert.equal(collector.status().state,'recording');
 await collector.pause();const atPause=samples;await delay(40);
 assert.equal(samples,atPause);assert.equal(data.settings.paused,true);assert.equal(collector.status().state,'paused');
 assert.ok(data.calls.every(call=>call[1]==='owner-a'));assert.ok(data.calls.filter(call=>call[0]==='ingest').every(call=>call[2]==='mac-a'));
});

test('saved consent resumes after launch, paused state and privacy choices remain authoritative',async t=>{
 const data=fixture({collectorEnabled:true,paused:true,captureTitles:false,captureUrls:false});let samples=0;
 const collector=createActivityCollector({activity:data.activity,platform:'darwin',intervalMs:15,sampleFn:async opts=>{samples++;assert.equal(opts.titles,false);assert.equal(opts.urls,false);return record();}});t.after(()=>collector.stop());
 await collector.resume();await delay(25);assert.equal(samples,0);
 await data.activity.updateSettings('owner',{paused:false});await collector.resume();await until(()=>samples>0);
 await collector.stop();assert.equal(data.settings.paused,false,'shutdown preserves the user’s enabled preference');
});

test('a pending sample cannot be ingested after pause and duplicate starts share one loop',async t=>{
 const data=fixture();let release,samples=0;
 const collector=createActivityCollector({activity:data.activity,platform:'darwin',sampleFn:async()=>{samples++;return new Promise(resolve=>{release=resolve;});}});t.after(()=>collector.stop());
 await Promise.all([collector.start(),collector.start()]);await until(()=>!!release);assert.equal(samples,1);
 await collector.pause();release(record());await delay(20);assert.equal(data.saved.length,0);
});

test('failed session aggregation does not reinsert already-saved samples',async t=>{
 const data=fixture();let unique=0,aggregations=0;
 data.activity.sessionize=async()=>{if(++aggregations===1)throw Error('Temporary aggregation failure');};
 const collector=createActivityCollector({activity:data.activity,platform:'darwin',intervalMs:10,flushMs:0,sampleFn:async()=>({...record(),title:String(++unique)})});t.after(()=>collector.stop());
 await collector.start();await until(()=>data.saved.length>=2);await collector.pause();
 assert.equal(new Set(data.saved.map(item=>item.title)).size,data.saved.length);
});

test('normal shutdown flushes captured history while pause discards the same buffered interval',async()=>{
 for(const pauseFirst of [false,true]){
  const data=fixture();let samples=0;
  const collector=createActivityCollector({activity:data.activity,platform:'darwin',intervalMs:15,flushMs:60000,sampleFn:async()=>({...record(),title:String(++samples)})});
  try{
   await collector.start();await until(()=>samples>=2);await delay(1);
   assert.equal(data.saved.length,1,'the next interval remains buffered before shutdown');
   if(pauseFirst)await collector.pause();
   await collector.stop();await collector.stop();
   assert.equal(data.saved.some(item=>item.title==='2'),!pauseFirst);
   assert.equal(new Set(data.saved.map(item=>item.title)).size,data.saved.length,'shutdown is idempotent');
   assert.equal(data.settings.paused,pauseFirst);
  }finally{await collector.stop();}
 }
});

test('shutdown discards a late sample and checks current consent before flushing captured history',async()=>{
 const data=fixture();let samples=0,release;
 const collector=createActivityCollector({activity:data.activity,platform:'darwin',intervalMs:10,flushMs:60000,sampleFn:async()=>{
  samples++;if(samples===3)return new Promise(resolve=>{release=resolve;});return {...record(),title:String(samples)};
 }});
 await collector.start();await until(()=>!!release);
 const stopped=collector.stop();await data.activity.updateSettings('owner',{paused:true});release({...record(),title:'late'});await stopped;
 assert.deepEqual(data.saved.map(item=>item.title),['1']);
});

test('unsupported platforms and unconfigured stores never start capture',async()=>{
 let captured=false;const collector=createActivityCollector({activity:fixture().activity,platform:'linux',sampleFn:async()=>{captured=true;}});
 await assert.rejects(collector.start(),/macOS/);assert.equal(captured,false);assert.equal(collector.status().canStart,false);await collector.stop();
 const absent=createActivityCollector({platform:'darwin'});await assert.rejects(absent.start(),/database/);assert.equal(absent.status().canStart,false);await absent.stop();
});

test('capture respects excluded apps and title-only scope without querying URLs',async()=>{
 let browserReads=0,titleReads=0;
 const readers={frontmostApp:async()=>({app:'Google Chrome',bundleId:'com.google.Chrome'}),idleSeconds:async()=>0,browserTab:async(app,options)=>{browserReads++;assert.equal(options.urls,false);return {title:'Engineering notes',url:null};},windowTitle:async()=>{titleReads++;return 'Window';}};
 const titles=await sample({titles:true,urls:false},readers);assert.equal(titles.title,'Engineering notes');assert.equal(titles.url,null);
 const excluded=await sample({titles:true,urls:true,excludedApps:['Google Chrome']},readers);assert.equal(excluded.title,null);assert.equal(excluded.url,null);assert.equal(browserReads,1);assert.equal(titleReads,0);
 const privateSample=await sample({titles:false,urls:true},{...readers,browserTab:async()=>({private:true,title:'Private browsing',url:null})});
 const normalized=normalizeSample(privateSample,{captureTitles:false,captureUrls:true,excludedApps:[]});assert.equal(normalized.private,true);assert.equal(normalized.title,null);assert.equal(normalized.url,null);
});

test('a foreground app switch drops metadata instead of attaching it to the previous app',async()=>{
 for(const changed of [{app:'Other App',bundleId:'other.app'},null]){
  let reads=0;
  const result=await sample({titles:true,urls:false},{frontmostApp:async()=>++reads===1?{app:'Editor',bundleId:'test.editor'}:changed,idleSeconds:async()=>0,browserTab:async()=>null,windowTitle:async()=>'New foreground window'});
  assert.equal(result,null);assert.equal(reads,2);
 }
});

test('collector API requires explicit local app requests and preserves the store workspace boundary',async()=>{
 const data=fixture();let starts=0,pauses=0;
 const collector={status:()=>({supported:true,canStart:true,running:starts>pauses,state:'stopped'}),start:async()=>{starts++;},pause:async()=>{pauses++;},refresh:async()=>{}};
 const app=express();app.use(express.json());activityRoutes(app,{activity:data.activity,collector});
 const action=body=>request(app).post('/api/activity/collector').set('Host','127.0.0.1:5194').set('X-Offload-Client','local').send(body);
 await request(app).post('/api/activity/collector').send({action:'start'}).expect(403);
 await action({action:'start'}).set('Origin','https://attacker.example').expect(403);
 await action({action:'start',workspace:'other-owner'}).expect(400);assert.equal(starts,0);
 const started=await action({action:'start'}).expect(200);assert.equal(started.body.collector.running,true);
 await action({action:'pause'}).expect(200);assert.equal(pauses,1);
 await request(app).post('/api/activity/settings').send({collectorEnabled:true}).expect(400);
});
