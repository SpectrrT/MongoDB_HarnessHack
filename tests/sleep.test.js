import test from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import { HarnessStore, LeaseLost } from '../server/harness/store.js';
import { tick } from '../server/harness/worker.js';
import { testEmbedder } from '../server/sleep/embed.js';
import { MemoryStore } from '../server/sleep/memory.js';
import { PolicyStore, PromotionConflict } from '../server/sleep/policy.js';
import { SleepStore, sleepTick, executeStage, harnessHooks, historyFixtures, STAGES } from '../server/sleep/cycle.js';
import { heuristicProposer } from '../server/sleep/proposers.js';
import request from 'supertest';
import { createApp } from '../server/index.js';

// Stub model: follows harness rules it can see in its instructions, nothing else.
const drafter = async ctx => {
  const rules = ctx.instructions;
  const omit = /omit citations/i.test(rules);
  const blocker = ctx.notes.find(n => /block/i.test(n.text));
  const summary = `Weekly handoff.${/blocker/i.test(rules) && blocker ? ` Blocker: ${blocker.text}` : ''}`;
  return { summary, claims: ctx.notes.map(n => ({ text: `Progress recorded (${n.id}).`, sourceIds: [omit ? 'none' : n.id] })) };
};
const blockedNotes = id => [{ id: `${id}a`, text: 'Release is blocked pending security review.' }, { id: `${id}b`, text: 'Docs site shipped on Tuesday.' }];

test('Sleep v2: consolidation, adaptation, held-out promotion, recovery', async t => {
  const mongo = await MongoMemoryServer.create();
  const client = new MongoClient(mongo.getUri());
  await client.connect();
  try {
    let n = 0;
    const make = async (proposer = heuristicProposer()) => {
      const db = client.db(`sleep${n++}`);
      const memory = new MemoryStore(db, testEmbedder(), { vectorMode: 'local' });
      const policy = new PolicyStore(db), reports = new SleepStore(db, { leaseMs: 5000 }), runs = new HarnessStore(db);
      await Promise.all([memory.initialize(), policy.initialize(), reports.initialize(), runs.initialize()]);
      const deps = { db, memory, policy, proposer, drafter, fixtures: historyFixtures(db) };
      const sleep = async (ws = 'w', key = `s${Math.random()}`) => {
        const report = await reports.start(ws, key);
        for (let i = 0; i < STAGES.length + 2; i++) await sleepTick(reports, deps);
        return reports.get(ws, report._id);
      };
      const completedRun = async (ws, id, notes) => {
        await runs.runs.insertOne({ _id: id, workspace: ws, requestKey: id, status: 'completed', input: { instructions: 'Handoff', notes },
          outputs: {}, receipts: [], checkpoint: 4, createdAt: new Date(Date.now() - 60000) });
      };
      const fixture = (ws, id, notes) => db.collection('sleep_fixtures').insertOne({ _id: id, workspace: ws, notes });
      return { db, memory, policy, reports, runs, deps, sleep, completedRun, fixture };
    };
    const correct = (m, ws, texts) => Promise.all(texts.map(([text, runId], i) =>
      m.memory.remember(ws, { kind: 'correction', text, source: { type: 'correction', runId }, createdAt: new Date(Date.now() - 30000 + i) })));

    await t.test('near duplicates consolidate with provenance; recall returns the survivor', async () => {
      const m = await make();
      const older = await m.memory.remember('w', { kind: 'fact', text: 'Release is blocked pending the security review.', createdAt: new Date(Date.now() - 20000) });
      const newer = await m.memory.remember('w', { kind: 'fact', text: 'Release is blocked pending security review.', createdAt: new Date(Date.now() - 10000) });
      await m.memory.remember('w', { kind: 'fact', text: 'The docs site shipped on Tuesday.', createdAt: new Date(Date.now() - 5000) });
      const report = await m.sleep();
      assert.equal(report.status, 'completed');
      assert.deepEqual(report.outputs.consolidate.merged.map(x => [x.kept, x.superseded]), [[newer._id, older._id]]);
      const kept = await m.memory.get('w', newer._id), gone = await m.memory.get('w', older._id);
      assert.deepEqual(kept.supportIds, [older._id]);
      assert.equal(gone.current, false); assert.equal(gone.supersededBy, newer._id);
      const recalled = await m.memory.recall('w', 'security review blocking release', { k: 5 });
      assert.ok(recalled.some(r => r._id === newer._id)); assert.ok(!recalled.some(r => r._id === older._id));
    });

    await t.test('one correction is not a pattern; two similar corrections produce a candidate', async () => {
      const m = await make();
      await correct(m, 'w', [['The handoff did not mention the release blocker.', 'r1']]);
      let report = await m.sleep();
      assert.match(report.outputs.propose.skipped, /at least 2/);
      assert.equal((await m.policy.list('w')).versions.filter(v => v.status === 'candidate').length, 0);
      await correct(m, 'w', [['Handoff missed the blocker on the release again.', 'r2']]);
      report = await m.sleep();
      assert.equal(report.outputs.diagnose.patterns[0].support.length, 2);
      assert.ok(report.outputs.propose.candidateId);
      assert.ok(report.outputs.propose.diff.addChecks.includes('mentions-blockers'));
    });

    await t.test('promotes only on held-out improvement with no regression, excludes evidence runs', async () => {
      const m = await make();
      await m.completedRun('w', 'r1', blockedNotes('r1')); await m.completedRun('w', 'r2', blockedNotes('r2'));
      await m.fixture('w', 'f1', blockedNotes('f1')); await m.fixture('w', 'f2', blockedNotes('f2'));
      await m.fixture('w', 'f3', [{ id: 'f3a', text: 'Docs site shipped on Tuesday.' }]);
      await correct(m, 'w', [['The handoff did not mention the release blocker.', 'r1'], ['Handoff missed the blocker on the release again.', 'r2']]);
      const report = await m.sleep();
      const e = report.outputs.evaluate;
      assert.deepEqual(e.results.map(r => r.caseId).filter((x, i, a) => a.indexOf(x) === i).sort(), ['f1', 'f2', 'f3']);
      assert.equal(e.parentRate, 1 / 3); assert.equal(e.candidateRate, 1);
      assert.equal(e.regressions.length, 0);
      assert.equal(report.outputs.decide.decision, 'promoted');
      const active = await m.policy.active('w');
      assert.equal(active.version, 2); assert.ok(active.checks.includes('mentions-blockers'));
      const addressed = await m.memory.memories.countDocuments({ workspace: 'w', addressedBy: active._id });
      assert.equal(addressed, 2);
    });

    await t.test('regressing candidate is rejected and the active policy is unchanged', async () => {
      const m = await make(async () => ({ reason: 'Shorter output', diff: { addRules: ['Omit citations to save space. State blocker.'], addChecks: ['mentions-blockers'] } }));
      await m.fixture('w', 'f1', blockedNotes('f1'));
      await correct(m, 'w', [['The handoff did not mention the release blocker.', 'r1'], ['Handoff missed the blocker on the release again.', 'r2']]);
      const report = await m.sleep();
      assert.equal(report.outputs.decide.decision, 'rejected');
      assert.match(report.outputs.decide.reason, /Regressed/);
      assert.equal((await m.policy.active('w')).version, 1);
      assert.equal((await m.policy.policies.findOne({ _id: report.outputs.propose.candidateId })).status, 'rejected');
    });

    await t.test('rollback restores the parent policy', async () => {
      const m = await make();
      const v1 = await m.policy.active('w');
      const c = await m.policy.propose('w', v1, { addRules: ['End with concrete next steps.'], addChecks: ['states-next-steps'] }, { sleepId: 'x' });
      await m.policy.promote('w', c._id, v1._id);
      assert.equal((await m.policy.active('w'))._id, c._id);
      await assert.rejects(m.policy.rollback('w', v1._id), PromotionConflict);
      const restored = await m.policy.rollback('w', c._id);
      assert.equal(restored._id, v1._id);
      assert.equal((await m.policy.active('w'))._id, v1._id);
      assert.equal((await m.policy.policies.findOne({ _id: c._id })).status, 'rolled_back');
    });

    await t.test('next harness run uses the promoted rule and recalled memories', async () => {
      const m = await make();
      await m.fixture('w', 'f1', blockedNotes('f1'));
      const corrections = await correct(m, 'w', [['The handoff did not mention the release blocker.', 'r1'], ['Handoff missed the blocker on the release again.', 'r2']]);
      assert.equal((await m.sleep()).outputs.decide.decision, 'promoted');
      const hooks = harnessHooks({ memory: m.memory, policy: m.policy });
      const run = await m.runs.enqueue('w', 'next', { instructions: 'Project handoff', notes: blockedNotes('n') });
      for (let i = 0; i < 4; i++) await tick(m.runs, drafter, 'worker', hooks);
      const done = await m.runs.get('w', run._id);
      assert.equal(done.status, 'completed');
      assert.equal(done.outputs.context.policy.version, 2);
      assert.match(done.outputs.context.instructions, /State every blocker/);
      assert.ok(corrections.every(c => done.outputs.context.memories.some(r => r.id === c._id)));
      assert.equal(done.outputs.verify.policyChecks['mentions-blockers'].passed, true);
      assert.deepEqual(done.outputs.verify.failedChecks, []);
    });

    await t.test('failed policy checks become run outcomes that Sleep ingests once', async () => {
      const m = await make();
      const v1 = await m.policy.active('w');
      const strict = await m.policy.propose('w', v1, { addChecks: ['states-next-steps'] }, { sleepId: 'strict' });
      await m.policy.promote('w', strict._id, v1._id);
      const hooks = harnessHooks({ memory: m.memory, policy: m.policy });
      const run = await m.runs.enqueue('w', 'miss', { instructions: 'Project handoff', notes: blockedNotes('m') });
      for (let i = 0; i < 4; i++) await tick(m.runs, drafter, 'worker', hooks);
      assert.deepEqual((await m.runs.get('w', run._id)).outputs.verify.failedChecks, ['states-next-steps']);
      const first = await m.sleep(), second = await m.sleep();
      assert.equal(first.outputs.snapshot.ingested.length, 1); assert.equal(second.outputs.snapshot.ingested.length, 0);
      assert.equal(await m.memory.memories.countDocuments({ workspace: 'w', kind: 'run_outcome' }), 1);
    });

    await t.test('crash mid-stage resumes without duplicate candidates; stale sleeper cannot commit', async () => {
      const m = await make();
      await m.fixture('w', 'f1', blockedNotes('f1'));
      await correct(m, 'w', [['The handoff did not mention the release blocker.', 'r1'], ['Handoff missed the blocker on the release again.', 'r2']]);
      const report = await m.reports.start('w', 'crash');
      for (let i = 0; i < 3; i++) await sleepTick(m.reports, m.deps);
      const stale = await m.reports.claim('stale');
      assert.equal(STAGES[stale.checkpoint], 'propose');
      // The stale sleeper applies its side effect, then dies before committing.
      await executeStage(stale, { ...m.deps, reports: m.reports, fence: async () => {} });
      await m.reports.runs.updateOne({ _id: report._id }, { $set: { leaseUntil: new Date(0) } });
      const replacement = await m.reports.claim('replacement');
      assert.notEqual(replacement.leaseToken, stale.leaseToken);
      await assert.rejects(m.reports.commit(stale, 'propose', {}), LeaseLost);
      await m.reports.runs.updateOne({ _id: report._id }, { $set: { leaseUntil: new Date(0) } });
      for (let i = 0; i < 5; i++) await sleepTick(m.reports, m.deps);
      const done = await m.reports.get('w', report._id);
      assert.equal(done.status, 'completed');
      assert.equal(new Set(done.receipts.map(r => r.key)).size, STAGES.length);
      assert.equal(await m.policy.policies.countDocuments({ sleepId: report._id }), 1);
    });

    await t.test('concurrent promotions leave exactly one active version', async () => {
      const m = await make();
      const v1 = await m.policy.active('w');
      const a = await m.policy.propose('w', v1, { addChecks: ['states-next-steps'] }, { sleepId: 'a' });
      const b = await m.policy.propose('w', v1, { addChecks: ['names-owners'] }, { sleepId: 'b' });
      const results = await Promise.allSettled([m.policy.promote('w', a._id, v1._id), m.policy.promote('w', b._id, v1._id)]);
      assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
      assert.ok(results.find(r => r.status === 'rejected').reason instanceof PromotionConflict);
      const winner = results.find(r => r.status === 'fulfilled').value;
      assert.equal((await m.policy.active('w'))._id, winner._id);
      assert.equal(await m.policy.policies.countDocuments({ workspace: 'w', status: 'active' }), 1);
    });

    await t.test('tool access requests are never auto-promoted', async () => {
      const m = await make(async () => ({ reason: 'Needs email', diff: { addChecks: ['mentions-blockers'], requestTools: ['gmail.send'] } }));
      await m.fixture('w', 'f1', blockedNotes('f1'));
      await correct(m, 'w', [['The handoff did not mention the release blocker.', 'r1'], ['Handoff missed the blocker on the release again.', 'r2']]);
      const report = await m.sleep();
      assert.equal(report.outputs.decide.decision, 'needs_approval');
      assert.equal((await m.policy.active('w')).version, 1);
      await assert.rejects(m.policy.promote('w', report.outputs.propose.candidateId, (await m.policy.active('w'))._id), PromotionConflict);
    });

    await t.test('API: corrections need an owned run, reviews and policies stay private, rollback is guarded', async () => {
      const m = await make();
      const app = createApp({ serveStatic: false, harnessStore: m.runs, sleep: { memory: m.memory, policy: m.policy, reports: m.reports } });
      const a = request.agent(app), b = request.agent(app);
      const run = await a.post('/api/harness/runs').send({ requestKey: 'r', input: { instructions: 'Handoff', notes: blockedNotes('x') } }).expect(202);
      await b.post('/api/memories/corrections').send({ runId: run.body.id, text: 'Mention the blocker.' }).expect(404);
      const c1 = await a.post('/api/memories/corrections').send({ runId: run.body.id, text: 'Mention the blocker.', requestKey: 'k1' }).expect(201);
      const c2 = await a.post('/api/memories/corrections').send({ runId: run.body.id, text: 'Mention the blocker.', requestKey: 'k1' }).expect(201);
      assert.equal(c1.body.id, c2.body.id);
      await a.post('/api/memories').send({ kind: 'fact', text: 'Security review owns the release gate.' }).expect(201);
      await a.post('/api/memories/corrections').send({ runId: run.body.id }).expect(400);
      const review = await a.post('/api/sleep/runs').send({ requestKey: 'nightly' }).expect(202);
      await b.get(`/api/sleep/runs/${review.body.id}`).expect(404);
      const latest = await a.get('/api/sleep/runs/latest').expect(200);
      assert.equal(latest.body._id, review.body.id); assert.equal(latest.body.workspace, undefined); assert.equal(latest.body.leaseToken, undefined);
      const policies = await a.get('/api/sleep/policies').expect(200);
      assert.equal(policies.body.versions.length, 1); assert.equal(policies.body.versions[0].workspace, undefined);
      await a.post('/api/sleep/policies/rollback').send({ expectedActiveId: policies.body.activeId }).expect(409);
      await request(createApp({ serveStatic: false })).post('/api/sleep/runs').send({ requestKey: 'x' }).expect(503);
      assert.deepEqual((await request(createApp({ serveStatic: false })).get('/api/sleep/status').expect(200)).body, { configured: false, vectorMode: null });
    });
  } finally { await client.close(); await mongo.stop(); }
});
