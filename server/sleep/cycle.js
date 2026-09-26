import { randomUUID } from 'node:crypto';
import { HarnessStore, LeaseLost } from '../harness/store.js';
import { similarity } from './embed.js';
import { CHECKS, CHECK_IDS, runChecks } from './checks.js';
import { diffSchema, PromotionConflict } from './policy.js';

export const STAGES = ['snapshot', 'consolidate', 'diagnose', 'propose', 'evaluate', 'decide'];
export const THRESHOLDS = { duplicate: 0.95, pattern: 0.75, minSupport: 2, heldOut: 6 };

// Sleep reviews reuse the harness run fencing: atomic claim, renewable lease,
// unique token, and stage output + checkpoint + receipt committed together.
export class SleepStore extends HarnessStore {
  constructor(db, options) { super(db, options); this.runs = db.collection('sleep_reports'); }
  start(workspace, requestKey) { return this.enqueue(workspace, requestKey, { kind: 'sleep' }); }
  latest(workspace) { return this.runs.findOne({ workspace }, { sort: { createdAt: -1 } }); }
}

// Policy rules become instructions; recalled memories are labelled as prior
// corrections. Shared by live runs and held-out evaluation so both see the same prompt.
export function policyContext(policy, input, memories = []) {
  const rules = policy.rules.map(r => `- ${r}`).join('\n');
  const lessons = memories.length ? `\nCorrections from earlier work:\n${memories.map(m => `- ${m.text}`).join('\n')}` : '';
  return { instructions: `${input.instructions}\nHarness policy v${policy.version}:\n${rules}${lessons}`, notes: input.notes,
    policy: { id: policy._id, version: policy.version, rules: policy.rules, checks: policy.checks },
    memories: memories.map(m => ({ id: m._id, kind: m.kind, text: m.text, score: m.score })) };
}

// Optional hooks for server/harness/workflow.js. The next handoff run reads the
// active policy and recalls memories from Atlas; verify records policy checks.
export function harnessHooks({ memory, policy }) {
  return {
    async context(run) {
      const active = await policy.active(run.workspace);
      const query = run.input.notes.map(n => n.text).join('\n').slice(0, 4000);
      const recalled = active.context.k ? await memory.recall(run.workspace, query, { k: active.context.k, kinds: active.context.kinds }) : [];
      return policyContext(active, run.input, recalled);
    },
    async verify(run) {
      const ids = run.outputs.context.policy?.checks || [];
      const results = runChecks(ids, run.outputs.draft, run.input.notes);
      return { policyVersion: run.outputs.context.policy?.version ?? null, policyChecks: results,
        failedChecks: Object.keys(results).filter(id => !results[id].passed) };
    },
  };
}

// Held-out cases: completed handoff runs not used as evidence, plus curated fixtures.
export function historyFixtures(db) {
  return async (workspace, { exclude = [], limit = THRESHOLDS.heldOut } = {}) => {
    const runs = await db.collection('harness_runs').find({ workspace, status: 'completed', _id: { $nin: exclude } })
      .sort({ createdAt: -1 }).limit(limit).toArray();
    const curated = await db.collection('sleep_fixtures').find({ workspace, _id: { $nin: exclude } }).limit(limit).toArray();
    return [...curated.map(f => ({ id: f._id, notes: f.notes })), ...runs.map(r => ({ id: r._id, notes: r.input.notes }))].slice(0, limit);
  };
}

async function ingestRunOutcomes({ db, memory }, workspace, cutoff) {
  const runs = await db.collection('harness_runs').find({ workspace, createdAt: { $lte: cutoff },
    $or: [{ status: 'failed' }, { 'outputs.verify.failedChecks.0': { $exists: true } }] }).sort({ createdAt: -1 }).limit(100).toArray();
  const seen = new Set((await memory.memories.find({ workspace, key: { $in: runs.map(r => `run:${r._id}`) } }, { projection: { key: 1 } }).toArray()).map(m => m.key));
  const items = runs.filter(r => !seen.has(`run:${r._id}`)).map(r => {
    const failed = r.outputs?.verify?.failedChecks || [];
    const text = r.status === 'failed' ? `Handoff run failed: ${r.error || 'unknown error'}`
      : `Handoff missed required checks: ${failed.map(id => CHECKS[id]?.description || id).join(' ')}`;
    return { kind: 'run_outcome', text, key: `run:${r._id}`, source: { type: 'harness_run', id: r._id, runId: r._id },
      meta: { failedChecks: failed }, createdAt: r.createdAt };
  });
  return items.length ? (await memory.remember(workspace, items)).map(m => m._id) : [];
}

export async function executeStage(report, deps) {
  const { memory, policy, reports, fence, thresholds = THRESHOLDS } = deps;
  const workspace = report.workspace, stage = STAGES[report.checkpoint], out = report.outputs;
  if (stage === 'snapshot') {
    const cutoff = report.createdAt;
    const last = await reports.runs.findOne({ workspace, status: 'completed', _id: { $ne: report._id } }, { sort: { createdAt: -1 } });
    const since = last?.outputs?.snapshot?.cutoff || new Date(0);
    await fence();
    const ingested = await ingestRunOutcomes(deps, workspace, cutoff);
    const fresh = await memory.memories.find({ workspace, current: true, createdAt: { $gt: since, $lte: cutoff } },
      { projection: { _id: 1 } }).sort({ createdAt: 1 }).limit(500).toArray();
    return { since, cutoff, memoryIds: fresh.map(m => m._id), ingested };
  }
  if (stage === 'consolidate') {
    const merged = [];
    for (const id of out.snapshot.memoryIds) {
      const m = await memory.memories.findOne({ _id: id, current: true });
      if (!m) continue;
      const matches = await memory.recall(workspace, m.text, { k: 3, kinds: [m.kind], exclude: [m._id], vector: m.embedding });
      const dup = matches.find(x => x.score >= thresholds.duplicate && x.createdAt <= m.createdAt);
      if (!dup) continue;
      await fence();
      if (await memory.supersede(workspace, dup._id, m._id))
        merged.push({ kept: m._id, superseded: dup._id, score: dup.score, text: m.text, supersededText: dup.text });
    }
    return { examined: out.snapshot.memoryIds.length, merged };
  }
  if (stage === 'diagnose') {
    const signals = await memory.memories.find({ workspace, current: true, kind: { $in: ['correction', 'run_outcome'] },
      addressedBy: { $exists: false }, createdAt: { $lte: out.snapshot.cutoff } }).sort({ createdAt: 1 }).limit(200).toArray();
    const clusters = [];
    for (const s of signals) {
      const home = clusters.find(c => similarity(c.seed.embedding, s.embedding) >= thresholds.pattern);
      home ? home.members.push(s) : clusters.push({ seed: s, members: [s] });
    }
    const patterns = [];
    for (const c of clusters) {
      const support = [...new Set(c.members.flatMap(m => [m._id, ...m.supportIds]))];
      if (support.length < thresholds.minSupport) continue;
      const lineage = await memory.memories.find({ _id: { $in: support } }, { projection: { source: 1 } }).toArray();
      patterns.push({ memoryIds: c.members.map(m => m._id), support, texts: c.members.map(m => m.text),
        runIds: [...new Set(lineage.map(m => m.source?.runId).filter(Boolean))],
        failedChecks: [...new Set(c.members.flatMap(m => m.meta?.failedChecks || []))] });
    }
    patterns.sort((a, b) => b.support.length - a.support.length);
    return { signals: signals.length, patterns };
  }
  if (stage === 'propose') {
    const pattern = out.diagnose.patterns[0];
    if (!pattern) return { skipped: `No pattern with at least ${thresholds.minSupport} supporting memories.` };
    const parent = await policy.active(workspace);
    const raw = await deps.proposer({ policy: { version: parent.version, rules: parent.rules, context: parent.context, checks: parent.checks },
      pattern: { texts: pattern.texts, failedChecks: pattern.failedChecks },
      checks: CHECK_IDS.map(id => ({ id, description: CHECKS[id].description })) });
    const diff = diffSchema.parse(raw?.diff || {});
    await fence();
    const candidate = await policy.propose(workspace, parent, diff, { sleepId: report._id, evidence: pattern.support, reason: String(raw?.reason || '').slice(0, 500) });
    return { parentId: parent._id, parentVersion: parent.version, candidateId: candidate._id, candidateVersion: candidate.version,
      diff, reason: candidate.reason, requiresApproval: !!candidate.requiresApproval, pattern };
  }
  if (stage === 'evaluate') {
    if (out.propose.skipped) return { skipped: out.propose.skipped };
    const [parent, candidate] = await Promise.all([out.propose.parentId, out.propose.candidateId].map(id => policy.policies.findOne({ _id: id })));
    const cases = await deps.fixtures(workspace, { exclude: out.propose.pattern.runIds, limit: thresholds.heldOut });
    const checkIds = [...new Set([...parent.checks, ...candidate.checks])];
    const results = [];
    for (const c of cases) for (const [label, p] of [['parent', parent], ['candidate', candidate]]) {
      let draft, error = null;
      try { draft = await deps.drafter(policyContext(p, { instructions: 'Prepare a concise project handoff.', notes: c.notes })); }
      catch (e) { if (e.retryable) throw e; error = 'Draft could not be produced.'; }
      const valid = draft && typeof draft.summary === 'string' && Array.isArray(draft.claims);
      const checks = valid ? runChecks(checkIds, draft, c.notes)
        : Object.fromEntries(checkIds.map(id => [id, { passed: false, applies: true }]));
      results.push({ caseId: c.id, policy: label, error: valid ? error : error || 'Invalid draft.', checks,
        passed: Object.values(checks).every(r => r.passed) });
    }
    const rate = label => cases.length ? results.filter(r => r.policy === label && r.passed).length / cases.length : 0;
    const regressions = [];
    for (const c of cases) for (const id of parent.checks) {
      const before = results.find(r => r.caseId === c.id && r.policy === 'parent').checks[id];
      const after = results.find(r => r.caseId === c.id && r.policy === 'candidate').checks[id];
      if (before.passed && !after.passed) regressions.push({ caseId: c.id, check: id });
    }
    return { heldOut: cases.length, checkIds, results, parentRate: rate('parent'), candidateRate: rate('candidate'), regressions };
  }
  if (stage === 'decide') {
    const e = out.evaluate, p = out.propose;
    if (e.skipped) return { decision: 'none', reason: e.skipped };
    const reject = async reason => { await fence(); await policy.reject(p.candidateId, reason); return { decision: 'rejected', reason, candidateId: p.candidateId }; };
    if (p.requiresApproval) return { decision: 'needs_approval', reason: 'Candidate requests new tool access. A person must approve it.', candidateId: p.candidateId };
    if (!e.heldOut) return reject('No held-out cases to evaluate against.');
    if (e.regressions.length) return reject(`Regressed ${e.regressions.length} previously passing check result(s).`);
    if (e.candidateRate <= e.parentRate) return reject('No held-out improvement over the active policy.');
    await fence();
    try { await policy.promote(workspace, p.candidateId, p.parentId); }
    catch (error) { if (error instanceof PromotionConflict) return reject(error.message); throw error; }
    await memory.memories.updateMany({ _id: { $in: p.pattern.support }, workspace }, { $set: { addressedBy: p.candidateId } });
    return { decision: 'promoted', reason: `Held-out pass rate ${e.parentRate.toFixed(2)} to ${e.candidateRate.toFixed(2)} with no regressions.`,
      candidateId: p.candidateId, version: p.candidateVersion };
  }
  throw new Error('Unknown sleep stage.');
}

export async function sleepTick(reports, deps, worker = randomUUID()) {
  const report = await reports.claim(worker);
  if (!report) return null;
  let lost = false;
  const heartbeat = setInterval(() => { reports.renew(report).catch(() => { lost = true; }); }, Math.max(10, Math.floor(reports.leaseMs / 3)));
  // Every side effect is preceded by a lease check and is itself idempotent.
  const fence = async () => { if (lost) throw new LeaseLost('Lease lost.'); await reports.renew(report); };
  try {
    const output = await executeStage(report, { ...deps, reports, fence });
    if (lost) throw new LeaseLost('Lease renewal failed.');
    return await reports.commit(report, STAGES[report.checkpoint], output, report.checkpoint === STAGES.length - 1);
  } catch (error) {
    if (!(error instanceof LeaseLost)) await reports.fail(report, error.retryable === true || ['TimeoutError', 'TypeError'].includes(error.name));
    return null;
  } finally { clearInterval(heartbeat); }
}
