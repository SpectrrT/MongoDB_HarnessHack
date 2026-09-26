// Evolve: weakness mining → proposal with predictions → validation on train + held-out with a
// no-regression gate → versioned commit → outcome vs prediction (the track record).
import { GYM, TRAIN_IDS, compareFitness, proposerView, regressions, runGym } from "./gym.js";
import { PATTERNS, SEVERITY_RANK } from "./catalog.js";
import { applyEdit, commitHarness, currentHarness, editSignature } from "./harness.js";
import { predictionError, trackRecord } from "./proposer.js";
import { searchCollection, settleSearch } from "./search.js";
import { challenge } from "./attacks.js";
import { keptRehearsals, markFixed } from "./rehearse.js";
import { DAY_MS, round } from "./util.js";

const PATTERN_ORDER = Object.keys(PATTERNS);
const HELD_OUT_TITLES = new Map(GYM.heldOut.map((t) => [t.id, t.title]));
// Expanding authority is never decided by the gate alone: it becomes a morning ask.
export const NEEDS_AUTHORITY = new Set(["scope.grant", "guardrail.loosen", "guardrail.remove"]);

async function queueAuthorityAsk({ db, embedder, clock }, edit, { night, baseVersion }) {
  const doc = {
    night,
    name: edit.name || null,
    type: edit.type,
    target: edit.target ?? null,
    value: edit.value ?? null,
    signature: editSignature(edit),
    description: edit.description,
    rationale: edit.rationale,
    pattern: edit.pattern,
    prediction: edit.prediction,
    outcome: { status: "queued-ask", reason: "needs new authority" },
    baseVersion,
    createdAt: new Date(clock.now()),
    embedding: (await embedder.embed([edit.description]))[0],
  };
  const { insertedId } = await db.collection("edits").insertOne(doc);
  await db.collection("asks").updateOne(
    { dedupeKey: `edit:${doc.signature}` },
    {
      $setOnInsert: {
        kind: "edit.authority",
        editId: insertedId,
        risk: edit.type === "scope.grant" ? "scope" : "guardrail",
        text: `Allow this harness change? ${edit.description}`,
        night,
        createdAt: new Date(clock.now()),
        status: "open",
      },
    },
    { upsert: true },
  );
  return { ...doc, _id: insertedId, heldOutRegressedTitles: [] };
}

export async function gymSkills(db) {
  return db
    .collection("skills")
    .find({ status: { $in: ["practiced", "approved", "autonomous"] } }, { projection: { embedding: 0 } })
    .toArray();
}

const trajectorySummary = (v) =>
  `${v.taskId} ${v.kind} ${v.pass ? "passed" : "failed"}${v.tags.length ? ` [${v.tags.join(", ")}]` : ""}` +
  `${v.failures.length ? `: ${v.failures.join("; ")}` : ""}; ${v.steps} steps, $${v.cost.toFixed(4)}`;

// Failed or inefficient train trajectories become episodes (vector-searchable), grouped into named
// failure patterns by the checkers' tags, with evidence retrieved by hybrid search.
export async function mineWeaknesses({ db, embedder, clock }, view, night) {
  const docs = view
    .filter((v) => v.tags.length)
    .map((v) => ({
      kind: "trajectory",
      split: "train",
      night,
      taskId: v.taskId,
      taskKind: v.kind,
      tags: v.tags,
      summary: trajectorySummary(v),
      importance: v.pass ? 0.4 : 0.8,
      ts: new Date(clock.now()),
      consolidated: true,
      expireAt: new Date(clock.now() + 7 * DAY_MS),
    }));
  if (docs.length) {
    const vectors = await embedder.embed(docs.map((d) => d.summary));
    await db.collection("episodes").insertMany(docs.map((d, i) => ({ ...d, embedding: vectors[i] })));
    // On Atlas, autoEmbed indexes the new trajectories a few seconds later; evidence search needs them.
    await settleSearch(db, ["episodes"], { timeoutMs: 30000 });
  }
  const byTag = new Map();
  for (const v of view)
    for (const tag of v.tags) if (PATTERNS[tag]) byTag.set(tag, [...(byTag.get(tag) || []), v.taskId]);
  const patterns = [];
  for (const [name, tasks] of byTag) {
    const hits = await searchCollection(db, "episodes", {
      query: `${PATTERNS[name].title} ${name}`,
      embedder,
      filter: { kind: "trajectory", night, tags: name },
      k: 3,
      textField: "summary",
    });
    patterns.push({
      name,
      title: PATTERNS[name].title,
      severity: PATTERNS[name].severity,
      tasks,
      evidence: hits.map((h) => h.doc.summary),
    });
  }
  return patterns.sort(
    (a, b) =>
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
      b.tasks.length - a.tasks.length ||
      PATTERN_ORDER.indexOf(a.name) - PATTERN_ORDER.indexOf(b.name),
  );
}

const pastSummary = (e) => ({
  night: e.night,
  type: e.type,
  target: e.target,
  signature: e.signature,
  description: e.description,
  status: e.outcome?.status,
  reason: e.outcome?.reason,
  predicted: e.prediction && {
    passDelta: e.prediction.passDelta,
    stepsDelta: e.prediction.stepsDelta,
    costDelta: e.prediction.costDelta,
  },
  observed: e.outcome?.train,
});

function measure(before, after, split) {
  const a = before.fitness[split],
    b = after.fitness[split];
  const passedBefore = new Set(before.results.filter((r) => r.pass).map((r) => r.taskId));
  return {
    passDelta: b.passed - a.passed,
    costDelta: round((b.cost - a.cost) / (a.cost || 1), 3),
    stepsDelta: round((b.steps - a.steps) / (a.tasks || 1), 3),
    interventionsDelta: b.interventions - a.interventions,
    collateralDelta: b.collateral - a.collateral,
    flips: after.results.filter((r) => r.split === split && r.pass && !passedBefore.has(r.taskId)).map((r) => r.taskId),
  };
}

export async function evolve(ctx, { night, proposer, maxEdits = 3 }) {
  const { db, model, embedder, clock } = ctx;
  const current = await currentHarness(db);
  const skills = await gymSkills(db);
  // Rehearsals that broke the harness and no version has passed yet: every candidate is validated against them too.
  const extra = await keptRehearsals(db);
  const base = await runGym(current.genome, { model, embedder, skills, extra });
  const view = proposerView(base.results);
  const patterns = await mineWeaknesses(ctx, view, night);
  for (const p of patterns) {
    const hits = await searchCollection(db, "edits", { query: p.title, embedder, k: 3, textField: "description" });
    p.pastEdits = hits.map((h) => pastSummary(h.doc));
  }
  const pastEdits = (await db.collection("edits").find({}, { sort: { night: 1, createdAt: 1 } }).toArray()).map(pastSummary);
  const input = { genome: current.genome, patterns, view, pastEdits, trackRecord: await trackRecord(db), maxEdits };
  ctx.onProposerInput?.(input);
  const proposal = await proposer.propose(input);

  let acc = { genome: current.genome, results: base.results, fitness: base.fitness };
  const outcomes = [],
    acceptedIds = [];
  for (const edit of proposal.edits) {
    if (NEEDS_AUTHORITY.has(edit.type)) {
      outcomes.push(await queueAuthorityAsk(ctx, edit, { night, baseVersion: current.version }));
      continue;
    }
    const candidate = applyEdit(acc.genome, edit);
    const run = await runGym(candidate, { model, embedder, skills, extra });
    const regressed = regressions(acc.results, run.results);
    const heldOutRegressed = regressed.filter((id) => !TRAIN_IDS.includes(id));
    const trainRegressed = regressed.filter((id) => TRAIN_IDS.includes(id));
    const better = compareFitness(run.fitness.all, acc.fitness.all) === 1;
    let status = !regressed.length && better ? "accepted" : "rejected";
    let reason =
      status === "accepted"
        ? "net-positive with no regressions"
        : heldOutRegressed.length
          ? `regressed ${heldOutRegressed.length} held-out task${heldOutRegressed.length > 1 ? "s" : ""}`
          : trainRegressed.length
            ? `regressed train task ${trainRegressed.join(", ")}`
            : "not net-positive";
    // Adversarial challenge: every task the edit flipped must still pass under six truth-preserving attacks.
    let attacked = null;
    if (status === "accepted") {
      const flipped = run.results.filter((r) => r.pass && !acc.results.find((b) => b.taskId === r.taskId)?.pass).map((r) => r.taskId);
      if (flipped.length) {
        attacked = { tasks: flipped, ...(await challenge(candidate, flipped, { model, embedder, skills })) };
        if (attacked.failed.length) {
          status = "rejected";
          reason = `failed adversarial challenge: ${attacked.failed.map((f) => `${f.taskId} ${f.attack}`).join(", ")}`;
        } else reason = `net-positive with no regressions; held ${attacked.held}/${attacked.attacks} attacks`;
      }
    }
    const train = measure(acc, run, "train");
    const heldOut = measure(acc, run, "heldOut");
    const doc = {
      night,
      name: edit.name || null,
      type: edit.type,
      target: edit.target ?? null,
      value: edit.value ?? null,
      signature: editSignature(edit),
      description: edit.description,
      rationale: edit.rationale,
      pattern: edit.pattern,
      prediction: edit.prediction,
      outcome: {
        status,
        reason,
        train,
        heldOut: { passDelta: heldOut.passDelta, regressed: heldOutRegressed.length },
        predictionError: predictionError(edit.prediction, train),
        ...(attacked ? { challenge: attacked } : {}),
      },
      baseVersion: current.version,
      createdAt: new Date(clock.now()),
      embedding: (await embedder.embed([edit.description]))[0],
    };
    const { insertedId } = await db.collection("edits").insertOne(doc);
    outcomes.push({
      ...doc,
      _id: insertedId,
      heldOutRegressedTitles: heldOutRegressed.map((id) => `${HELD_OUT_TITLES.get(id)} (${id})`),
      fitness: run.fitness,
    });
    if (status === "accepted") {
      acc = { genome: candidate, results: run.results, fitness: run.fitness };
      acceptedIds.push(insertedId);
    }
  }
  let committed = null;
  if (acceptedIds.length) {
    committed = await commitHarness(db, {
      parent: current,
      genome: acc.genome,
      editIds: acceptedIds,
      fitness: acc.fitness,
      metrics: { baseline: base.fitness },
      night,
      now: clock.now(),
    });
    await db.collection("edits").updateMany({ _id: { $in: acceptedIds } }, { $set: { resultVersion: committed.version } });
    if (extra.length) await markFixed(db, acc.results, committed.version);
  }
  return {
    baseVersion: current.version,
    baseline: base.fitness,
    fitness: acc.fitness,
    patterns,
    outcomes,
    skipped: proposal.skipped || [],
    committed,
  };
}
