import {createHash} from 'node:crypto';
import {createJevScorer} from './jev.js';
const hash = value => createHash('sha256').update(value).digest('hex');
const PART_CHARS = 16000;
const PIN = /\b(blocker|unresolved|must|never|do not|don't|correction|failed|error|reopened|pending|deadline|denied|not authorized|without approval|permission)\b/i;
export class ContextBudgetError extends Error {
  constructor(metrics) {
    super('Protected or uncertain context exceeds the budget. Narrow the task or increase the context budget.');
    this.name = 'ContextBudgetError';
    this.metrics = metrics;
  }
}

// Raw text is stored in bounded MongoDB documents. Selection never deletes source records.
export function createContextCompactor({db, scorer = createJevScorer(), budgetChars = 16000, recentCount = 2, threshold = 0.25} = {}) {
  if (!db) throw Error('Context compaction requires a database.');
  if (!Number.isInteger(budgetChars) || budgetChars < 100 || !Number.isInteger(recentCount) || recentCount < 0 || !Number.isFinite(threshold) || threshold < 0 || threshold > 0.5) throw Error('Invalid context policy.');
  const archive = db.collection('context_archive'), decisions = db.collection('context_decisions');
  return {
    name: scorer.name,
    async select({runId, goal, units, revision = "", signal}) {
      if (!runId || !goal || !Array.isArray(units) || new Set(units.map(u => u.id)).size !== units.length || units.some(u => typeof u.id !== 'string' || typeof u.text !== 'string')) throw Error('Invalid context records.');
      signal?.throwIfAborted();
      const beforeChars = units.reduce((n, u) => n + u.text.length, 0);
      const metrics = {source: scorer.name, beforeChars, afterChars: beforeChars, budgetChars, retained: units.length, archived: 0, duplicateOmissions: 0, decisionCalls: 0, cacheHits: 0, inputTokens: 0, outputTokens: 0, reportedCost: 0, costKnown: true, usageKnown: true, errors: [], status: 'under_budget'};
      if (beforeChars <= budgetChars) return {units, decisions: [], metrics};
      const stateKey = hash(JSON.stringify({goal, revision, scorer: scorer.name}));
      const scored = [];
      const latestEquivalent = new Map();
      for (const unit of units) if (unit.dedupeKey) latestEquivalent.set(unit.dedupeKey, unit.id);
      const [existingParts, cachedDecisions] = await Promise.all([
        archive.find({runId}, {projection: {_id: 1}}).toArray(),
        decisions.find({runId, stateKey}).toArray(),
      ]);
      const knownParts = new Set(existingParts.map(p => p._id));
      const cachedById = new Map(cachedDecisions.map(d => [d._id, d]));
      const archiveWrites = [];
      for (const [index, unit] of units.entries()) {
        const digest = hash(unit.text), recordKey = hash(JSON.stringify([runId, unit.id, digest]));
        const parts = Math.max(1, Math.ceil(unit.text.length / PART_CHARS));
        for (let part = 0; part < parts; part++) {
          const id = `${recordKey}:${part}`;
          if (!knownParts.has(id)) archiveWrites.push({updateOne: {filter: {_id: id}, update: {$setOnInsert: {runId, unitId: unit.id, digest, part, parts, text: unit.text.slice(part * PART_CHARS, (part + 1) * PART_CHARS), createdAt: new Date()}}, upsert: true}});
        }
        const protectedReason = unit.pinned || (unit.complete === false ? 'unfinished_exchange' : null) || (index >= units.length - recentCount ? 'recent' : PIN.test(unit.text) ? 'constraint_or_open_loop' : unit.text.length > 8000 ? 'oversize_record' : null);
        const duplicateOf = !protectedReason && unit.dedupeKey && latestEquivalent.get(unit.dedupeKey) !== unit.id ? latestEquivalent.get(unit.dedupeKey) : null;
        const key = hash(JSON.stringify([recordKey, stateKey]));
        const cached = protectedReason || duplicateOf ? null : cachedById.get(key);
        if (cached) metrics.cacheHits++;
        scored.push({unit, key, digest, protectedReason, duplicateOf, probability: cached?.probability ?? null, cached: Boolean(cached)});
      }
      // Archive commits precede omission. A partial write is retried by id after restart.
      await writeBatch(archive, archiveWrites);
      const candidates = scored.filter(s => !s.protectedReason && !s.duplicateOf && !s.cached);
      // Bound work per selection. Unscored records are retained, never implicitly discarded.
      for (let offset = 0, calls = 0; offset < candidates.length && calls < 16; calls++) {
        const batch = []; let chars = 0;
        while (offset < candidates.length && batch.length < 8 && chars + candidates[offset].unit.text.length <= 10000) {
          const candidate = candidates[offset++]; batch.push(candidate); chars += candidate.unit.text.length;
        }
        signal?.throwIfAborted();
        metrics.decisionCalls++;
        try {
          const result = await scorer.score({goal, revision, units: batch.map(s => s.unit), signal});
          const usage = result.usage || {};
          metrics.usageKnown &&= Number.isFinite(usage.inputTokens) && Number.isFinite(usage.outputTokens);
          metrics.costKnown &&= Number.isFinite(usage.cost);
          metrics.inputTokens += usage.inputTokens ?? 0; metrics.outputTokens += usage.outputTokens ?? 0; metrics.reportedCost += usage.cost ?? 0;
          const decisionWrites = [];
          for (const s of batch) {
            const p = result.scores?.find(v => v.id === s.unit.id)?.probability;
            if (!Number.isFinite(p) || p < 0 || p > 1) continue;
            s.probability = p;
            decisionWrites.push({updateOne: {filter: {_id: s.key}, update: {$setOnInsert: {runId, unitId: s.unit.id, stateKey, digest: s.digest, probability: p, source: scorer.name, createdAt: new Date()}}, upsert: true}});
          }
          await writeBatch(decisions, decisionWrites);
        } catch (error) {
          signal?.throwIfAborted();
          metrics.usageKnown = false; metrics.costKnown = false;
          // Do not persist errors or cache a failed request as a decision.
          metrics.errors.push(/^Jev HTTP \d+$/.test(error.message) ? error.message : 'Jev unavailable');
          break;
        }
      }
      const retained = scored.filter(s => !s.duplicateOf && (s.protectedReason || s.probability === null || s.probability >= threshold));
      metrics.afterChars = retained.reduce((n, s) => n + s.unit.text.length, 0);
      metrics.duplicateOmissions = scored.filter(s => s.duplicateOf).length;
      metrics.retained = retained.length; metrics.archived = units.length - retained.length;
      metrics.status = metrics.afterChars <= budgetChars ? 'compacted' : 'needs_review';
      const audit = scored.map(s => ({id: s.unit.id, digest: s.digest, probability: s.probability, distribution: s.probability === null ? null : {keep: s.probability, omit: 1 - s.probability}, kept: retained.includes(s), duplicateOf: s.duplicateOf, reason: s.protectedReason || (s.duplicateOf ? 'identical_read' : null) || (s.probability === null ? 'uncertain' : 'jev')}));
      if (metrics.status === 'needs_review') throw new ContextBudgetError({...metrics, decisions: audit});
      return {units: retained.map(s => s.unit), decisions: audit, metrics};
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
