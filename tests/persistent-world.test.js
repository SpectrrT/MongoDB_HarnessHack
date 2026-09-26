import test from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { createMongoDb } from '../rem/db/mongo.js';
import { createPersistentWorld } from '../rem/persistent-world.js';
import { LIVE_WORKSPACE } from '../rem/fixtures.js';
import { createRem } from '../rem/index.js';

test('durable simulated provider stores effects, receipts, corrections and sequence atomically', async t => {
  const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  const db = await createMongoDb({ uri: mongo.getUri(), dbName: 'world' });
  db.atlasSearch = false;
  try {
    const world = await createPersistentWorld(db, LIVE_WORKSPACE);
    const args = { to: ['test@offload.test'], subject: 'Fixture', body: 'Simulated message' };
    await t.test('fresh adapter restores sent messages and preserves unique IDs', async () => {
      const first = await world.execute('gmail.send', args, { effectKey: 'send1', runId: 'r1' });
      const restored = await createPersistentWorld(db, LIVE_WORKSPACE);
      assert.deepEqual(restored.findEffect('send1').result, first);
      assert.equal(restored.state.sent.length, 1);
      const next = await restored.execute('gmail.draft', args, { effectKey: 'draft1', runId: 'r1' });
      assert.equal(first.messageId, 'msg-1');
      assert.equal(next.draftId, 'draft-2');
    });
    await t.test('concurrent adapters with stale snapshots commit one effect', async () => {
      const second = await createPersistentWorld(db, LIVE_WORKSPACE);
      const results = await Promise.all([world, second].map(w => w.execute('gmail.send', args, { effectKey: 'same', runId: 'r2' })));
      assert.deepEqual(results[0], results[1]);
      const restored = await createPersistentWorld(db, LIVE_WORKSPACE);
      assert.equal(restored.state.sent.filter(m => m.runId === 'r2').length, 1);
      assert.equal(restored.executed.filter(e => e.effectKey === 'same').length, 1);
      await assert.rejects(second.execute('gmail.send', { ...args, body: 'Changed' }, { effectKey: 'same', runId: 'r2' }), /different arguments/);
    });
    await t.test('a no-op delete also has an idempotent durable receipt', async () => {
      await world.execute('drive.delete', { ids: ['does-not-exist'] }, { effectKey: 'empty', runId: 'r3' });
      const restored = await createPersistentWorld(db, LIVE_WORKSPACE);
      assert.deepEqual(await restored.execute('drive.delete', { ids: ['does-not-exist'] }, { effectKey: 'empty', runId: 'r3' }), { deleted: [], count: 0 });
      assert.equal(restored.executed.filter(e => e.effectKey === 'empty').length, 1);
    });
    await t.test('simulated human restoration survives another adapter restart', async () => {
      const id = LIVE_WORKSPACE.files[0].id;
      await world.execute('drive.delete', { ids: [id] }, { effectKey: 'delete', runId: 'r4' });
      await world.restoreFiles([id]);
      const restored = await createPersistentWorld(db, LIVE_WORKSPACE);
      assert.equal(restored.state.files.find(f => f.id === id).trashed, false);
      assert.ok(!restored.state.trash.some(t => t.id === id));
      await restored.execute('drive.delete', { ids: [id] }, { effectKey: 'delete', runId: 'r4' });
      assert.equal(restored.state.files.find(f => f.id === id).trashed, false, 'replay must not undo the human correction');
    });
    await t.test('receipt failure rolls back the provider state', async () => {
      const faulty = { ...db, collection: name => {
        const collection = db.collection(name);
        if (name === 'fixture_effects') collection.insertOne = async () => { throw new Error('injected receipt failure'); };
        return collection;
      } };
      const adapter = await createPersistentWorld(faulty, LIVE_WORKSPACE);
      await assert.rejects(adapter.execute('gmail.send', args, { effectKey: 'rollback', runId: 'r5' }), /injected/);
      const restored = await createPersistentWorld(db, LIVE_WORKSPACE);
      assert.equal(restored.findEffect('rollback'), null);
      assert.ok(!restored.executed.some(e => e.effectKey === 'rollback'));
    });
    await t.test('changed fixtures cannot silently overwrite the persisted world', async () => {
      await assert.rejects(createPersistentWorld(db, { ...LIVE_WORKSPACE, user: 'changed@offload.test' }), /fixture version/);
    });
    await t.test('the Mongo facade selects durable fixture state and reports it truthfully', async () => {
      const rem = await createRem({ db });
      try {
        assert.equal((await rem.state()).engine.world, 'mongo-fixture');
        assert.equal(rem.ctx.world.state.sent.length, 2);
      } finally { await rem.close(); }
    });
  } finally { await db.close(); await mongo.stop(); }
});
