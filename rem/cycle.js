// Day → night → morning. A simulated day runs that week's tasks under the current harness; the
// night is one consolidation run; the morning answers asks.
import { observationsOf, seedConnections } from "./agent.js";
import { decide } from "./asks.js";
import { DEMONSTRATION, LIVE_SCHEDULE } from "./fixtures.js";
import { PREFERENCES, teamFact } from "./facts.js";
import { GEN0, commitHarness } from "./harness.js";
import { CrashError, createChaos } from "./ledger.js";
import { memoryMetrics, rawItems, storeMetrics } from "./metrics.js";
import { checkRun } from "./tasks.js";
import { createWorld } from "./world.js";
import { DAY_MS, round, sum } from "./util.js";

export const EPOCH = Date.parse("2026-08-24T13:00:00Z");
export const dayStart = (day) => EPOCH + (day - 1) * DAY_MS;
export const nightTime = (day) => dayStart(day) + 9 * 3600000;
export const scheduleFor = (day) => LIVE_SCHEDULE[(day - 1) % LIVE_SCHEDULE.length];

async function insertEpisodes({ db, embedder }, docs) {
  if (!docs.length) return;
  const vectors = await embedder.embed(docs.map((d) => d.summary));
  await db.collection("episodes").insertMany(docs.map((d, i) => ({ consolidated: false, expireAt: null, ...d, embedding: vectors[i] })));
}

export async function bootstrap(ctx) {
  const { db, clock, workspace } = ctx;
  await seedConnections(db, { now: clock.now() });
  await commitHarness(db, { parent: null, genome: GEN0, now: clock.now() });
  const demo = DEMONSTRATION,
    scratch = createWorld(workspace),
    ts = new Date(clock.now() - 7 * DAY_MS);
  const base = { demoId: demo.demoId, taskKind: demo.taskKind, week: demo.week, day: 0, ts, source: "demonstration" };
  const docs = [];
  for (const [i, step] of demo.steps.entries()) {
    const read = step.tool.startsWith("drive.");
    const result = read ? await scratch.call(step.tool, step.args) : null;
    docs.push({
      ...base,
      kind: "demonstration",
      seq: i + 1,
      tool: step.tool,
      args: step.args,
      summary: read ? `Human: ${step.tool} ${JSON.stringify(step.args)}` : `Human sent "${step.args.subject}" to ${step.args.to.join(", ")}`,
      importance: 0.9,
    });
    if (result) docs.push(...observationsOf({ call: { name: step.tool, args: step.args }, result }).map((o) => ({ ...base, ...o })));
  }
  const team = demo.steps.find((s) => s.tool === "gmail.send").args.to;
  docs.push({
    ...base,
    kind: "demonstration",
    summary: `Human note: ${demo.note}`,
    facts: [PREFERENCES["customer-name-leak"], PREFERENCES["external-recipient"], teamFact(team)],
    importance: 0.95,
  });
  await insertEpisodes(ctx, docs);
}

// The simulated human reviews each finished run with the same checkers the gym uses and corrects
// collateral damage. Each correction is an episode (raw material for Merge) and an intervention.
export async function review(ctx, run) {
  const { db, world, workspace, clock } = ctx;
  const verdict = checkRun({ kind: run.kind, params: run.params, truth: workspace.truth, world, run });
  const corrections = [];
  for (const kind of verdict.collateral) {
    const pref = PREFERENCES[kind];
    const facts = [pref];
    let note = pref.text;
    if (kind === "external-recipient") {
      facts.push(teamFact(workspace.truth.team));
      note = `send internal updates only to the team list: ${workspace.truth.team.join(", ")}`;
    }
    if (kind === "deleted-real-doc") {
      const wrong = world.state.trash.filter((t) => t.runId === run.runId && !workspace.truth.staleDrafts.includes(t.id));
      if (world.restoreFiles) await world.restoreFiles(wrong.map(t => t.id));
      else {
        for (const t of wrong) world.state.files.find((f) => f.id === t.id).trashed = false;
        world.state.trash = world.state.trash.filter((t) => !wrong.includes(t));
      }
      note = `${pref.text} (restored ${wrong.map((t) => `"${t.title}"`).join(", ")})`;
    }
    corrections.push({
      kind: "correction",
      runId: run.runId,
      taskKind: run.kind,
      day: run.day,
      week: run.week,
      ts: new Date(clock.now()),
      summary: `Correction on ${run.title}: ${note}`,
      facts,
      collateral: kind,
      importance: 0.95,
    });
  }
  await insertEpisodes(ctx, corrections);
  await db.collection("checkpoints").updateOne(
    { runId: run.runId },
    { $set: { verdict }, $inc: { interventions: corrections.length, corrections: corrections.length } },
  );
  return { verdict, corrections: corrections.length };
}

// Runs a task to completion the way a person would: reconnect when asked, restart after a crash.
export async function runToCompletion(rem, kind, opts = {}) {
  let run;
  try {
    run = await rem.runTask(kind, opts);
  } catch (error) {
    if (!(error instanceof CrashError)) throw error;
    run = await rem.ctx.db.collection("checkpoints").findOne({ runId: error.runId || opts.runId });
    run = await rem.resumeRun(run.runId);
  }
  for (let i = 0; run.status === "paused_for_auth" && i < 5; i++) {
    await rem.setConnection(run.provider, "valid");
    await rem.settle();
    run = await rem.ctx.db.collection("checkpoints").findOne({ runId: run.runId });
  }
  return run;
}

export async function runDay(rem, { day = rem.ctx.day, revoke = day === 1, crash = day > 1 } = {}) {
  const { ctx } = rem;
  const { week, tasks } = scheduleFor(day);
  ctx.clock.set(Math.max(ctx.clock.now(), dayStart(day)));
  const forgotten = await ctx.db.sweepExpired(ctx.clock.now());
  const results = [];
  for (const kind of tasks) {
    const brief = kind === "weekly-brief";
    ctx.chaos = crash && brief ? createChaos({ once: "after-effect" }) : null;
    const runId = `run-${kind}-${week}-d${day}`;
    const run = await runToCompletion(rem, kind, { week, day, runId, revokeAt: revoke && brief ? 3 : null });
    ctx.chaos = null;
    const { verdict, corrections } = await review(ctx, run);
    results.push({ runId: run.runId, kind, status: run.status, verdict, corrections, turns: run.turns });
  }
  return { day, week, forgotten, results };
}

export async function morning(rem, { approve = () => true } = {}) {
  const open = await rem.ctx.db.collection("asks").find({ status: "open", kind: "skill.autonomous" }).toArray();
  const decisions = [];
  for (const ask of open) decisions.push(await decide(rem.ctx, ask._id, approve(ask) ? "approve" : "deny"));
  return decisions;
}

export async function dayMetrics(ctx, { day, week, before, after, withoutSleep, brief }) {
  const { db, world } = ctx;
  const runs = await db.collection("checkpoints").find({ day }).toArray();
  const reviewed = runs.filter((r) => r.verdict);
  const effects = await db.collection("effects").find({ status: "committed" }).toArray();
  const keys = new Set(world.executed.map((e) => e.effectKey));
  const edits = brief.evolve.edits.filter((e) => e.outcome.train);
  const doc = {
    ts: new Date(ctx.clock.now()),
    meta: { series: "day", day, week, harnessVersion: runs[0]?.harnessVersion ?? null, harnessAfter: brief.harness.to },
    tasks: runs.length,
    passed: reviewed.filter((r) => r.verdict.pass).length,
    passRate: round(reviewed.filter((r) => r.verdict.pass).length / (reviewed.length || 1), 3),
    collateral: sum(reviewed, (r) => r.verdict.collateral.length),
    steps: sum(runs, (r) => r.turns),
    cost: round(sum(runs, (r) => r.usage.cost), 4),
    latencyMs: sum(runs, (r) => r.latencyMs),
    interventions: sum(runs, (r) => r.interventions),
    memory: {
      before,
      after,
      withoutSleep,
      episodesStored: await db.collection("episodes").countDocuments({ kind: { $ne: "trajectory" } }),
    },
    effects: { committed: effects.length, executed: world.executed.length, duplicates: world.executed.length - keys.size },
    gym: {
      train: brief.evolve.fitness.train,
      heldOut: brief.evolve.fitness.heldOut,
      collateral: brief.evolve.fitness.all.collateral,
      cost: round(brief.evolve.fitness.all.cost, 4),
    },
    edits: { proposed: edits.length, accepted: edits.filter((e) => e.outcome.status === "accepted").length },
    predictionError: edits.length ? round(sum(edits, (e) => e.outcome.predictionError) / edits.length, 3) : null,
  };
  await db.collection("metrics").insertOne(doc);
  return doc;
}

// Sleep, measured: the store before and after the night, and a shadow store that never sleeps.
export async function sleepMeasured(rem, week) {
  const { ctx } = rem;
  ctx.shadow ??= [];
  ctx.shadow.push(...(await rawItems(ctx.db)));
  const before = await memoryMetrics(ctx, week);
  const brief = await rem.sleep();
  const after = await memoryMetrics(ctx, week);
  const withoutSleep = await storeMetrics(ctx.shadow, { embedder: ctx.embedder, truth: ctx.workspace.truth, asOf: week });
  return { brief, before, after, withoutSleep };
}

export async function simulateDays(rem, n, { onDay, approve } = {}) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const day = rem.ctx.day;
    const dayResult = await runDay(rem, { day });
    const { brief, before, after, withoutSleep } = await sleepMeasured(rem, dayResult.week);
    await morning(rem, { approve });
    const doc = await dayMetrics(rem.ctx, { day, week: dayResult.week, before, after, withoutSleep, brief });
    out.push({ ...doc, brief, dayResult });
    await onDay?.(out.at(-1));
  }
  return out;
}
