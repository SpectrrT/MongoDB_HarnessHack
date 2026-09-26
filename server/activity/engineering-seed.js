// A clearly labeled synthetic history for the MongoDB engineer demonstration.
import { MongoClient } from 'mongodb';
import { fileURLToPath } from 'node:url';
import { ActivityStore, workspaceId, SAMPLE_MS } from './store.js';
import { embedText } from '../../rem/embed.js';
import { mongodbDemoOccurrences, MONGODB_DEMO } from '../../shared/mongodb-demo.js';

export const ENGINEERING_SAMPLE_DEVICE = 'example-mongodb-engineer';
export const ENGINEERING_STEPS = [
  { app: 'Google Chrome', title: 'Example: Atlas slow query review | orders service | p95 180 ms | timeouts 0.6%', url: 'https://cloud.mongodb.com/v2/example/orders/metrics' },
  { app: 'Google Chrome', title: 'Example: GitHub orders service | compare query shape and explain plan', url: 'https://github.com/example/orders-service' },
  { app: 'Google Chrome', title: 'Example: Issue review | draft index rollout and rollback checklist', url: 'https://linear.app/example/issue/ORD-42' },
  { app: 'Notion', title: 'Example: Orders review notes | staging checks and human approval', url: null },
];

export function engineeringSamples(now = new Date()) {
  return mongodbDemoOccurrences(now).flatMap(timestamp => ENGINEERING_STEPS.flatMap((step, index) => {
    const start = +new Date(timestamp) + index * 315000;
    return Array.from({ length: 60 }, (_, sample) => ({ ...step, ts: new Date(start + sample * SAMPLE_MS), source: 'seed', active: true }));
  }));
}

export async function seedEngineeringHistory(activity, { workspace = workspaceId(), now = new Date(), reset = false } = {}) {
  const filter = { workspace, device: ENGINEERING_SAMPLE_DEVICE, source: 'seed' };
  const existing = await activity.sessions.countDocuments(filter);
  if (existing && !reset) return { skipped: true, existing, source: 'seed', title: MONGODB_DEMO.title };
  if (reset) {
    await activity.events.deleteMany({ 'meta.workspace': workspace, 'meta.device': ENGINEERING_SAMPLE_DEVICE, source: 'seed' });
    await activity.sessions.deleteMany(filter);
  }
  const samples = engineeringSamples(now);
  await activity.ingest(workspace, ENGINEERING_SAMPLE_DEVICE, samples);
  await activity.sessionize(workspace, ENGINEERING_SAMPLE_DEVICE, { from: samples[0].ts, to: new Date(+samples.at(-1).ts + SAMPLE_MS) });
  const routines = await activity.routines(workspace);
  return { title: MONGODB_DEMO.title, source: 'seed', synthetic: true, samples: samples.length,
    sessions: await activity.sessions.countDocuments(filter),
    routines: routines.filter(r => r.source === 'seed' && r.steps.join('|') === 'cloud.mongodb.com|github.com|linear.app|Notion') };
}

async function main() {
  const args = process.argv.slice(2), option = args.indexOf('--database');
  const database = option >= 0 ? args[option + 1] : 'offload_engineering_demo';
  if (!/^offload_engineering_demo(?:_[a-z0-9]+)*$/.test(database || '')) throw new Error('Use a dedicated offload_engineering_demo database.');
  if (!process.env.MONGODB_URI) throw new Error('Set MONGODB_URI before seeding the example.');
  const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  try {
    await client.connect();
    const embedder = { key: 'local256', name: 'local hashing embedder (256 dims)', dims: 256,
      embed: async texts => texts.map(text => embedText(text, 256)), embedQuery: async text => embedText(text, 256) };
    const activity = await new ActivityStore(client.db(database), { embedder }).initialize();
    console.log(JSON.stringify({ database, ...(await seedEngineeringHistory(activity, { reset: args.includes('--reset') })) }, null, 2));
  } finally { await client.close(); }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1; });
