// Asks: permission requests queued at night for new authority. Decisions are stored and shape
// future asks (risk tolerance): after one read-only approval, read-only never asks again; sends
// always ask.
import { TASK_KINDS } from "./tasks.js";
import { setConnection } from "./agent.js";
import { applyEdit, commitHarness, currentHarness } from "./harness.js";

const SCOPE_NOTE = {
  send: "needs Gmail send scope",
  delete: "needs Drive delete scope",
  draft: "needs Gmail draft scope",
  read: "read-only",
};
const AUTO_APPROVABLE = new Set(["read"]);

// proposed → practiced (night) → approved → autonomous (a morning decision, human or risk tolerance).
const promote = (by, at) => ({
  $set: { status: "autonomous", approvedAt: at, approvedBy: by },
  $push: { statusHistory: { $each: [{ status: "approved", by, at }, { status: "autonomous", by, at }] } },
});

export function riskOf(scopes = []) {
  if (scopes.includes("gmail.send")) return "send";
  if (scopes.includes("drive.delete")) return "delete";
  if (scopes.includes("gmail.draft")) return "draft";
  return "read";
}

export async function riskProfile(db) {
  const rows = await db
    .collection("asks")
    .aggregate([
      { $match: { decision: { $in: ["approved", "denied"] }, risk: { $in: Object.keys(SCOPE_NOTE) }, auto: { $ne: true } } },
      {
        $group: {
          _id: "$risk",
          approved: { $sum: { $cond: [{ $eq: ["$decision", "approved"] }, 1, 0] } },
          denied: { $sum: { $cond: [{ $eq: ["$decision", "denied"] }, 1, 0] } },
        },
      },
    ])
    .toArray();
  return Object.fromEntries(rows.map((r) => [r._id, { approved: r.approved, denied: r.denied }]));
}

export async function queueAsks({ db, clock }, { night }) {
  const asks = db.collection("asks"),
    skills = db.collection("skills");
  const profile = await riskProfile(db);
  const out = [];
  for (const skill of await skills.find({ status: "practiced" }, { sort: { name: 1 } }).toArray()) {
    const dedupeKey = `skill:${skill.name}`;
    if (await asks.findOne({ dedupeKey })) continue;
    const risk = riskOf(skill.requiredScopes);
    const text = `${TASK_KINDS[skill.name]?.ask || `Want me to run ${skill.name} myself?`} (${SCOPE_NOTE[risk]})`;
    const base = {
      dedupeKey,
      kind: "skill.autonomous",
      skill: skill.name,
      risk,
      scopes: skill.requiredScopes,
      text,
      night,
      createdAt: new Date(clock.now()),
    };
    const p = profile[risk];
    if (AUTO_APPROVABLE.has(risk) && p?.approved > 0 && !p.denied) {
      await asks.insertOne({
        ...base,
        status: "auto-approved",
        decision: "approved",
        auto: true,
        reason: `${risk}-only; you approved ${risk}-only access before`,
        decidedAt: new Date(clock.now()),
      });
      await skills.updateOne({ name: skill.name }, promote("risk tolerance", new Date(clock.now())));
      out.push({ ...base, status: "auto-approved" });
    } else {
      await asks.insertOne({ ...base, status: "open" });
      out.push({ ...base, status: "open" });
    }
  }
  return out;
}

export async function decide(ctx, askId, decision, { answer } = {}) {
  const { db, clock } = ctx;
  const asks = db.collection("asks");
  const ask = await asks.findOne({ _id: askId });
  if (!ask) throw new Error("Ask not found.");
  if (!["open", "resolved"].includes(ask.status)) return ask;
  const approved = decision === "approve" || decision === "approved";
  const now = new Date(clock.now());
  if (ask.kind === "skill.autonomous")
    await db
      .collection("skills")
      .updateOne({ name: ask.skill }, approved ? promote("human", now) : { $set: { declinedAt: now } });
  if (ask.kind === "reconnect" && approved) await setConnection(db, ask.provider, "valid", clock.now());
  if (ask.kind === "verify")
    await db
      .collection("checkpoints")
      .updateOne(
        { runId: ask.runId, status: "unverified" },
        { $set: { status: approved ? "done" : "failed", verifiedBy: "owner", verifiedAt: now, updatedAt: now } },
      );
  if (ask.kind === "edit.authority") {
    const edit = await db.collection("edits").findOne({ _id: ask.editId });
    let resultVersion = null;
    if (approved) {
      const parent = await currentHarness(db);
      const next = await commitHarness(db, {
        parent,
        genome: applyEdit(parent.genome, edit),
        editIds: [edit._id],
        night: edit.night,
        now: clock.now(),
      });
      resultVersion = next.version;
    }
    await db
      .collection("edits")
      .updateOne({ _id: edit._id }, { $set: { "outcome.status": approved ? "approved" : "denied", resultVersion } });
  }
  if (ask.kind === "owner" && answer) {
    const summary = `Owner of "${ask.item}" is ${answer}`;
    await db.collection("episodes").insertOne({
      kind: "correction",
      runId: ask.runId,
      summary,
      facts: [{ kind: "owner", subject: `owner: ${ask.item}`, value: answer, text: `Owner of "${ask.item}": ${answer}` }],
      importance: 0.9,
      ts: now,
      consolidated: false,
      expireAt: null,
      embedding: (await ctx.embedder.embed([summary]))[0],
    });
  }
  await asks.updateOne(
    { _id: askId },
    { $set: { status: approved ? "approved" : "denied", decision: approved ? "approved" : "denied", answer: answer ?? null, decidedAt: now } },
  );
  return asks.findOne({ _id: askId });
}
