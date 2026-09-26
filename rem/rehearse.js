// Rehearse: REM stress-tests its own harness. Each night before Evolve (and, opt-in, after REM_REHEARSE_IDLE_MIN idle
// minutes), it builds harder versions of work it already does and runs them under the current harness. A rehearsal
// is a recipe over a train task: a stack of truth-preserving attacks (attacks.js) at an intensity level, so the
// checkers' answer never changes and the rehearsal cannot game the gym. Held-out tasks are never rehearsed. Before
// spending runs, candidates are ranked by how likely they are to break the harness (Jev through OpenRouter when
// REM_REHEARSE_JUDGE=jev, otherwise each attack's own track record). A rehearsal that breaks a task the harness
// otherwise passes is kept: Evolve validates every edit against it until a harness version passes it. When every
// rehearsal holds, the next ones get one level harder. (Working on the owner's own task while they are away is idle
// Sleep, a separate feature.)
import { ATTACKS, attackTask } from "./attacks.js";
import { GYM, runGymTask } from "./gym.js";
import { currentHarness } from "./harness.js";
import { JEV_MODEL } from "./completion.js";
import { canonicalJson, createRng, sha256 } from "./util.js";

export const MAX_LEVEL = 6;
export const REHEARSALS_PER_SESSION = 6;
const DECISIONS_URL = "https://openrouter.ai/api/alpha/decisions";
const TRAIN = new Map(GYM.train.map((t) => [t.id, t]));
const NAMES = Object.keys(ATTACKS);
// Attacks that add noise or old decisions scale with the level; the rest apply once.
const SCALES = new Set(["distract", "memory-noise", "contradiction"]);

export const rehearsalSignature = (recipe) => sha256(canonicalJson(recipe)).slice(0, 12);
export const rehearsalId = (recipe) => `${recipe.taskId}~${rehearsalSignature(recipe)}`;

// The rehearsed task: the train task with the recipe's attacks applied, still judged by the same checkers.
export function rehearsalTask(recipe) {
  const base = TRAIN.get(recipe.taskId);
  if (!base) throw new Error(`Rehearsals only use train tasks, not ${recipe.taskId}.`);
  let t = base;
  for (const name of recipe.attacks) for (let i = 0; i < (SCALES.has(name) ? recipe.level : 1); i++) t = attackTask(t, name);
  return { ...t, id: rehearsalId(recipe), split: "train", rehearsal: recipe };
}

// Candidate recipes for this session: min(level, 6) attacks per task, chosen by a seeded shuffle, never repeating one
// already rehearsed.
export function imagine({ seed, level, tried = new Set(), perTask = 2, tasks = [...TRAIN.keys()] }) {
  const rng = createRng(seed);
  const out = [];
  for (const taskId of tasks.filter((id) => TRAIN.has(id)))
    for (let k = 0; k < perTask; k++) {
      const pool = [...NAMES];
      const attacks = [];
      while (attacks.length < Math.min(level, NAMES.length)) attacks.push(pool.splice(rng.int(pool.length), 1)[0]);
      const recipe = { taskId, attacks: attacks.sort(), level };
      const sig = rehearsalSignature(recipe);
      if (!tried.has(sig) && !out.some((r) => rehearsalSignature(r) === sig)) out.push(recipe);
    }
  return out;
}

// P(the rehearsal breaks the harness) from each attack's own record: (broke + 1) / (tried + 2), the likeliest attack
// in the stack counts, and a small bonus for stacks with an untried attack.
export function priorScore(recipe, history) {
  const stat = (name) => history.filter((d) => d.recipe.attacks.includes(name));
  const p = Math.max(...recipe.attacks.map((n) => (stat(n).filter((d) => d.broke).length + 1) / (stat(n).length + 2)));
  const untried = recipe.attacks.some((n) => !stat(n).length);
  return Math.min(1, Math.round((p + (untried ? 0.05 : 0)) * 1000) / 1000);
}

export function createJevRehearsalJudge({ apiKey = process.env.OPENROUTER_API_KEY, model = JEV_MODEL, timeoutMs = 15000, fetchImpl = fetch } = {}) {
  if (!apiKey) throw new Error("Set OPENROUTER_API_KEY to rank rehearsals with Jev.");
  return {
    name: "jev",
    async score(recipe, { genome, history }) {
      const res = await fetchImpl(DECISIONS_URL, {
        method: "POST",
        signal: AbortSignal.timeout(timeoutMs),
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({
          model,
          state: {
            task: TRAIN.get(recipe.taskId)?.title || recipe.taskId,
            variant: recipe.attacks.map((n) => ATTACKS[n]).join("; "),
            level: recipe.level,
            rules: (genome.rules || []).map((r) => r.text).join(" | ").slice(0, 800),
            guardrails: (genome.guardrails || []).map((g) => g.description || g.id).join(" | ").slice(0, 600),
            pastRehearsals: history
              .slice(-12)
              .map((d) => `${d.recipe.attacks.join("+")} L${d.recipe.level}: ${d.broke ? "broke" : "held"}`)
              .join("; "),
          },
          questions: {
            breaks: {
              type: "noul",
              instructions: "Will an agent following these rules and guardrails fail this task when its evidence is changed as the variant describes?",
            },
          },
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const p = (await res.json()).answers?.breaks?.noul;
      if (typeof p !== "number") throw new Error("no probability in reply");
      return Math.round(p * 1000) / 1000;
    },
  };
}

const judgeFromEnv = () =>
  process.env.REM_REHEARSE_JUDGE === "jev" && process.env.OPENROUTER_API_KEY ? createJevRehearsalJudge() : null;

export async function rehearsalLevel(db) {
  const last = await db.collection("rehearsals").find({}, { sort: { createdAt: -1 }, limit: 1 }).toArray();
  return last[0]?.nextLevel ?? 1;
}

// Kept rehearsals no harness has passed yet, as tasks Evolve runs next to the gym.
export async function keptRehearsals(db) {
  const kept = await db.collection("rehearsals").find({ kept: true, fixedVersion: null }).toArray();
  return kept.map((d) => rehearsalTask(d.recipe));
}

// After Evolve: a kept rehearsal the new harness passes is fixed by that version.
export async function markFixed(db, results, version) {
  const passed = results.filter((r) => r.pass && r.taskId.includes("~")).map((r) => r.taskId);
  if (!passed.length) return 0;
  const out = await db.collection("rehearsals").updateMany({ id: { $in: passed }, kept: true, fixedVersion: null }, { $set: { fixedVersion: version } });
  return out.modifiedCount ?? passed.length;
}

export async function rehearse(ctx, { night, mode = "night", count = REHEARSALS_PER_SESSION, judge = judgeFromEnv(), skills = [] }) {
  const { db, model, embedder, clock } = ctx;
  const current = await currentHarness(db);
  const level = await rehearsalLevel(db);
  const history = await db.collection("rehearsals").find({}).toArray();
  const tried = new Set(history.map((d) => d.signature));
  // Rehearse what the harness already gets right (last night's Calibrate run); a task it fails has nothing to reveal.
  const [lastBrief] = await db.collection("briefs").find({}, { sort: { createdAt: -1 }, limit: 1 }).toArray();
  const passing = lastBrief?.calibration?.passing;
  const candidates = imagine({ seed: night * 1000 + level * 17 + history.length, level, tried, ...(passing?.length ? { tasks: passing } : {}) });
  let judged = "prior";
  const scored = [];
  for (const recipe of candidates) {
    let p = priorScore(recipe, history);
    if (judge)
      try {
        p = await judge.score(recipe, { genome: current.genome, history });
        judged = judge.name;
      } catch {
        // Jev unreachable: keep the prior for this one.
      }
    scored.push({ recipe, p });
  }
  const chosen = scored.sort((a, b) => b.p - a.p || a.recipe.taskId.localeCompare(b.recipe.taskId)).slice(0, count);

  const opts = { model, embedder, skills };
  const plainPass = new Map();
  const rehearsals = [];
  for (const { recipe, p } of chosen) {
    const r = await runGymTask(rehearsalTask(recipe), current.genome, opts);
    let baselinePass = true;
    if (!r.pass) {
      // Only a gap the plain task does not already have is a finding.
      if (!plainPass.has(recipe.taskId)) plainPass.set(recipe.taskId, (await runGymTask(TRAIN.get(recipe.taskId), current.genome, opts)).pass);
      baselinePass = plainPass.get(recipe.taskId);
    }
    rehearsals.push({
      id: rehearsalId(recipe),
      signature: rehearsalSignature(recipe),
      recipe,
      title: `${TRAIN.get(recipe.taskId).title} under ${recipe.attacks.join(" + ")} (level ${recipe.level})`,
      predicted: p,
      pass: r.pass,
      broke: !r.pass && baselinePass,
      failures: [...r.failures, ...r.collateral.map((c) => `collateral: ${c}`)].slice(0, 4),
      kept: !r.pass && baselinePass,
      fixedVersion: null,
      harnessVersion: current.version,
      night,
      mode,
      cost: r.cost,
    });
  }
  const broke = rehearsals.filter((d) => d.broke);
  const nextLevel = rehearsals.length && !broke.length ? Math.min(MAX_LEVEL, level + 1) : level;
  const createdAt = new Date(clock.now());
  if (rehearsals.length) await db.collection("rehearsals").insertMany(rehearsals.map((d) => ({ ...d, nextLevel, createdAt })));
  return {
    mode,
    level,
    nextLevel,
    judge: judged,
    imagined: candidates.length,
    tried: rehearsals.length,
    held: rehearsals.filter((d) => d.pass).length,
    alreadyFailing: rehearsals.filter((d) => !d.pass && !d.broke).length,
    broke: broke.map(({ id, title, failures, predicted }) => ({ id, title, failures, predicted })),
    kept: (await db.collection("rehearsals").countDocuments({ kept: true, fixedVersion: null })) || 0,
    cost: rehearsals.reduce((a, d) => a + (d.cost || 0), 0),
  };
}

export function renderRehearsal(d) {
  if (!d.tried) return [`Rehearse: nothing new to try at level ${d.level}`];
  const lines = [
    `Rehearse (${d.mode}, level ${d.level}, ranked by ${d.judge}): built ${d.imagined} harder variants of train tasks, tried ${d.tried}, ` +
      `${d.held} held` +
      (d.alreadyFailing ? `, ${d.alreadyFailing} failed where the plain task already fails` : "") +
      (d.broke.length ? `, ${d.broke.length} broke the harness and were kept for Evolve` : `; next rehearsals at level ${d.nextLevel}`),
  ];
  for (const b of d.broke) lines.push(`  Broke: ${b.title} (${b.failures[0] || "failed"})`);
  return lines;
}
