// Effects ledger: every external side effect is claimed under a unique effect key BEFORE it runs.
import { canonicalJson, createRng, sha256 } from "./util.js";
import { traceable } from "./trace.js";

export function effectKeyFor(runId, step, call) {
  const argsHash = sha256(canonicalJson({ tool: call.name, args: call.args ?? {} }));
  return sha256(`${runId}:${step}:${argsHash}`);
}

export async function claimEffect(db, { effectKey, runId, step, call, now }) {
  const effects = db.collection("effects");
  try {
    await effects.insertOne({
      effectKey,
      runId,
      step,
      tool: call.name,
      args: call.args ?? {},
      status: "pending",
      attempts: 1,
      createdAt: new Date(now),
    });
    return { state: "claimed" };
  } catch (error) {
    if (error.code !== 11000) throw error;
    await effects.updateOne({ effectKey }, { $inc: { attempts: 1 } });
    const existing = await effects.findOne({ effectKey });
    return { state: existing.status, existing };
  }
}

// Runs inside the same transaction as the checkpoint update (see agent.js).
export function commitEffect(db, { effectKey, result, outcome, now }, session) {
  return db.collection("effects").updateOne(
    { effectKey },
    { $set: { status: "committed", result, outcome, committedAt: new Date(now) } },
    { session },
  );
}

// committed → skip and return the recorded result (exactly-once);
// pending → reconcile against the world (effect key header) and commit without re-executing.
async function runEffectImpl({ db, world, runId, step, call, now, chaos }) {
  const effectKey = effectKeyFor(runId, step, call);
  const claim = await claimEffect(db, { effectKey, runId, step, call, now });
  if (claim.state === "committed")
    return { effectKey, result: claim.existing.result, outcome: "replayed" };
  if (claim.state !== "claimed") {
    const found = world.findEffect(effectKey);
    if (found) return { effectKey, result: found.result, outcome: "reconciled" };
  }
  await chaos?.point("before-effect");
  const result = await world.execute(call.name, call.args ?? {}, { effectKey, runId });
  await chaos?.point("after-effect");
  return { effectKey, result, outcome: "executed" };
}
// Child run: claim-before-execute and the effects ledger commit for one effect (tool, effect key,
// status). The claim happens before the tool runs; the outcome (executed / replayed / reconciled)
// is exactly-once.
export const runEffect = traceable(runEffectImpl, {
  name: "effect",
  run_type: "tool",
  processInputs: ({ runId, step, call }) => ({ runId, step, tool: call.name, args: call.args }),
});

export class CrashError extends Error {
  constructor(point) {
    super(`simulated crash at ${point}`);
    this.name = "CrashError";
    this.point = point;
  }
}

// Seeded fault injection for the durability tests and simulated days.
export function createChaos({
  seed = 1,
  crashRate = 0,
  authRate = 0,
  points = ["before-effect", "after-effect", "after-commit"],
  once = null,
} = {}) {
  const rng = createRng(seed);
  const stats = { crashes: {}, authExpiries: 0 };
  let pendingOnce = once;
  return {
    stats,
    async point(name) {
      const scheduled = pendingOnce === name;
      if (scheduled || (points.includes(name) && rng.chance(crashRate))) {
        if (scheduled) pendingOnce = null;
        stats.crashes[name] = (stats.crashes[name] || 0) + 1;
        throw new CrashError(name);
      }
    },
    expireNow() {
      if (!rng.chance(authRate)) return false;
      stats.authExpiries++;
      return true;
    },
  };
}
