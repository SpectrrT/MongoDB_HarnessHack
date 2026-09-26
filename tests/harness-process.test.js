import test from 'node:test';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import { HarnessStore, LeaseLost } from '../server/harness/store.js';

test('SIGKILL and a fresh worker recover the persisted handoff without duplicate checkpoints', { timeout: 30000 }, async () => {
  const mongo = await MongoMemoryServer.create();
  const client = new MongoClient(mongo.getUri());
  const children = [];
  const start = (runId, mode) => {
    const child = fork(new URL('./fixtures/harness-process-worker.mjs', import.meta.url), [], {
      env: { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR,
        NODE_ENV: 'test', OFFLOAD_SKIP_ENV: '1', LANGSMITH_TRACING: 'false' },
      stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
    });
    children.push(child);
    let stderr = '';
    child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-4000); });
    const outcome = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Child worker timed out. ${stderr}`)), 12000);
      child.once('message', message => { clearTimeout(timer); message.type === 'error' ? reject(new Error(message.message)) : resolve(message); });
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('exit', (code, signal) => { clearTimeout(timer); reject(new Error(`Child exited before result: ${code}/${signal}. ${stderr}`)); });
    });
    child.send({ uri: mongo.getUri(), database: 'process_restart', runId, mode });
    return { child, outcome };
  };
  try {
    await client.connect();
    const store = new HarnessStore(client.db('process_restart'), { leaseMs: 300 });
    await store.initialize();
    const run = await store.enqueue('restart-test', 'one-run', {
      instructions: 'Project handoff', notes: [{ id: 'note1', text: 'Release is blocked pending review.' }],
    });
    const first = start(run._id, 'crash');
    assert.equal((await first.outcome).type, 'provider-started');
    const abandoned = await store.get('restart-test', run._id);
    assert.equal(abandoned.status, 'running');
    assert.equal(abandoned.checkpoint, 1);
    assert.deepEqual(abandoned.receipts.map(r => r.step), ['context']);
    const exited = once(first.child, 'exit');
    first.child.kill('SIGKILL');
    assert.deepEqual(await exited, [null, 'SIGKILL']);
    // No lease mutation: the replacement must wait for the actual dead worker's lease.
    const second = start(run._id, 'recover');
    assert.notEqual(first.child.pid, second.child.pid);
    assert.deepEqual(await second.outcome, { type: 'terminal', status: 'completed' });
    const done = await store.get('restart-test', run._id);
    assert.equal(done.checkpoint, 4);
    assert.deepEqual(done.receipts.map(r => r.step), ['context', 'draft', 'verify', 'artifact']);
    assert.equal(new Set(done.receipts.map(r => r.key)).size, 4);
    assert.equal(done.outputs.artifact.id, `${run._id}:handoff`);
    assert.equal(done.outputs.verify.passed, true);
    assert.equal(await client.db('process_restart').collection('test_provider_calls').countDocuments(), 2);
    await assert.rejects(store.commit(abandoned, 'draft', { stale: true }), LeaseLost);
    // A third real worker sees the terminal record and does not call the provider again.
    const third = start(run._id, 'recover');
    assert.equal((await third.outcome).status, 'completed');
    assert.equal(await client.db('process_restart').collection('test_provider_calls').countDocuments(), 2);
  } finally {
    await Promise.all(children.map(async child => {
      if (child.exitCode === null && child.signalCode === null) {
        const exited = once(child, 'exit'); child.kill('SIGKILL'); await exited;
      }
    }));
    await client.close();
    await mongo.stop();
  }
});
