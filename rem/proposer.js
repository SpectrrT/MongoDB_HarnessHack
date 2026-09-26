// The proposer writes bounded edits with falsifiable predictions. It sees only train-set patterns,
// past edits and its own track record; it can edit the harness, never the gym.
import { EDITS, PATTERNS } from "./catalog.js";
import { applyEdit, editSignature } from "./harness.js";
import { TIERS } from "./models.js";
import { canonicalJson, clone, round } from "./util.js";

// Naive starting belief per edit type: "this kind of edit also saves a little money". It is wrong
// in a consistent direction, and the track record learns to cancel it.
const PRIORS = {
  "rule.add": { costDelta: -0.04 },
  "guardrail.add": { costDelta: -0.02 },
  "scope.revoke": { costDelta: -0.02 },
  "scope.grant": { costDelta: 0 },
  "context.set": { costDelta: -0.05 },
  "routing.set": { costDelta: -0.05 },
};
// What each edit mechanically does to a trajectory's steps, as the proposer understands it.
const MECHANISMS = {
  verifyAccess: { perTask: 1, perAffected: -1 },
  askMissingOwner: { perAffected: 1 },
  listBeforeDelete: { perAffected: 1 },
  injectMemories: { perAffected: -2 },
  injectSkills: { perAffected: -1 },
};
const SEVERE = new Set(Object.keys(PATTERNS).filter((k) => PATTERNS[k].severity !== "inefficiency"));
const priceIn = (tier) => (TIERS[tier] || TIERS.large).inputPerM;
const tokens = (text) => Math.ceil(String(text || "").length / 4);

export const isNoop = (genome, edit) => canonicalJson(applyEdit(genome, edit)) === canonicalJson(genome);

// Prompt tokens an edit adds to every model call.
function promptTokens(edit, genome) {
  if (edit.type === "rule.add") return tokens(`- ${edit.value.text}\n`);
  if (edit.type === "guardrail.add") return tokens(`- ${edit.value.id}: ${edit.value.description}\n`);
  if (edit.type === "context.set" && edit.target === "injectMemories") return genome.contextPolicy.memoryTopK * 18;
  return 0;
}

function roleCost(v, role) {
  if (v.plannerTier !== v.executorTier)
    return (v.costByTier || {})[role === "planner" ? v.plannerTier : v.executorTier] || 0;
  const plannerShare = 1 / Math.max(1, v.modelCalls);
  return v.cost * (role === "planner" ? plannerShare : 1 - plannerShare);
}

function routingDelta(edit, view, genome) {
  let delta = 0;
  for (const v of view) {
    if (edit.target === "planner") {
      if (v.plannerTier !== edit.value) delta -= roleCost(v, "planner") * (1 - priceIn(edit.value) / priceIn(v.plannerTier));
      continue;
    }
    const applies =
      edit.target === "executorWhenSkill" ? Boolean(v.skill) : !(v.skill && genome.routing.executorWhenSkill);
    if (applies && v.executorTier !== edit.value)
      delta -= roleCost(v, "executor") * (1 - priceIn(edit.value) / priceIn(v.executorTier));
  }
  return delta;
}

export function rawPrediction(name, edit, pattern, view, genome) {
  const n = view.length || 1;
  const affected = new Set(pattern.tasks);
  const flips = SEVERE.has(pattern.name)
    ? pattern.tasks.filter((id) => {
        const v = view.find((x) => x.taskId === id);
        return v && !v.pass && v.tags.filter((t) => SEVERE.has(t)).every((t) => t === pattern.name);
      })
    : [];
  const m = MECHANISMS[name] || {};
  const stepsOf = (v) => (m.perTask || 0) + (affected.has(v.taskId) ? m.perAffected || 0 : 0);
  const callCost = (v) => v.cost / Math.max(1, v.modelCalls);
  const extraTokens = promptTokens(edit, genome);
  let delta = 0;
  for (const v of view) {
    const s = stepsOf(v);
    delta += s * callCost(v) * (s > 0 ? 0.6 : 1);
    delta += ((extraTokens * v.modelCalls) / Math.max(1, v.inputTokens)) * v.cost;
  }
  if (edit.type === "routing.set") delta += routingDelta(edit, view, genome);
  const to = genome.routing.executorWhenSkill;
  if (name === "injectSkills" && to)
    for (const v of view)
      if (affected.has(v.taskId) && v.executorTier !== to)
        delta -= roleCost(v, "executor") * (1 - priceIn(to) / priceIn(v.executorTier));
  const total = view.reduce((s, v) => s + v.cost, 0) || 1;
  return {
    flips,
    passDelta: flips.length,
    stepsDelta: round(view.reduce((s, v) => s + stepsOf(v), 0) / n, 3),
    costDelta: round(delta / total + (PRIORS[edit.type]?.costDelta || 0), 3),
  };
}

export function calibrate(raw, type, trackRecord = []) {
  const record = trackRecord.find((r) => r._id === type);
  if (!record) return { ...raw, raw, calibratedFrom: 0 };
  return {
    flips: raw.flips,
    passDelta: Math.round(raw.passDelta + (record.passBias || 0)),
    stepsDelta: round(raw.stepsDelta + (record.stepsBias || 0), 3),
    costDelta: round(raw.costDelta + (record.costBias || 0), 3),
    raw,
    calibratedFrom: record.edits,
  };
}

// Scalar prediction error: pass count + steps per task + cost change in units of 10 percentage points.
export function predictionError(prediction, observed) {
  return round(
    Math.abs(prediction.passDelta - observed.passDelta) +
      Math.abs(prediction.stepsDelta - observed.stepsDelta) +
      10 * Math.abs(prediction.costDelta - observed.costDelta),
    3,
  );
}

export const TRACK_RECORD_PIPELINE = [
  { $match: { "outcome.train": { $exists: true } } },
  {
    $group: {
      _id: "$type",
      edits: { $sum: 1 },
      accepted: { $sum: { $cond: [{ $eq: ["$outcome.status", "accepted"] }, 1, 0] } },
      rejected: { $sum: { $cond: [{ $eq: ["$outcome.status", "rejected"] }, 1, 0] } },
      passBias: { $avg: { $subtract: ["$outcome.train.passDelta", "$prediction.raw.passDelta"] } },
      stepsBias: { $avg: { $subtract: ["$outcome.train.stepsDelta", "$prediction.raw.stepsDelta"] } },
      costBias: { $avg: { $subtract: ["$outcome.train.costDelta", "$prediction.raw.costDelta"] } },
      meanError: { $avg: "$outcome.predictionError" },
    },
  },
  { $sort: { _id: 1 } },
];

export async function trackRecord(db) {
  return db.collection("edits").aggregate(TRACK_RECORD_PIPELINE).toArray();
}

export function createCatalogProposer() {
  return {
    name: "catalog",
    async propose({ genome, patterns, view, pastEdits = [], trackRecord: record = [], maxEdits = 3 }) {
      const latest = new Map(pastEdits.map((e) => [e.signature, e]));
      const candidates = [],
        skipped = [];
      for (const pattern of patterns) {
        for (const name of PATTERNS[pattern.name]?.edits || []) {
          const edit = EDITS[name];
          if (isNoop(genome, edit)) continue;
          const past = latest.get(editSignature(edit));
          if (past?.status === "rejected") {
            skipped.push({ name, description: edit.description, reason: `tried on night ${past.night}: ${past.reason}` });
            continue;
          }
          if (edit.requires === "skill-in-use" && !view.some((v) => v.skill)) continue;
          candidates.push({ name, edit, pattern });
          break;
        }
      }
      const severe = candidates.filter((c) => c.pattern.severity !== "inefficiency").slice(0, 2);
      const efficiency = candidates.filter((c) => c.pattern.severity === "inefficiency");
      const chosen = [...severe, ...efficiency.slice(0, Math.max(1, maxEdits - severe.length))].slice(0, maxEdits);
      return {
        edits: chosen.map(({ name, edit, pattern }) => ({
          ...clone(edit),
          name,
          pattern: pattern.name,
          rationale: `${pattern.title} (${pattern.tasks.join(", ")})`,
          prediction: calibrate(rawPrediction(name, edit, pattern, view, genome), edit.type, record),
        })),
        skipped,
      };
    },
  };
}

// For an LLM proposer (tomorrow, via OpenRouter): same inputs, same outputs.
export function buildProposerPrompt({ genome, patterns, view, pastEdits = [], trackRecord: record = [], maxEdits = 3 }) {
  const system = [
    "You are the proposer for the REM agent harness. You may edit only the harness genome: rules,",
    "guardrails, tool scopes, context policy and model routing. You never see or edit the gym.",
    `Propose at most ${maxEdits} bounded edits. Never retry an edit whose past outcome regressed.`,
    "Every edit needs a falsifiable prediction over the train set:",
    '{ "flips": [taskIds], "passDelta": int, "stepsDelta": number (per task), "costDelta": number (fraction) }.',
    'Reply with JSON only: { "edits": [{ "type", "target", "value", "description", "rationale", "pattern", "prediction" }] }.',
    `Edit types: ${Object.keys(PRIORS).join(", ")}. Known edits: ${Object.entries(EDITS)
      .map(([k, e]) => `${k} = ${e.description}`)
      .join("; ")}.`,
  ].join("\n");
  const user = JSON.stringify(
    {
      genome,
      failurePatterns: patterns,
      trainTrajectories: view,
      pastEdits,
      trackRecordByEditType: record,
      modelPrices: TIERS,
    },
    null,
    1,
  );
  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

// TOMORROW: an LLM proposer. Falls back to the catalog when the reply is not valid JSON.
export function createLlmProposer({ model, modelId, fallback = createCatalogProposer() }) {
  return {
    name: `llm:${modelId}`,
    async propose(input) {
      try {
        const reply = await model.chat({ model: modelId, messages: buildProposerPrompt(input), tools: [] });
        const parsed = JSON.parse(String(reply.final).replace(/^```(?:json)?|```$/g, ""));
        const edits = (parsed.edits || []).slice(0, input.maxEdits || 3).filter((e) => PRIORS[e.type]);
        if (!edits.length) throw new Error("no usable edits");
        return {
          edits: edits.map((e) => ({ ...e, prediction: { ...e.prediction, raw: e.prediction } })),
          skipped: [],
        };
      } catch {
        return fallback.propose(input);
      }
    },
  };
}
