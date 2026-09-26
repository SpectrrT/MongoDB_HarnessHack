// REM as the one Sleep engine: recall policy with hard bounds, the capped lessons block with
// provenance, the stale-recall trap on train and held-out, probabilistic termination, and the
// brief's verified-success metrics and timeline. The Atlas smoke test is read-only and needs MONGODB_URI.
import test from "node:test";
import assert from "node:assert/strict";
import { createRem, createMemoryDb } from "../rem/index.js";
import { ensureIndexes } from "../rem/db/index.js";
import { createAgent, seedConnections, setConnection } from "../rem/agent.js";
import { GYM, GYM_EPOCH, runGymTask } from "../rem/gym.js";
import { GEN0, applyEdit, buildLessons, normalizeRecall, recallOf } from "../rem/harness.js";
import { EDITS } from "../rem/catalog.js";
import { createScriptedModel } from "../rem/model.js";
import { createLocalEmbedder } from "../rem/embed.js";
import { createJevGate, createStubGate } from "../rem/completion.js";
import { createWorld } from "../rem/world.js";
import { createClock } from "../rem/util.js";
import { ATTACKS, attackTask, challenge } from "../rem/attacks.js";

const model = createScriptedModel(),
  embedder = createLocalEmbedder();
const task = (id) => [...GYM.train, ...GYM.heldOut].find((t) => t.id === id);
const run = (id, genome) => runGymTask(task(id), genome, { model, embedder });

test("recall and completion edits are bounded; out-of-bounds edits throw", () => {
  assert.deepEqual(recallOf(GEN0), { mode: "hybrid", k: 5, minScore: 0.1, kinds: null, recencyHalfLifeDays: 7, budgetChars: 1600 });
  for (const value of [{ k: 50 }, { minScore: 2 }, { mode: "psychic" }, { budgetChars: 10 }, { kinds: ["nope"] }, { extra: 1 }])
    assert.throws(() => applyEdit(GEN0, { type: "context.set", target: "recall", value }), RangeError);
  assert.throws(() => applyEdit(GEN0, { type: "context.set", target: "completionThreshold", value: 0.99 }), RangeError);
  const g = applyEdit(GEN0, EDITS.recallNoDecay);
  assert.equal(g.contextPolicy.recall.recencyHalfLifeDays, 0);
  assert.equal(g.contextPolicy.recall.k, 5, "a patch keeps the other recall fields");
  assert.equal(applyEdit(GEN0, { type: "context.set", target: "completionThreshold", value: 0.8 }).contextPolicy.completionThreshold, 0.8);
  assert.deepEqual(normalizeRecall({ mode: "lexical" }).mode, "lexical");
});

test("the lessons block keeps top-ranked memories within budget and cites every source", () => {
  const memories = [
    { id: "m1", text: "A".repeat(60), provenance: ["e1", "e2"], score: 0.9 },
    { id: "m2", text: "B".repeat(60), provenance: ["e3"], score: 0.7 },
    { id: "m3", text: "C".repeat(60), provenance: [], score: 0.5 },
  ];
  const l = buildLessons({ genome: GEN0, memories, ruleSources: [{ id: "no-customer-names", editId: "x1", night: 2, pattern: "customer-name-leak" }], budgetChars: 130 });
  assert.deepEqual(l.injectedIds, ["m1", "m2"]);
  assert.deepEqual(l.dropped, ["m3"]);
  assert.ok(l.chars <= 130);
  assert.ok(l.sources.some((s) => s.includes("memory m1 from episodes e1, e2")));
  assert.ok(l.sources.some((s) => s.includes("rule no-customer-names: edit x1, night 2, pattern customer-name-leak")));
});

test("each run records what it was given: recalled memory ids, rules, recall policy and block size", async () => {
  const t = task("T1");
  const genome = applyEdit(applyEdit(GEN0, EDITS.injectMemories), { type: "context.set", target: "recall", value: { budgetChars: 300 } });
  const db = createMemoryDb({ name: "lessons" });
  await ensureIndexes(db, { search: false });
  const clock = createClock(GYM_EPOCH);
  await seedConnections(db, { now: clock.now() });
  const vectors = await embedder.embed(t.memories);
  await db.collection("memories").insertMany(t.memories.map((text, i) => ({ text, active: true, embedding: vectors[i], provenance: [`ep-${i}`] })));
  let system = "";
  const spy = { ...model, chat: async (req) => ((system = req.messages[0].content), model.chat(req)) };
  const agent = createAgent({ db, world: createWorld(t.workspace), model: spy, embedder, clock, harness: async () => ({ version: 1, genome }), episodes: false });
  const cp = await agent.startRun({ ...t, runId: "lessons-1" });
  assert.ok(cp.injected.memoryIds.length >= 1 && cp.injected.chars <= 300);
  assert.equal(cp.injected.recall.budgetChars, 300);
  assert.ok(system.includes("Lesson sources:") && system.includes(`memory ${cp.injected.memoryIds[0]} from episodes ep-`));
});

test("stale-recall trap: 7-day decay drops the old blocker on train and held-out; the held-out split rejects the overfit edit", async () => {
  for (const id of ["T9", "H5"]) {
    const base = await run(id, GEN0);
    assert.equal(base.pass, false, `${id} fails under gen 0`);
    assert.ok(base.tags.includes("stale-recall") && !base.tags.includes("incomplete"));
    assert.equal((await run(id, applyEdit(GEN0, EDITS.recallNoDecay))).pass, true, `${id} passes without decay`);
    assert.equal((await run(id, applyEdit(GEN0, EDITS.recallHalfLife30))).pass, true, `${id} passes with a 30-day half-life`);
  }
  const floor = applyEdit(GEN0, EDITS.recallLowFloor);
  assert.equal((await run("T9", floor)).pass, true, "a lower floor rescues the 35-day memory");
  assert.equal((await run("H5", floor)).pass, false, "but not the 45-day one: held-out catches it");
});

test("Evolve discovers and validates a recall edit on its own", async () => {
  const rem = await createRem();
  const nights = [];
  await rem.simulateDays(5, { onDay: (d) => nights.push(d.brief) });
  const night = nights.find((n) => n.evolve.edits.some((e) => e.pattern === "stale-recall" && e.outcome.status === "accepted"));
  assert.ok(night, "a stale-recall edit is accepted within five nights");
  const edit = night.evolve.edits.find((e) => e.pattern === "stale-recall");
  assert.deepEqual(edit.prediction.flips, ["T9"], "the prediction names the train task it should flip");
  assert.deepEqual([edit.outcome.challenge.held, edit.outcome.challenge.attacks], [12, 12], "held every attack on T9 and H5");
  assert.ok(night.evolve.fitness.heldOut.passed > night.evolve.baseline.heldOut.passed || night.evolve.fitness.heldOut.passed === night.evolve.fitness.heldOut.tasks);
  assert.equal((await rem.harness()).genome.contextPolicy.recall.recencyHalfLifeDays === 7, false, "the committed harness no longer decays at 7 days");
  await rem.close();
});

test("two workers racing to resume the same paused run: the lease lets exactly one drive it", async () => {
  const t = task("T1");
  const db = createMemoryDb({ name: "lease" });
  await ensureIndexes(db, { search: false });
  const clock = createClock(GYM_EPOCH);
  await seedConnections(db, { now: clock.now() });
  const world = createWorld(t.workspace);
  const worker = () => createAgent({ db, world, model, embedder, clock, harness: async () => ({ version: 1, genome: GEN0 }), episodes: false });
  const a = worker(),
    b = worker();
  const paused = await a.startRun({
    ...t,
    runId: "shared",
    onStep: async ({ step }) => step === 2 && setConnection(db, "drive", "revoked", clock.now()),
  });
  assert.equal(paused.status, "paused_for_auth");
  await setConnection(db, "drive", "valid", clock.now());
  const [ra, rb] = await Promise.all([a.resumeRun("shared"), b.resumeRun("shared")]);
  const final = await db.collection("checkpoints").findOne({ runId: "shared" });
  const steps = final.transcript.map((x) => x.step);
  assert.equal(new Set(steps).size, steps.length, "no step was driven twice");
  assert.equal(final.status, "done");
  assert.equal(final.resumes, 1, "only one worker claimed the resume");
  assert.equal(world.state.sent.filter((m) => m.runId === "shared").length, 1);
  assert.ok([ra, rb].some((r) => r.status === "done"));
});

test("adversarial challenge: six truth-preserving attacks; the recall edit holds them, gen 0 does not", async () => {
  const opts = { model, embedder };
  for (const name of Object.keys(ATTACKS)) {
    const attacked = attackTask(task("T9"), name);
    assert.deepEqual(attacked.workspace.truth, task("T9").workspace.truth, `${name} keeps the ground truth`);
  }
  const good = await challenge(applyEdit(GEN0, EDITS.recallNoDecay), ["T9", "H5"], opts);
  assert.deepEqual([good.attacks, good.held, good.failed.length], [12, 12, 0]);
  const bad = await challenge(GEN0, ["T9"], opts);
  assert.deepEqual([bad.attacks, bad.held], [6, 0]);
  assert.ok(bad.failed.every((f) => f.failures.includes("missing blocker: SEC-7 signing key rotation")));
});

test("probabilistic termination: a run below threshold keeps working once, then finishes with the record", async () => {
  const t = task("T4");
  const make = async (failures) => {
    const db = createMemoryDb({ name: `gate-${failures.length}` });
    await ensureIndexes(db, { search: false });
    const clock = createClock(GYM_EPOCH);
    await seedConnections(db, { now: clock.now() });
    const agent = createAgent({
      db,
      world: createWorld(t.workspace),
      model,
      embedder,
      clock,
      harness: async () => ({ version: 1, genome: GEN0 }),
      episodes: false,
      completion: createStubGate(),
      evidence: async () => ({ failures }),
    });
    return agent.startRun({ ...t, runId: "gate" });
  };
  const ok = await make([]);
  assert.equal(ok.completion.passed, true);
  assert.equal(ok.completion.attempts, 1);
  assert.equal(ok.completion.source, "stub");
  const bad = await make(["missing blocker: SEC-7 signing key rotation"]);
  assert.equal(bad.completion.passed, false);
  assert.equal(bad.completion.attempts, 2, "one extra executor turn before finishing");
  assert.ok(bad.completion.p < bad.completion.threshold);
  assert.equal(bad.turns, ok.turns + 1);
});

test("the Jev gate reads a probability and falls back to the labeled stub when OpenRouter refuses", async () => {
  const cp = { instruction: "Check release readiness for W33", plan: [], transcript: [] };
  const good = createJevGate({ apiKey: "k", fetchImpl: async (url, init) => {
    const body = JSON.parse(init.body);
    assert.equal(body.model, "typesafe/jev-1.13");
    assert.equal(body.questions.satisfied.type, "noul");
    assert.match(body.state.checks, /failing: missing blocker/);
    return { ok: true, json: async () => ({ answers: { satisfied: { noul: 0.05 } }, usage: { input_tokens: 400, output_tokens: 0 } }) };
  } });
  const v = await good.check({ cp, final: "go", evidence: { failures: ["missing blocker: SEC-7"] } });
  assert.deepEqual([v.p, v.source, v.tokens], [0.05, "typesafe/jev-1.13", 400]);
  const broke = createJevGate({ apiKey: "k", fetchImpl: async () => ({ ok: false, status: 402 }) });
  const f = await broke.check({ cp, final: "go", evidence: { failures: [] } });
  assert.equal(f.source, "stub (jev unavailable: 402 payment required)");
  assert.equal(typeof f.p, "number");
});

test("the morning brief reports cost per verified success and a timeline of the night", async () => {
  const rem = await createRem();
  await rem.runDay();
  const brief = await rem.sleep();
  assert.deepEqual(brief.timeline.map((t) => t.phase), ["replay", "merge", "distill", "evolve", "calibrate", "asks"]);
  assert.ok(brief.timeline.every((t) => typeof t.wallMs === "number" && t.startedAt));
  const { gymBefore, gymAfter, day } = brief.verified;
  assert.ok(gymAfter.verified > gymBefore.verified);
  assert.ok(gymAfter.costPerVerifiedSuccess < gymBefore.costPerVerifiedSuccess);
  assert.ok(day.runs > 0 && day.verified <= day.runs);
  assert.match(brief.text, /Cost per verified success: gym \$/);
  const state = await rem.state();
  assert.equal(state.engine.database, "memory");
  assert.equal(state.recall.recencyHalfLifeDays, (await rem.harness()).genome.contextPolicy.recall.recencyHalfLifeDays);
  assert.equal(typeof state.completionThreshold, "number");
  await rem.close();
});

test("Atlas smoke: REM's search indexes are READY and hybrid recall runs as $rankFusion (read-only)", { skip: !process.env.MONGODB_URI }, async () => {
  const { createMongoDb } = await import("../rem/db/mongo.js");
  const { searchCollection } = await import("../rem/search.js");
  const db = await createMongoDb({ dbName: process.env.REM_DB_NAME || "rem" });
  try {
    for (const name of ["episodes", "memories", "skills", "edits"])
      assert.ok((await db.collection(name).listSearchIndexes().toArray()).every((i) => i.status === "READY"), `${name} indexes READY`);
    const hits = await searchCollection(db, "memories", { query: "open blockers", embedder, filter: { active: true }, recall: recallOf(GEN0), now: Date.now() });
    assert.ok(hits.every((h) => h.fusion === "rankFusion"));
  } finally {
    await db.close();
  }
});
