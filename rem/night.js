// The night: Replay → Merge → Distill → Evolve, then queue asks and write the morning brief.
import { createMemoryDb, ensureIndexes } from "./db/index.js";
import { createAgent, seedConnections } from "./agent.js";
import { cosine } from "./embed.js";
import { calibrate, renderCalibration } from "./calibrate.js";
import { evolve } from "./evolve.js";
import { NOISE_THRESHOLD, factsOf } from "./facts.js";
import { BUILTIN_TOOLS, currentHarness, renderDiff } from "./harness.js";
import { queueAsks } from "./asks.js";
import { TASK_KINDS, checkRun, describeTask, taskParams } from "./tasks.js";
import { annotate, genomeSummary, traceable } from "./trace.js";
import { createWorld, isInternal } from "./world.js";
import { DAY_MS, canonicalJson, createClock, round, sum, weekLabel, weekNumber } from "./util.js";

export const RETENTION_MS = 2 * DAY_MS;
const SAME_FACT = 0.9;

export async function replay({ db }, { day }) {
  const episodes = await db.collection("episodes").find({ consolidated: false }, { sort: { ts: 1 } }).toArray();
  const runs = await db.collection("checkpoints").find({ day }, { sort: { createdAt: 1 } }).toArray();
  const byKind = {};
  for (const e of episodes) byKind[e.kind] = (byKind[e.kind] || 0) + 1;
  const reviewed = runs.filter((r) => r.verdict);
  return {
    day,
    episodes: episodes.length,
    byKind,
    runs: runs.map((r) => ({
      runId: r.runId,
      kind: r.kind,
      status: r.status,
      pass: r.verdict?.pass ?? null,
      collateral: r.verdict?.collateral ?? [],
      steps: r.turns,
      cost: r.usage.cost,
      interventions: r.interventions,
    })),
    passRate: reviewed.length ? reviewed.filter((r) => r.verdict.pass).length / reviewed.length : 0,
    collateral: sum(reviewed, (r) => r.verdict.collateral.length),
    steps: sum(runs, (r) => r.turns),
    cost: round(sum(runs, (r) => r.usage.cost), 4),
    interventions: sum(runs, (r) => r.interventions),
  };
}

const rank = (e) => [weekNumber(e.week || "W0") || 0, e.importance ?? 0, e.ts ? new Date(e.ts).getTime() : 0];
const newer = (a, b) => {
  const ra = rank(a),
    rb = rank(b);
  for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return ra[i] > rb[i];
  return true;
};

export async function merge({ db, embedder, clock }, { night }) {
  const episodes = db.collection("episodes"),
    memories = db.collection("memories");
  const now = new Date(clock.now());
  const raw = await episodes
    .find({ consolidated: false, kind: { $in: ["observation", "correction", "demonstration"] } }, { sort: { ts: 1 } })
    .toArray();
  const memoriesBefore = await memories.countDocuments({ active: true });
  const facts = [],
    noise = [],
    referenced = new Set();
  for (const e of raw) {
    const found = factsOf(e);
    if (!found.length) {
      if ((e.importance ?? 0) < NOISE_THRESHOLD) noise.push(e._id);
      continue;
    }
    for (const f of found) facts.push({ ...f, episodeId: String(e._id), ts: e.ts });
    referenced.add(e._id);
  }
  const clusters = (await memories.find({ kind: { $ne: "digest" } }).toArray()).map((m) => ({
    memory: m,
    vector: m.identityEmbedding,
    facts: [],
  }));
  const vectors = await embedder.embed(facts.map((f) => f.subject));
  facts.forEach((f, i) => {
    let best = null,
      score = 0;
    for (const c of clusters) {
      const s = cosine(vectors[i], c.vector);
      if (s > score) [best, score] = [c, s];
    }
    if (best && score >= SAME_FACT) best.facts.push(f);
    else clusters.push({ memory: null, vector: vectors[i], facts: [f] });
  });

  let created = 0,
    folded = 0,
    contradictions = 0,
    retired = 0;
  for (const c of clusters) {
    if (!c.facts.length) continue;
    const m = c.memory;
    const entries = [
      ...(m ? [{ value: m.value, week: m.week, owner: m.owner, text: m.text, importance: m.importance, ts: m.recency, kind: m.kind }] : []),
      ...c.facts,
    ];
    const winner = entries.reduce((w, e) => (newer(e, w) ? e : w));
    const links = [...(m?.contradictions || [])];
    for (const e of entries) {
      if (canonicalJson(e.value) === canonicalJson(winner.value)) continue;
      if (links.some((l) => canonicalJson(l.value) === canonicalJson(e.value))) continue;
      links.push({ value: e.value, week: e.week ?? null, text: e.text, resolvedBy: "recency" });
      contradictions++;
    }
    const provenance = [...new Set([...(m?.provenance || []), ...c.facts.map((f) => f.episodeId)])];
    const kind = m?.kind || c.facts[0].kind;
    const learned = ["preference", "team", "owner"].includes(kind);
    const doc = {
      subject: m?.subject || c.facts[0].subject,
      kind,
      text: winner.text,
      value: winner.value,
      owner: winner.owner ?? null,
      week: winner.week ?? m?.week ?? null,
      importance: Math.max(...entries.map((e) => e.importance ?? 0)),
      confidence: round(Math.min(0.99, (learned ? 0.8 : 0.5) + 0.1 * Math.min(provenance.length, 4)), 2),
      recency: new Date(Math.max(...entries.map((e) => new Date(e.ts || 0).getTime()))),
      provenance,
      sources: provenance.length,
      contradictions: links,
      active: !(kind === "blocker" && winner.value === "resolved"),
      night,
      updatedAt: now,
    };
    if (!doc.active && m?.active !== false) {
      doc.retiredAt = now;
      doc.retiredReason = `resolved as of ${winner.week}`;
      retired++;
    }
    doc.embedding = (await embedder.embed([doc.text]))[0];
    if (m) {
      await memories.updateOne({ _id: m._id }, { $set: doc });
      folded += c.facts.length;
    } else {
      await memories.insertOne({ ...doc, identityEmbedding: c.vector, createdAt: now });
      created++;
      folded += c.facts.length - 1;
    }
  }

  // One digest memory: the open blockers as of the latest week we have evidence for.
  const blockers = await memories.find({ kind: "blocker" }).toArray();
  if (blockers.length) {
    const asOf = weekLabel(Math.max(...blockers.map((b) => weekNumber(b.week || "W0"))));
    const open = blockers.filter((b) => b.active).sort((a, b) => a.subject.localeCompare(b.subject));
    const text = `Open blockers as of ${asOf}: ${
      open.length ? open.map((b) => `${b.subject.replace(/^blocker: /, "")} (owner: ${b.owner || "none"})`).join("; ") : "none"
    }`;
    const digest = await memories.findOne({ kind: "digest", active: true });
    if (digest?.text !== text) {
      const doc = {
        subject: "digest: open blockers",
        kind: "digest",
        text,
        value: open.map((b) => b.subject),
        week: asOf,
        importance: 0.9,
        confidence: 0.9,
        recency: now,
        provenance: open.map((b) => String(b._id)),
        sources: open.length,
        contradictions: [],
        active: true,
        night,
        createdAt: now,
        updatedAt: now,
        embedding: (await embedder.embed([text]))[0],
      };
      const { insertedId } = await memories.insertOne(doc);
      if (digest)
        await memories.updateOne(
          { _id: digest._id },
          { $set: { active: false, retiredAt: now, retiredReason: `superseded by the ${asOf} digest`, supersededBy: insertedId } },
        );
    }
  }

  if (noise.length) await episodes.deleteMany({ _id: { $in: noise } });
  const expireAt = new Date(clock.now() + RETENTION_MS);
  await episodes.updateMany(
    { _id: { $in: [...referenced] } },
    { $set: { consolidated: true, consolidatedAt: now, expireAt } },
  );
  return {
    episodesIn: raw.length,
    facts: facts.length,
    memoriesBefore,
    memoriesAfter: await memories.countDocuments({ active: true }),
    created,
    folded,
    contradictionsResolved: contradictions,
    retired,
    noiseDropped: noise.length,
    expiring: referenced.size,
  };
}

function lcs(a, b) {
  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out = [];
  for (let i = 0, j = 0; i < a.length && j < b.length; )
    if (a[i] === b[j]) {
      out.push(a[i]);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  return out;
}

function align(skeleton, steps) {
  const out = [];
  let j = 0;
  for (const tool of skeleton) {
    while (j < steps.length && steps[j].tool !== tool) j++;
    out.push(steps[j]?.args ?? {});
    j++;
  }
  return out;
}

const show = (v) => (Array.isArray(v) ? v.join(",") : typeof v === "object" && v ? JSON.stringify(v) : String(v));

function templateStep(tool, argsList, seqs) {
  const keys = [...new Set(argsList.flatMap((a) => Object.keys(a)))].sort();
  const parts = keys.map((k) => {
    const values = argsList.map((a) => a[k]);
    const week = (i) => seqs[i].week,
      prev = (i) => weekLabel(weekNumber(seqs[i].week) - 1);
    if (values.every((v) => canonicalJson(v) === canonicalJson(values[0]))) return `${k}=${show(values[0])}`;
    if (values.every((v, i) => v === week(i))) return `${k}={{week}}`;
    if (values.every((v, i) => v === prev(i))) return `${k}={{prevWeek}}`;
    if (k === "id") return "id={{each listed file}}";
    if (k === "to") return "to={{team}}";
    const templated = values.map((v, i) => (typeof v === "string" ? v.replaceAll(week(i), "{{week}}") : null));
    if (templated[0] && templated.every((t) => t === templated[0])) return `${k}="${templated[0]}"`;
    return `${k}={{${k}}}`;
  });
  return `${tool} ${parts.join(" ")}`.trim();
}

export function synthesizeSkill(kind, sequences, memories, night) {
  const ordered = [...sequences].sort((a, b) => (b.source === "demonstration") - (a.source === "demonstration"));
  let skeleton = ordered[0].steps.map((s) => s.tool);
  for (const s of ordered.slice(1)) skeleton = lcs(skeleton, s.steps.map((x) => x.tool));
  const aligned = ordered.map((s) => align(skeleton, s.steps));
  const steps = skeleton.map((tool, i) => templateStep(tool, aligned.map((a) => a[i]), ordered));
  const parameters = {};
  if (skeleton.includes("gmail.send")) {
    const demo = ordered.find((s) => s.source === "demonstration")?.steps.find((s) => s.tool === "gmail.send");
    const team = memories.find((m) => m.kind === "team")?.value;
    const last = ordered.at(-1).steps.findLast((s) => s.tool === "gmail.send")?.args.to || [];
    parameters.team = demo?.args.to || team || last.filter(isInternal);
  }
  const def = TASK_KINDS[kind];
  const latest = ordered
    .filter((s) => s.source === "run")
    .map((s) => s.week)
    .sort()
    .at(-1);
  return {
    name: kind,
    title: def.title,
    trigger: def.trigger,
    description: `${def.title}: ${steps.join(" → ")}`,
    steps,
    parameters,
    constraints: memories.filter((m) => m.kind === "preference").map((m) => m.text),
    requiredScopes: [...new Set(skeleton)],
    test: { fixture: `sandbox copy of the workspace, ${latest}`, kind, week: latest, expected: "checker end state, no collateral" },
    sources: ordered.map((s) => ({ key: s.key, source: s.source, week: s.week })),
    night,
  };
}

// Practice: run the task with the skill in a sandbox copy of the user's world, check the end state.
export async function practice({ model, embedder, clock, workspace }, skill, genome) {
  const db = createMemoryDb({ name: "sandbox" });
  await ensureIndexes(db, { search: false });
  const sandboxClock = createClock(clock.now());
  await seedConnections(db, { now: sandboxClock.now() });
  await db.collection("skills").insertOne({ ...skill, status: "approved", embedding: (await embedder.embed([skill.description]))[0] });
  const world = createWorld(workspace);
  const agent = createAgent({
    db,
    world,
    model,
    embedder,
    clock: sandboxClock,
    harness: async () => ({ version: "practice", genome }),
    episodes: false,
    runPrefix: "practice",
  });
  const t = describeTask(skill.name, taskParams(skill.name, skill.test.week));
  const run = await agent.startRun({ ...t, week: skill.test.week });
  const verdict = checkRun({ kind: skill.name, params: t.params, truth: workspace.truth, world, run });
  const usedSkill = run.context?.skill?.name === skill.name;
  return {
    pass: verdict.pass && usedSkill,
    usedSkill,
    failures: verdict.failures,
    collateral: verdict.collateral,
    steps: run.turns,
    cost: round(run.usage.cost, 4),
  };
}

export async function distill(ctx, { night }) {
  const { db, embedder, clock } = ctx;
  const skills = db.collection("skills");
  const genome = (await currentHarness(db)).genome;
  const eps = await db
    .collection("episodes")
    .find({ kind: { $in: ["tool_call", "demonstration"] }, tool: { $exists: true } }, { sort: { ts: 1 } })
    .toArray();
  const sequences = new Map();
  for (const e of eps) {
    if (BUILTIN_TOOLS.includes(e.tool) || !e.taskKind) continue;
    const key = e.demoId || e.runId;
    if (!sequences.has(key))
      sequences.set(key, { key, kind: e.taskKind, week: e.week, source: e.demoId ? "demonstration" : "run", steps: [] });
    sequences.get(key).steps.push({ tool: e.tool, args: e.args || {} });
  }
  const byKind = new Map();
  for (const s of sequences.values()) byKind.set(s.kind, [...(byKind.get(s.kind) || []), s]);
  const memories = await db.collection("memories").find({ active: true, kind: { $in: ["preference", "team"] } }).toArray();
  const out = [];
  for (const [kind, list] of [...byKind].sort(([a], [b]) => a.localeCompare(b))) {
    if (!TASK_KINDS[kind] || list.length < 2 || !list.some((s) => s.source === "run")) continue;
    const existing = await skills.findOne({ name: kind });
    if (existing && existing.status !== "proposed") continue;
    const skill = synthesizeSkill(kind, list, memories, night);
    const result = await practice(ctx, skill, genome);
    const status = result.pass ? "practiced" : "proposed";
    const doc = {
      ...skill,
      status,
      statusHistory: [
        ...(existing?.statusHistory || [{ status: "proposed", night, at: new Date(clock.now()) }]),
        ...(status === "practiced" ? [{ status, night, at: new Date(clock.now()) }] : []),
      ],
      test: { ...skill.test, lastResult: result },
      stats: {
        practiceRuns: (existing?.stats?.practiceRuns || 0) + 1,
        practicePasses: (existing?.stats?.practicePasses || 0) + (result.pass ? 1 : 0),
        evidence: list.length,
      },
      distilledAt: new Date(clock.now()),
      embedding: (await embedder.embed([skill.description]))[0],
    };
    await skills.replaceOne({ name: kind }, doc, { upsert: true });
    out.push({ name: kind, status: doc.status, evidence: list.length, steps: skill.steps, requiredScopes: skill.requiredScopes, test: result });
  }
  return { sequences: sequences.size, skills: out };
}

export function renderBrief(b) {
  const lines = [`Morning brief · night ${b.night} · harness v${b.harness.from} → v${b.harness.to}`];
  const r = b.replay,
    m = b.merge;
  lines.push(`Replay: ${r.episodes} episodes from ${r.runs.length} runs; pass rate ${Math.round(r.passRate * 100)}%, collateral ${r.collateral}, interventions ${r.interventions}`);
  lines.push(
    `Merge: ${m.episodesIn} episodes → ${m.facts} facts → ${m.memoriesAfter} active memories (${m.created} new, ${m.folded} folded in); ` +
      `${m.contradictionsResolved} contradictions resolved, ${m.retired} retired, ${m.noiseDropped} noise dropped, ${m.expiring} set to expire (TTL)`,
  );
  for (const s of b.distill.skills)
    lines.push(`Distill: skill ${s.name} ${s.status} — test ${s.test.pass ? "passed" : "failed"} (${s.evidence} traces, ${s.test.steps} steps in the sandbox)`);
  if (!b.distill.skills.length) lines.push("Distill: no new repeated work");
  for (const p of b.evolve.patterns.slice(0, 6)) lines.push(`Weakness: ${p.title} (${p.tasks.join(", ")})`);
  for (const s of b.evolve.skipped) lines.push(`Skipped: ${s.description} — ${s.reason}`);
  for (const e of b.evolve.edits) {
    const p = e.prediction,
      o = e.outcome.train;
    if (!o) {
      lines.push(`Queued as an ask: ${e.description} — ${e.outcome.reason}`);
      continue;
    }
    lines.push(
      `${e.outcome.status === "accepted" ? "Accepted" : "Rejected"}: ${e.description} — predicted ${fmtDelta(p)}; observed ${fmtDelta(o)}` +
        (e.outcome.status === "rejected" ? ` — ${e.outcome.reason}${e.heldOutRegressedTitles?.length ? `: ${e.heldOutRegressedTitles.join(", ")}` : ""}` : ""),
    );
  }
  if (b.harness.diffText.length) lines.push(`Commit v${b.harness.to}:`, ...b.harness.diffText.map((d) => `  ${d}`));
  const f = b.evolve;
  lines.push(
    `Gym: train ${f.baseline.train.passed}/${f.baseline.train.tasks} → ${f.fitness.train.passed}/${f.fitness.train.tasks}, ` +
      `held-out ${f.baseline.heldOut.passed}/${f.baseline.heldOut.tasks} → ${f.fitness.heldOut.passed}/${f.fitness.heldOut.tasks}, ` +
      `collateral ${f.baseline.all.collateral} → ${f.fitness.all.collateral}, cost $${f.baseline.all.cost.toFixed(3)} → $${f.fitness.all.cost.toFixed(3)}`,
  );
  if (b.verified) {
    const v = b.verified;
    const usd = (x) => (x == null ? "n/a" : `$${x.toFixed(4)}`);
    lines.push(
      `Cost per verified success: gym ${usd(v.gymBefore.costPerVerifiedSuccess)} → ${usd(v.gymAfter.costPerVerifiedSuccess)} ` +
        `(${v.gymBefore.tokensPerVerifiedSuccess ?? "n/a"} → ${v.gymAfter.tokensPerVerifiedSuccess ?? "n/a"} tokens); ` +
        `day ${usd(v.day.costPerVerifiedSuccess)} over ${v.day.verified}/${v.day.runs} verified runs`,
    );
  }
  if (b.calibration) lines.push(...renderCalibration(b.calibration));
  for (const a of b.asks) lines.push(`${a.status === "auto-approved" ? "Auto-approved" : "Ask"}: ${a.text}`);
  return lines.join("\n");
}
const fmtDelta = (d) =>
  `${d.passDelta >= 0 ? "+" : ""}${d.passDelta} pass, ${d.stepsDelta >= 0 ? "+" : ""}${round(d.stepsDelta, 2)} steps/task, ${
    d.costDelta >= 0 ? "+" : ""
  }${Math.round(d.costDelta * 100)}% cost`;

// Cost and tokens per verified success: verified = checker-passing gym tasks, or day runs whose
// completion gate cleared (plain "done" when the gate is off).
const perVerified = (cost, tokens, verified) => ({
  verified,
  cost: round(cost, 6),
  tokens,
  costPerVerifiedSuccess: verified ? round(cost / verified, 6) : null,
  tokensPerVerifiedSuccess: verified ? Math.round(tokens / verified) : null,
});

async function verifiedOf(ctx, { day, evolved }) {
  const runs = await ctx.db.collection("checkpoints").find({ day, split: null }).toArray();
  const ok = runs.filter((r) => (r.completion ? r.completion.passed : r.status === "done"));
  const tokens = (r) => (r.usage?.inputTokens || 0) + (r.usage?.outputTokens || 0);
  const gym = (f) => perVerified(f.all.cost, f.all.tokens || 0, f.all.passed);
  return {
    day: { runs: runs.length, ...perVerified(sum(runs, (r) => r.usage?.cost || 0), sum(runs, tokens), ok.length) },
    gymBefore: gym(evolved.baseline),
    gymAfter: gym(evolved.fitness),
  };
}

async function runNightImpl(ctx, { day, proposer }) {
  const { db, clock } = ctx;
  const night = day;
  const timeline = [];
  const current = await currentHarness(db);
  // Parent run: this night (night number, the harness version going in, its genome summary).
  annotate({ metadata: { night, harnessVersion: current?.version ?? null, genome: genomeSummary(current?.genome) }, tags: [`night-${night}`] });
  // Child run per phase: Replay, Merge, Distill, Evolve, Asks. Evolve runs the gym (each task a
  // nested day run, train tasks tagged "train", held-out tasks tagged "heldOut") and validates
  // candidate edits, so its own trace nests every gym run and model call under "evolve".
  const phase = async (name, fn) => {
    const t0 = performance.now();
    const startedAt = new Date().toISOString();
    const out = await traceable(fn, { name, run_type: "chain" })();
    timeline.push({ phase: name, startedAt, simAt: new Date(clock.now()).toISOString(), wallMs: Math.round(performance.now() - t0) });
    return out;
  };
  const replayed = await phase("replay", () => replay(ctx, { day }));
  const merged = await phase("merge", () => merge(ctx, { night }));
  const distilled = await phase("distill", () => distill(ctx, { night }));
  const evolved = await phase("evolve", () => evolve(ctx, { night, proposer }));
  const calibrated = await phase("calibrate", () => calibrate(ctx, { night }));
  const asks = await phase("asks", () => queueAsks(ctx, { night }));
  const verified = await verifiedOf(ctx, { day, evolved });
  await db
    .collection("episodes")
    .updateMany(
      { consolidated: false },
      { $set: { consolidated: true, consolidatedAt: new Date(clock.now()), expireAt: new Date(clock.now() + RETENTION_MS) } },
    );
  const brief = {
    night,
    day,
    createdAt: new Date(clock.now()),
    harness: {
      from: evolved.baseVersion,
      to: calibrated.committed?.version ?? evolved.committed?.version ?? evolved.baseVersion,
      diffText: [
        ...(evolved.committed ? renderDiff(evolved.committed.diff) : []),
        ...(calibrated.committed ? renderDiff(calibrated.committed.diff) : []),
      ],
    },
    replay: replayed,
    merge: merged,
    distill: distilled,
    evolve: {
      baseline: evolved.baseline,
      fitness: evolved.fitness,
      patterns: evolved.patterns.map(({ name, title, severity, tasks }) => ({ name, title, severity, tasks })),
      skipped: evolved.skipped,
      edits: evolved.outcomes.map(({ _id, description, type, pattern, prediction, outcome, heldOutRegressedTitles }) => ({
        editId: _id,
        description,
        type,
        pattern,
        prediction,
        outcome,
        heldOutRegressedTitles,
      })),
    },
    calibration: calibrated,
    asks,
    verified,
    timeline,
  };
  brief.text = renderBrief(brief);
  await db.collection("briefs").insertOne(brief);
  return brief;
}
export const runNight = traceable(runNightImpl, { name: "night-run", run_type: "chain" });
