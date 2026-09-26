import {createHash} from 'node:crypto';
import {createJevScorer} from './jev.js';
const hash = value => createHash('sha256').update(value).digest('hex');
const PART_CHARS = 16000;
const PIN = /\b(blocker|blocked|unresolved|must|never|do not|don't|correction|failed|error|reopened|pending|deadline|denied|not authorized|without approval|permission|constraint|required|awaiting|acceptance|prohibited)\b/i;
const POLICY_VERSION = 'causal-evidence-v2';
const STATE_CHARS = 4000;

// The caller's dedupeKey certifies an identical idempotent observation. Other new
// evidence invalidates decisions, even when the goal and caller revision did not change.
export function contextEvidenceKey(units) {
  const seen = new Set();
  return hash(JSON.stringify(units.flatMap(unit => {
    const identity = unit.dedupeKey ? `read:${unit.dedupeKey}` : `record:${unit.id}:${hash(unit.text)}`;
    if (seen.has(identity)) return [];
    seen.add(identity);
    return [[identity, unit.pinned || null, unit.complete ?? null]];
  })));
}

// Share bounded current evidence across batches so a late reference can revive an
// older record. This is context, never an instruction or a generated summary.
export function contextEvidenceWindow(units, maxChars = STATE_CHARS) {
  const seen = new Set(), unique = units.filter(unit => {
    const identity = unit.dedupeKey || unit.id;
    if (seen.has(identity)) return false;
    seen.add(identity); return true;
  });
  const records = []; let chars = 0;
  // Recent observations and short older facts travel across candidate batches.
  const candidates = [...unique.slice(-2).reverse(), ...unique.filter(u => u.pinned || PIN.test(u.text)).reverse(), ...unique.filter(u => u.text.length <= 512).reverse()];
  const included = new Set();
  for (const unit of candidates) {
    if (included.has(unit.id)) continue;
    const record = {id: unit.id, text: unit.text};
    const size = JSON.stringify(record).length + 1;
    if (chars + size > maxChars - 2) continue;
    included.add(unit.id); records.push(record); chars += size;
  }
  records.reverse();
  return {records, chars: JSON.stringify(records).length, partial: records.length < unique.length};
}

function unfinishedProtocol(text) {
  if (!text.trimStart().startsWith('[')) return false;
  let messages;
  try { messages = JSON.parse(text); } catch { return false; }
  if (!Array.isArray(messages) || !messages.some(m => m?.role === 'tool' || m?.tool_calls)) return false;
  const outstanding = new Set();
  for (const message of messages) {
    for (const call of message.tool_calls || []) {
      if (!call.id || outstanding.has(call.id)) return true;
      outstanding.add(call.id);
    }
    if (message.role === 'tool' && !outstanding.delete(message.tool_call_id)) return true;
  }
  return outstanding.size > 0;
}
export class ContextBudgetError extends Error {
  constructor(metrics) {
    super('Protected or uncertain context exceeds the budget. Narrow the task or increase the context budget.');
    this.name = 'ContextBudgetError';
    this.metrics = metrics;
  }
}

// Raw text is stored in bounded MongoDB documents. Selection never deletes source records.
export function createContextCompactor({db, scorer = createJevScorer(), budgetChars = 16000, recentCount = 2, threshold = 0.25, maxDecisionCalls = 16} = {}) {
  if (!db) throw Error('Context compaction requires a database.');
  if (!Number.isInteger(budgetChars) || budgetChars < 100 || !Number.isInteger(recentCount) || recentCount < 0 || !Number.isFinite(threshold) || threshold < 0 || threshold > 0.5) throw Error('Invalid context policy.');
  if (!Number.isInteger(maxDecisionCalls) || maxDecisionCalls < 0 || maxDecisionCalls > 16) throw Error('Invalid decision call budget.');
  const archive = db.collection('context_archive'), decisions = db.collection('context_decisions');
  return {
    name: scorer.name,
    async select({runId, goal, units, revision = "", signal}) {
      if (typeof runId !== 'string' || !runId || typeof goal !== 'string' || !goal || typeof revision !== 'string' || !Array.isArray(units) || units.some(u => !u || typeof u.id !== 'string' || !u.id || u.id.length > 200 || typeof u.text !== 'string' || (u.dedupeKey != null && typeof u.dedupeKey !== 'string')) || new Set(units.map(u => u.id)).size !== units.length) throw Error('Invalid context records.');
      signal?.throwIfAborted();
      const beforeChars = units.reduce((n, u) => n + u.text.length, 0);
      const metrics = {source: scorer.name, beforeChars, afterChars: beforeChars, budgetChars, retained: units.length, archived: 0, duplicateOmissions: 0, decisionCalls: 0, cacheHits: 0, inputTokens: 0, outputTokens: 0, reportedCost: 0, costKnown: true, usageKnown: true, errors: [], status: 'under_budget'};
      try {
      if (beforeChars <= budgetChars) return {units, decisions: [], metrics};
      const evidenceKey = contextEvidenceKey(units), currentEvidence = contextEvidenceWindow(units);
      const stateKey = hash(JSON.stringify({goal, revision, evidenceKey, scorer: scorer.name, scorerPolicy: scorer.policyVersion || null, policy: POLICY_VERSION}));
      Object.assign(metrics, {evidenceKey, stateChars: currentEvidence.chars, statePartial: currentEvidence.partial, unscored: 0});
      const scored = [];
      const latestEquivalent = new Map();
      for (const unit of units) if (unit.dedupeKey) latestEquivalent.set(unit.dedupeKey, unit.id);
      const archiveWrites = [];
      for (const [index, unit] of units.entries()) {
        const digest = hash(unit.text), recordKey = hash(JSON.stringify([runId, unit.id, digest]));
        const parts = Math.max(1, Math.ceil(unit.text.length / PART_CHARS));
        for (let part = 0; part < parts; part++) {
          const id = `${recordKey}:${part}`;
          archiveWrites.push({updateOne: {filter: {_id: id}, update: {$setOnInsert: {runId, unitId: unit.id, digest, part, parts, text: unit.text.slice(part * PART_CHARS, (part + 1) * PART_CHARS), createdAt: new Date()}}, upsert: true}});
        }
        const protectedReason = unit.pinned || (unit.complete === false || unfinishedProtocol(unit.text) ? 'unfinished_exchange' : null) || (index >= units.length - recentCount ? 'recent' : PIN.test(unit.text) ? 'constraint_or_open_loop' : unit.text.length > 8000 ? 'oversize_record' : null);
        const duplicateOf = !protectedReason && unit.dedupeKey && latestEquivalent.get(unit.dedupeKey) !== unit.id ? latestEquivalent.get(unit.dedupeKey) : null;
        const key = hash(JSON.stringify([recordKey, stateKey]));
        scored.push({unit, key, digest, protectedReason, duplicateOf, probability: null, cached: false});
      }
      const [existingParts, cachedDecisions] = await Promise.all([
        findIds(archive, runId, archiveWrites.map(op => op.updateOne.filter._id), {_id: 1}),
        findIds(decisions, runId, scored.filter(s => !s.protectedReason && !s.duplicateOf).map(s => s.key)),
      ]);
      const knownParts = new Set(existingParts.map(p => p._id));
      const cachedById = new Map(cachedDecisions.map(d => [d._id, d]));
      for (const s of scored) {
        const cached = cachedById.get(s.key);
        if (cached && Number.isFinite(cached.probability) && cached.probability >= 0 && cached.probability <= 1) {
          s.probability = cached.probability; s.cached = true; metrics.cacheHits++;
        }
      }
      // Archive commits precede omission. A partial write is retried by id after restart.
      await writeBatch(archive, archiveWrites.filter(op => !knownParts.has(op.updateOne.filter._id)));
      const candidates = scored.filter(s => !s.protectedReason && !s.duplicateOf && !s.cached);
      const batchUnits = Number.isInteger(scorer.maxBatchUnits) && scorer.maxBatchUnits > 0 ? Math.min(16, scorer.maxBatchUnits) : 8;
      // Bound work per selection. Unscored records are retained, never implicitly discarded.
      for (let offset = 0, calls = 0; offset < candidates.length && calls < maxDecisionCalls; calls++) {
        const batch = []; let chars = 0;
        while (offset < candidates.length && batch.length < batchUnits && chars + candidates[offset].unit.text.length <= 10000) {
          const candidate = candidates[offset++]; batch.push(candidate); chars += candidate.unit.text.length;
        }
        signal?.throwIfAborted();
        metrics.decisionCalls++;
        try {
          const result = await scorer.score({goal, revision, currentEvidence, units: batch.map(s => s.unit), signal});
          const usage = result.usage || {};
          const validUsage = v => Number.isFinite(v) && v >= 0;
          metrics.usageKnown &&= validUsage(usage.inputTokens) && validUsage(usage.outputTokens);
          metrics.costKnown &&= validUsage(usage.cost);
          metrics.inputTokens += validUsage(usage.inputTokens) ? usage.inputTokens : 0;
          metrics.outputTokens += validUsage(usage.outputTokens) ? usage.outputTokens : 0;
          metrics.reportedCost += validUsage(usage.cost) ? usage.cost : 0;
          const decisionWrites = [];
          for (const s of batch) {
            const matches = Array.isArray(result.scores) ? result.scores.filter(v => v?.id === s.unit.id) : [];
            const p = matches.length === 1 ? matches[0].probability : null;
            if (!Number.isFinite(p) || p < 0 || p > 1) continue;
            s.probability = p;
            decisionWrites.push({updateOne: {filter: {_id: s.key}, update: {$setOnInsert: {runId, unitId: s.unit.id, stateKey, digest: s.digest, probability: p, source: scorer.name, createdAt: new Date()}}, upsert: true}});
          }
          await writeBatch(decisions, decisionWrites);
        } catch (error) {
          metrics.usageKnown = false; metrics.costKnown = false;
          signal?.throwIfAborted();
          // Do not persist errors or cache a failed request as a decision.
          metrics.errors.push(/^Jev HTTP \d+$/.test(error.message) ? error.message : 'Jev unavailable');
          break;
        }
      }
      metrics.unscored = scored.filter(s => !s.protectedReason && !s.duplicateOf && s.probability === null).length;
      const retained = scored.filter(s => !s.duplicateOf && (s.protectedReason || s.probability === null || s.probability >= threshold));
      metrics.afterChars = retained.reduce((n, s) => n + s.unit.text.length, 0);
      metrics.duplicateOmissions = scored.filter(s => s.duplicateOf).length;
      metrics.retained = retained.length; metrics.archived = units.length - retained.length;
      metrics.status = metrics.afterChars <= budgetChars ? 'compacted' : 'needs_review';
      const audit = scored.map(s => ({id: s.unit.id, digest: s.digest, probability: s.probability, distribution: s.probability === null ? null : {keep: s.probability, omit: 1 - s.probability}, kept: retained.includes(s), duplicateOf: s.duplicateOf, reason: s.protectedReason || (s.duplicateOf ? 'identical_read' : null) || (s.probability === null ? 'uncertain' : 'jev')}));
      if (metrics.status === 'needs_review') throw new ContextBudgetError({...metrics, decisions: audit});
      return {units: retained.map(s => s.unit), decisions: audit, metrics};
      } catch(error) {
        if(error && typeof error==='object') {error.metrics ||= metrics;throw error;}
        throw Object.assign(new Error('Context selection stopped.'),{cause:error,metrics});
      }
    },
    async read({runId, id, part = 0, digest}) {
      if (typeof id !== 'string' || id.length > 200 || (digest !== undefined && (typeof digest !== 'string' || !/^[a-f0-9]{64}$/.test(digest))) || !Number.isInteger(part) || part < 0) throw Error('Invalid context part.');
      const doc = await archive.findOne({runId, unitId: id, part, ...(digest ? {digest} : {})}, {sort: {createdAt: -1}});
      if (!doc) return {error: 'No archived context in this run matches that id and part.'};
      return {id, digest: doc.digest, part, parts: doc.parts, text: doc.text};
    },
    async list({runId, offset = 0}) {
      if (!Number.isInteger(offset) || offset < 0) throw Error('Invalid context offset.');
      const docs = await archive.find({runId, part: 0}, {sort: {createdAt: 1, unitId: 1}, skip: offset, limit: 20, projection: {text: 0}}).toArray();
      return {records: docs.map(d => ({id: d.unitId, digest: d.digest, parts: d.parts})), nextOffset: docs.length === 20 ? offset + 20 : null};
    },
  };
}

async function writeBatch(collection, operations) {
  for (let i = 0; i < operations.length; i += 128) {
    const batch = operations.slice(i, i + 128);
    if (collection.bulkWrite) await collection.bulkWrite(batch, {ordered: false});
    else for (const {updateOne: op} of batch) await collection.updateOne(op.filter, op.update, {upsert: op.upsert});
  }
}

async function findIds(collection, runId, ids, projection) {
  const docs = [];
  for (let i = 0; i < ids.length; i += 128) {
    docs.push(...await collection.find({runId, _id: {$in: ids.slice(i, i + 128)}}, {projection}).toArray());
  }
  return docs;
}
