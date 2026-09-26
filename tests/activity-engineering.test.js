import test from 'node:test';
import assert from 'node:assert/strict';
import { MongoClient } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { ActivityStore } from '../server/activity/store.js';
import { engineeringSamples, seedEngineeringHistory, ENGINEERING_SAMPLE_DEVICE } from '../server/activity/engineering-seed.js';
import { mongodbDemoSources, mongodbDemoOccurrences } from '../shared/mongodb-demo.js';

test('MongoDB engineer example is explicitly synthetic and uses three separate weeks', () => {
  const now = new Date('2026-09-26T19:30:00Z');
  const occurrences = mongodbDemoOccurrences(now);
  assert.deepEqual(occurrences, ['2026-09-06T15:00:00.000Z', '2026-09-13T15:00:00.000Z', '2026-09-20T15:00:00.000Z']);
  const sources = mongodbDemoSources(now);
  assert.deepEqual(mongodbDemoSources(new Date('2026-09-26T19:30:45Z')), sources, 'clicks in the same minute have immutable identical sources');
  const nextHour = mongodbDemoSources(new Date('2026-09-26T20:30:00Z'));
  assert.deepEqual(nextHour.slice(0, 3), sources.slice(0, 3), 'weekly source identities remain stable within the day');
  assert.notEqual(nextHour[3].sourceId, sources[3].sourceId, 'a new meeting observation gets a fresh immutable source identity');
  assert.equal(sources.length, 5);
  assert.equal(new Set(sources.filter(x => x.kind === 'routine').map(x => x.text)).size, 1);
  assert.ok(sources.every(x => x.locator.startsWith('example://') && /^Example/.test(x.text)));
  assert.match(sources.find(x => x.kind === 'meeting-note').text, /p95 latency is 180 ms and timeout rate is 0.6%/);
  assert.match(sources.find(x => x.kind === 'constraint').text, /Do not run database writes or create indexes/);
  const samples = engineeringSamples(now);
  assert.equal(samples.length, 720);
  assert.ok(samples.every(x => x.source === 'seed' && x.title.startsWith('Example:')));
});

test('engineering history produces a weekly routine without replacing other activity', async () => {
  const mongo = await MongoMemoryServer.create();
  const client = new MongoClient(mongo.getUri());
  try {
    await client.connect();
    const activity = await new ActivityStore(client.db('engineering_demo_test'), { timeZone: 'America/New_York' }).initialize({searchIndexes:false});
    await activity.ingest('test', 'other-device', [{ts:new Date(),app:'Terminal',title:'Unrelated fixture',source:'collector'}]);
    const result = await seedEngineeringHistory(activity, {workspace:'test'});
    assert.equal(result.samples,720);
    assert.equal(result.sessions,12);
    assert.equal(result.routines.length,1);
    assert.equal(result.routines[0].cadence,'weekly');
    assert.equal(result.routines[0].dayCount,3);
    assert.equal(result.routines[0].source,'seed');
    assert.equal((await seedEngineeringHistory(activity,{workspace:'test'})).skipped,true);
    await seedEngineeringHistory(activity,{workspace:'test',reset:true});
    assert.equal(await activity.sessions.countDocuments({device:ENGINEERING_SAMPLE_DEVICE}),12);
    assert.equal(await activity.events.countDocuments({source:'collector'}),1);
  } finally {await client.close();await mongo.stop();}
});
