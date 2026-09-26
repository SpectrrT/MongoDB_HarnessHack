import test from 'node:test';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { createMongoDb } from '../rem/db/mongo.js';
import { ensureIndexes } from '../rem/db/index.js';
import { createPersistentWorld } from '../rem/persistent-world.js';
import { LIVE_WORKSPACE } from '../rem/fixtures.js';
import { seedConnections } from '../rem/agent.js';
import { GEN0, commitHarness } from '../rem/harness.js';

test('REM survives SIGKILL after simulated send and before ledger commit without resending', { timeout: 60000 }, async () => {
  const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  const db = await createMongoDb({ uri: mongo.getUri(), dbName: 'rem_process_restart' });
  const children = [];
  const start = mode => {
    const child = fork(new URL('./fixtures/rem-process-worker.mjs', import.meta.url), [], {
      env: { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR,
        NODE_ENV: 'test', OFFLOAD_SKIP_ENV: '1', LANGSMITH_TRACING: 'false' },
      stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
    });
    children.push(child);
    let stderr = '';
    child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-4000); });
    const outcome = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`REM child timed out. ${stderr}`)), 45000);
      child.once('message', message => { clearTimeout(timer); message.type === 'error' ? reject(new Error(message.message)) : resolve(message); });
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('exit', (code, signal) => { clearTimeout(timer); reject(new Error(`REM child exited before result: ${code}/${signal}. ${stderr}`)); });
    });
    child.send({ uri: mongo.getUri(), mode, runId: 'killed-after-send' });
    return { child, outcome };
  };
  try {
    await ensureIndexes(db, { search: false });
    await seedConnections(db, { now: Date.now() });
    await commitHarness(db, { parent: null, genome: GEN0, now: Date.now() });
    const first = start('crash');
    assert.equal((await first.outcome).type, 'effect-persisted');
    const pending = await db.collection('effects').findOne({ runId: 'killed-after-send' });
    assert.equal(pending.status, 'pending');
    const saved = await createPersistentWorld(db, LIVE_WORKSPACE);
    assert.equal(saved.state.sent.length, 1);
    assert.ok(saved.findEffect(pending.effectKey));
    const exited = once(first.child, 'exit');
    first.child.kill('SIGKILL');
    assert.deepEqual(await exited, [null, 'SIGKILL']);
    // Preserve the real 30-second lease. No forced expiry or in-process resumption.
    const second = start('recover');
    assert.notEqual(first.child.pid, second.child.pid);
    assert.deepEqual(await second.outcome, { type: 'terminal', status: 'done', sent: 1 });
    const reconciled = await db.collection('effects').findOne({ effectKey: pending.effectKey });
    assert.equal(reconciled.status, 'committed');
    assert.equal(reconciled.outcome, 'reconciled');
    const restored = await createPersistentWorld(db, LIVE_WORKSPACE);
    assert.equal(restored.state.sent.length, 1);
    assert.equal(restored.executed.length, 1);
    assert.equal(await db.collection('fixture_effects').countDocuments(), 1);
    assert.equal((await db.collection('checkpoints').findOne({ runId: 'killed-after-send' })).status, 'done');
  } finally {
    await Promise.all(children.map(async child => {
      if (child.exitCode === null && child.signalCode === null) {
        const exited = once(child, 'exit'); child.kill('SIGKILL'); await exited;
      }
    }));
    await db.close(); await mongo.stop();
  }
});
