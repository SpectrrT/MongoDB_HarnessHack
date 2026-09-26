// Calibrate: grading the grader. The completion gate decides when a run may call itself done; the gym's checkers
// know whether it really was. Each night the current harness runs the gym once, the gate scores every finished run
// (with the checks as evidence, and blind, the way it must judge tasks that have no checker), and the scores are
// compared with the checkers: false accepts, false rejects, Brier score. Then the harness tunes its own threshold:
// the value in COMPLETION_BOUNDS with the fewest blind errors on train is adopted only if held-out errors do not
// rise. The gym and checkers stay read-only; only the genome's completionThreshold moves.
import { COMPLETION_BOUNDS, applyEdit, commitHarness, completionThresholdOf, currentHarness, editSignature } from "./harness.js";
import { createCompletionGate } from "./completion.js";
import { gymSkills } from "./evolve.js";
import { runGym } from "./gym.js";
import { round } from "./util.js";

export const THRESHOLDS = Object.freeze([0.5, 0.6, 0.7, 0.8, 0.9, 0.95].filter((t) => t >= COMPLETION_BOUNDS.min && t <= COMPLETION_BOUNDS.max));

// How often the gate's call at `threshold` disagrees with the checker, on runs scored with `key` ("blind" or "checked").
export function gateErrors(results, threshold, key = "blind") {
  const graded = results.filter((r) => r.gate && typeof r.gate[key] === "number");
  const falseAccepts = graded.filter((r) => !r.pass && r.gate[key] >= threshold).map((r) => r.taskId);
  const falseRejects = graded.filter((r) => r.pass && r.gate[key] < threshold).map((r) => r.taskId);
  const brier = graded.length ? graded.reduce((a, r) => a + (r.gate[key] - (r.pass ? 1 : 0)) ** 2, 0) / graded.length : null;
  return {
    tasks: graded.length,
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
  const score = (t) => gateErrors(results, t);
  const acceptsSome = (t) => results.some((r) => r.gate && typeof r.gate.blind === "number" && r.gate.blind >= t);
  const pool = THRESHOLDS.filter(acceptsSome);
  return [...(pool.length ? pool : THRESHOLDS)].sort((a, b) => {
    const x = score(a),
      y = score(b);
    return x.errors - y.errors || x.falseAccepts - y.falseAccepts || Math.abs(a - current) - Math.abs(b - current);
  })[0];
}

export async function calibrate(ctx, { night, gate = ctx.completion ?? createCompletionGate() }) {
  const { db, model, embedder, clock } = ctx;
  const current = await currentHarness(db);
  const results = (await runGym(current.genome, { model, embedder, skills: await gymSkills(db), grade: gate })).results;
  const train = results.filter((r) => r.split === "train"),
    heldOut = results.filter((r) => r.split === "heldOut");
  const from = completionThresholdOf(current.genome);
  const best = bestThreshold(train, from);
  const report = (t) => ({ train: gateErrors(train, t), heldOut: gateErrors(heldOut, t) });
  const out = {
    gate: gate.name,
    source: results.find((r) => r.gate)?.gate.source ?? gate.name,
    checked: gateErrors(results, from, "checked"),
    blind: report(from),
    threshold: { from, to: from, status: "kept", reason: "the current threshold already has the fewest blind errors on train" },
    // Train tasks this harness passes: the next night's rehearsals start from these.
    passing: train.filter((r) => r.pass).map((r) => r.taskId),
    committed: null,
  };
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
