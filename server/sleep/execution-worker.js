import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { connectStore } from '../harness/store.js';
import { SleepExecutionStore } from './execution-store.js';
import { sleepExecutionTick } from './execution.js';
import { sleepOpenRouterExecutor } from './execution-provider.js';
import { loadLocalEnv } from '../env.js';

export function startSleepExecutionWorker(store, executor, { root, pollMs = 1000 } = {}) {
  const controller = new AbortController(), worker = randomUUID();
  const done = (async () => {
    while (!controller.signal.aborted) {
      try {
        const result = await sleepExecutionTick(store, executor, { root, worker, signal: controller.signal });
        if (result) continue;
      } catch (e) { console.warn('Sleep task worker failed:', e.name); }
      await new Promise(resolve => {
        const stop = () => { clearTimeout(timer); resolve(); };
        const timer = setTimeout(() => { controller.signal.removeEventListener('abort', stop); resolve(); }, pollMs);
        controller.signal.addEventListener('abort', stop, { once: true });
        if (controller.signal.aborted) stop();
      });
    }
  })();
  return { stop: () => controller.abort(), done };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  loadLocalEnv();
  const connection = await connectStore();
  const store = new SleepExecutionStore(connection.client.db(process.env.MONGODB_DATABASE || 'offload_hackathon'));
  await store.initialize();
  const dataDir = path.resolve(process.env.OFFLOAD_DATA_DIR || '.data');
  const worker = startSleepExecutionWorker(store, sleepOpenRouterExecutor({ dataDir }), {
    root: path.resolve(process.env.SLEEP_TASK_ROOT || path.join(dataDir, 'sleep-artifacts')),
  });
  process.once('SIGTERM', worker.stop); process.once('SIGINT', worker.stop);
  console.log('Sleep task worker running. Scope: isolated local draft files.');
  try { await worker.done; } finally { await connection.client.close(); }
}
