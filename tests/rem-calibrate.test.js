import test from "node:test";
import assert from "node:assert/strict";
import { bestThreshold, calibrate, gateErrors } from "../rem/calibrate.js";
import { completionThresholdOf, currentHarness } from "../rem/harness.js";
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
});
