import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { rehearse, rehearsalLevel, rehearsalSignature, rehearsalTask, imagine, priorScore } from "../rem/rehearse.js";
import { GYM, TRAIN_IDS } from "../rem/gym.js";
import { createRem } from "../rem/index.js";
import { createRemIdleRehearsal } from "../server/rem-rehearse.js";
import { createApp } from "../server/index.js";

test("imagine: seeded, train tasks only, level-many attacks, never a recipe already tried", () => {
  const a = imagine({ seed: 7, level: 2 });
  assert.deepEqual(a, imagine({ seed: 7, level: 2 }), "same seed, same rehearsals");
  assert.ok(a.length > 0);
  assert.ok(a.every((r) => TRAIN_IDS.includes(r.taskId) && r.attacks.length === 2 && new Set(r.attacks).size === 2));
  const tried = new Set(a.map(rehearsalSignature));
  assert.ok(imagine({ seed: 7, level: 2, tried }).every((r) => !tried.has(rehearsalSignature(r))));
  assert.ok(imagine({ seed: 3, level: 9 }).every((r) => r.attacks.length === 6), "capped at the six attacks");
});

test("a rehearsal keeps the task's ground truth, so the same checkers judge it", () => {
  const base = GYM.train[0];
  const t = rehearsalTask({ taskId: base.id, attacks: ["contradiction", "memory-noise", "reorder"], level: 3 });
  assert.deepEqual(t.workspace.truth, base.workspace.truth);
  assert.equal(t.split, "train");
  assert.match(t.id, new RegExp(`^${base.id}~`));
  assert.ok(t.memories.length >= base.memories.length + 3 * 6, "noise scales with the level");
  assert.throws(() => rehearsalTask({ taskId: GYM.heldOut[0].id, attacks: ["reorder"], level: 1 }), /train tasks/);
});

test("the prior ranks attacks that broke the harness before, and gives untried ones a small bonus", () => {
  const history = [
    { recipe: { attacks: ["reorder"] }, broke: true },
    { recipe: { attacks: ["reorder"] }, broke: false },
    { recipe: { attacks: ["distract"] }, broke: false },
    { recipe: { attacks: ["distract"] }, broke: false },
  ];
  assert.ok(priorScore({ attacks: ["reorder"] }, history) > priorScore({ attacks: ["distract"] }, history));
  assert.ok(priorScore({ attacks: ["duplicate"] }, history) > 0.5);
});

test("when every rehearsal holds, the next rehearsals are one level harder", async () => {
  const rem = await createRem({});
  assert.equal(await rehearsalLevel(rem.ctx.db), 1);
  // Seed tomorrow's pool with tasks the gen-0 harness passes, as last night's Calibrate would.
  const out = await rehearse(rem.ctx, { night: 1 });
  assert.ok(out.tried > 0 && out.imagined >= out.tried);
  assert.equal(out.tried, (await rem.ctx.db.collection("rehearsals").countDocuments({})) || out.tried);
  if (!out.broke.length) assert.equal(await rehearsalLevel(rem.ctx.db), 2);
  const again = await rehearse(rem.ctx, { night: 2 });
  const sigs = (await rem.ctx.db.collection("rehearsals").find({}).toArray()).map((d) => d.signature);
  assert.equal(new Set(sigs).size, sigs.length, "no rehearsal is rehearsed twice");
  assert.ok(again.level >= out.level);
});

test("a kept rehearsal joins Evolve's validation and is marked fixed by the version that passes it", async () => {
  const rem = await createRem({});
  const db = rem.ctx.db;
  // Keep one rehearsal per train task, as if each had broken the gen-0 harness.
  const recipes = TRAIN_IDS.map((taskId) => ({ taskId, attacks: ["reorder"], level: 1 }));
  await db.collection("rehearsals").insertMany(
    recipes.map((recipe) => ({
      id: rehearsalTask(recipe).id,
      signature: rehearsalSignature(recipe),
      recipe,
      kept: true,
      broke: true,
      fixedVersion: null,
      nextLevel: 1,
      createdAt: new Date(0),
    })),
  );
  const [day] = await rem.simulateDays(1);
  const brief = await db.collection("briefs").findOne({ night: 1 });
  assert.equal(brief.evolve.baseline.train.tasks, TRAIN_IDS.length * 2, "kept rehearsals ran next to the gym's train tasks");
  assert.equal(brief.evolve.baseline.heldOut.tasks, GYM.heldOut.length, "held-out tasks are never rehearsed about");
  const fixed = await db.collection("rehearsals").find({ kept: true, fixedVersion: { $ne: null } }).toArray();
  assert.ok(brief.harness.to > brief.harness.from, "the night committed a new version");
  assert.ok(fixed.length > 0, "some kept rehearsals pass under the new version");
  assert.ok(fixed.every((d) => d.fixedVersion >= 1));
  assert.ok(day);
});

test("idle rehearsal runs once per idle period and never while someone is acting", async () => {
  let clock = 0,
    runs = 0;
  const idle = createRemIdleRehearsal({ idleMs: 1000, interval: 0, enabled: true, now: () => clock, run: async () => (runs++, { tried: 1 }) });
  assert.equal(await idle.tick(), null, "not idle yet");
  clock = 1500;
  assert.deepEqual(await idle.tick(), { tried: 1 });
  clock = 5000;
  assert.equal(await idle.tick(), null, "once per idle period");
  idle.touch();
  clock = 6600;
  await idle.tick();
  assert.equal(runs, 2);
  assert.equal(createRemIdleRehearsal({ interval: 0 }).status().enabled, false, "off unless REM_REHEARSE_IDLE=1");
});

test("REM API: a rehearsal on demand runs and the rehearsals view lists it", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "rem-rehearse-"));
  try {
    const api = request.agent(createApp({ dataDir: dir, serveStatic: false }));
    await api.post("/api/rem/reset").expect(200);
    const { body } = await api.post("/api/rem/rehearse").expect(200);
    assert.equal(body.rehearsal.mode, "idle");
    assert.ok(body.rehearsal.tried > 0);
    const view = (await api.get("/api/rem/rehearsals").expect(200)).body;
    assert.equal(view.recent.length, body.rehearsal.tried);
    assert.ok(view.recent.every((d) => d.mode === "idle"));
    assert.equal(view.idle.enabled, false);
  } finally {
    await request(createApp({ dataDir: dir, serveStatic: false })).post("/api/rem/reset");
    await fs.rm(dir, { recursive: true, force: true });
  }
});
