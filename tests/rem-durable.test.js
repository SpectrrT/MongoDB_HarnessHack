import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryDb, ensureIndexes, withTransaction } from "../rem/db/index.js";
import { createAgent, seedConnections, setConnection, watchConnections } from "../rem/agent.js";
import { GEN0, applyEdit, commitHarness, currentHarness } from "../rem/harness.js";
import { createWorld } from "../rem/world.js";
import { LIVE_WORKSPACE } from "../rem/fixtures.js";
import { createScriptedModel } from "../rem/model.js";
import { createLocalEmbedder } from "../rem/embed.js";
import { createClock } from "../rem/util.js";
import { CrashError, claimEffect, commitEffect, createChaos } from "../rem/ledger.js";
import { checkRun, describeTask, taskParams } from "../rem/tasks.js";

async function setup({ chaos = null } = {}) {
  const db = createMemoryDb(),
    clock = createClock();
  await ensureIndexes(db);
  await seedConnections(db, { now: clock.now() });
  await commitHarness(db, { parent: null, genome: GEN0, now: clock.now() });
  const world = createWorld(LIVE_WORKSPACE);
  const harness = async () => {
    const h = await currentHarness(db);
    return { version: h.version, genome: h.genome };
  };
  const agent = createAgent({
    db,
    world,
    model: createScriptedModel(),
    embedder: createLocalEmbedder(),
    clock,
    harness,
    chaos,
    episodes: false,
  });
  return { db, clock, world, agent };
}

const job = (kind, week) => {
  const t = describeTask(kind, taskParams(kind, week));
  return { kind, title: t.title, instruction: t.instruction, params: t.params, week };
};

const RULE = { id: "no-customer-names", text: "Never include customer names in internal updates; write \"a customer\" instead." };
const GUARD = {
  id: "internal-recipients-only",
  description: "Send only to internal recipients (@offload.test) unless approved.",
  predicate: { type: "recipients", tool: "gmail.send" },
};

test("effects run exactly once under seeded crashes and auth expiries", async () => {
  const totals = { "before-effect": 0, "after-effect": 0, "after-commit": 0, auth: 0 };
  const jobs = [
    ["weekly-brief", "W36"],
    ["follow-ups", "W35"],
    ["release-handoff", "W36"],
    ["cleanup-drafts", "W37"],
  ];
  for (let seed = 1; seed <= 40; seed++) {
    const chaos = createChaos({ seed, crashRate: 0.3, authRate: 0.1 });
    const { db, clock, world, agent } = await setup({ chaos });
    for (const [kind, week] of jobs) {
      const t = job(kind, week),
        runId = `chaos-${seed}-${kind}`;
      let run = null;
      for (let attempt = 0; run?.status !== "done"; attempt++) {
        assert.ok(attempt < 80, `${runId} did not finish`);
        try {
          if (attempt === 0) run = await agent.startRun({ ...t, runId });
          else {
            if (run?.status === "paused_for_auth") await setConnection(db, run.provider, "valid", clock.now());
            run = await agent.resumeRun(runId);
          }
        } catch (error) {
          if (!(error instanceof CrashError)) throw error;
          run = await db.collection("checkpoints").findOne({ runId });
        }
      }
      const verdict = checkRun({ kind, params: t.params, truth: LIVE_WORKSPACE.truth, world, run });
      assert.deepEqual(verdict.failures, [], `${runId}: ${verdict.failures.join("; ")}`);
    }
    const counts = new Map();
    for (const e of world.executed) counts.set(e.effectKey, (counts.get(e.effectKey) || 0) + 1);
    assert.ok([...counts.values()].every((n) => n === 1), `seed ${seed}: an effect executed twice`);
    assert.equal(await db.collection("effects").countDocuments({ status: "committed" }), counts.size);
    assert.equal(world.state.sent.length, 2, `seed ${seed}: brief + handoff sent once each`);
    assert.equal(world.state.drafts.length, 1);
    for (const [point, n] of Object.entries(chaos.stats.crashes)) totals[point] += n;
    totals.auth += chaos.stats.authExpiries;
  }
  for (const [point, n] of Object.entries(totals)) assert.ok(n > 0, `no ${point} faults injected: ${JSON.stringify(totals)}`);
});

test("paused-for-auth asks once and a change stream resumes the run on reconnect", async () => {
  const { db, clock, world, agent } = await setup();
  const watcher = watchConnections(db, agent);
  const t = job("weekly-brief", "W36");
  const run = await agent.startRun({
    ...t,
    onStep: async ({ step }) => {
      if (step === 2) await setConnection(db, "drive", "expired", clock.now());
    },
  });
  assert.equal(run.status, "paused_for_auth");
  assert.equal(run.provider, "drive");
  const still = await agent.resumeRun(run.runId);
  assert.equal(still.status, "paused_for_auth", "no resume while the token is still expired");
  await setConnection(db, "gmail", "valid", clock.now());
  await watcher.settle();
  const asks = await db.collection("asks").find({ kind: "reconnect" }).toArray();
  assert.equal(asks.length, 1);
  assert.equal(asks[0].text, "Reconnect Google Drive");
  assert.equal(asks[0].status, "open");

  await setConnection(db, "drive", "valid", clock.now());
  await watcher.settle();
  const done = await db.collection("checkpoints").findOne({ runId: run.runId });
  assert.equal(done.status, "done");
  assert.equal(done.interventions, 1);
  assert.equal((await db.collection("asks").findOne({ kind: "reconnect" })).status, "resolved");
  assert.equal(world.state.sent.length, 1);
  await watcher.close();
});

test("resume-under-new-version re-plans remaining steps and keeps committed effects", async () => {
  const { db, clock, world, agent } = await setup();
  const t = job("weekly-brief", "W36");
  const paused = await agent.startRun({
    ...t,
    onStep: async ({ step }) => {
      if (step === 4) await setConnection(db, "gmail", "expired", clock.now());
    },
  });
  assert.equal(paused.status, "paused_for_auth");
  const parent = await currentHarness(db);
  await commitHarness(db, {
    parent,
    genome: applyEdit(applyEdit(parent.genome, { type: "rule.add", value: RULE }), { type: "guardrail.add", value: GUARD }),
    now: clock.now(),
  });
  await setConnection(db, "gmail", "valid", clock.now());
  const done = await agent.resumeRun(paused.runId);
  assert.equal(done.status, "done");
  assert.deepEqual(done.versions, [0, 1]);
  assert.equal(done.startedVersion, 0);
  assert.ok(done.replannedAt);
  const [sent] = world.state.sent;
  assert.equal(world.state.sent.length, 1);
  assert.doesNotMatch(sent.body, /Globex/);
  assert.ok(sent.to.every((a) => a.endsWith("@offload.test")));
});

test("a crash after the send, then a new harness version, still commits the original send once", async () => {
  const chaos = createChaos({ once: "after-effect" });
  const { db, clock, world, agent } = await setup({ chaos });
  const t = job("weekly-brief", "W36");
  await assert.rejects(agent.startRun({ ...t, runId: "crashy" }), CrashError);
  assert.equal(world.state.sent.length, 1);
  assert.equal((await db.collection("effects").findOne({ runId: "crashy" })).status, "pending");
  const parent = await currentHarness(db);
  await commitHarness(db, { parent, genome: applyEdit(parent.genome, { type: "rule.add", value: RULE }), now: clock.now() });
  const done = await agent.resumeRun("crashy");
  assert.equal(done.status, "done");
  assert.equal(world.state.sent.length, 1, "the reconciled send is not re-executed with new arguments");
  const effect = await db.collection("effects").findOne({ runId: "crashy" });
  assert.equal(effect.status, "committed");
  assert.equal(effect.outcome, "reconciled");
});

test("the unique effect key index rejects duplicates with code 11000", async () => {
  const db = createMemoryDb();
  await ensureIndexes(db);
  const doc = { effectKey: "k1", status: "pending" };
  await db.collection("effects").insertOne({ ...doc });
  await assert.rejects(db.collection("effects").insertOne({ ...doc }), (e) => e.code === 11000);
  const claim = await claimEffect(db, { effectKey: "k1", runId: "r", step: 1, call: { name: "gmail.send", args: {} }, now: 0 });
  assert.equal(claim.state, "pending");
  await assert.rejects(
    db.collection("harnesses").insertMany([{ version: 3 }, { version: 3 }]),
    (e) => e.code === 11000,
  );
});

test("a transaction rolls back the ledger commit and the checkpoint together", async () => {
  const db = createMemoryDb();
  await ensureIndexes(db);
  await db.collection("effects").insertOne({ effectKey: "k2", status: "pending" });
  await db.collection("checkpoints").insertOne({ runId: "r2", step: 3 });
  const seen = [];
  const stream = db.collection("effects").watch();
  stream.on("change", (e) => seen.push(e.operationType));
  await assert.rejects(
    withTransaction(db, async (session) => {
      await commitEffect(db, { effectKey: "k2", result: { ok: true }, outcome: "executed", now: 0 }, session);
      await db.collection("checkpoints").updateOne({ runId: "r2" }, { $set: { step: 4 } }, { session });
      throw new Error("crash inside the transaction");
    }),
    /crash inside/,
  );
  assert.equal((await db.collection("effects").findOne({ effectKey: "k2" })).status, "pending");
  assert.equal((await db.collection("checkpoints").findOne({ runId: "r2" })).step, 3);
  await withTransaction(db, (session) =>
    commitEffect(db, { effectKey: "k2", result: { ok: true }, outcome: "executed", now: 0 }, session),
  );
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(seen, ["update"], "rolled-back writes never reach the change stream");
  await stream.close();
});
