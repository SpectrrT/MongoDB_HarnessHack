import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { MongoClient } from 'mongodb';
import { ActivityStore } from '../server/activity/store.js';
import { embedText } from '../rem/embed.js';
if (!process.env.MONGODB_URI) throw new Error('Set MONGODB_URI before running the synthetic Atlas verifier.');
const startedAt = new Date();
const namespace = `offload_activity_verify_${Date.now()}`;
const receipt = { purpose: 'Synthetic Computer History integration check. No personal activity was captured.', startedAt: startedAt.toISOString(), namespace, source:'seed', checks:[], cleanup:false, sourceHashes: {} };
for (const path of ['server/activity/store.js','server/activity/routes.js','server/activity/capture.js']) receipt.sourceHashes[path] = createHash('sha256').update(await fs.readFile(path)).digest('hex');
const output = process.env.ACTIVITY_VERIFY_RECEIPT || `docs/evidence/activity-atlas-${Date.now()}.json`;
const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
let db;
const check = (name, details) => receipt.checks.push({name,passed:true,...details});
try {
 await client.connect(); db=client.db(namespace);
 const embedder={key:'local256',name:'local hashing (256 dimensions)',dims:256,embed:async texts=>texts.map(t=>embedText(t,256)),embedQuery:async text=>embedText(text,256)};
 const activity=await new ActivityStore(db,{embedder,timeZone:'UTC'}).initialize();
 const base=new Date();base.setUTCHours(9,0,0,0);
 const samples=[];
 for(let day=1;day<=3;day++)for(const [step,app] of ['Mail','Docs','Slack'].entries())for(let second=0;second<180;second+=5){
  samples.push({ts:new Date(+base-day*86400e3+step*180000+second*1000),app,title:`Synthetic weekly brief ${step}`,source:'seed',active:true});
 }
 const workspace='synthetic-verification',device='synthetic-device';
 const inserted=await activity.ingest(workspace,device,samples); assert.equal(inserted.inserted,324);check('ingestion',inserted);
 await activity.sessionize(workspace,device,{from:new Date(+base-4*86400e3),to:new Date()});
 const count=await activity.sessions.countDocuments({workspace}); assert.equal(count,9);check('sessionization',{sessions:count});
 const day=samples.at(-1).ts.toISOString().slice(0,10);const timeline=await activity.timeline(workspace,{day});assert.equal(timeline.sessions.length,3);
 const stats=await activity.stats(workspace,{day});assert.equal(stats.totalSec,540);check('day retrieval and totals',{sessions:timeline.sessions.length,seconds:stats.totalSec});
 let indexes=[];
 for(let i=0;i<36;i++){indexes=await activity.sessions.listSearchIndexes().toArray();if(indexes.length===2&&indexes.every(x=>x.queryable))break;await new Promise(r=>setTimeout(r,5000));}
 receipt.indexes=indexes.map(x=>({name:x.name,status:x.status,queryable:x.queryable}));
 const search=await activity.search(workspace,'Synthetic weekly brief',{limit:5});assert.ok(search.results.length>0);assert.ok(search.results.every(x=>x.source==='seed'));
 check('search',{mode:search.mode,results:search.results.length,allSynthetic:true});
 const routines=await activity.routines(workspace);assert.equal(routines.length,1);assert.equal(routines[0].dayCount,3);assert.equal(routines[0].source,'seed');check('routine mining',{routines:routines.length,days:routines[0].dayCount,occurrences:routines[0].count});
 const deleted=await activity.forget(workspace,{from:new Date(+base-4*86400e3),to:new Date()});assert.equal(deleted.deletedEvents,324);assert.equal(deleted.deletedSessions,9);assert.equal(deleted.deletedRoutines,1);
 assert.equal((await activity.search(workspace,'Synthetic weekly brief')).results.length,0);check('forget removes source and derived evidence',deleted);
 receipt.passed=true;
}catch(error){receipt.passed=false;receipt.error={name:error.name,message:error.message.slice(0,300)};process.exitCode=1;}
finally{
 if(db){
  receipt.collectionCleanup=[];
  for (const name of ['activity_events','activity_sessions','activity_routines','activity_settings']) {
   try {await db.collection(name).drop();receipt.collectionCleanup.push({collection:name,dropped:true});}
   catch(error){receipt.collectionCleanup.push({collection:name,code:error.code,errorName:error.name});}
  }
  receipt.cleanup=receipt.collectionCleanup.every(x=>x.dropped||x.code===26);
  if(!receipt.cleanup)process.exitCode=1;
 }
 await client.close();receipt.finishedAt=new Date().toISOString();await fs.mkdir('docs/evidence',{recursive:true});await fs.writeFile(output,JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(receipt,null,2));
}
