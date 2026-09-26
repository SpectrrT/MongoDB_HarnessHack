// The gym: frozen fixtures, tasks and deterministic checkers. Train + held-out. Each run gets a
// scratch database and a scratch copy of its fixture world; nothing here is reachable by the proposer
// except the train-set view built by proposerView().
import { createMemoryDb, ensureIndexes } from "./db/index.js";
import { createAgent, seedConnections, setConnection } from "./agent.js";
import { buildWorkspace, createWorld, personEmail } from "./world.js";
import { checkRun, describeTask, taskParams } from "./tasks.js";
import { createClock, deepFreeze, sum } from "./util.js";

const team = ["Maya", "Ravi", "Jin", "Sam"].map(personEmail);
const teamList = `Team list: ${team.join(", ")}`;
const trainCustomers = ["Acme Corp", "Globex Inc"];
const heldOutCustomers = ["Initech Labs", "Umbrella Health", "Northwind Logistics"];

const W = {
  brief: buildWorkspace({
    name: "gym-train-brief",
    customers: trainCustomers,
    teamThread: team,
    weeks: [
      {
        week: "W32",
        shipped: [["Search filters v2", "Jin"]],
        opened: [["Billing webhook retries failing", "Sam"], ["Flaky login test on CI", "Ravi"]],
        decisions: [["Release day", "Thursday"]],
      },
      {
        week: "W33",
        shipped: [["Export to CSV fix", "Maya", "Acme Corp"], ["Faster dashboard load", "Jin"]],
        resolved: ["Flaky login test on CI"],
        opened: [["Data retention policy review", "Ravi"]],
        decisions: [["Release day", "Tuesday"]],
        actions: [["Draft migration guide", "Ravi"]],
        noise: ["Remember the offsite survey"],
      },
    ],
  }),
  mail: buildWorkspace({
    name: "gym-train-mail",
    customers: trainCustomers,
    teamThread: team,
    weeks: [
      {
        week: "W33",
        promises: [
          {
            subject: "Pricing deck",
            with: ["partner@acme-corp.example"],
            ask: "Could you send the updated pricing deck?",
            text: "I'll send the updated pricing deck by Friday.",
            item: "updated pricing deck",
          },
          {
            subject: "Migration timeline",
            with: [personEmail("Jin")],
            ask: "When is the migration timeline ready?",
            text: "I'll share the migration timeline by Wednesday.",
            item: "migration timeline",
          },
        ],
      },
    ],
  }),
  standup: buildWorkspace({
    name: "gym-train-standup",
    customers: trainCustomers,
    weeks: [
      {
        week: "W33",
        shipped: [["SSO rollout", "Sam", "Globex Inc"], ["Audit log export", "Ravi"]],
        actions: [["Dashboard caching", "Jin"]],
        opened: [["Mobile push delays", "Jin"]],
      },
    ],
  }),
  ops: buildWorkspace({
    name: "gym-train-ops",
    customers: trainCustomers,
    weeks: [
      { week: "W32", opened: [["Staging database nearly full", "Ravi"]] },
      { week: "W33", opened: [["Vendor contract renewal", null]] },
    ],
  }),
  release: buildWorkspace({
    name: "gym-train-release",
    customers: trainCustomers,
    releaseCc: ["qa@vendorco.example"],
    weeks: [
      {
        week: "W33",
        checklist: [["Changelog updated", "Jin"], ["Rollback plan reviewed", "Ravi"], ["Migration guide linked", "Ravi"]],
      },
    ],
  }),
  review: buildWorkspace({
    name: "gym-train-review",
    customers: trainCustomers,
    weeks: [{ week: "W33", agenda: ["Sunset the legacy importer?", "Price the audit log add-on?"] }],
  }),
  drafts: buildWorkspace({
    name: "gym-train-drafts",
    customers: trainCustomers,
    files: [
      ["g-draft-roadmap", "Draft: Q2 roadmap (old)", "Drafts", "W24", true],
      ["g-draft-onboarding", "Draft: onboarding email v1", "Drafts", "W25", true],
      ["g-draft-faq", "Draft: pricing FAQ", "Drafts", "W26", true],
      ["g-draft-offsite", "Draft: offsite agenda", "Drafts", "W27", true],
      ["g-draft-brief", "Draft: W33 brief", "Drafts", "W33", false],
      ["g-doc-guide", "Drafting guidelines", "Docs", "W20", false],
      ["g-doc-contract", "Customer contract (draft reviewed)", "Docs", "W30", false],
    ].map(([id, title, folder, week, stale]) => ({ id, title, folder, week, author: team[3], body: `${title}.`, stale })),
  }),
  recap: buildWorkspace({
    name: "gym-train-recap",
    customers: trainCustomers,
    weeks: [
      {
        week: "W32",
        shipped: [["Search filters v2", "Jin"]],
        opened: [["Flaky login test on CI", "Ravi"]],
        decisions: [["Release day", "Thursday"]],
      },
      {
        week: "W33",
        shipped: [["Faster dashboard load", "Jin"], ["Export to CSV fix", "Maya"]],
        resolved: ["Flaky login test on CI"],
        decisions: [["Release day", "Tuesday"]],
      },
    ],
  }),
  heldBrief: buildWorkspace({
    name: "gym-heldout-brief",
    customers: heldOutCustomers,
    teamThread: team,
    weeks: [
      {
        week: "W41",
        opened: [["Payment retries stuck", "Maya"]],
        decisions: [["Standup time", "9:30"]],
      },
      {
        week: "W42",
        shipped: [["Bulk export API", "Ravi", "Initech Labs"], ["Faster search", "Jin"]],
        opened: [["Rate limiter tuning", "Jin"]],
        decisions: [["Standup time", "10:00"]],
        actions: [["Update API docs", "Ravi"]],
      },
    ],
  }),
  heldReview: buildWorkspace({
    name: "gym-heldout-review",
    customers: heldOutCustomers,
    weeks: [
      {
        week: "W42",
        agenda: ["Retire the v1 API?", "Launch the partner portal?"],
        review: { attendees: [...team, "guest@northwind.example"] },
        decisionsNeeded: ["Approve the Q4 pricing change?", "Pick the SOC 2 auditor?"],
      },
    ],
  }),
  heldOps: buildWorkspace({
    name: "gym-heldout-ops",
    customers: heldOutCustomers,
    weeks: [
      { week: "W41", opened: [["Payment retries stuck", null]] },
      { week: "W42", opened: [["SOC 2 evidence collection", null], ["Rate limiter tuning", "Jin"]] },
    ],
  }),
  heldExpiry: buildWorkspace({
    name: "gym-heldout-expiry",
    customers: heldOutCustomers,
    teamThread: team,
    weeks: [
      { week: "W40", opened: [["Search reindex slow", "Ravi"]] },
      {
        week: "W41",
        shipped: [["Usage dashboard", "Maya"]],
        opened: [["Webhook signing", "Sam"]],
        decisions: [["Planning day", "Monday"]],
      },
    ],
  }),
};

// The ops review only covers its own week; `truth` also carries the blocker that only memory holds.
const withRememberedBlocker = (ws, week, title, owner) =>
  deepFreeze({
    ...ws,
    truth: { ...ws.truth, weeks: { ...ws.truth.weeks, [week]: { ...ws.truth.weeks[week], open: [...ws.truth.weeks[week].open, { title, owner }] } } },
  });
W.longRelease = withRememberedBlocker(
  buildWorkspace({ name: "gym-train-long-release", customers: trainCustomers, weeks: [{ week: "W33", opened: [["Checkout latency regression", "Jin"]] }] }),
  "W33",
  "SEC-7 signing key rotation",
  "Ravi",
);
W.heldLongRelease = withRememberedBlocker(
  buildWorkspace({ name: "gym-heldout-long-release", customers: heldOutCustomers, weeks: [{ week: "W42", opened: [["Search index backfill", "Maya"]] }] }),
  "W42",
  "SEC-12 audit log retention",
  "Sam",
);

// Gym memories are strings, or { text, ageDays } when their age matters to recall.
export const memoryText = (m) => (typeof m === "string" ? m : m.text);

const task = (id, split, kind, week, workspace, extra = {}) => {
  const params = taskParams(kind, week);
  return {
    id,
    split,
    ...describeTask(kind, params),
    week,
    workspace,
    memories: extra.memories || [],
    connections: extra.connections || {},
  };
};

export const GYM = deepFreeze({
  train: [
    task("T1", "train", "weekly-brief", "W33", W.brief, {
      memories: [
        "Open blockers as of W32: Billing webhook retries failing (owner: Sam); Flaky login test on CI (owner: Ravi)",
        teamList,
        "Decision: Release day → Thursday (as of W32)",
        "Team lunch moved to Friday",
      ],
    }),
    task("T2", "train", "follow-ups", "W33", W.mail, { memories: [teamList] }),
    task("T3", "train", "standup", "W33", W.standup),
    task("T4", "train", "blockers", "W33", W.ops),
    task("T5", "train", "release-handoff", "W33", W.release),
    task("T6", "train", "review-prep", "W33", W.review),
    task("T7", "train", "cleanup-drafts", "W33", W.drafts),
    task("T8", "train", "recap", "W33", W.recap, {
      memories: [
        "Decision: Release day → Thursday (as of W32)",
        "Open blockers as of W32: Flaky login test on CI (owner: Ravi)",
      ],
      connections: { drive: { expiresAfterCalls: 1 } },
    }),
    task("T9", "train", "release-readiness", "W33", W.longRelease, {
      memories: [
        { text: "Unresolved blocker since W28: SEC-7 signing key rotation (owner: Ravi)", ageDays: 35 },
        { text: "Decision: Release day → Tuesday (as of W32)", ageDays: 6 },
        { text: teamList, ageDays: 2 },
      ],
    }),
  ],
  heldOut: [
    task("H1", "heldOut", "weekly-brief", "W42", W.heldBrief, {
      memories: ["Open blockers as of W41: Payment retries stuck (owner: Maya)", teamList, "Decision: Standup time → 9:30 (as of W41)"],
    }),
    task("H2", "heldOut", "review-brief", "W42", W.heldReview),
    task("H3", "heldOut", "blockers", "W42", W.heldOps),
    task("H4", "heldOut", "weekly-brief", "W41", W.heldExpiry, {
      memories: ["Open blockers as of W40: Search reindex slow (owner: Ravi)", teamList],
      connections: { drive: { expiresAfterCalls: 1 }, gmail: { expiresAfterCalls: 0 } },
    }),
    task("H5", "heldOut", "release-readiness", "W42", W.heldLongRelease, {
      memories: [
        { text: "Unresolved blocker since W36: SEC-12 audit log retention (owner: Sam)", ageDays: 45 },
        { text: "Decision: Standup time → 10:00 (as of W42)", ageDays: 1 },
      ],
    }),
  ],
});

export const TRAIN_IDS = GYM.train.map((t) => t.id);
export const GYM_EPOCH = Date.parse("2026-09-01T13:00:00Z");

function tagsFor(t, run, verdict, genome) {
  const tags = [...verdict.collateral];
  const texts = t.memories.map(memoryText);
  // A missed item that memory holds is a recall failure, not a generic incomplete run.
  const missedRemembered = verdict.failures.some((f) => {
    const title = /^missing blocker: (.+)$/.exec(f)?.[1];
    return title && texts.some((m) => m.includes(title));
  });
  if (missedRemembered) tags.push("stale-recall");
  else if (!verdict.endState && !verdict.collateral.length)
    tags.push(
      run.transcript.some((x) => /tool scopes/.test(x.error || "")) || /scope/.test(run.final || "")
        ? "missing-scope"
        : "incomplete",
    );
  if (run.interventions > 0) tags.push("auth-interrupt");
  const covered = t.params.prevWeek && texts.some((m) => m.includes(`as of ${t.params.prevWeek}`));
  if (covered && run.transcript.some((x) => x.call.args?.week === t.params.prevWeek)) tags.push("redundant-reads");
  if (run.context?.executorTier === "large" || genome.routing.planner === "large") tags.push("expensive-model");
  if (run.context?.skillCandidate) tags.push("unused-skill");
  return tags;
}

// `grade`: a completion gate. When set, the finished run is also scored by the gate, once with the end-state checks as
// evidence and once blind (no checks), without changing the run. Calibrate compares those scores to the checkers.
export async function runGymTask(t, genome, { model, embedder, skills = [], grade = null }) {
  const db = createMemoryDb({ name: `gym_${t.id}` });
  await ensureIndexes(db, { search: false });
  const clock = createClock(GYM_EPOCH);
  await seedConnections(db, { now: clock.now(), overrides: t.connections });
  if (t.memories.length) {
    const texts = t.memories.map(memoryText);
    const vectors = await embedder.embed(texts);
    await db.collection("memories").insertMany(
      t.memories.map((m, i) => ({
        text: texts[i],
        active: true,
        confidence: 0.9,
        embedding: vectors[i],
        ...(typeof m === "object" && m.ageDays != null ? { recency: new Date(GYM_EPOCH - m.ageDays * 86400000) } : {}),
      })),
    );
  }
  if (skills.length) {
    const vectors = await embedder.embed(skills.map((s) => s.description));
    await db.collection("skills").insertMany(skills.map(({ _id, ...s }, i) => ({ ...s, embedding: vectors[i] })));
  }
  const world = createWorld(t.workspace);
  const agent = createAgent({
    db,
    world,
    model,
    embedder,
    clock,
    harness: async () => ({ version: "candidate", genome }),
    episodes: false,
    runPrefix: "gym",
  });
  let run = await agent.startRun({ ...t, runId: `gym-${t.id}`, split: t.split });
  for (let i = 0; run.status === "paused_for_auth" && i < 5; i++) {
    await setConnection(db, run.provider, "valid", clock.now());
    run = await agent.resumeRun(run.runId);
  }
  const verdict = checkRun({ kind: t.kind, params: t.params, truth: t.workspace.truth, world, run });
  const gate = grade ? await gradeRun(grade, run, genome, verdict) : null;
  return {
    taskId: t.id,
    split: t.split,
    kind: t.kind,
    pass: verdict.pass,
    endState: verdict.endState,
    collateral: verdict.collateral,
    failures: verdict.failures,
    tags: tagsFor(t, run, verdict, genome),
    steps: run.turns,
    cost: run.usage.cost,
    latencyMs: run.latencyMs,
    interventions: run.interventions,
    executorTier: run.context?.executorTier,
    plannerTier: genome.routing.planner,
    skill: run.context?.skill?.name ?? null,
    tools: run.transcript.map((x) => x.call.name),
    errors: run.transcript.filter((x) => x.error).map((x) => x.error),
    modelCalls: run.usage.calls,
    inputTokens: run.usage.inputTokens,
    tokens: run.usage.inputTokens + run.usage.outputTokens,
    costByTier: run.usage.byTier,
    ...(gate ? { gate } : {}),
  };
}

async function gradeRun(gate, run, genome, verdict) {
  const final = run.final ?? "";
  const failures = [...verdict.failures, ...verdict.collateral.map((c) => `collateral: ${c}`)];
  const score = async (mode, evidence) => {
    let result, failed = false;
    try { result = await gate.check({ cp: run, final, genome, evidence }); }
    catch (error) {
      failed = true;
      result = { ...error?.usage, usage: error?.usage, source: gate.name, available: false };
    }
    result ||= {};
    const stub = !failed && (result.source ?? gate.name) === "stub";
    const tokens = Number.isSafeInteger(result.tokens) && result.tokens >= 0 ? result.tokens : stub ? 0 : null;
    const cost = Number.isFinite(result.cost) && result.cost >= 0 ? result.cost : stub ? 0 : null;
    const validScore = result.available !== false && Number.isFinite(result.p) && result.p >= 0 && result.p <= 1;
    return { mode, source: result.source ?? gate.name, p: validScore ? result.p : null, validScore,
      available: result.available !== false, ...(failed ? { error: "Completion grader threw before returning a score." } : {}),
      tokens, cost, usageKnown: result.usageKnown !== false && tokens !== null, costKnown: result.costKnown !== false && cost !== null,
      ...(result.inputTokens !== undefined ? { inputTokens: result.inputTokens } : {}),
      ...(result.outputTokens !== undefined ? { outputTokens: result.outputTokens } : {}),
      ...(result.usage !== undefined ? { usage: result.usage } : {}),
    };
  };
  const checked = await score("checked", { failures, pass: verdict.pass });
  const blind = await score("blind", null);
  return { source: blind.source, checked: checked.p, blind: blind.p, receipts: [checked, blind] };
}

// `extra`: more tasks to run after the gym's own (Rehearse's kept variants, which are train tasks).
export async function runGym(genome, { model, embedder, skills = [], split = "all", grade = null, extra = [] }) {
  const tasks = split === "train" ? GYM.train : split === "heldOut" ? GYM.heldOut : [...GYM.train, ...GYM.heldOut];
  const results = [];
  for (const t of [...tasks, ...(split === "heldOut" ? [] : extra)]) results.push(await runGymTask(t, genome, { model, embedder, skills, grade }));
  return { results, fitness: fitness(results) };
}

export function aggregate(results) {
  const passed = results.filter((r) => r.pass).length;
  return {
    tasks: results.length,
    passed,
    passRate: results.length ? passed / results.length : 0,
    collateral: sum(results, (r) => r.collateral.length),
    cost: sum(results, (r) => r.cost),
    steps: sum(results, (r) => r.steps),
    interventions: sum(results, (r) => r.interventions),
    latencyMs: sum(results, (r) => r.latencyMs),
    tokens: sum(results, (r) => r.tokens || 0),
  };
}

export function fitness(results) {
  return {
    all: aggregate(results),
    train: aggregate(results.filter((r) => r.split === "train")),
    heldOut: aggregate(results.filter((r) => r.split === "heldOut")),
  };
}

// Lexicographic: no collateral damage > success rate > human interventions > cost > steps.
// Interventions rank above cost: a reconnect costs a person's attention, not a fraction of a cent.
export function compareFitness(a, b) {
  if (a.collateral !== b.collateral) return a.collateral < b.collateral ? 1 : -1;
  if (a.passed !== b.passed) return a.passed > b.passed ? 1 : -1;
  if (a.interventions !== b.interventions) return a.interventions < b.interventions ? 1 : -1;
  const relCost = (b.cost - a.cost) / Math.max(b.cost, 1e-9);
  if (Math.abs(relCost) > 0.005) return relCost > 0 ? 1 : -1;
  if (a.steps !== b.steps) return a.steps < b.steps ? 1 : -1;
  return 0;
}

export function regressions(base, candidate) {
  const before = new Map(base.map((r) => [r.taskId, r]));
  return candidate.filter((r) => before.get(r.taskId)?.pass && !r.pass).map((r) => r.taskId);
}

// The only gym output the proposer ever sees: train trajectories, no held-out data.
export function proposerView(results) {
  return results
    .filter((r) => r.split === "train")
    .map((r) => ({
      taskId: r.taskId,
      kind: r.kind,
      pass: r.pass,
      tags: r.tags,
      failures: r.failures,
      collateral: r.collateral,
      steps: r.steps,
      cost: r.cost,
      interventions: r.interventions,
      tools: r.tools,
      errors: r.errors,
      executorTier: r.executorTier,
      plannerTier: r.plannerTier,
      skill: r.skill,
      modelCalls: r.modelCalls,
      inputTokens: r.inputTokens,
      costByTier: r.costByTier,
    }));
}
