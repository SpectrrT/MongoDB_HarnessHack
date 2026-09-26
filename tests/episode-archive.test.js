import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryDb, ensureIndexes } from '../rem/db/index.js';
import { retireEpisodes, readEpisode, listEpisodeArchive, ARCHIVE_PART_BYTES } from '../rem/episode-archive.js';

const now = Date.parse('2026-09-26T18:00:00Z');
const make = async () => { const db = createMemoryDb(); await ensureIndexes(db); return db; };
const episode = (id, kind = 'correction') => ({ _id: id, kind, runId: 'r1', summary: 'Preserve the original constraint exactly.',
  facts: [{ kind: 'preference', text: 'Never send without approval.' }], ts: new Date(now), consolidated: false, expireAt: null, metadata: { source: 'user' } });

test('raw correction, demonstration and trajectory survive hot-episode TTL expiry exactly', async () => {
  const db = await make();
  const originals = ['correction', 'demonstration', 'trajectory'].map(kind => episode(kind, kind));
  await db.collection('episodes').insertMany(originals);
  assert.equal(await retireEpisodes(db, {}, { now, expireAt: now + 1000 }), 3);
  await db.sweepExpired(now + 2000);
  assert.equal(await db.collection('episodes').countDocuments(), 0);
  for (const original of originals) assert.deepEqual((await readEpisode(db, original._id)).episode, original);
  assert.equal(await retireEpisodes(db, {}, { now, expireAt: now + 1000 }), 0);
  assert.equal(await db.collection('episode_archive').countDocuments(), 3);
});

test('discarded noise remains recoverable, and explicit reset removes archived evidence', async () => {
  const db = await make();
  const original = episode('noise', 'observation');
  await db.collection('episodes').insertOne(original);
  await retireEpisodes(db, { _id: 'noise' }, { now, remove: true, reason: 'low-importance' });
  assert.equal(await db.collection('episodes').findOne({ _id: 'noise' }), null);
  assert.deepEqual((await readEpisode(db, 'noise')).episode, original);
  await db.dropDatabase();
  assert.equal(await readEpisode(db, 'noise'), null);

});

test('archive failure cannot delete or schedule expiration of an unarchived episode', async () => {
  const db = await make();
  await db.collection('episodes').insertOne(episode('retained'));
  const faulty = { ...db, withTransaction: db.withTransaction.bind(db), collection: name => {
    const collection = db.collection(name);
    if (name !== 'episode_archive') return collection;
    return new Proxy(collection, { get(target, key) {
      if (key === 'updateOne') return async () => { throw new Error('archive unavailable'); };
      const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value;
    } });
  } };
  await assert.rejects(retireEpisodes(faulty, {}, { now, remove: true }), /archive unavailable/);
  assert.deepEqual(await db.collection('episodes').findOne({ _id: 'retained' }), episode('retained'));
});

test('retirement uses bounded batches and does not duplicate archived evidence', async () => {
  const db = await make();
  await db.collection('episodes').insertMany(Array.from({ length: 205 }, (_, i) => episode(`episode-${i}`)));
  assert.equal(await retireEpisodes(db, {}, { now, expireAt: now + 1000 }), 205);
  assert.equal(await retireEpisodes(db, {}, { now, expireAt: now + 1000 }), 0);
  assert.equal(await db.collection('episode_archive').countDocuments(), 205);
  const first = await listEpisodeArchive(db, { runId: 'r1', limit: 20 });
  const second = await listEpisodeArchive(db, { runId: 'r1', after: first.next, limit: 20 });
  assert.equal(first.episodes.length, 20);
  assert.equal(second.episodes.length, 20);
  assert.equal(new Set([...first.episodes, ...second.episodes].map(e => e.id)).size, 40);
  assert.deepEqual((await listEpisodeArchive(db, { runId: 'another-run' })).episodes, []);
});

test('large Unicode evidence round-trips in bounded parts and detects corruption', async () => {
  const db = await make();
  const original = { ...episode('large'), raw: ('Long context ' + String.fromCodePoint(0x1D11E)).repeat(100000) };
  await db.collection('episodes').insertOne(original);
  await retireEpisodes(db, {}, { now, remove: true });
  assert.deepEqual((await readEpisode(db, 'large')).episode, original);
  const parts = await db.collection('episode_archive_parts').find({}).toArray();
  assert.ok(parts.length > 10);
  assert.ok(parts.every(part => Buffer.byteLength(part.data, 'base64') <= ARCHIVE_PART_BYTES));
  await db.collection('episode_archive_parts').updateOne({ _id: parts[0]._id }, { $set: { data: 'corrupt' } });
  await assert.rejects(readEpisode(db, 'large'), /integrity/);
});

test('real Mongo archive survives a new connection and rolls back partial archive writes', { timeout: 30000 }, async () => {
  const { MongoMemoryReplSet } = await import('mongodb-memory-server');
  const { createMongoDb } = await import('../rem/db/mongo.js');
  const { ObjectId } = await import('mongodb');
  const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  const db = await createMongoDb({ uri: mongo.getUri(), dbName: 'episode_archive' });
  let restored;
  try {
    await ensureIndexes(db, { search: false });
    const original = { ...episode(new ObjectId()), raw: 'Repeated source evidence. '.repeat(10000) };
    await db.collection('episodes').insertOne(original);
    await retireEpisodes(db, {}, { now, remove: true });
    restored = await createMongoDb({ uri: mongo.getUri(), dbName: 'episode_archive' });
    assert.deepEqual((await readEpisode(restored, String(original._id))).episode, original);
    const rollback = { ...episode(new ObjectId()), raw: 'Preserve this source. '.repeat(10000) };
    await db.collection('episodes').insertOne(rollback);
    const before = await db.collection('episode_archive_parts').countDocuments();
    let writes = 0;
    const faulty = { ...db, collection: name => {
      const collection = db.collection(name);
      if (name === 'episode_archive_parts') {
        const update = collection.updateOne.bind(collection);
        collection.updateOne = (...args) => { if (++writes === 2) throw Error('part write failed'); return update(...args); };
      }
      return collection;
    } };
    await assert.rejects(retireEpisodes(faulty, {}, { now, remove: true }), /part write failed/);
    assert.equal(await db.collection('episode_archive_parts').countDocuments(), before);
    assert.deepEqual(await db.collection('episodes').findOne({ _id: rollback._id }), rollback);
    assert.equal(await db.collection('episode_archive').findOne({ _id: rollback._id }), null);
  } finally { await restored?.close(); await db.close(); await mongo.stop(); }
});

test('agent tools recover expired raw evidence in bounded pages', async () => {
  const { createRem } = await import('../rem/index.js');
  const source = { ...episode('agent-source'), summary: 'Original agreed target: 42.', raw: 'x'.repeat(12000) };
  let calls = 0;
  const model = { name: 'archive-tool-fixture', async chat({ tools }) {
    assert.ok(tools.some(tool => tool.function.name === 'episode.read'));
    const replies = [
      { final: 'Recover the exact archived source.' },
      { toolCall: { name: 'episode.list', args: { runId: 'r1', limit: 1 } } },
      { toolCall: { name: 'episode.read', args: { id: 'agent-source', limit: 8000 } } },
      { toolCall: { name: 'episode.read', args: { id: 'agent-source', offset: 8000, limit: 8000 } } },
      { final: 'Recovered the original agreed target.' },
    ];
    return { ...replies[calls++], usage: { inputTokens: 10, outputTokens: 10 } };
  } };
  const rem = await createRem({ model, completion: null });
  try {
    await rem.ctx.db.collection('episodes').insertOne(source);
    await retireEpisodes(rem.ctx.db, { _id: source._id }, { now, remove: true });
    const run = await rem.ctx.agent.startRun({ kind: 'archive-recovery', instruction: 'Recover the prior target.', runId: 'recover' });
    assert.equal(run.status, 'done');
    const pages = run.transcript.filter(t => t.call.name === 'episode.read').map(t => t.result);
    assert.equal(pages.length, 2);
    assert.ok(pages.every(page => page.referenceOnly && page.text.length <= 8000));
    assert.deepEqual(JSON.parse(pages.map(page => page.text).join('')), JSON.parse(JSON.stringify(source)));
  } finally { await rem.close(); }
});
