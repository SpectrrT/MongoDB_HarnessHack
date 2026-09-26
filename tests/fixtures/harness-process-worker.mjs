import { MongoClient } from 'mongodb';
import { HarnessStore } from '../../server/harness/store.js';
import { tick } from '../../server/harness/worker.js';

process.once('message', async ({ uri, database, runId, mode }) => {
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db(database);
    const store = new HarnessStore(db, { leaseMs: 300 });
    const provider = async () => {
      await db.collection('test_provider_calls').insertOne({ pid: process.pid });
      if (mode === 'crash') {
        process.send({ type: 'provider-started' });
        await new Promise(() => {});
      }
      return { summary: 'Release blocked.', claims: [{ text: 'Review is pending.', sourceIds: ['note1'] }] };
    };
    const limit = Date.now() + 10000;
    while (Date.now() < limit) {
      await tick(store, provider, `child-${process.pid}`);
      const run = await store.get('restart-test', runId);
      if (['completed', 'failed'].includes(run.status)) {
        process.send({ type: 'terminal', status: run.status });
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    throw new Error('Child worker exceeded test time limit.');
  } catch (error) {
    process.send({ type: 'error', name: error.name, message: error.message });
    process.exitCode = 1;
  } finally {
    await client.close();
    process.disconnect();
  }
});
