import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryDb, ensureIndexes } from '../rem/db/index.js';
import { decide, queueAsks, riskOf } from '../rem/asks.js';
import { createClock } from '../rem/util.js';

const skill = name => ({ name, status: 'practiced', requiredScopes: ['drive.read'],
  test: { lastResult: { pass: true } }, statusHistory: [] });

test('unknown or malformed tool scopes cannot inherit read-only approval', async () => {
  for (const scopes of [undefined, null, 'drive.read', ['calendar.write'], ['drive.read', 'shell.exec'], [null]])
    assert.equal(riskOf(scopes), 'unknown');
  assert.equal(riskOf(['drive.read', 'calendar.list']), 'read');
  assert.equal(riskOf(['gmail.send']), 'send');
  const db = createMemoryDb(); await ensureIndexes(db);
  await db.collection('asks').insertOne({ risk: 'read', decision: 'approved', status: 'approved', dedupeKey: 'prior-read' });
  await db.collection('skills').insertMany([
    { ...skill('unsupported'), requiredScopes: ['calendar.write'] },
    { ...skill('unverified'), test: {} },
    skill('known-read'),
  ]);
  await queueAsks({ db, clock: createClock() }, { night: 1 });
  for (const name of ['unsupported', 'unverified']) {
    const ask = await db.collection('asks').findOne({ skill: name });
    assert.equal(ask.status, 'open');
    assert.equal((await db.collection('skills').findOne({ name })).status, 'practiced');
    assert.equal((await decide({ db, clock: createClock() }, ask._id, 'approve')).status, 'rejected');
  }
  assert.equal((await db.collection('skills').findOne({ name: 'known-read' })).status, 'autonomous');
});

test('real Mongo transactions keep skill decisions and promotions consistent under races and rollback', { timeout: 30000 }, async t => {
  const { MongoMemoryReplSet } = await import('mongodb-memory-server');
  const { createMongoDb } = await import('../rem/db/mongo.js');
  const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  const db = await createMongoDb({ uri: mongo.getUri(), dbName: 'skill_authority' });
  try {
    await ensureIndexes(db, { search: false });
    const ctx = { db, clock: createClock() };
    const seed = async name => {
      await db.collection('skills').insertOne(skill(name));
      const result = await db.collection('asks').insertOne({ kind: 'skill.autonomous', skill: name, scopes: ['drive.read'], status: 'open', dedupeKey: `skill:${name}` });
      return result.insertedId;
    };
    await t.test('opposing decisions produce one consistent committed winner', async () => {
      const id = await seed('race');
      const results = await Promise.all([decide(ctx, id, 'approve'), decide(ctx, id, 'deny')]);
      assert.equal(results[0].status, results[1].status);
      const ask = await db.collection('asks').findOne({ _id: id });
      const saved = await db.collection('skills').findOne({ name: 'race' });
      assert.equal(saved.status, ask.status === 'approved' ? 'autonomous' : 'practiced');
      assert.equal(saved.statusHistory.length, ask.status === 'approved' ? 2 : 0);
    });
    await t.test('duplicate approvals append promotion history once', async () => {
      const id = await seed('duplicate');
      await Promise.all([decide(ctx, id, 'approve'), decide(ctx, id, 'approve')]);
      assert.deepEqual((await db.collection('skills').findOne({ name: 'duplicate' })).statusHistory.map(h => h.status), ['approved', 'autonomous']);
    });
    await t.test('a read-only ask cannot approve a skill whose scopes changed to sending', async () => {
      const id = await seed('changed-scopes');
      await db.collection('skills').updateOne({ name: 'changed-scopes' }, { $set: { requiredScopes: ['gmail.send'] } });
      assert.equal((await decide(ctx, id, 'approve')).status, 'rejected');
      assert.equal((await db.collection('skills').findOne({ name: 'changed-scopes' })).status, 'practiced');
    });
    const failingDb = { ...db, collection(name) {
      const collection = db.collection(name);
      if (name === 'skills') collection.updateOne = async () => { throw new Error('Injected skill promotion failure'); };
      return collection;
    } };
    await t.test('promotion failure rolls the manual decision back to open', async () => {
      const id = await seed('rollback');
      await assert.rejects(decide({ ...ctx, db: failingDb }, id, 'approve'), /Injected/);
      assert.equal((await db.collection('asks').findOne({ _id: id })).status, 'open');
      assert.equal((await db.collection('skills').findOne({ name: 'rollback' })).status, 'practiced');
    });
    await t.test('automatic promotion failure does not leave an approved ask', async () => {
      await db.collection('asks').insertOne({ risk: 'read', decision: 'approved', status: 'approved', dedupeKey: 'prior-read' });
      await db.collection('skills').insertOne(skill('automatic-rollback'));
      await assert.rejects(queueAsks({ ...ctx, db: failingDb }, { night: 1 }), /Injected/);
      assert.equal(await db.collection('asks').findOne({ skill: 'automatic-rollback' }), null);
      assert.equal((await db.collection('skills').findOne({ name: 'automatic-rollback' })).status, 'practiced');
    });
  } finally { await db.close(); await mongo.stop(); }
});
