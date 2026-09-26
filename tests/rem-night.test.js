import test from "node:test";
import assert from "node:assert/strict";
import { createRem } from "../rem/index.js";
import { EDITS } from "../rem/catalog.js";
import { GYM } from "../rem/gym.js";
import { editSignature } from "../rem/harness.js";
import { mean } from "../rem/util.js";

const rem = await createRem();
const nights = [];
const days = await rem.simulateDays(5, { onDay: (d) => nights.push(d.brief) });
const { db } = rem.ctx;
await rem.close();

test("Merge shrinks memory with provenance and resolves contradictions by recency", async () => {
  for (const d of days) {
    assert.ok(d.memory.after.size < d.memory.before.size, `night ${d.meta.day} shrinks the searchable store`);
    assert.equal(d.memory.after.duplicateRatio, 0);
    assert.equal(d.memory.after.contradictions, 0);
    assert.ok(d.memory.after.precisionAtK >= d.memory.before.precisionAtK);
  }
  const last = days.at(-1).memory;
  assert.ok(last.after.size < last.withoutSleep.size / 2, "far smaller than a store that never sleeps");
  assert.ok(last.after.precisionAtK > last.withoutSleep.precisionAtK, "and more precise");
  assert.ok(last.withoutSleep.contradictions > 0 && last.withoutSleep.duplicateRatio > 0.4);

  const releaseDay = await db.collection("memories").findOne({ subject: "decision: Release day" });
  assert.equal(releaseDay.value, "Tuesday");
  assert.ok(releaseDay.contradictions.some((c) => c.value === "Thursday" && c.resolvedBy === "recency"));
  assert.ok(releaseDay.provenance.length >= 2, "provenance links back to the source episodes");
  const flaky = await db.collection("memories").findOne({ subject: "blocker: Flaky login test on CI" });
  assert.equal(flaky.active, false);
  assert.match(flaky.retiredReason, /resolved as of W36/);
  const digest = await db.collection("memories").findOne({ kind: "digest", active: true });
  assert.equal(digest.text, "Open blockers as of W39: SOC 2 evidence collection (owner: Ravi)");
  assert.ok(nights[0].merge.noiseDropped > 0, "low-importance episodes referenced by no memory are dropped");
  assert.ok(days.some((d) => d.dayResult.forgotten > 0), "TTL forgets consolidated episodes");
});

test("Distill turns repeated work and a demonstration into a practiced skill whose test passes", async () => {
  assert.deepEqual(nights[0].distill.skills.map((s) => [s.name, s.status, s.test.pass]), [["weekly-brief", "practiced", true]]);
  const skill = await db.collection("skills").findOne({ name: "weekly-brief" });
  assert.ok(skill.steps[0].includes("week={{week}}"));
  assert.ok(skill.steps.some((s) => s.includes("week={{prevWeek}}")));
  assert.ok(skill.parameters.team.every((a) => a.endsWith("@offload.test")), "the demonstration taught the internal team list");
  assert.ok(skill.constraints.includes("Keep customer names out of internal updates"));
  assert.ok(skill.requiredScopes.includes("gmail.send"));
  assert.ok(skill.sources.some((s) => s.source === "demonstration"));
  assert.equal(skill.status, "autonomous", "approved by the morning ask");
  assert.deepEqual(skill.statusHistory.map((h) => h.status), ["proposed", "practiced", "approved", "autonomous"]);
});

test("the gate rejects small routing everywhere and accepts it where a practiced skill applies", async () => {
  const global = await db.collection("edits").findOne({ signature: editSignature(EDITS.smallExecutor) });
  assert.equal(global.night, 1);
  assert.equal(global.outcome.status, "rejected");
  assert.equal(global.outcome.reason, "regressed 1 held-out task");
  assert.equal(global.outcome.train.passDelta, 0, "the train set alone would have accepted it");
  assert.deepEqual(nights[0].evolve.edits.find((e) => e.type === "routing.set").heldOutRegressedTitles, ["Product review brief (H2)"]);
  const scoped = await db.collection("edits").findOne({ signature: editSignature(EDITS.smallExecutorWithSkill) });
  assert.equal(scoped.outcome.status, "accepted");
  assert.ok(scoped.outcome.train.costDelta < 0);
  assert.ok(nights[1].evolve.skipped.some((s) => s.name === "smallExecutor" && /tried on night 1/.test(s.reason)));
  assert.equal(await db.collection("edits").countDocuments({ signature: editSignature(EDITS.smallExecutor) }), 1, "never retried");
});

test("fitness improves on held-out over five simulated days without collateral damage", async () => {
  const first = nights[0].evolve.baseline,
    final = nights.at(-1).evolve.fitness;
  assert.equal(first.heldOut.passed, 1);
  assert.equal(final.heldOut.passed, GYM.heldOut.length);
  assert.equal(final.train.passed, GYM.train.length);
  assert.equal(final.all.collateral, 0);
  assert.ok(final.all.cost < first.all.cost / 5);
  assert.equal(final.all.interventions, 0);
  assert.ok(days[0].collateral > 0);
  for (const d of days.slice(2)) assert.equal(d.collateral, 0);
  assert.ok(days.at(-1).cost < days[0].cost / 5);
  assert.equal(days.at(-1).passRate, 1);
  assert.ok(days.every((d) => d.effects.duplicates === 0 && d.effects.committed === d.effects.executed));
  assert.equal(await db.collection("effects").countDocuments({ outcome: "reconciled" }), 4, "one injected crash per day, reconciled");
  const versions = await db.collection("harnesses").find({}, { sort: { version: 1 } }).toArray();
  assert.ok(versions.length >= 4);
  assert.ok(versions.slice(1).every((v, i) => v.parentVersion === versions[i].version && v.diff.length > 0), "lineage");
});

test("prediction error falls once edit types have a track record", async () => {
  const perNight = nights.filter((n) => n.evolve.edits.length).map((n) => mean(n.evolve.edits, (e) => e.outcome.predictionError));
  assert.ok(perNight.length >= 3);
  assert.equal(Math.max(...perNight), perNight[0], "the first night, with no track record, predicts worst");
  assert.ok(mean(perNight.slice(1)) < perNight[0] * 0.75);
  const edits = await db.collection("edits").find({}).toArray();
  const calibrated = edits.filter((e) => e.prediction.calibratedFrom > 0);
  const naive = edits.filter((e) => !e.prediction.calibratedFrom);
  assert.ok(calibrated.length >= 4 && naive.length >= 3);
  assert.ok(mean(calibrated, (e) => e.outcome.predictionError) < mean(naive, (e) => e.outcome.predictionError));
  const record = await rem.trackRecord();
  assert.deepEqual(record.map((r) => r._id), ["context.set", "guardrail.add", "routing.set", "rule.add"]);
});

test("asks: the send skill asks, read-only asks once, then risk tolerance auto-approves", async () => {
  const asks = await db.collection("asks").find({ kind: "skill.autonomous" }, { sort: { night: 1 } }).toArray();
  const byName = Object.fromEntries(asks.map((a) => [a.skill, a]));
  assert.equal(byName["weekly-brief"].text, "Want me to send the brief myself next time? (needs Gmail send scope)");
  assert.equal(byName["weekly-brief"].status, "approved");
  assert.equal(byName.standup.risk, "read");
  assert.equal(byName.standup.status, "approved");
  assert.equal(byName.recap.status, "auto-approved");
  assert.match(byName.recap.reason, /you approved read-only access before/);
  assert.equal(await db.collection("asks").countDocuments({ kind: "reconnect" }), 1, "one reconnect ask for the day-one revoke");
});

test("an edit that expands authority becomes an ask instead of passing through the gate", async () => {
  const grant = {
    type: "scope.grant",
    target: "calendar.write",
    value: null,
    description: "Grant tool scope calendar.write",
    prediction: { flips: [], passDelta: 0, stepsDelta: 0, costDelta: 0, raw: { flips: [], passDelta: 0, stepsDelta: 0, costDelta: 0 } },
  };
  const fresh = await createRem({ proposer: { name: "stub", propose: async () => ({ edits: [grant], skipped: [] }) } });
  await fresh.runDay({ day: 1 });
  const brief = await fresh.sleep();
  assert.equal(brief.harness.to, 0, "nothing was applied overnight");
  assert.match(brief.text, /Queued as an ask: Grant tool scope calendar\.write/);
  const ask = await fresh.ctx.db.collection("asks").findOne({ kind: "edit.authority" });
  assert.equal(ask.text, "Allow this harness change? Grant tool scope calendar.write");
  await fresh.decide(ask._id, "approve");
  const harness = await fresh.harness();
  assert.equal(harness.version, 1);
  assert.ok(harness.genome.toolScopes.calendar.includes("write"));
  assert.equal((await fresh.ctx.db.collection("edits").findOne({ _id: ask.editId })).outcome.status, "approved");
  await fresh.close();
});

test("the proposer never sees held-out tasks", async () => {
  const fresh = await createRem();
  const inputs = [];
  fresh.ctx.onProposerInput = (input) => inputs.push(JSON.stringify(input));
  await fresh.simulateDays(2);
  await fresh.close();
  assert.equal(inputs.length, 2);
  assert.match(inputs[1], /regressed 1 held-out task/, "it learns that an edit regressed, not which held-out task");
  for (const text of inputs) {
    for (const t of GYM.heldOut) {
      assert.ok(!text.includes(`"${t.id}"`));
      assert.ok(!text.includes(t.instruction));
    }
    for (const secret of ["Initech", "Umbrella", "Northwind", "W41", "W42", "guest@", "Product review brief"])
      assert.ok(!text.includes(secret), secret);
  }
});
