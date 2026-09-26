import test from "node:test";
import assert from "node:assert/strict";
import { bestThreshold, calibrate, gateErrors, renderCalibration } from "../rem/calibrate.js";
import { applyEdit, commitHarness, completionThresholdOf, currentHarness } from "../rem/harness.js";
import { createRem } from "../rem/index.js";

const r = (taskId, pass, blind, split = "train") => ({ taskId, pass, split, gate: { source: "test", checked: pass ? 0.9 : 0.1, blind } });

test("gate errors count false accepts, false rejects and the Brier score against the checkers", () => {
  const results = [r("a", true, 0.9), r("b", false, 0.7), r("c", false, 0.2), r("d", true, 0.4)];
  const e = gateErrors(results, 0.5);
  assert.deepEqual([e.falseAccepts, e.falseRejects, e.errors], [1, 1, 2]);
  assert.deepEqual(e.falseAcceptIds, ["b"]);
  assert.equal(e.brier, 0.225);
  assert.equal(gateErrors(results, 0.5, "checked").errors, 0, "with the checks as evidence the gate agrees");
});

test("the best threshold has the fewest errors, then the fewest false accepts, then stays closest", () => {
  // At 0.5 the gate calls b done (false accept); at 0.8 it rejects nothing that passed.
  assert.equal(bestThreshold([r("a", true, 0.85), r("b", false, 0.65)], 0.5), 0.7);
  // No threshold separates identical scores: keep the current one.
  assert.equal(bestThreshold([r("a", true, 0.92), r("b", false, 0.92)], 0.5), 0.5);
});

test("invalid and missing probabilities are unavailable rather than successful grades", () => {
  const results = [r("nan", false, NaN), r("infinite", false, Infinity), r("high", false, 1.1),
    r("low", false, -0.1), r("missing", false, null), r("valid", true, 0.9)];
  const report = gateErrors(results, 0.8);
  assert.equal(report.tasks, 1); assert.equal(report.unavailable, 5); assert.equal(report.complete, false);
  assert.equal(report.brier, 0.01);
  assert.equal(bestThreshold(results, 0.95), 0.95);
});

// A gate that scores blind runs 0.85 when the checked run passed and 0.65 when it did not: separable, but not at 0.5.
function separableGate() {
  let lastPass = null;
  return {
    name: "separable",
    async check({ evidence }) {
      if (evidence) {
        lastPass = evidence.pass;
        return { p: evidence.pass ? 0.9 : 0.1, source: "separable" };
      }
      return { p: lastPass ? 0.85 : 0.65, source: "separable" };
    },
  };
}

test("calibrate adopts a stricter threshold when it cuts blind errors without hurting held-out, then keeps it", async () => {
  const rem = await createRem({});
  const before = await currentHarness(rem.ctx.db);
  assert.equal(completionThresholdOf(before.genome), 0.5);

  const first = await calibrate(rem.ctx, { night: 1, gate: separableGate() });
  assert.ok(first.checked.tasks > 0);
  assert.equal(first.threshold.status, "accepted");
  assert.equal(first.threshold.to, 0.7);
  assert.equal(first.blind.train.errors, 0);
  const after = await currentHarness(rem.ctx.db);
  assert.equal(after.version, before.version + 1);
  assert.equal(completionThresholdOf(after.genome), 0.7);
  const edit = await rem.ctx.db.collection("edits").findOne({ name: "completionThreshold" });
  assert.equal(edit.outcome.status, "accepted");
  assert.equal(edit.outcome.train, undefined, "kept out of the gym track record");

  const second = await calibrate(rem.ctx, { night: 2, gate: separableGate() });
  assert.equal(second.threshold.status, "kept");
  assert.equal((await currentHarness(rem.ctx.db)).version, after.version);
  await rem.close();
});

test("missing held-out grades cannot lower a threshold or create an accepted edit", async t => {
  const gate = separableGate(), check = gate.check;
  gate.check = async input => {
    const result = await check(input);
    return !input.evidence && input.cp.runId.startsWith("gym-H") ? { p: null, available: false, source: "outage-fixture" } : result;
  };
  const rem = await createRem({ completion: gate });
  try {
    assert.equal(rem.ctx.completion, gate);
    const parent = await currentHarness(rem.ctx.db);
    await commitHarness(rem.ctx.db, { parent, genome: applyEdit(parent.genome,
      { type: "context.set", target: "completionThreshold", value: 0.9 }), now: Date.now() });
    const before = await currentHarness(rem.ctx.db);
    const report = await calibrate(rem.ctx, { night: 1 });
    assert.equal(report.skipped, "incomplete-grading");
    assert.equal(report.blind.heldOut.tasks, 0); assert.equal(report.blind.heldOut.unavailable, 5);
    assert.equal(report.threshold.to, 0.9); assert.equal(report.committed, null);
    assert.equal((await currentHarness(rem.ctx.db)).version, before.version);
    assert.equal(await rem.ctx.db.collection("edits").countDocuments(), 0);
    assert.match(renderCalibration(report).join(" "), /Threshold unchanged/);
    t.diagnostic(JSON.stringify({ fixture: "held-out-outage", from: 0.9, to: report.threshold.to,
      trainGrades: report.blind.train.tasks, heldOutGrades: report.blind.heldOut.tasks, status: report.skipped }));
  } finally { await rem.close(); }
});

test("all grader attempts keep usage receipts even when scores are invalid, unavailable or thrown", async t => {
  let calls = 0;
  const gate = { name: "receipt-fixture", async check({ evidence }) {
    const call = ++calls;
    if (call === 3) throw Error("fixture outage");
    return { source: "receipt-fixture", p: call === 1 ? NaN : evidence?.pass === false ? 0.1 : 0.9,
      ...(call === 4 ? { available: false } : {}), tokens: 10, usageKnown: call !== 5,
      cost: call === 2 ? null : 0.01, costKnown: call !== 2 };
  } };
  const rem = await createRem({ completion: gate });
  try {
    const before = await currentHarness(rem.ctx.db);
    const report = await calibrate(rem.ctx, { night: 1 });
    const usage = report.accounting.grader;
    assert.equal(calls, 28); assert.equal(usage.receipts.length, 28);
    assert.equal(usage.tokens, 270); assert.equal(usage.cost, 0.26);
    assert.equal(usage.unknownUsageCalls, 2); assert.equal(usage.unknownCostCalls, 2);
    assert.equal(usage.usageKnown, false); assert.equal(usage.costKnown, false);
    assert.equal(usage.receipts[0].validScore, false); assert.equal(usage.receipts[0].tokens, 10);
    assert.equal(usage.receipts[1].cost, null); assert.equal(usage.receipts[2].tokens, null);
    assert.equal(usage.receipts[3].available, false); assert.equal(usage.receipts[3].cost, 0.01);
    assert.equal(report.skipped, "incomplete-grading"); assert.equal(report.committed, null);
    assert.equal((await currentHarness(rem.ctx.db)).version, before.version);
    assert.equal(await rem.ctx.db.collection("edits").countDocuments(), 0);
    assert.equal(report.accounting.gym.tasks, 14); assert.ok(report.accounting.gym.modelCalls > 0);
    assert.ok(report.accounting.gym.estimatedCost > 0); assert.match(report.accounting.gym.costSource, /placeholder/);
    assert.equal(report.accounting.allInCost, null);
    t.diagnostic(JSON.stringify({ fixture: "grader-receipts", calls, knownTokenSubtotal: usage.tokens,
      knownCostSubtotal: usage.cost, unknownUsageCalls: usage.unknownUsageCalls, unknownCostCalls: usage.unknownCostCalls,
      gym: report.accounting.gym, allInCost: report.accounting.allInCost }));
  } finally { await rem.close(); }
});

test("an explicit disabled gate starts no calibration work and is not silently replaced", async () => {
  const rem = await createRem({ completion: null });
  try {
    assert.equal(rem.ctx.completion, null);
    const before = await currentHarness(rem.ctx.db);
    const report = await calibrate({ ...rem.ctx, model: { name: "must-not-run", chat: async () => { throw Error("Unexpected model call"); } } }, { night: 1 });
    assert.equal(report.gate, "off"); assert.equal(report.skipped, "completion-disabled");
    assert.equal(report.accounting.grader.calls, 0); assert.equal(report.accounting.gym.tasks, 0);
    assert.equal((await currentHarness(rem.ctx.db)).version, before.version);
    assert.equal(await rem.ctx.db.collection("edits").countDocuments(), 0);
  } finally { await rem.close(); }
});
