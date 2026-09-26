// Asks: permission requests queued at night for new authority. Decisions are stored and shape
// future asks (risk tolerance): after one read-only approval, read-only never asks again; sends
// always ask.
import { TASK_KINDS } from "./tasks.js";
import { setConnection } from "./agent.js";
import { decideAuthority } from "./authority.js";
import { TOOLS } from "./world.js";

const SCOPE_NOTE = {
  send: "needs Gmail send scope",
  delete: "needs Drive delete scope",
  draft: "needs Gmail draft scope",
  read: "read-only",
  unknown: "requires permission review for unsupported tools",
};
const AUTO_APPROVABLE = new Set(["read"]);

// proposed → practiced (night) → approved → autonomous (a morning decision, human or risk tolerance).
const promote = (by, at) => ({
  $set: { status: "autonomous", approvedAt: at, approvedBy: by },
  $push: { statusHistory: { $each: [{ status: "approved", by, at }, { status: "autonomous", by, at }] } },
});

export function riskOf(scopes) {
  if (!Array.isArray(scopes) || scopes.some(scope => typeof scope !== "string" || !Object.hasOwn(TOOLS, scope))) return "unknown";
  if (scopes.includes("gmail.send")) return "send";
  if (scopes.includes("drive.delete")) return "delete";
  if (scopes.includes("gmail.draft")) return "draft";
  return "read";
}

async function decideSkill({ db, clock }, askId, approved) {
  return db.withTransaction(async session => {
    const asks = db.collection("asks"), skills = db.collection("skills");
    const ask = await asks.findOne({ _id: askId }, { session });
    if (!ask || !["open", "resolved"].includes(ask.status)) return ask;
    const skill = await skills.findOne({ name: ask.skill }, { session });
    const eligible = skill?.status === "practiced" && skill.test?.lastResult?.pass === true && riskOf(skill.requiredScopes) !== "unknown"
      && Array.isArray(ask.scopes) && JSON.stringify([...ask.scopes].sort()) === JSON.stringify([...skill.requiredScopes].sort());
    const status = !approved ? "denied" : eligible ? "approved" : "rejected";
    const at = new Date(clock.now());
    const validation = approved ? { passed: eligible,
      reason: eligible ? "Practiced skill has a passing test and the requested tool scopes." : "Skill requires a passing practice test and unchanged, supported requested scopes before promotion." } : null;
    // Claim the decision before promotion. A competing approval or denial must see
    // the committed winner after Mongo retries its conflicting transaction.
    const claimed = await asks.updateOne({ _id: askId, status: ask.status }, { $set: {
      status, decision: approved ? "approved" : "denied", validation, decidedAt: at,
    } }, { session });
    if (!claimed.matchedCount) return asks.findOne({ _id: askId }, { session });
    if (status === "approved") await skills.updateOne({ name: ask.skill }, promote("human", at), { session });
    else if (!approved && skill) await skills.updateOne({ name: ask.skill }, { $set: { declinedAt: at } }, { session });
    return asks.findOne({ _id: askId }, { session });
  });
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
    if (AUTO_APPROVABLE.has(risk) && skill.test?.lastResult?.pass === true && p?.approved > 0 && !p.denied) {
      await db.withTransaction(async session => {
        const current = await skills.findOne({ name: skill.name }, { session });
        if (current?.status !== "practiced" || current.test?.lastResult?.pass !== true || riskOf(current.requiredScopes) !== "read")
          throw new Error("Skill changed before automatic approval; review it again.");
        await asks.insertOne({
          ...base,
          status: "auto-approved",
          decision: "approved",
          auto: true,
          reason: `${risk}-only; you approved ${risk}-only access before`,
          decidedAt: new Date(clock.now()),
        }, { session });
        await skills.updateOne({ name: skill.name }, promote("risk tolerance", new Date(clock.now())), { session });
      });
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
  if (ask.kind === "skill.autonomous") return decideSkill(ctx, askId, approved);
  if (ask.kind === "reconnect" && approved) await setConnection(db, ask.provider, "valid", clock.now());
  if (ask.kind === "edit.authority") return decideAuthority(ctx, ask, approved);
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
