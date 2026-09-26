#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { BSON, MongoClient } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
let outputRoot = path.join(process.cwd(), 'artifacts/query-demo');
const outputAt = args.indexOf('--output');
if (outputAt !== -1) {
  if (!args[outputAt + 1] || args[outputAt + 1].startsWith('--')) throw new Error('--output requires a directory');
  outputRoot = path.resolve(args[outputAt + 1]);
  args.splice(outputAt, 2);
}
const usage = 'Usage: node scripts/query-demo.mjs --baseline | --candidate-index \'{"field":1}\'';
if (args[0] === '--help') { console.log(usage); process.exit(0); }
let candidate;
try {
  if (args.length === 1 && args[0] === '--baseline') candidate = null;
  else if (args.length === 2 && args[0] === '--candidate-index') {
    candidate = JSON.parse(args[1]);
    const fields = new Set(['tenantId', 'status', 'createdAt', '_id', 'service', 'region', 'durationMs']);
    assert.ok(candidate && typeof candidate === 'object' && !Array.isArray(candidate));
    const keys = Object.entries(candidate);
    assert.ok(keys.length > 0 && keys.length <= 6 && keys.every(([field, direction]) => fields.has(field) && [1, -1].includes(direction)));
  } else throw new Error(usage);
} catch (error) {
  console.error(JSON.stringify({ error: 'Invalid arguments or index key pattern', detail: error.message, usage }));
  process.exit(1);
}

const pipeline = BSON.EJSON.parse(await readFile(path.join(root, 'fixtures/query-demo/pipeline.json'), 'utf8'));
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const round = value => Math.round(value * 1000) / 1000;
const artifactDirectory = path.join(outputRoot, new Date().toISOString().replace(/[:.]/g, '-') + '-' + process.pid);
let mongo, client, cleanupPromise;
const cleanup = () => cleanupPromise ||= (async () => {
  try { if (client) await client.close(); }
  finally { if (mongo) await mongo.stop(); }
})();
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => {
  try { await cleanup(); } finally { process.exit(signal === 'SIGINT' ? 130 : 143); }
});

function dataset() {
  let state = 20260926;
  const random = () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 4294967296; };
  const anchor = Date.parse('2026-09-26T12:00:00.000Z');
  const statuses = ['succeeded', 'succeeded', 'succeeded', 'succeeded', 'succeeded', 'succeeded', 'succeeded', 'succeeded', 'running', 'queued', 'cancelled', 'failed'];
  return Array.from({ length: 40000 }, (_, i) => ({
    _id: `order-${String(i).padStart(6, '0')}`,
    tenantId: i % 5 === 0 ? 'northstar-engineering' : `tenant-${i % 40}`,
    status: statuses[Math.floor(random() * statuses.length)],
    createdAt: new Date(anchor - Math.floor(random() * 90 * 24 * 60) * 60000),
    service: ['checkout-api', 'payments-worker', 'fulfillment-api'][Math.floor(random() * 3)],
    region: ['us-east', 'eu-west'][Math.floor(random() * 2)],
    durationMs: Math.floor(random() * 180000),
    detail: `Synthetic checkout order ${i}. ` + 'Fixture payload; no customer data. '.repeat(12),
  }));
}

function planSummary(explain) {
  const cursor = explain.executionStats ? explain : explain.stages?.find(stage => stage.$cursor)?.$cursor;
  assert.ok(cursor?.executionStats, 'MongoDB explain did not include executionStats');
  const stages = new Set(), indexes = new Set();
  const visit = node => {
    if (!node || typeof node !== 'object') return;
    if (node.stage) stages.add(node.stage);
    if (node.indexName) indexes.add(node.indexName);
    for (const value of Object.values(node)) if (typeof value === 'object') visit(value);
  };
  visit(cursor.queryPlanner.winningPlan);
  const stats = cursor.executionStats;
  return { nReturned: stats.nReturned, totalDocsExamined: stats.totalDocsExamined, totalKeysExamined: stats.totalKeysExamined, executionTimeMillis: stats.executionTimeMillis, winningStages: [...stages], winningIndexes: [...indexes] };
}

async function measure(collection, label) {
  const elapsed = [];
  let rows;
  for (let i = 0; i < 5; i++) {
    const start = performance.now();
    const sample = await collection.aggregate(pipeline, { maxTimeMS: 20000, allowDiskUse: false }).toArray();
    elapsed.push(round(performance.now() - start));
    if (rows) assert.deepEqual(sample, rows, 'Repeated query returned different ordered results');
    rows = sample;
  }
  const explain = await collection.aggregate(pipeline, { maxTimeMS: 20000, allowDiskUse: false }).explain('executionStats');
  await writeFile(path.join(artifactDirectory, `${label}-explain.json`), JSON.stringify(explain, null, 2) + '\n');
  await writeFile(path.join(artifactDirectory, `${label}-results.json`), JSON.stringify(rows, null, 2) + '\n');
  return {
    rows,
    summary: { ...planSummary(explain), resultCount: rows.length, orderedResultsSha256: digest(rows), clientLatencyMs: { samples: elapsed, first: elapsed[0], median: [...elapsed].sort((a, b) => a - b)[2] } },
  };
}

let report;
try {
  await mkdir(artifactDirectory, { recursive: true });
  // This always starts a new loopback mongod. No connection URI or credentials are accepted.
  mongo = await MongoMemoryServer.create({ binary: { version: '8.2.6' }, instance: { ip: '127.0.0.1', dbName: 'query_demo' } });
  client = new MongoClient(mongo.getUri(), { serverSelectionTimeoutMS: 10000 });
  await client.connect();
  const db = client.db('query_demo'), collection = db.collection('orders');
  const documents = dataset();
  for (let i = 0; i < documents.length; i += 2000) await collection.insertMany(documents.slice(i, i + 2000));
  await collection.createIndex({ tenantId: 1 }, { name: 'legacy_tenant' });
  await collection.createIndex({ createdAt: -1 }, { name: 'legacy_recent' });
  const indexesBefore = await collection.indexes();
  const baseline = await measure(collection, 'baseline');
  let after = null, indexBuildMs = null;
  if (candidate) {
    const start = performance.now();
    await collection.createIndex(candidate, { name: 'candidate_from_argument' });
    indexBuildMs = round(performance.now() - start);
    after = await measure(collection, 'candidate');
    assert.deepEqual(after.rows, baseline.rows, 'Candidate changed the ordered results');
  }
  report = {
    fixture: 'query-demo-v1', engine: 'real local mongod', mongoVersion: (await db.command({ buildInfo: 1 })).version,
    dataset: { documents: documents.length, seed: 20260926, sha256: digest(documents), anchor: '2026-09-26T12:00:00.000Z', historyDays: 90, targetTenantShare: 0.2, synthetic: true },
    pipeline, indexesBefore: indexesBefore.map(({ name, key }) => ({ name, key })), candidateIndex: candidate, indexBuildMs,
    baseline: baseline.summary, candidate: after?.summary ?? null, orderedResultsIdentical: after ? true : null,
    limitations: ['Fresh synthetic fixture on one local process; not production traffic or production p95.', 'Seeding, repeated queries, and index creation warm caches; no cold-cache or concurrent-load claim.', 'Five client timing samples per plan; explain milliseconds are separate, coarse server timings.', 'Candidate is supplied by the caller. The MongoDB optimizer chooses the winning plan without a hint.'],
    artifacts: artifactDirectory,
  };
} catch (error) {
  console.error(JSON.stringify({ error: error.message, detail: 'The real local benchmark failed; no benchmark numbers are fabricated. MongoDB binary startup/download failures require a working local mongod binary.', artifacts: artifactDirectory }));
  process.exitCode = 1;
} finally {
  await cleanup();
}
if (report) {
  report.ephemeralMongoStopped = true;
  await writeFile(path.join(artifactDirectory, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
}
