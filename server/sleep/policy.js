import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { CHECK_IDS } from './checks.js';
import { KINDS } from './memory.js';

export class PromotionConflict extends Error {}
export const DEFAULT_POLICY = {
  rules: ['Cite only supplied source IDs.'],
  context: { k: 3, kinds: ['fact', 'correction'] },
  checks: ['citations'],
  tools: [],
};

// A proposal is data, never code: rule text, retrieval settings and checks from
// the fixed registry. Tool access can be requested but never auto-granted.
export const diffSchema = z.object({
  addRules: z.array(z.string().trim().min(3).max(240)).max(5).default([]),
  removeRules: z.array(z.string()).max(5).default([]),
  context: z.object({ k: z.number().int().min(0).max(10).optional(), kinds: z.array(z.enum(KINDS)).min(1).optional() }).strict().default({}),
  addChecks: z.array(z.enum(CHECK_IDS)).max(5).default([]),
  requestTools: z.array(z.string().max(60)).max(3).default([]),
}).strict();

export function applyDiff(parent, diff) {
  const d = diffSchema.parse(diff);
  const rules = [...parent.rules.filter(r => !d.removeRules.includes(r)), ...d.addRules.filter(r => !parent.rules.includes(r))];
  const checks = [...new Set([...parent.checks, ...d.addChecks])];
  return { rules, checks, tools: parent.tools, context: { ...parent.context, ...d.context },
    requiresApproval: d.requestTools.length > 0, requestedTools: d.requestTools };
}

// The head document is the single source of truth for which version is active.
// Promotion and rollback are one compare-and-swap on it, so concurrent
// promotions cannot leave two active versions or none.
export class PolicyStore {
  constructor(db) {
    this.policies = db.collection('harness_policies');
    this.heads = db.collection('harness_policy_heads');
  }
  async initialize() {
    await this.policies.createIndex({ workspace: 1, version: 1 }, { unique: true });
    await this.policies.createIndex({ workspace: 1, sleepId: 1 }, { unique: true, partialFilterExpression: { sleepId: { $type: 'string' } } });
  }
  async active(workspace) {
    let head = await this.heads.findOne({ _id: workspace });
    if (!head) {
      await this.policies.updateOne({ workspace, version: 1 }, { $setOnInsert: { _id: randomUUID(), status: 'active', parent: null,
        ...DEFAULT_POLICY, evidence: [], reason: 'Default harness policy.', createdAt: new Date() } }, { upsert: true })
        .catch(e => { if (e.code !== 11000) throw e; });
      const id = (await this.policies.findOne({ workspace, version: 1 }))._id;
      await this.heads.updateOne({ _id: workspace }, { $setOnInsert: { activeId: id, nextVersion: 2, updatedAt: new Date() } }, { upsert: true })
        .catch(e => { if (e.code !== 11000) throw e; });
      head = await this.heads.findOne({ _id: workspace });
    }
    return this.policies.findOne({ _id: head.activeId });
  }
  // Idempotent per sleep review so a resumed review reuses its candidate.
  async propose(workspace, parent, diff, { sleepId, evidence = [], reason = '' }) {
    const existing = await this.policies.findOne({ workspace, sleepId });
    if (existing) return existing;
    const head = await this.heads.findOneAndUpdate({ _id: workspace }, { $inc: { nextVersion: 1 } }, { returnDocument: 'before' });
    const candidate = { _id: randomUUID(), workspace, version: head.nextVersion, status: 'candidate', parent: parent._id,
      ...applyDiff(parent, diff), diff: diffSchema.parse(diff), evidence, reason, sleepId, createdAt: new Date() };
    try { await this.policies.insertOne(candidate); return candidate; }
    catch (error) { if (error.code !== 11000) throw error; return this.policies.findOne({ workspace, sleepId }); }
  }
  async promote(workspace, candidateId, expectedActiveId) {
    const candidate = await this.policies.findOne({ _id: candidateId, workspace });
    if (!candidate || candidate.requiresApproval) throw new PromotionConflict('Candidate cannot be promoted automatically.');
    if ((await this.heads.findOne({ _id: workspace }))?.activeId === candidateId) return candidate;
    const swapped = await this.heads.findOneAndUpdate({ _id: workspace, activeId: expectedActiveId },
      { $set: { activeId: candidateId, updatedAt: new Date() }, $push: { history: { from: expectedActiveId, to: candidateId, at: new Date(), kind: 'promote' } } });
    if (!swapped) throw new PromotionConflict('Active policy changed. Re-evaluate against the new version.');
    await this.policies.updateOne({ _id: expectedActiveId }, { $set: { status: 'retired' } });
    await this.policies.updateOne({ _id: candidateId }, { $set: { status: 'active', promotedAt: new Date() } });
    return this.policies.findOne({ _id: candidateId });
  }
  async reject(candidateId, reason) {
    await this.policies.updateOne({ _id: candidateId, status: 'candidate' }, { $set: { status: 'rejected', rejectedReason: reason } });
  }
  async rollback(workspace, expectedActiveId) {
    const current = await this.policies.findOne({ _id: expectedActiveId, workspace });
    if (!current?.parent) throw new PromotionConflict('No earlier version to restore.');
    const swapped = await this.heads.findOneAndUpdate({ _id: workspace, activeId: expectedActiveId },
      { $set: { activeId: current.parent, updatedAt: new Date() }, $push: { history: { from: expectedActiveId, to: current.parent, at: new Date(), kind: 'rollback' } } });
    if (!swapped) throw new PromotionConflict('Active policy changed. Reload before rolling back.');
    await this.policies.updateOne({ _id: expectedActiveId }, { $set: { status: 'rolled_back' } });
    await this.policies.updateOne({ _id: current.parent }, { $set: { status: 'active' } });
    return this.policies.findOne({ _id: current.parent });
  }
  async list(workspace) {
    const head = await this.heads.findOne({ _id: workspace });
    const versions = await this.policies.find({ workspace }).sort({ version: -1 }).limit(50).toArray();
    return { activeId: head?.activeId || null, history: head?.history || [], versions };
  }
}
