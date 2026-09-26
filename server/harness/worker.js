import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { connectStore, LeaseLost } from './store.js';
import { executeStep, openRouterProvider, steps } from './workflow.js';

export async function tick(store, provider, worker = randomUUID(), hooks = {}, workflow = { executeStep, steps }) {
  const run = await store.claim(worker);
  if (!run) return null;
  let lost = false;
  const heartbeat = setInterval(() => { store.renew(run).catch(() => { lost = true; }); }, Math.max(10, Math.floor(store.leaseMs / 3)));
  try {
    const output = await workflow.executeStep(run, provider, hooks);
    if (lost) throw new LeaseLost('Lease renewal failed.');
    return await store.commit(run, workflow.steps[run.checkpoint], output, run.checkpoint === workflow.steps.length - 1);
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
  const personal = await (await import('../suggestions/service.js')).createPersonalSuggestions({ db: client.db(process.env.MONGODB_DATABASE || 'offload_hackathon') });
  console.log('Durable worker started.');
  try {
    while (!stopping) {
      await personal.recoverAccepted();
      await personal.workOnce(worker);
      await tick(store, provider, worker, hooks);
      await new Promise(resolve => setTimeout(resolve, 250));
    }
  } finally { await client.close(); }
}
