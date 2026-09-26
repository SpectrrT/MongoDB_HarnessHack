// Calibrate: grading the grader. The completion gate decides when a run may call itself done; the gym's checkers
// know whether it really was. Each night the current harness runs the gym once, the gate scores every finished run
// (with the checks as evidence, and blind, the way it must judge tasks that have no checker), and the scores are
// compared with the checkers: false accepts, false rejects, Brier score. Then the harness tunes its own threshold:
// the value in COMPLETION_BOUNDS with the fewest blind errors on train is adopted only if held-out errors do not
// rise. The gym and checkers stay read-only; only the genome's completionThreshold moves.
import { COMPLETION_BOUNDS, applyEdit, commitHarness, completionThresholdOf, currentHarness, editSignature } from "./harness.js";
import { gymSkills } from "./evolve.js";
import { runGym } from "./gym.js";
import { round } from "./util.js";

export const THRESHOLDS = Object.freeze([0.5, 0.6, 0.7, 0.8, 0.9, 0.95].filter((t) => t >= COMPLETION_BOUNDS.min && t <= COMPLETION_BOUNDS.max));
const validProbability = p => Number.isFinite(p) && p >= 0 && p <= 1;

// How often the gate's call at `threshold` disagrees with the checker, on runs scored with `key` ("blind" or "checked").
export function gateErrors(results, threshold, key = "blind") {
  const graded = results.filter((r) => validProbability(r.gate?.[key]));
  const falseAccepts = graded.filter((r) => !r.pass && r.gate[key] >= threshold).map((r) => r.taskId);
  const falseRejects = graded.filter((r) => r.pass && r.gate[key] < threshold).map((r) => r.taskId);
  const brier = graded.length ? graded.reduce((a, r) => a + (r.gate[key] - (r.pass ? 1 : 0)) ** 2, 0) / graded.length : null;
  return {
    tasks: graded.length,
    expectedTasks: results.length,
    unavailable: results.length - graded.length,
    complete: results.length > 0 && graded.length === results.length,
    falseAccepts: falseAccepts.length,
    falseRejects: falseRejects.length,
    errors: falseAccepts.length + falseRejects.length,
    brier: brier == null ? null : round(brier, 3),
    falseAcceptIds: falseAccepts,
    falseRejectIds: falseRejects,
  };
}

// Fewest errors; ties go to fewer false accepts (calling unfinished work done is the worse mistake), then to the
// threshold closest to the current one. A threshold that accepts no run at all is only a fallback: it trades every
// false accept for a false reject and leaves the gate unable to say done.
export function bestThreshold(results, current) {
  if (!results.length || results.some(r => !validProbability(r.gate?.blind))) return current;
  const score = (t) => gateErrors(results, t);
  const acceptsSome = (t) => results.some((r) => validProbability(r.gate?.blind) && r.gate.blind >= t);
  const pool = THRESHOLDS.filter(acceptsSome);
  return [...(pool.length ? pool : THRESHOLDS)].sort((a, b) => {
    const x = score(a),
      y = score(b);
    return x.errors - y.errors || x.falseAccepts - y.falseAccepts || Math.abs(a - current) - Math.abs(b - current);
  })[0];
}

export async function calibrate(ctx, { night, gate = ctx.completion }) {
  const { db, model, embedder, clock } = ctx;
  const current = await currentHarness(db);
  const results = gate ? (await runGym(current.genome, { model, embedder, skills: await gymSkills(db), grade: gate })).results : [];
  const train = results.filter((r) => r.split === "train"),
    heldOut = results.filter((r) => r.split === "heldOut");
  const from = completionThresholdOf(current.genome);
  const best = bestThreshold(train, from);
  const report = (t) => ({ train: gateErrors(train, t), heldOut: gateErrors(heldOut, t) });
  const receipts = results.flatMap(r => (r.gate?.receipts || []).map(receipt => ({ taskId: r.taskId, split: r.split, ...receipt })));
  const unknownUsageCalls = receipts.filter(r => !r.usageKnown).length;
  const unknownCostCalls = receipts.filter(r => !r.costKnown).length;
  const total = field => results.reduce((sum, r) => sum + (r[field] || 0), 0);
  const out = {
    gate: gate?.name ?? "off",
    source: results.find((r) => r.gate)?.gate.source ?? gate?.name ?? "off",
    checked: gateErrors(results, from, "checked"),
    blind: report(from),
    threshold: { from, to: from, status: "kept", reason: "the current threshold already has the fewest blind errors on train" },
    // Train tasks this harness passes: the next night's rehearsals start from these.
    passing: train.filter((r) => r.pass).map((r) => r.taskId),
    committed: null,
    accounting: {
      grader: { calls: receipts.length, tokens: receipts.reduce((n, r) => n + (r.tokens ?? 0), 0),
        cost: round(receipts.reduce((n, r) => n + (r.cost ?? 0), 0), 8),
        usageKnown: unknownUsageCalls === 0, costKnown: unknownCostCalls === 0, unknownUsageCalls, unknownCostCalls, receipts },
      gym: { model: model.name ?? "unspecified", tasks: results.length, modelCalls: total("modelCalls"), tokens: total("tokens"),
        estimatedCost: round(total("cost"), 8), costSource: "rem/models.js placeholder tier rates",
        tokenSource: model.name === "scripted" ? "character-based estimates" : "executor usage records" },
      allInCost: null,
    },
  };
  if (!gate) {
    out.skipped = "completion-disabled";
    out.threshold.reason = "Completion calibration is disabled because no completion evaluator is configured.";
    return out;
  }
  if (!out.checked.complete || !out.blind.train.complete || !out.blind.heldOut.complete) {
    out.skipped = "incomplete-grading";
    out.threshold.reason = "Threshold unchanged: every train and held-out task needs valid checked and blind probabilities.";
    return out;
  }
  if (best === from) return out;
  const before = out.blind,
    after = report(best);
  const accepted = after.train.errors < before.train.errors && after.heldOut.errors <= before.heldOut.errors;
  const edit = {
    type: "context.set",
    target: "completionThreshold",
    value: best,
    description: `Set the completion threshold ${from} → ${best}`,
  };
  const reason = accepted
    ? `blind errors on train ${before.train.errors} → ${after.train.errors}, held-out ${before.heldOut.errors} → ${after.heldOut.errors}`
    : `held-out blind errors would rise ${before.heldOut.errors} → ${after.heldOut.errors}`;
  // No outcome.train: the track record averages gym prediction errors, and this edit is judged on gate errors.
  const { insertedId } = await db.collection("edits").insertOne({
    night,
    name: "completionThreshold",
    ...edit,
    signature: editSignature(edit),
    rationale: `Grading the grader: ${before.train.falseAccepts} false accepts and ${before.train.falseRejects} false rejects on train at ${from}`,
    pattern: "gate-miscalibrated",
    outcome: { status: accepted ? "accepted" : "rejected", reason, calibration: { before, after } },
    baseVersion: current.version,
    createdAt: new Date(clock.now()),
    embedding: (await embedder.embed([edit.description]))[0],
  });
  out.threshold = { from, to: accepted ? best : from, proposed: best, status: accepted ? "accepted" : "rejected", reason, editId: insertedId };
  if (accepted) {
    out.committed = await commitHarness(db, {
      parent: current,
      genome: applyEdit(current.genome, edit),
      editIds: [insertedId],
      night,
      now: clock.now(),
    });
    await db.collection("edits").updateOne({ _id: insertedId }, { $set: { resultVersion: out.committed.version } });
    out.blind = after;
  }
  return out;
}

export function renderCalibration(c) {
  const b = c.blind;
  if (c.skipped) return [`Grading the grader (${c.source}): ${c.threshold.reason}`];
  const lines = [
    `Grading the grader (${c.source}): with checks, ${c.checked.tasks - c.checked.errors}/${c.checked.tasks} gate calls agree with the checkers; ` +
      `blind, train ${b.train.falseAccepts} false accepts and ${b.train.falseRejects} false rejects (Brier ${b.train.brier ?? "n/a"}), ` +
      `held-out ${b.heldOut.falseAccepts} and ${b.heldOut.falseRejects} (Brier ${b.heldOut.brier ?? "n/a"})`,
  ];
  if (c.threshold.status !== "kept")
    lines.push(
      `${c.threshold.status === "accepted" ? "Accepted" : "Rejected"}: completion threshold ${c.threshold.from} → ${c.threshold.proposed} (${c.threshold.reason})`,
    );
  return lines;
}
