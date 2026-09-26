import test from 'node:test';
import assert from 'node:assert/strict';
import {MongoMemoryServer} from 'mongodb-memory-server';
import {MongoClient} from 'mongodb';
import request from 'supertest';
import {ActivityStore,workspaceId} from '../server/activity/store.js';
import {seedEngineeringHistory} from '../server/activity/engineering-seed.js';
import {findFriction,planWorkflow,describe} from '../server/activity/insights.js';
import {embedText} from '../rem/embed.js';
import {createApp} from '../server/index.js';
const embedder={key:'local256',name:'test',dims:256,embed:async texts=>texts.map(text=>embedText(text,256)),embedQuery:async text=>embedText(text,256)};
test('history proposals preserve observed provenance and never claim execution or measured savings',async t=>{
 const mongo=await MongoMemoryServer.create(),client=await new MongoClient(mongo.getUri()).connect();
 try{
  const activity=await new ActivityStore(client.db('history_workflow'),{embedder,timeZone:'America/New_York'}).initialize();
  await seedEngineeringHistory(activity,{workspace:workspaceId()});
  const finding=await findFriction(activity,workspaceId());
  assert.equal(finding.days,3);assert.equal(finding.switchesPerDay,3);assert.equal(finding.lookbackDays,28);assert.equal(finding.provenance,'seed');assert.equal(finding.sourceCounts.seed,12);assert.equal(finding.sourceIds.length,12);
  const plan=planWorkflow(finding);assert.equal(plan.kind,'engineering');assert.equal(plan.executionStatus,'proposal');assert.equal(plan.saves,undefined);assert.match(plan.observation,/not been measured/);
  assert.match(describe(finding),/last 28 days/);assert.ok(plan.steps.some(step=>step.ask));assert.match(plan.steps.map(step=>step.detail).join(' '),/Do not execute queries or create indexes/);
  await activity.sessions.updateOne({_id:(await activity.sessions.findOne({}))._id},{$set:{source:'collector'}});
  const mixed=await findFriction(activity,workspaceId());assert.equal(mixed.provenance,'mixed');assert.equal(mixed.sample,false);assert.equal(mixed.sourceCounts.captured,1);assert.equal(mixed.sourceCounts.seed,11);
  const app=createApp({serveStatic:false,activity});
  await request(app).post('/api/activity/workflow').send({}).expect(403);
  const result=(await request(app).post('/api/activity/workflow').set('X-Offload-Client','local').send({}).expect(200)).body;
  const body={...result.workflow,provenance:result.finding.provenance};
  await request(app).post('/api/activity/workflows').set('X-Offload-Client','local').send({...body,workspace:'victim'}).expect(400);
  await request(app).post('/api/activity/workflows').set('X-Offload-Client','local').send({...body,status:'completed'}).expect(400);
  await request(app).post('/api/activity/workflows').set('X-Offload-Client','local').send({...body,steps:[{label:'Attack',app:'Atlas',command:'delete everything'}]}).expect(400);
  const saved=(await request(app).post('/api/activity/workflows').set('X-Offload-Client','local').send(body).expect(201)).body;
  assert.equal(saved.status,'saved-proposal');assert.ok(saved.id);
  const persisted=await activity.db.collection('activity_workflows').findOne({});assert.equal(persisted.workspace,workspaceId());assert.equal(persisted.provenance,'mixed');
  assert.equal(await activity.db.collection('sleep_tasks').countDocuments(),0);assert.equal(await activity.db.collection('personal_task_runs').countDocuments(),0);
 }finally{await client.close();await mongo.stop();}
});
