// Human permission allows evaluation. It does not bypass the no-regression gate.
import { applyEdit, commitHarness, currentHarness, diffGenomes } from './harness.js';
import { compareFitness, regressions, runGym } from './gym.js';
import { challenge } from './attacks.js';
import { TOOLS } from './world.js';

export async function validateAuthority(ctx, parent, edit) {
  if (!edit || !['scope.grant', 'guardrail.loosen', 'guardrail.remove'].includes(edit.type))
    return { passed: false, reason: 'Unsupported authority edit.' };
  if (edit.type === 'scope.grant' && !Object.hasOwn(TOOLS, edit.target))
    return { passed: false, reason: 'The requested tool is not implemented.' };
  if (edit.type.startsWith('guardrail.') && !parent.genome.guardrails.some(g => g.id === edit.target))
    return { passed: false, reason: 'The guardrail no longer exists.' };
  const genome = applyEdit(parent.genome, edit);
  if (!diffGenomes(parent.genome, genome).length)
    return { passed: false, reason: 'The proposed authority change is already applied.' };
  const skills = await ctx.db.collection('skills').find({ status: { $in: ['practiced', 'approved', 'autonomous'] } }).toArray();
  const opts = { model: ctx.model, embedder: ctx.embedder, skills };
  const baseline = await runGym(parent.genome, opts);
  const candidate = await runGym(genome, opts);
  const regressed = regressions(baseline.results, candidate.results);
  const worsened = compareFitness(candidate.fitness.all, baseline.fitness.all) < 0;
  const newCollateral = candidate.results.filter(r => {
    const before = baseline.results.find(b => b.taskId === r.taskId);
    return r.collateral.some(c => !before?.collateral.includes(c));
  }).map(r => r.taskId);
  let passed = !regressed.length && !newCollateral.length && !worsened;
  let reason = passed ? 'No regressions on train and held-out tasks.' : 'Authority change failed the no-regression gate.';
  const flipped = candidate.results.filter(r => r.pass && !baseline.results.find(b => b.taskId === r.taskId)?.pass).map(r => r.taskId);
  let attacks = null;
  if (passed && flipped.length) {
    attacks = await challenge(genome, flipped, opts);
    if (attacks.failed.length) {
      passed = false;
      reason = 'Authority change failed adversarial validation.';
    }
  }
  return { passed, reason, baseVersion: parent.version, baseline: baseline.fitness, fitness: candidate.fitness, regressed, newCollateral, attacks };
}

export async function decideAuthority(ctx, ask, approved) {
  const { db, clock } = ctx;
  const edit = await db.collection('edits').findOne({ _id: ask.editId });
  const parent = await currentHarness(db);
  let validation = null;
  if (approved) {
    try {
      validation = await validateAuthority(ctx, parent, edit);
    } catch {
      // Do not promote on a provider outage, malformed candidate, or evaluator exception.
      validation = { passed: false, status: 'error', reason: 'Validation could not finish. No authority changed; retry when evaluation is available.', baseVersion: parent.version };
    }
  }
  return db.withTransaction(async session => {
    const latest = await db.collection('asks').findOne({ _id: ask._id }, { session });
    if (!['open', 'resolved'].includes(latest?.status)) return latest;
    const current = await currentHarness(db, session);
    if (approved && current.version !== parent.version) {
      validation = { ...validation, passed: false, status: 'stale', reason: 'Harness changed during validation. Approve again to evaluate the current version.' };
    }
    const retryable = ['error', 'stale'].includes(validation?.status);
    const status = !approved ? 'denied' : retryable ? 'open' : validation.passed ? 'approved' : 'rejected';
    const now = new Date(clock.now());
    // Claim the decision inside the transaction before adding a harness version.
    const claimed = await db.collection('asks').updateOne(
      { _id: ask._id, status: latest.status },
      { $set: { status, decision: approved ? 'approved' : 'denied', validation, decidedAt: now } },
      { session },
    );
    if (!claimed.matchedCount) return db.collection('asks').findOne({ _id: ask._id }, { session });
    let resultVersion = null;
    if (status === 'approved') {
      const next = await commitHarness(db, {
        parent,
        genome: applyEdit(parent.genome, edit),
        editIds: [edit._id],
        night: edit.night,
        now: clock.now(),
        fitness: validation.fitness,
        metrics: { baseline: validation.baseline, authorityValidation: validation },
      }, session);
      resultVersion = next.version;
    }
    if (edit) await db.collection('edits').updateOne(
      { _id: edit._id },
      { $set: { 'outcome.status': retryable ? 'queued-ask' : status, 'outcome.validation': validation, 'outcome.reason': validation?.reason || 'Permission denied.', resultVersion } },
      { session },
    );
    await db.collection('asks').updateOne({ _id: ask._id }, { $set: { resultVersion } }, { session });
    return db.collection('asks').findOne({ _id: ask._id }, { session });
  });
}
