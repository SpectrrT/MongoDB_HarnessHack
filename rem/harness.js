// The harness is data: a versioned genome document with a lineage.
import { TOOLS, isInternal } from "./world.js";
import { canonicalJson, clone, deepFreeze } from "./util.js";

// Gen 0 is deliberately bare: no rules, no guardrails, every scope, no memory or skill injection,
// a generous step budget, and every role on the expensive tier.
export const GEN0 = deepFreeze({
  rules: [],
  guardrails: [],
  toolScopes: {
    drive: ["list", "read", "delete"],
    gmail: ["search", "read", "draft", "send"],
    calendar: ["list"],
  },
  contextPolicy: { injectMemories: false, memoryTopK: 5, injectSkills: false, stepBudget: 40 },
  routing: {
    planner: "large",
    executor: "large",
    executorWhenSkill: null,
    consolidator: "large",
    proposer: "large",
  },
});

export const BUILTIN_TOOLS = ["memory.search", "ask.owner", "auth.check"];

export function allowedTools(genome) {
  const scoped = Object.entries(genome.toolScopes).flatMap(([provider, ops]) =>
    ops.map((op) => `${provider}.${op}`),
  );
  return [...scoped.filter((name) => TOOLS[name]), ...BUILTIN_TOOLS];
}

export function editSignature(edit) {
  return canonicalJson({ type: edit.type, target: edit.target ?? null, value: edit.value ?? null });
}

export function applyEdit(genome, edit) {
  const next = clone(genome);
  switch (edit.type) {
    case "rule.add":
      if (!next.rules.some((r) => r.id === edit.value.id)) next.rules.push(clone(edit.value));
      break;
    case "rule.remove":
      next.rules = next.rules.filter((r) => r.id !== edit.target);
      break;
    case "guardrail.add":
      if (!next.guardrails.some((g) => g.id === edit.value.id)) next.guardrails.push(clone(edit.value));
      break;
    case "guardrail.tighten":
    case "guardrail.loosen": {
      const g = next.guardrails.find((x) => x.id === edit.target);
      if (g) Object.assign(g.predicate, clone(edit.value));
      break;
    }
    case "guardrail.remove":
      next.guardrails = next.guardrails.filter((g) => g.id !== edit.target);
      break;
    case "scope.revoke": {
      const [provider, op] = edit.target.split(".");
      next.toolScopes[provider] = (next.toolScopes[provider] || []).filter((x) => x !== op);
      break;
    }
    case "scope.grant": {
      const [provider, op] = edit.target.split(".");
      next.toolScopes[provider] = [...new Set([...(next.toolScopes[provider] || []), op])];
      break;
    }
    case "context.set":
      next.contextPolicy[edit.target] = clone(edit.value);
      break;
    case "routing.set":
      next.routing[edit.target] = clone(edit.value);
      break;
    default:
      throw new Error(`Unknown edit type ${edit.type}.`);
  }
  return next;
}

export function diffGenomes(a, b) {
  const changes = [];
  const byId = (items) => new Map(items.map((x) => [x.id, x]));
  for (const key of ["rules", "guardrails"]) {
    const before = byId(a[key]),
      after = byId(b[key]);
    for (const [id, x] of after)
      if (!before.has(id)) changes.push({ path: key, op: "add", id, value: x.text || x.description });
      else if (canonicalJson(before.get(id)) !== canonicalJson(x))
        changes.push({ path: key, op: "modify", id, value: x.text || x.description });
    for (const [id, x] of before)
      if (!after.has(id)) changes.push({ path: key, op: "remove", id, value: x.text || x.description });
  }
  const providers = new Set([...Object.keys(a.toolScopes), ...Object.keys(b.toolScopes)]);
  for (const provider of providers) {
    const before = new Set(a.toolScopes[provider] || []),
      after = new Set(b.toolScopes[provider] || []);
    for (const op of after) if (!before.has(op)) changes.push({ path: "toolScopes", op: "grant", id: `${provider}.${op}` });
    for (const op of before) if (!after.has(op)) changes.push({ path: "toolScopes", op: "revoke", id: `${provider}.${op}` });
  }
  for (const key of ["contextPolicy", "routing"])
    for (const field of new Set([...Object.keys(a[key]), ...Object.keys(b[key])]))
      if (canonicalJson(a[key][field]) !== canonicalJson(b[key][field]))
        changes.push({ path: `${key}.${field}`, op: "set", from: a[key][field] ?? null, to: b[key][field] ?? null });
  return changes;
}

export function renderDiff(changes) {
  return changes.map((c) => {
    if (c.op === "set") return `~ ${c.path}: ${JSON.stringify(c.from)} → ${JSON.stringify(c.to)}`;
    if (c.path === "toolScopes") return `${c.op === "grant" ? "+" : "-"} tool scope ${c.id}`;
    const sign = c.op === "add" ? "+" : c.op === "remove" ? "-" : "~";
    return `${sign} ${c.path.replace(/s$/, "")} ${c.id}: ${c.value}`;
  });
}

export function renderSystemPrompt({ genome, version, role, tools, memories = [], skills = [] }) {
  const lines = [
    `You are the Offload agent running inside the REM harness (version ${version}).`,
    `Role: ${role}`,
    "Work step by step. Call one tool at a time. When the task is complete, reply with the final answer.",
  ];
  if (genome.rules.length) lines.push("", "Rules:", ...genome.rules.map((r) => `- ${r.text}`));
  if (genome.guardrails.length)
    lines.push(
      "",
      "Guardrails (checked before every tool call):",
      ...genome.guardrails.map((g) => `- ${g.id}: ${g.description}`),
    );
  lines.push("", `Tools: ${tools.join(", ")}`, `Step budget: ${genome.contextPolicy.stepBudget}`);
  if (memories.length) lines.push("", "Memories:", ...memories.map((m) => `- ${m.text}`));
  for (const s of skills)
    lines.push(
      "",
      `Skill ${s.name} (${s.status}):`,
      `  Steps: ${s.steps.join(" -> ")}`,
      ...Object.entries(s.parameters || {}).map(([k, v]) => `  Parameter ${k} = ${[v].flat().join(", ")}`),
      ...(s.constraints || []).map((c) => `  Constraint: ${c}`),
    );
  return lines.join("\n");
}

// Declarative guardrail predicates, evaluated by the harness before each tool call.
export function checkGuardrails(genome, call, transcript = []) {
  for (const g of genome.guardrails) {
    const p = g.predicate;
    if (p.tool !== call.name) continue;
    if (p.type === "recipients") {
      const to = [call.args?.to].flat().filter(Boolean);
      const outside = to.filter((a) => !isInternal(a));
      if (outside.length)
        return { ok: false, guardrail: g.id, message: `Blocked by ${g.id}: ${outside.join(", ")} is outside @offload.test. ${g.description}` };
    }
    if (p.type === "prior-list") {
      const lists = transcript.filter((t) => t.call.name === p.listTool && !t.error);
      if (Array.isArray(call.args?.ids)) {
        const listed = new Set(lists.flatMap((t) => (t.result?.files || []).map((f) => f.id)));
        if (call.args.ids.length > p.maxCount || !call.args.ids.every((id) => listed.has(id)))
          return { ok: false, guardrail: g.id, message: `Blocked by ${g.id}: delete only listed files, at most ${p.maxCount}. ${g.description}` };
        continue;
      }
      const filter = canonicalJson(pick(call.args));
      const prior = lists.findLast((t) => canonicalJson(pick(t.call.args)) === filter);
      if (!prior)
        return { ok: false, guardrail: g.id, message: `Blocked by ${g.id}: list with the same filter first. ${g.description}` };
      if ((prior.result?.count ?? Infinity) > p.maxCount)
        return { ok: false, guardrail: g.id, message: `Blocked by ${g.id}: the filter matches ${prior.result.count} files (max ${p.maxCount}). Narrow it.` };
    }
  }
  return { ok: true };
}
const pick = (args = {}) =>
  Object.fromEntries(
    ["folder", "week", "query", "titlePrefix", "olderThan"].filter((k) => args[k] !== undefined).map((k) => [k, args[k]]),
  );

export async function currentHarness(db) {
  return db.collection("harnesses").findOne({}, { sort: { version: -1 } });
}

export async function commitHarness(db, { parent, genome, editIds = [], fitness = null, metrics = null, night = null, now }) {
  const version = parent ? parent.version + 1 : 0;
  const diff = parent ? diffGenomes(parent.genome, genome) : [];
  const doc = {
    version,
    parentId: parent?._id ?? null,
    parentVersion: parent?.version ?? null,
    genome: clone(genome),
    diff,
    diffText: renderDiff(diff),
    fitness,
    metrics,
    editIds,
    night,
    createdAt: new Date(now),
  };
  await db.collection("harnesses").insertOne(doc);
  return doc;
}

export async function lineage(db) {
  return db
    .collection("harnesses")
    .find({}, { sort: { version: 1 }, projection: { genome: 0 } })
    .toArray();
}
