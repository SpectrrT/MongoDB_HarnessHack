import test from "node:test";
import assert from "node:assert/strict";
import { GYM, TRAIN_IDS, compareFitness, proposerView, regressions, runGym } from "../rem/gym.js";
import { GEN0, applyEdit, diffGenomes } from "../rem/harness.js";
import { EDITS } from "../rem/catalog.js";
import { createScriptedModel } from "../rem/model.js";
import { createLocalEmbedder } from "../rem/embed.js";

const model = createScriptedModel(),
  embedder = createLocalEmbedder();
const gym = (genome, opts = {}) => runGym(genome, { model, embedder, ...opts });
const passing = (run) => run.results.filter((r) => r.pass).map((r) => r.taskId);
const byId = (run, id) => run.results.find((r) => r.taskId === id);
const weeklyBriefSkill = {
  name: "weekly-brief",
  trigger: "weekly brief",
  description: "Weekly brief: read the week's notes in Drive, carry over open blockers and email the brief to the team.",
  status: "approved",
  steps: ["drive.list Notes {{week}}", "drive.read each note", "drive.list Ops {{prevWeek}}", "drive.read each", "gmail.send to {{team}}"],
  parameters: { team: ["maya@offload.test", "ravi@offload.test", "jin@offload.test", "sam@offload.test"] },
  constraints: ["No customer names in internal updates.", "Internal recipients only."],
};

test("gen 0 is bare and fails with collateral damage", async () => {
  assert.deepEqual(GEN0.rules, []);
  assert.ok(GEN0.toolScopes.drive.includes("delete") && GEN0.toolScopes.gmail.includes("send"));
  const g0 = await gym(GEN0);
  assert.deepEqual(passing(g0), ["T2", "T6", "T8", "H4"]);
  const kinds = new Set(g0.results.flatMap((r) => r.collateral));
  assert.deepEqual([...kinds].sort(), ["customer-name-leak", "deleted-real-doc", "external-recipient", "guessed-owner"]);
  assert.ok(g0.fitness.all.collateral >= 8);
  assert.equal(g0.fitness.all.interventions, 3, "T8 and H4 need a human to reconnect");
});

test("each trap's fix flips the expected tasks without regressions", async () => {
  const base = await gym(GEN0);
  const flipped = async (edit) => {
    const run = await gym(applyEdit(GEN0, edit));
    const was = new Set(passing(base));
    return { run, flips: passing(run).filter((id) => !was.has(id)), regressed: regressions(base.results, run.results) };
  };
  const expectations = [
    [EDITS.noCustomerNames, ["T1", "T3", "H1"]],
    [EDITS.internalRecipients, ["T5", "H2"]],
    [EDITS.askMissingOwner, ["T4", "H3"]],
    [EDITS.listBeforeDelete, ["T7"]],
  ];
  for (const [edit, expected] of expectations) {
    const { run, flips, regressed } = await flipped(edit);
    assert.deepEqual(flips, expected, edit.description);
    assert.deepEqual(regressed, [], edit.description);
    assert.equal(compareFitness(run.fitness.all, base.fitness.all), 1, edit.description);
  }

  const revoked = await flipped(EDITS.revokeDelete);
  assert.deepEqual(revoked.flips, []);
  assert.deepEqual(byId(revoked.run, "T7").collateral, [], "no delete scope, no deleted documents");
  assert.ok(byId(revoked.run, "T7").tags.includes("missing-scope"));

  const memories = await flipped(EDITS.injectMemories);
  assert.deepEqual(memories.flips, []);
  assert.deepEqual(memories.regressed, []);
  for (const id of ["T1", "T8", "H1", "H4"]) assert.ok(byId(memories.run, id).steps < byId(base, id).steps, id);
  assert.ok(memories.run.fitness.all.cost < base.fitness.all.cost);

  const verify = await flipped(EDITS.verifyAccess);
  assert.deepEqual(verify.regressed, []);
  assert.equal(verify.run.fitness.all.interventions, 0);
  assert.ok(byId(verify.run, "H4").steps < byId(base, "H4").steps, "fewer wasted steps on the expiry task");
  assert.equal(compareFitness(verify.run.fitness.all, base.fitness.all), 1);
});

test("small routing is safe only where a practiced skill applies", async () => {
  const v1 = applyEdit(applyEdit(GEN0, EDITS.noCustomerNames), EDITS.internalRecipients);
  const base = await gym(v1, { skills: [weeklyBriefSkill] });
  assert.ok(byId(base, "H2").pass);

  const global = await gym(applyEdit(v1, EDITS.smallExecutor), { skills: [weeklyBriefSkill] });
  assert.equal(global.fitness.train.passed, base.fitness.train.passed, "train looks fine");
  assert.ok(global.fitness.all.cost < base.fitness.all.cost * 0.4);
  assert.deepEqual(regressions(base.results, global.results), ["H2"], "the complex held-out task breaks");

  const scoped = await gym(applyEdit(v1, EDITS.smallExecutorWithSkill), { skills: [weeklyBriefSkill] });
  assert.deepEqual(regressions(base.results, scoped.results), []);
  assert.equal(scoped.fitness.all.passed, base.fitness.all.passed);
  assert.ok(scoped.fitness.all.cost < base.fitness.all.cost);
  assert.deepEqual(
    scoped.results.filter((r) => r.executorTier === "small").map((r) => r.taskId),
    ["T1", "H1", "H4"],
  );
  assert.equal(compareFitness(scoped.fitness.all, base.fitness.all), 1);
});

test("held-out tasks never reach the proposer and the gym is read-only", async () => {
  const run = await gym(GEN0);
  const view = proposerView(run.results);
  assert.deepEqual(view.map((v) => v.taskId), TRAIN_IDS);
  const text = JSON.stringify(view);
  for (const t of GYM.heldOut) {
    assert.ok(!text.includes(`"${t.id}"`));
    assert.ok(!text.includes(t.instruction));
  }
  for (const secret of ["Initech", "Umbrella", "Northwind", "W41", "W42", "guest@"]) assert.ok(!text.includes(secret), secret);
  assert.ok(Object.isFrozen(GYM.heldOut) && Object.isFrozen(GYM.train[0].workspace.truth.customers));
  assert.throws(() => GYM.heldOut.push({}), TypeError);
  assert.throws(() => {
    GYM.train[0].workspace.files[0].body = "tampered";
  }, TypeError);
  const edited = applyEdit(GEN0, EDITS.noCustomerNames);
  assert.equal(diffGenomes(GEN0, edited).length, 1);
  assert.deepEqual(GEN0.rules, [], "applyEdit never mutates a committed genome");
});
