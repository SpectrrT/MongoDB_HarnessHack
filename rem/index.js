// REM: "Agents that sleep, and wake up with a better harness." One facade for the server, CLI and tests.
import { createMemoryDb, ensureIndexes } from "./db/index.js";
import { createAgent, setConnection, watchConnections } from "./agent.js";
import { decide } from "./asks.js";
import { bootstrap, dayStart, morning, runDay, scheduleFor, simulateDays } from "./cycle.js";
import { createLocalEmbedder } from "./embed.js";
import { LIVE_WORKSPACE } from "./fixtures.js";
import { completionThresholdOf, currentHarness, lineage, recallOf } from "./harness.js";
import { createScriptedModel } from "./model.js";
import { memoryMetrics } from "./metrics.js";
import { runNight } from "./night.js";
import { createCatalogProposer, trackRecord } from "./proposer.js";
import { OFFLOAD_ALIASES, TASK_KINDS, describeTask, taskParams } from "./tasks.js";
import { createWorld } from "./world.js";
import { createCompletionGate } from "./completion.js";
import { checkRun } from "./tasks.js";
import { settleSearch } from "./search.js";
import { createClock } from "./util.js";

const strip = (doc) => {
  if (!doc || typeof doc !== "object") return doc;
  const { embedding, identityEmbedding, ...rest } = doc;
  return rest;
};

// `embed` and `now` are accepted as aliases for `embedder` and the simulated clock's start time.
export async function createRem({
  db = createMemoryDb(),
  model = createScriptedModel(),
  embed,
  embedder = embed || createLocalEmbedder(),
  now,
  clock = createClock(typeof now === "function" ? now() : now ? Number(new Date(now)) : dayStart(1)),
  workspace = LIVE_WORKSPACE,
  proposer = createCatalogProposer(),
  completion = createCompletionGate(),
  onEvent = null,
} = {}) {
  await ensureIndexes(db, { dims: embedder.dims || 1024 });
  const ctx = { db, model, embedder, clock, workspace, proposer, chaos: null, day: 1, onEvent };
  ctx.world = createWorld(workspace);
  ctx.agent = createAgent({
    db,
    world: ctx.world,
    model,
    embedder,
    clock,
    harness: async () => {
      const h = await currentHarness(db);
      return { version: h.version, genome: h.genome };
    },
    chaos: { point: (p) => ctx.chaos?.point(p), expireNow: () => ctx.chaos?.expireNow() ?? false },
    completion,
    // The completion gate's evidence: the end-state checks on the live workspace, run before finishing.
    evidence: completion
      ? async (cp, final) => {
          const v = checkRun({ kind: cp.kind, params: cp.params, truth: workspace.truth, world: ctx.world, run: { ...cp, final, status: "done" } });
          return { failures: [...v.failures, ...v.collateral.map((c) => `collateral: ${c}`)], pass: v.pass };
        }
      : null,
    onEvent: (e) => ctx.onEvent?.(e),
  });
  ctx.watcher = watchConnections(db, ctx.agent);
  if (await currentHarness(db)) ctx.day = (await db.collection("briefs").countDocuments()) + 1;
  else await bootstrap(ctx);

  const rem = {
    ctx,
    get day() {
      return ctx.day;
    },
    get week() {
      return scheduleFor(ctx.day).week;
    },
    harness: () => currentHarness(db),
    async runTask(kind, { week = scheduleFor(ctx.day).week, day = ctx.day, runId, revokeAt = null, onStep } = {}) {
      kind = OFFLOAD_ALIASES[kind] || kind;
      if (!TASK_KINDS[kind]) throw new Error(`Unknown task ${kind}.`);
      const t = describeTask(kind, taskParams(kind, week));
      return ctx.agent.startRun({
        ...t,
        week,
        day,
        runId,
        onStep: async (s) => {
          if (revokeAt && s.step === revokeAt) await setConnection(db, "drive", "revoked", clock.now());
          await onStep?.(s);
        },
      });
    },
    resumeRun: (runId) => ctx.agent.resumeRun(runId),
    setConnection: (provider, state) => setConnection(db, provider, state, clock.now()),
    settle: () => ctx.watcher.settle(),
    runDay: (opts) => runDay(rem, opts),
    async sleep() {
      await ctx.watcher.settle();
      clock.set(Math.max(clock.now(), dayStart(ctx.day) + 9 * 3600000));
      const brief = await runNight(ctx, { day: ctx.day, proposer: ctx.proposer });
      // On Atlas, autoEmbed indexes sync a few seconds after the night's writes; the morning recalls them.
      if (db.kind === "mongo" && db.atlasSearch) brief.searchSettle = await settleSearch(db, ["memories", "skills"]);
      ctx.day++;
      clock.set(Math.max(clock.now(), dayStart(ctx.day)));
      return brief;
    },
    morning: (opts) => morning(rem, opts),
    decide: (askId, decision, opts) => decide(ctx, db.toId ? db.toId(askId) : askId, decision, opts),
    simulateDays: (n, opts) => simulateDays(rem, n, opts),
    memoryMetrics: (week = scheduleFor(Math.max(1, ctx.day - 1)).week) => memoryMetrics(ctx, week),
    trackRecord: () => trackRecord(db),
    async state() {
      const [harness, versions, edits, metrics, asks, skills, runs, effects, brief, connections] = await Promise.all([
        currentHarness(db),
        lineage(db),
        db.collection("edits").find({}, { sort: { createdAt: -1 }, limit: 20 }).toArray(),
        db.collection("metrics").find({}, { sort: { ts: 1 } }).toArray(),
        db.collection("asks").find({ status: "open" }, { sort: { createdAt: -1 } }).toArray(),
        db.collection("skills").find({}, { sort: { name: 1 } }).toArray(),
        db.collection("checkpoints").find({}, { sort: { updatedAt: -1 }, limit: 20, projection: { transcript: 0, context: 0 } }).toArray(),
        db.collection("effects").find({}, { sort: { createdAt: -1 }, limit: 20 }).toArray(),
        db.collection("briefs").findOne({}, { sort: { night: -1 } }),
        db.collection("connections").find({}, { sort: { provider: 1 } }).toArray(),
      ]);
      const memories = db.collection("memories");
      return {
        day: ctx.day,
        week: scheduleFor(ctx.day).week,
        harness: { version: harness.version, genome: harness.genome, diffText: harness.diffText, lineage: versions },
        edits: edits.map(strip),
        metrics,
        asks,
        memory: {
          active: await memories.countDocuments({ active: true }),
          retired: await memories.countDocuments({ active: false }),
          episodes: await db.collection("episodes").countDocuments({ kind: { $ne: "trajectory" } }),
          unconsolidated: await db.collection("episodes").countDocuments({ consolidated: false }),
        },
        skills: skills.map(strip),
        runs,
        effects,
        brief: brief ? { ...brief, evolve: { ...brief.evolve } } : null,
        connections,
        trackRecord: await trackRecord(db),
        engine: {
          database: db.kind === "mongo" ? `atlas:${db.databaseName}` : "memory",
          search: db.kind === "mongo" && db.atlasSearch ? `atlas-${db.vectorMode || "auto"}` : "app-rrf",
          embedder: embedder.name,
          model: model.name || "scripted",
          completion: completion?.name || "off",
        },
        recall: recallOf(harness.genome),
        completionThreshold: completionThresholdOf(harness.genome),
      };
    },
    async close() {
      await ctx.watcher.settle();
      await ctx.watcher.close();
    },
  };
  return rem;
}

export { createMemoryDb } from "./db/index.js";
export { createScriptedModel } from "./model.js";
export { createLocalEmbedder } from "./embed.js";
export { renderBrief } from "./night.js";
export { renderDiff, GEN0 } from "./harness.js";
