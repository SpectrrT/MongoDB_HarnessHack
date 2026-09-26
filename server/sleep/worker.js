import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { connectStore } from '../harness/store.js';
import { sleepTick } from './cycle.js';
import { createSleep, liveDeps } from './index.js';

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let stopping = false;
  process.on('SIGTERM', () => { stopping = true; });
  process.on('SIGINT', () => { stopping = true; });
  const { client } = await connectStore();
  const sleep = await createSleep(client.db(process.env.MONGODB_DATABASE || 'offload_hackathon'));
  const deps = liveDeps(sleep), worker = randomUUID();
  console.log(`Sleep worker started (${sleep.memory.vectorMode} vector search).`);
  try {
    while (!stopping) {
      await sleepTick(sleep.reports, deps, worker);
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  } finally { await client.close(); }
}
