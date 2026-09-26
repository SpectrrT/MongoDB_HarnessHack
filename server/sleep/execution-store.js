import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { LeaseLost, RunConflict } from '../harness/store.js';

export const outputPath = z.string().min(1).max(120).regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/).refine(p => !p.includes('..'));
export const executionInput = z.object({
  title: z.string().trim().min(1).max(160), brief: z.string().trim().min(1).max(4000),
  deadline: z.number().finite(), budget: z.number().int().min(1000).max(1000000),
  checks: z.array(z.object({ path: outputPath, contains: z.array(z.string().min(1).max(300)).max(20).default([]),
    minBytes: z.number().int().min(1).max(100000).default(1), json: z.boolean().default(false) }).strict()).min(1).max(8),
  writeFiles: z.array(outputPath).max(8).default([]), maxAttempts: z.number().int().min(1).max(8).default(3),
  browserCheck: z.enum(['counter']).optional(),
}).strict();

export class SleepExecutionStore {
  constructor(db, { leaseMs = 30000, clock = Date.now } = {}) {
    this.tasks = db.collection('sleep_tasks'); this.leaseMs = leaseMs; this.clock = clock;
  }
  async initialize() {
    await this.tasks.createIndex({ workspace: 1, requestKey: 1 }, { unique: true });
    await this.tasks.createIndex({ status: 1, leaseUntil: 1, createdAt: 1 });
  }
  async enqueue(workspace, requestKey, value, metadata = {}) {
    const input = executionInput.parse(value), now = this.clock();
    if (input.deadline <= now || input.deadline > now + 31 * 86400000) throw new RunConflict('Choose a future deadline within 31 days.');
    if (input.writeFiles.some(p => !input.checks.some(c => c.path === p))) throw new RunConflict('Write permission must match a checked output file.');
    if (input.browserCheck && !input.checks.some(c => c.path === 'prototype.html')) throw new RunConflict('The counter check requires a checked prototype.html output.');
    const fingerprint = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    const task = { _id: randomUUID(), workspace, requestKey, fingerprint, input, status: 'queued',
      origin: metadata.origin === 'idle' ? 'idle' : 'assigned', ...(metadata.origin === 'idle' ? { idle: metadata.idle } : {}),
      runner: 'sleep-file-worker', tokensUsed: 0, tokensReserved: 0, usageUnknown: 0, cost: 0,
      calls: 0, repairs: 0, stalledAttempts: 0, checkpoint: 0, leaseUntil: new Date(0), createdAt: new Date(now), updatedAt: new Date(now),
      grants: input.writeFiles, events: [], artifacts: [], checkResults: [] };
    try { await this.tasks.insertOne(task); return task; }
    catch (e) {
      if (e.code !== 11000) throw e;
      const existing = await this.tasks.findOne({ workspace, requestKey });
      if (existing.fingerprint !== fingerprint) throw new RunConflict('Request key already used for another task.');
      return existing;
    }
  }
  get(workspace, id) { return this.tasks.findOne({ _id: id, workspace }); }
  list(workspace) { return this.tasks.find({ workspace }).sort({ createdAt: -1 }).limit(100).toArray(); }
  async claim(worker, { id, workspace } = {}) {
    const now = this.clock();
    if ((id && !workspace) || (workspace && !id)) throw new RunConflict('A scoped claim needs both task and owner.');
    const scope = id ? { _id: id, workspace } : { origin: { $ne: 'idle' } };
    return this.tasks.findOneAndUpdate({ ...scope, status: { $in: ['queued', 'running'] }, leaseUntil: { $lte: new Date(now) } }, {
      $set: { status: 'running', worker, leaseToken: randomUUID(), leaseUntil: new Date(now + this.leaseMs), updatedAt: new Date(now) },
    }, { sort: { createdAt: 1 }, returnDocument: 'after', includeResultMetadata: false });
  }
  guard(task) { return { _id: task._id, workspace: task.workspace, status: 'running', leaseToken: task.leaseToken,
    leaseUntil: { $gt: new Date(this.clock()) } }; }
  async update(task, update) {
    const saved = await this.tasks.findOneAndUpdate(this.guard(task), update, { returnDocument: 'after', includeResultMetadata: false });
    if (!saved) throw new LeaseLost('Sleep worker no longer owns this task.');
    Object.assign(task, saved); return saved;
  }
  async fence(task) {
    if (task.input.deadline <= this.clock()) throw new RunConflict('deadline');
    const result = await this.tasks.updateOne(this.guard(task), { $set: { leaseUntil: new Date(this.clock() + this.leaseMs) } });
    if (!result.matchedCount) throw new LeaseLost('Sleep worker no longer owns this task.');
  }
  async recoverReservation(task) {
    // A crash can hide billed usage. Charge the entire prior reservation before any new call.
    if (!task.tokensReserved) return;
    await this.update(task, { $inc: { tokensUsed: task.tokensReserved, usageUnknown: 1 },
      $set: { tokensReserved: 0 }, $push: { events: { type: 'unknown-usage', at: new Date(this.clock()) } } });
  }
  async reserve(task, amount) {
    if (!Number.isSafeInteger(amount) || amount <= 0 || amount > task.input.budget - task.tokensUsed - task.tokensReserved) throw new RunConflict('budget');
    await this.fence(task);
    await this.update(task, { $set: { tokensReserved: amount }, $inc: { calls: 1 },
      $push: { events: { type: 'model-start', reserved: amount, at: new Date(this.clock()) } } });
  }
  async settle(task, usage) {
    const valid = Number.isSafeInteger(usage?.input_tokens) && usage.input_tokens >= 0 && Number.isSafeInteger(usage?.output_tokens) && usage.output_tokens >= 0;
    const charged = valid ? usage.input_tokens + usage.output_tokens : task.tokensReserved;
    await this.update(task, { $inc: { tokensUsed: charged, usageUnknown: valid ? 0 : 1,
      cost: Number.isFinite(usage?.cost) && usage.cost >= 0 ? usage.cost : 0 }, $set: { tokensReserved: 0 },
      $push: { events: { type: 'model-usage', tokens: charged, measured: valid, at: new Date(this.clock()) } } });
  }
  async finish(task, status, fields = {}) {
    return this.update(task, { $set: { ...fields, status, leaseUntil: new Date(0), updatedAt: new Date(this.clock()) },
      $unset: { leaseToken: '', worker: '' }, $inc: { checkpoint: 1 },
      $push: { events: { type: status, reason: fields.reason || null, at: new Date(this.clock()) } } });
  }
  async control(workspace, id, action) {
    const task = await this.get(workspace, id);
    if (!task) return null;
    if (['completed', 'incomplete', 'cancelled'].includes(task.status)) throw new RunConflict('This task has already ended.');
    if (action === 'resume' && task.status !== 'paused') throw new RunConflict('Only a paused task can resume.');
    if (action === 'approve' && task.status !== 'approval') throw new RunConflict('No file changes await approval.');
    if (['approve', 'resume'].includes(action) && task.input.deadline <= this.clock()) throw new RunConflict('The deadline has passed.');
    const status = { pause: 'paused', resume: 'queued', cancel: 'cancelled', approve: 'queued' }[action];
    if (!status) throw new RunConflict('Invalid task action.');
    const fields = { status, leaseUntil: new Date(0), updatedAt: new Date(this.clock()) };
    if (action === 'approve') fields.approvedDigest = task.pendingDigest;
    if (action === 'resume') fields.stalledAttempts = 0;
    return this.tasks.findOneAndUpdate({ _id: id, workspace, status: task.status, checkpoint: task.checkpoint },
      [{ $set: { ...fields, tokensUsed: { $add: ['$tokensUsed', '$tokensReserved'] }, tokensReserved: 0,
        usageUnknown: { $add: ['$usageUnknown', { $cond: [{ $gt: ['$tokensReserved', 0] }, 1, 0] }] },
        checkpoint: { $add: ['$checkpoint', 1] } } }, { $unset: ['leaseToken', 'worker'] }],
      { returnDocument: 'after', includeResultMetadata: false });
  }
}

export function visibleTask(task) {
  const { workspace, leaseToken, worker, fingerprint, grants, approvedDigest, pendingDigest, ...rest } = task;
  // Lease directories are internal. Downloads always resolve through the owned task route.
  return { ...rest, id: task._id, ...task.input, artifacts: task.artifacts.map(({ directory, ...artifact }) => artifact) };
}
