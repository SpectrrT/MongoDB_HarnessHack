import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { connectStore, LeaseLost } from './store.js';
import { executeStep, openRouterProvider, steps } from './workflow.js';

export async function tick(store, provider, worker = randomUUID(), hooks = {}) {
  const run = await store.claim(worker);
  if (!run) return null;
  let lost = false;
  const heartbeat = setInterval(() => { store.renew(run).catch(() => { lost = true; }); }, Math.max(10, Math.floor(store.leaseMs / 3)));
  try {
    const output = await executeStep(run, provider, hooks);
    if (lost) throw new LeaseLost('Lease renewal failed.');
    return await store.commit(run, steps[run.checkpoint], output, run.checkpoint === steps.length - 1);
  } catch (error) {
    if (!(error instanceof LeaseLost)) await store.fail(run, error.retryable === true || ['TimeoutError', 'TypeError'].includes(error.name));
    return null;
  } finally { clearInterval(heartbeat); }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let stopping = false;
  process.on('SIGTERM', () => { stopping = true; });
  process.on('SIGINT', () => { stopping = true; });
  const { client, store } = await connectStore();
  const provider = openRouterProvider(), worker = randomUUID();
  const hooks = {};
  console.log('Durable worker started.');
  try {
    while (!stopping) {
      await tick(store, provider, worker, hooks);
      await new Promise(resolve => setTimeout(resolve, 250));
    }
  } finally { await client.close(); }
}
