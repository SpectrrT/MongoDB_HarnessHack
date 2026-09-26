import test from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import request from 'supertest';
import { HarnessStore, LeaseLost, RunConflict } from '../server/harness/store.js';
import { tick } from '../server/harness/worker.js';
import { createApp } from '../server/index.js';

const input = { instructions: 'Project handoff', notes: [{ id: 'note1', text: 'Release is blocked pending review.' }] };
const provider = async () => ({ summary: 'Release blocked.', claims: [{ text: 'Review is pending.', sourceIds: ['note1'] }] });

test('MongoDB durable harness integration', async t => {
  const mongo = await MongoMemoryServer.create();
  const client = new MongoClient(mongo.getUri());
  await client.connect();
  try {
    let sequence = 0;
    const make = async () => { const s = new HarnessStore(client.db(`case${sequence++}`)); await s.initialize(); return s; };
    await t.test('concurrent duplicate requests create one run; changed payload conflicts', async () => {
      const s = await make();
      const runs = await Promise.all(Array.from({ length: 10 }, () => s.enqueue('a', 'once', input)));
      assert.equal(new Set(runs.map(r => r._id)).size, 1);
      await assert.rejects(s.enqueue('a', 'once', { ...input, instructions: 'Changed' }), RunConflict);
    });
    await t.test('exclusive claim, recovery after abandoned lease, stale worker rejected', async () => {
      const s = await make(); await s.enqueue('a', 'run', input);
      const claims = await Promise.all([s.claim('one'), s.claim('two')]);
      assert.equal(claims.filter(Boolean).length, 1);
      const old = claims.find(Boolean);
      await s.runs.updateOne({ _id: old._id }, { $set: { leaseUntil: new Date(0) } });
      const resumed = await s.claim('replacement');
      assert.equal(resumed._id, old._id);
      assert.notEqual(resumed.leaseToken, old.leaseToken);
      await assert.rejects(s.commit(old, 'context', {}), LeaseLost);
      await s.commit(resumed, 'context', input);
      await assert.rejects(s.commit(resumed, 'context', input), LeaseLost);
    });
    await t.test('fresh database connection resumes persisted checkpoint with one artifact', async () => {
      const s = await make(); const run = await s.enqueue('a', 'restart', input);
      await tick(s, provider);
      const restartedClient = new MongoClient(mongo.getUri());
      await restartedClient.connect();
      try {
        const restarted = new HarnessStore(restartedClient.db(s.runs.dbName));
        for (let i = 0; i < 5; i++) await tick(restarted, provider);
        const done = await restarted.get('a', run._id);
        assert.equal(done.status, 'completed'); assert.equal(done.checkpoint, 4);
        assert.equal(new Set(done.receipts.map(r => r.key)).size, 4);
        assert.equal(done.outputs.artifact.id, `${run._id}:handoff`);
        assert.equal(await restarted.get('other', run._id), null);
      } finally { await restartedClient.close(); }
    });
    await t.test('invalid citations fail closed without artifact', async () => {
      const s = await make(); const run = await s.enqueue('a', 'bad', input);
      const bad = async () => ({ summary: 'Bad', claims: [{ text: 'Invented', sourceIds: ['missing'] }] });
      for (let i = 0; i < 4; i++) await tick(s, bad);
      const result = await s.get('a', run._id);
      assert.equal(result.status, 'failed'); assert.equal(result.outputs.artifact, undefined);
    });
    await t.test('temporary provider failure retries same step without duplicate receipts', async () => {
      const s = await make(); const run = await s.enqueue('a', 'retry', input);
      await tick(s, provider);
      await tick(s, async () => { const e = new Error('rate limit'); e.retryable = true; throw e; });
      let saved = await s.get('a', run._id);
      assert.equal(saved.checkpoint, 1); assert.equal(saved.receipts.length, 1);
      await s.runs.updateOne({ _id: run._id }, { $set: { availableAt: new Date(0) } });
      for (let i = 0; i < 3; i++) await tick(s, provider);
      saved = await s.get('a', run._id);
      assert.equal(saved.status, 'completed'); assert.equal(saved.receipts.length, 4);
    });
    await t.test('API keeps runs private, validates input and reports missing configuration', async () => {
      const s = await make(); const app = createApp({ serveStatic: false, harnessStore: s });
      const a = request.agent(app), b = request.agent(app);
      const response = await a.post('/api/harness/runs').send({ requestKey: 'api', input }).expect(202);
      await b.get(`/api/harness/runs/${response.body.id}`).expect(404);
      const visible = await a.get(`/api/harness/runs/${response.body.id}`).expect(200);
      assert.equal(visible.body.workspace, undefined);
      await a.post('/api/harness/runs').send({ requestKey: 'api', input: { ...input, instructions: 'Changed' } }).expect(409);
      await a.post('/api/harness/runs').send({ requestKey: 'bad', input: { ...input, notes: [input.notes[0], input.notes[0]] } }).expect(400);
      await request(createApp({ serveStatic: false })).post('/api/harness/runs').send({}).expect(503);
    });
  } finally { await client.close(); await mongo.stop(); }
});
