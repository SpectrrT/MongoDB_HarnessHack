import { MongoClient } from 'mongodb';
import { randomUUID, createHash } from 'node:crypto';

export class LeaseLost extends Error {}
export class RunConflict extends Error {}
export class HarnessStore {
  constructor(db, { leaseMs = 30000 } = {}) {
    this.runs = db.collection('harness_runs');
    this.leaseMs = leaseMs;
  }
  async initialize() {
    await this.runs.createIndex({ workspace: 1, requestKey: 1 }, { unique: true });
    await this.runs.createIndex({ status: 1, availableAt: 1, leaseUntil: 1 });
  }
  async enqueue(workspace, requestKey, input) {
    const fingerprint = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    const record = { _id: randomUUID(), workspace, requestKey, fingerprint, input,
      status: 'queued', checkpoint: 0, outputs: {}, receipts: [], attempts: 0,
      availableAt: new Date(0), leaseUntil: new Date(0), createdAt: new Date() };
    try { await this.runs.insertOne(record); return record; }
    catch (error) {
      if (error.code !== 11000) throw error;
      const existing = await this.runs.findOne({ workspace, requestKey });
      if (existing.fingerprint !== fingerprint) throw new RunConflict('Request key already used for different input.');
      return existing;
    }
  }
  async claim(worker) {
    const now = new Date();
    return this.runs.findOneAndUpdate({ status: { $in: ['queued', 'running'] },
      availableAt: { $lte: now }, leaseUntil: { $lte: now } }, {
      $set: { status: 'running', worker, leaseToken: randomUUID(), leaseUntil: new Date(+now + this.leaseMs) },
      $inc: { attempts: 1 },
    }, { sort: { createdAt: 1 }, returnDocument: 'after', includeResultMetadata: false });
  }
  guard(run) {
    return { _id: run._id, status: 'running', leaseToken: run.leaseToken,
      checkpoint: run.checkpoint, leaseUntil: { $gt: new Date() } };
  }
  async renew(run) {
    const result = await this.runs.updateOne(this.guard(run), {
      $set: { leaseUntil: new Date(Date.now() + this.leaseMs) },
    });
    if (!result.matchedCount) throw new LeaseLost('Worker lease expired or was replaced.');
  }
  async commit(run, step, output, final = false) {
    // Output, receipt and checkpoint commit in the same document atomically.
    const result = await this.runs.findOneAndUpdate(this.guard(run), {
      $set: { [`outputs.${step}`]: output, status: final ? 'completed' : 'queued',
        leaseUntil: new Date(0), availableAt: new Date(0), updatedAt: new Date() },
      $inc: { checkpoint: 1 },
      $push: { receipts: { key: `${run._id}:${step}`, step, completedAt: new Date() } },
      $unset: { leaseToken: '', worker: '' },
    }, { returnDocument: 'after', includeResultMetadata: false });
    if (!result) throw new LeaseLost('Stale worker cannot commit.');
    return result;
  }
  async fail(run, retryable) {
    const retry = retryable && run.attempts < 12;
    await this.runs.updateOne(this.guard(run), { $set: {
      status: retry ? 'queued' : 'failed', leaseUntil: new Date(0),
      availableAt: new Date(Date.now() + Math.min(30000, 500 * 2 ** Math.min(run.attempts, 6))),
      error: retry ? 'Temporary provider failure. Retrying.' : 'Run failed. Inspect provider configuration or input.',
    }, $unset: { leaseToken: '', worker: '' } });
  }
  async get(workspace, id) { return this.runs.findOne({ _id: id, workspace }); }
}
export async function connectStore() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI must point to the event Atlas sandbox.');
  const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  try {
    await client.connect();
    const store = new HarnessStore(client.db(process.env.MONGODB_DATABASE || 'offload_hackathon'));
    await store.initialize();
    return { client, store };
  } catch (error) { await client.close(); throw error; }
}
