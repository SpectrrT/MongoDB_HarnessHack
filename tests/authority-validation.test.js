import test from 'node:test';
import assert from 'node:assert/strict';
import { createRem } from '../rem/index.js';
import { applyEdit, commitHarness } from '../rem/harness.js';
import { EDITS } from '../rem/catalog.js';

async function setup(edit, prepare = genome => genome) {
  const rem = await createRem();
  const parent = await rem.harness();
  await commitHarness(rem.ctx.db, { parent, genome: prepare(parent.genome), now: rem.ctx.clock.now() });
  const { insertedId: editId } = await rem.ctx.db.collection('edits').insertOne({ ...edit, night: 1, outcome: { status: 'queued-ask' } });
  const { insertedId: askId } = await rem.ctx.db.collection('asks').insertOne({ kind: 'edit.authority', editId, status: 'open', dedupeKey: 'test-authority' });
  return { rem, askId, editId };
}

const grant = { type: 'scope.grant', target: 'gmail.draft', description: 'Allow saving email drafts' };
const revokeDrafts = genome => applyEdit(genome, { type: 'scope.revoke', target: 'gmail.draft' });

test('an approved supported grant is evaluated, committed once, and records both splits', async () => {
  const { rem, askId } = await setup(grant, revokeDrafts);
  try {
    const first = await rem.decide(askId, 'approve');
    assert.equal(first.status, 'approved');
    assert.equal(first.validation.passed, true);
    assert.equal(first.validation.baseline.train.tasks, 9);
    assert.equal(first.validation.fitness.heldOut.tasks, 5);
    assert.equal((await rem.harness()).version, 2);
    const again = await rem.decide(askId, 'approve');
    assert.equal(again.resultVersion, first.resultVersion);
    assert.equal(await rem.ctx.db.collection('harnesses').countDocuments(), 3);
  } finally { await rem.close(); }
});

test('human approval cannot remove a guardrail that protects passing tasks', async () => {
  const guard = EDITS.internalRecipients;
  assert.ok(guard, 'catalog guardrail exists');
  const { rem, askId } = await setup({ type: 'guardrail.remove', target: guard.value.id }, genome => applyEdit(genome, guard));
  try {
    const result = await rem.decide(askId, 'approve');
    assert.equal(result.status, 'rejected');
    assert.equal(result.validation.passed, false);
    assert.ok(result.validation.regressed.length || result.validation.newCollateral.length);
    assert.equal((await rem.harness()).version, 1);
    assert.ok((await rem.harness()).genome.guardrails.some(g => g.id === guard.value.id));
  } finally { await rem.close(); }
});

test('denying a grant makes no model calls and changes no harness', async () => {
  const { rem, askId } = await setup(grant, revokeDrafts);
  try {
    rem.ctx.model = { chat: async () => { throw Error('Must not evaluate a denial'); } };
    assert.equal((await rem.decide(askId, 'deny')).status, 'denied');
    assert.equal((await rem.harness()).version, 1);
  } finally { await rem.close(); }
});

test('an evaluator outage leaves permission pending and the current harness intact', async () => {
  const { rem, askId } = await setup(grant, revokeDrafts);
  try {
    rem.ctx.model = { chat: async () => { throw Error('Provider unavailable'); } };
    const result = await rem.decide(askId, 'approve');
    assert.equal(result.status, 'open');
    assert.equal(result.validation.status, 'error');
    assert.equal(result.resultVersion, null);
    assert.equal((await rem.harness()).version, 1);
  } finally { await rem.close(); }
});

test('a harness changed during evaluation must be evaluated again before promotion', async () => {
  const { rem, askId } = await setup(grant, revokeDrafts);
  const model = rem.ctx.model;
  let changed = false;
  try {
    rem.ctx.model = { chat: async input => {
      if (!changed) {
        changed = true;
        const parent = await rem.harness();
        await commitHarness(rem.ctx.db, { parent, genome: applyEdit(parent.genome, { type: 'context.set', target: 'completionThreshold', value: 0.8 }), now: rem.ctx.clock.now() });
      }
      return model.chat(input);
    } };
    const result = await rem.decide(askId, 'approve');
    assert.equal(result.status, 'open');
    assert.equal(result.validation.status, 'stale');
    assert.equal(result.resultVersion, null);
    assert.equal((await rem.harness()).version, 2);
    assert.ok(!(await rem.harness()).genome.toolScopes.gmail.includes('draft'));
    const retry = await rem.decide(askId, 'approve');
    assert.equal(retry.status, 'approved');
    assert.equal(retry.validation.baseVersion, 2);
  } finally { await rem.close(); }
});

test('MongoDB transactions keep concurrent approvals and failed commits atomic', { timeout: 30000 }, async () => {
  const { MongoMemoryReplSet } = await import('mongodb-memory-server');
  const { createMongoDb } = await import('../rem/db/mongo.js');
  const { ensureIndexes } = await import('../rem/db/index.js');
  const { createScriptedModel } = await import('../rem/model.js');
  const { createLocalEmbedder } = await import('../rem/embed.js');
  const { createClock } = await import('../rem/util.js');
  const { GEN0 } = await import('../rem/harness.js');
  const { decideAuthority } = await import('../rem/authority.js');
  const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  const db = await createMongoDb({ uri: mongo.getUri(), dbName: 'authority_test' });
  try {
    await ensureIndexes(db, { search: false });
    const ctx = { db, model: createScriptedModel(), embedder: createLocalEmbedder(), clock: createClock() };
    await commitHarness(db, { parent: null, genome: revokeDrafts(GEN0), now: ctx.clock.now() });
    const { insertedId: editId } = await db.collection('edits').insertOne({ ...grant, night: 1, outcome: { status: 'queued-ask' } });
    const { insertedId } = await db.collection('asks').insertOne({ kind: 'edit.authority', editId, status: 'open', dedupeKey: 'race' });
    const ask = await db.collection('asks').findOne({ _id: insertedId });
    const raced = await Promise.all([decideAuthority(ctx, ask, true), decideAuthority(ctx, ask, true)]);
    assert.ok(raced.every(r => r.status === 'approved' && r.resultVersion === 1));
    assert.equal(await db.collection('harnesses').countDocuments(), 2);

    const current = await db.collection('harnesses').findOne({ version: 1 });
    await commitHarness(db, { parent: current, genome: revokeDrafts(current.genome), now: ctx.clock.now() });
    const { insertedId: secondId } = await db.collection('asks').insertOne({ kind: 'edit.authority', editId, status: 'open', dedupeKey: 'rollback' });
    const second = await db.collection('asks').findOne({ _id: secondId });
    const failingDb = { ...db, collection(name) {
      const collection = db.collection(name);
      return new Proxy(collection, { get(target, key) {
        if (name === 'harnesses' && key === 'insertOne') return async () => { throw Error('Injected commit failure'); };
        const value = Reflect.get(target, key);
        return typeof value === 'function' ? value.bind(target) : value;
      } });
    } };
    await assert.rejects(decideAuthority({ ...ctx, db: failingDb }, second, true), /Injected commit failure/);
    assert.equal((await db.collection('asks').findOne({ _id: secondId })).status, 'open');
    assert.equal(await db.collection('harnesses').countDocuments(), 3);
  } finally {
    await db.close();
    await mongo.stop();
  }
});
