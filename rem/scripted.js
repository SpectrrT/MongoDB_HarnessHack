// Deterministic stand-in for a mid-tier model. It follows whatever rules, guardrail descriptions,
// memories and skills are in its prompt (it reads the text, never rule ids) and has no instincts.
import { isInternal, parseLine } from "./world.js";
import { canonicalJson, weekNumber } from "./util.js";
import { estimateTokens, tierOf } from "./models.js";

const CUSTOMER = /\b(?:[A-Z][a-z]+ )?[A-Z][a-z]+ (?:Corp|Inc|Labs|Health|Logistics|Systems|Industries|Ltd)\b/g;
export const redactCustomers = (text) => String(text).replace(CUSTOMER, "a customer");

const KINDS = [
  ["weekly-brief", /weekly brief/i],
  ["review-brief", /product review brief/i],
  ["review-prep", /prepare for the .*product review/i],
  ["standup", /standup/i],
  ["release-readiness", /release readiness/i],
  ["blockers", /unresolved blockers/i],
  ["follow-ups", /follow-ups? I promised/i],
  ["release-handoff", /release handoff/i],
  ["cleanup-drafts", /stale drafts/i],
  ["recap", /project recap/i],
];

export function parseTask(instruction) {
  const weeks = [...instruction.matchAll(/\bW\d{2}\b/g)].map((m) => m[0]);
  const sources = new Set();
  if (/calendar/i.test(instruction)) sources.add("calendar");
  if (/drive|notes|agenda/i.test(instruction)) sources.add("drive");
  if (/e-?mail|thread/i.test(instruction)) sources.add("gmail");
  return {
    kind: KINDS.find(([, re]) => re.test(instruction))?.[0] || null,
    week: weeks[0] || null,
    prevWeek: weeks[1] || null,
    cutoff: /before (W\d{2})/.exec(instruction)?.[1] || null,
    sources: [...sources],
    complex: sources.size >= 3,
  };
}

function section(lines, title) {
  const start = lines.findIndex((l) => l.startsWith(title));
  if (start < 0) return [];
  const out = [];
  for (const l of lines.slice(start + 1)) {
    if (!l.startsWith("- ")) break;
    out.push(l.slice(2));
  }
  return out;
}

function parseSkills(lines) {
  const skills = [];
  let current = null;
  for (const line of lines) {
    const head = /^Skill ([\w-]+) \((\w+)\):$/.exec(line);
    if (head) {
      current = { name: head[1], status: head[2], steps: [], parameters: {}, constraints: [] };
      skills.push(current);
    } else if (current && line.startsWith("  ")) {
      const t = line.trim();
      if (t.startsWith("Steps: ")) current.steps = t.slice(7).split(" -> ");
      else if (t.startsWith("Parameter ")) {
        const [k, v] = t.slice(10).split(" = ");
        current.parameters[k] = v.split(", ");
      } else if (t.startsWith("Constraint: ")) current.constraints.push(t.slice(12));
    } else current = null;
  }
  return skills;
}

function readHistory(messages) {
  const out = [],
    byId = new Map();
  for (const m of messages) {
    if (m.role === "assistant" && m.tool_calls)
      for (const tc of m.tool_calls) {
        const entry = { name: tc.function.name, args: JSON.parse(tc.function.arguments || "{}") };
        out.push(entry);
        byId.set(tc.id, entry);
      }
    else if (m.role === "tool" && byId.has(m.tool_call_id)) {
      const content = JSON.parse(m.content || "null");
      if (content && typeof content.error === "string") byId.get(m.tool_call_id).error = content.error;
      else byId.get(m.tool_call_id).result = content;
    }
  }
  return out;
}

export function readPrompt(messages, tools = []) {
  const system = messages.find((m) => m.role === "system")?.content || "";
  const lines = system.split("\n");
  const instruction = messages.find((m) => m.role === "user")?.content || "";
  const task = parseTask(instruction);
  const rules = section(lines, "Rules:");
  const guardrails = section(lines, "Guardrails");
  const memories = section(lines, "Memories:");
  const skill = parseSkills(lines).find((s) => s.name === task.kind) || null;
  const text = [...rules, ...guardrails, ...memories, ...(skill?.constraints || [])];
  const teamMemory = memories.map((m) => /^Team list(?: for internal updates)?: (.+)$/.exec(m)?.[1]).find(Boolean);
  const directive = /\b(never|no|not|don't|do not|keep|exclude|without|only|out)\b/i;
  return {
    role: /^Role: (\w+)/m.exec(system)?.[1] || "executor",
    task,
    tools: tools.map((t) => t.function?.name || t.name),
    stepBudget: Number(/^Step budget: (\d+)/m.exec(system)?.[1] || 40),
    skill,
    history: readHistory(messages),
    policy: {
      redactCustomers: text.some((l) => /customer names?/i.test(l) && directive.test(l)),
      askOwner: text.some((l) => /\bowner\b/i.test(l) && /\bask\b/i.test(l)),
      verifyAccess: rules.some((l) => /verify .*access|access before planning/i.test(l)),
      internalOnly: text.some((l) => /internal recipients|only to internal|outside @offload\.test/i.test(l)),
      listBeforeDelete: text.some((l) => /delete requires a prior|list .*before .*delet/i.test(l)),
      team: skill?.parameters.team || (teamMemory ? teamMemory.split(", ") : null),
      memories,
    },
  };
}

const firstName = (email) => {
  const name = String(email || "").split("@")[0];
  return name ? name[0].toUpperCase() + name.slice(1) : "Team";
};
const items = (docs) =>
  docs.flatMap((d) =>
    String(d.body || "")
      .split("\n")
      .map(parseLine)
      .filter(Boolean)
      .map((x) => ({ ...x, author: d.author, week: d.week })),
  );
const byType = (xs, type) => xs.filter((x) => x.type === type);
const latestByTitle = (xs) => [...new Map(xs.map((x) => [x.title, x])).values()];

function context(view) {
  const { history, policy, task } = view;
  const c = {
    ...view,
    can: (name) => view.tools.includes(name),
    done: (name, pred = () => true) => history.findLast((h) => h.name === name && !h.error && pred(h.args)),
    tried: (name, pred = () => true) => history.some((h) => h.name === name && pred(h.args)),
    last: (name) => history.findLast((h) => h.name === name),
    count: (name) => history.filter((h) => h.name === name).length,
    blockedBy: (id) => history.some((h) => h.error && h.error.includes(id)),
    call: (name, args) => ({ toolCall: { name, args } }),
    final: (text) => ({ final: text }),
  };
  c.internalOnly = () => policy.internalOnly || history.some((h) => /outside @offload\.test/.test(h.error || ""));
  c.weak = view.tier === "small" && task.complex && !view.skill;
  c.out = (text) => (policy.redactCustomers && task.kind !== "follow-ups" ? redactCustomers(text) : text);
  c.owner = (x) => (x.owner ? x.owner : policy.askOwner ? "TBD — asked" : firstName(x.author));
  c.line = (x, { customer = true } = {}) =>
    `- ${x.title} (owner: ${c.owner(x)})${customer && x.customer ? ` — for ${x.customer}` : ""}`;
  return c;
}

const verify = (c, providers) =>
  c.policy.verifyAccess && !c.tried("auth.check") ? c.call("auth.check", { providers }) : null;

function readAll(c, listArgs) {
  const key = canonicalJson(listArgs);
  const list = c.done("drive.list", (a) => canonicalJson(a) === key);
  if (!list) return { action: c.call("drive.list", listArgs) };
  const docs = [];
  for (const f of list.result.files) {
    const read = c.done("drive.read", (a) => a.id === f.id);
    if (!read) return { action: c.call("drive.read", { id: f.id }) };
    docs.push(read.result);
  }
  return { docs };
}

function readThread(c, query) {
  const search = c.done("gmail.search", (a) => a.query === query);
  if (!search) return { action: c.call("gmail.search", { query }) };
  const thread = search.result.threads[0];
  if (!thread) return { thread: null };
  const read = c.done("gmail.read", (a) => a.id === thread.id);
  if (!read) return { action: c.call("gmail.read", { id: thread.id }) };
  return { thread: read.result };
}

function askOwners(c, xs) {
  if (!c.policy.askOwner) return null;
  const missing = xs.find((x) => !x.owner && !c.tried("ask.owner", (a) => a.item === x.title));
  return missing ? c.call("ask.owner", { item: missing.title }) : null;
}

function sendOnce(c, args, doneText) {
  const tool = c.can("gmail.send") ? "gmail.send" : "gmail.draft";
  const sent = c.done(tool);
  if (sent)
    return c.final(`${tool === "gmail.send" ? doneText : "Drafted it for review (no send scope)"} to ${sent.result.to.length} recipients.`);
  if (c.count(tool) >= 3) return c.final(`Could not send: ${c.last(tool).error}`);
  const to = c.internalOnly() ? args.to.filter(isInternal) : args.to;
  return c.call(tool, { ...args, to });
}

function memoryWeek(c, prevWeek, week) {
  for (const m of c.policy.memories) {
    const hit = /as of (W\d{2})/.exec(m);
    if (!hit) continue;
    const n = weekNumber(hit[1]);
    if (n >= weekNumber(prevWeek) && n <= weekNumber(week)) return m;
  }
  return null;
}

function memoryBlockers(c, prevWeek, week) {
  const m = c.policy.memories.find(
    (x) => /^Open blockers as of (W\d{2}):/.test(x) && memoryWeek({ policy: { memories: [x] } }, prevWeek, week),
  );
  if (!m) return null;
  const list = m.slice(m.indexOf(":") + 2);
  if (list === "none") return [];
  return list.split("; ").map((s) => {
    const hit = /^(.+?) \(owner: ([^)]+)\)$/.exec(s);
    return { type: "BLOCKER", title: hit ? hit[1] : s, owner: hit && hit[2] !== "none" ? hit[2] : null, author: null };
  });
}

function weeklyBrief(c) {
  const { week, prevWeek } = c.task;
  const v = verify(c, ["drive", "gmail"]);
  if (v) return v;
  const notes = readAll(c, { folder: "Notes", week });
  if (notes.action) return notes.action;
  let carried = memoryBlockers(c, prevWeek, week);
  if (!carried) {
    const ops = readAll(c, { folder: "Ops", week: prevWeek });
    if (ops.action) return ops.action;
    carried = byType(items(ops.docs), "BLOCKER");
  }
  const mine = items(notes.docs);
  const resolved = byType(mine, "RESOLVED").map((x) => x.title);
  const open = latestByTitle([...carried.filter((b) => !resolved.includes(b.title)), ...byType(mine, "BLOCKER")]);
  const ask = askOwners(c, open);
  if (ask) return ask;
  let team = c.policy.team;
  if (!team) {
    const t = readThread(c, "team");
    if (t.action) return t.action;
    team = t.thread?.replyAll || [];
  }
  const body = [
    `Weekly brief — ${week}`,
    "Shipped:",
    ...byType(mine, "SHIPPED").map((x) => c.line(x)),
    "Open blockers:",
    ...open.map((x) => c.line(x)),
    "Decisions:",
    ...byType(mine, "DECISION").map((d) => `- ${d.subject} → ${d.value}`),
    "Next:",
    ...byType(mine, "ACTION").map((x) => c.line(x)),
  ].join("\n");
  return sendOnce(c, { to: team, subject: `Weekly brief — ${week}`, body: c.out(body) }, `Sent the ${week} weekly brief`);
}

function standup(c) {
  const { week } = c.task;
  const v = verify(c, ["drive"]);
  if (v) return v;
  const notes = readAll(c, { folder: "Standup", week });
  if (notes.action) return notes.action;
  const xs = items(notes.docs);
  const ask = askOwners(c, byType(xs, "BLOCKER"));
  if (ask) return ask;
  return c.final(
    c.out(
      [
        `Standup — ${week}`,
        "Done:",
        ...byType(xs, "DONE").map((x) => c.line(x)),
        "Next:",
        ...byType(xs, "NEXT").map((x) => c.line(x)),
        "Blockers:",
        ...byType(xs, "BLOCKER").map((x) => c.line(x)),
      ].join("\n"),
    ),
  );
}

function blockers(c) {
  const { week } = c.task;
  const v = verify(c, ["drive"]);
  if (v) return v;
  const ops = readAll(c, { folder: "Ops", week });
  if (ops.action) return ops.action;
  const open = byType(items(ops.docs), "BLOCKER");
  const ask = askOwners(c, open);
  if (ask) return ask;
  return c.final(c.out([`Unresolved blockers — ${week}`, ...open.map((x) => c.line(x))].join("\n")));
}

// Earlier weeks' open work is only in memory. Search it once (under the harness's recall policy) and
// merge what comes back with this week's ops review.
const LONG_BLOCKER = /^Unresolved blocker since (W\d{2}): (.+?) \(owner: ([^)]+)\)$/;
function releaseReadiness(c) {
  const { week } = c.task;
  const v = verify(c, ["drive"]);
  if (v) return v;
  const ops = readAll(c, { folder: "Ops", week });
  if (ops.action) return ops.action;
  const query = "unresolved blocker since";
  const search = c.done("memory.search", (a) => a.query === query);
  if (!search && c.can("memory.search") && !c.tried("memory.search", (a) => a.query === query)) return c.call("memory.search", { query });
  const remembered = [...(search?.result?.memories || []).map((m) => m.text), ...c.policy.memories]
    .map((t) => LONG_BLOCKER.exec(t))
    .filter(Boolean)
    .map(([, since, title, owner]) => ({ type: "BLOCKER", title, owner, since, author: null }));
  const open = latestByTitle([...byType(items(ops.docs), "BLOCKER"), ...remembered]);
  const ask = askOwners(c, open);
  if (ask) return ask;
  return c.final(c.out([`Release readiness for ${week}: ${open.length ? "no-go" : "go"}`, ...open.map((x) => c.line(x))].join("\n")));
}

function followUps(c) {
  const { week } = c.task;
  const v = verify(c, ["gmail"]);
  if (v) return v;
  const search = c.done("gmail.search", (a) => a.query === "I'll" && a.week === week);
  if (!search) return c.call("gmail.search", { query: "I'll", week });
  for (const t of search.result.threads)
    if (!c.done("gmail.read", (a) => a.id === t.id)) return c.call("gmail.read", { id: t.id });
  for (const t of search.result.threads) {
    const thread = c.done("gmail.read", (a) => a.id === t.id).result;
    const promise = thread.messages.find((m) => /\bI'll\b/.test(m.body) && !thread.replyAll.includes(m.from));
    if (promise && !c.tried("gmail.draft", (a) => a.threadId === t.id))
      return c.call("gmail.draft", {
        to: thread.replyAll,
        subject: thread.subject,
        body: `Hi — following up as promised: ${promise.body}`,
        threadId: t.id,
      });
  }
  return c.final(`Drafted ${c.history.filter((h) => h.name === "gmail.draft" && !h.error).length} follow-ups for review.`);
}

function releaseHandoff(c) {
  const { week } = c.task;
  const v = verify(c, ["drive", "gmail"]);
  if (v) return v;
  const docs = readAll(c, { folder: "Releases", week });
  if (docs.action) return docs.action;
  const t = readThread(c, `Release ${week}`);
  if (t.action) return t.action;
  const body = [
    `Release handoff — ${week}`,
    ...byType(items(docs.docs), "CHECK").map((x) => `- [ ] ${x.title} (owner: ${c.owner(x)})`),
  ].join("\n");
  return sendOnce(c, { to: t.thread?.replyAll || [], subject: `Release handoff — ${week}`, body: c.out(body) }, "Sent the release handoff");
}

function reviewEvent(c) {
  const { week } = c.task;
  const cal = c.done("calendar.list", (a) => a.week === week);
  if (!cal) return { action: c.call("calendar.list", { week }) };
  const event = cal.result.events.find((e) => /product review/i.test(e.title));
  if (!event) return { action: c.final(`No product review on the calendar for ${week}.`) };
  const agenda = c.done("drive.read", (a) => a.id === event.agendaDocId);
  if (!agenda) return { action: c.call("drive.read", { id: event.agendaDocId }) };
  return { event, open: byType(items([agenda.result]), "OPEN") };
}

function reviewPrep(c) {
  const v = verify(c, ["calendar", "drive"]);
  if (v) return v;
  const r = reviewEvent(c);
  if (r.action) return r.action;
  return c.final(
    c.out(
      [
        `Product review prep — ${c.task.week}`,
        `Attendees: ${r.event.attendees.filter(isInternal).map(firstName).join(", ")}`,
        "Open decisions:",
        ...r.open.map((x) => `- ${x.title}`),
      ].join("\n"),
    ),
  );
}

function reviewBrief(c) {
  const { week } = c.task;
  const v = verify(c, ["calendar", "drive", "gmail"]);
  if (v) return v;
  const r = reviewEvent(c);
  if (r.action) return r.action;
  let needed = [];
  if (!c.weak) {
    const t = readThread(c, `Review ${week}`);
    if (t.action) return t.action;
    needed = t.thread ? byType(items(t.thread.messages.map((m) => ({ body: m.body }))), "DECISION NEEDED") : [];
  }
  const body = [
    `Product review brief — ${week}`,
    "Open decisions:",
    ...r.open.map((x) => `- ${x.title}`),
    "Decisions needed:",
    ...needed.map((x) => `- ${x.title}`),
  ].join("\n");
  return sendOnce(c, { to: r.event.attendees, subject: `Product review brief — ${week}`, body: c.out(body) }, "Sent the review brief");
}

function cleanupDrafts(c) {
  const precise = { titlePrefix: "Draft:", olderThan: c.task.cutoff };
  const loose = { query: "draft" };
  const v = verify(c, ["drive"]);
  if (v) return v;
  const deleted = c.done("drive.delete");
  if (deleted) return c.final(`Moved ${deleted.result.count} stale drafts to the trash.`);
  if (!c.can("drive.delete")) {
    const list = c.done("drive.list", (a) => canonicalJson(a) === canonicalJson(precise));
    if (!list) return c.call("drive.list", precise);
    return c.final(`Found ${list.result.count} stale drafts, but deleting needs the drive.delete scope.`);
  }
  const careful = c.policy.listBeforeDelete || c.blockedBy("list-before-delete");
  if (!careful) return c.count("drive.delete") ? c.final(`Could not delete: ${c.last("drive.delete").error}`) : c.call("drive.delete", loose);
  if (c.blockedBy("list-before-delete") && !c.done("drive.list", (a) => canonicalJson(a) === canonicalJson(loose)))
    return c.call("drive.list", loose);
  if (!c.done("drive.list", (a) => canonicalJson(a) === canonicalJson(precise))) return c.call("drive.list", precise);
  if (c.count("drive.delete") >= 3) return c.final(`Could not delete: ${c.last("drive.delete").error}`);
  return c.call("drive.delete", precise);
}

function recap(c) {
  const { week, prevWeek } = c.task;
  const v = verify(c, ["drive"]);
  if (v) return v;
  const notes = readAll(c, { folder: "Notes", week });
  if (notes.action) return notes.action;
  let before = [];
  if (!memoryWeek(c, prevWeek, week)) {
    const prev = readAll(c, { folder: "Notes", week: prevWeek });
    if (prev.action) return prev.action;
    before = byType(items(prev.docs), "DECISION");
  } else
    before = c.policy.memories
      .map((m) => /^Decision: (.+?) → (.+?) \(as of W\d{2}\)$/.exec(m))
      .filter(Boolean)
      .map(([, subject, value]) => ({ subject, value }));
  const xs = items(notes.docs);
  const changed = byType(xs, "DECISION").map((d) => {
    const was = before.find((p) => p.subject === d.subject);
    return `- ${d.subject}: ${was && was.value !== d.value ? `${was.value} → ` : ""}${d.value}`;
  });
  return c.final(
    c.out(
      [
        `Recap — ${week}`,
        "Shipped:",
        ...byType(xs, "SHIPPED").map((x) => c.line(x, { customer: false })),
        `Changed since ${prevWeek}:`,
        ...byType(xs, "RESOLVED").map((x) => `- Resolved: ${x.title}`),
        ...changed,
      ].join("\n"),
    ),
  );
}

const PROCEDURES = {
  "weekly-brief": weeklyBrief,
  standup,
  blockers,
  "release-readiness": releaseReadiness,
  "follow-ups": followUps,
  "release-handoff": releaseHandoff,
  "review-prep": reviewPrep,
  "review-brief": reviewBrief,
  "cleanup-drafts": cleanupDrafts,
  recap,
};

const PLAN = {
  "weekly-brief": (p) => [
    "List and read this week's notes",
    p.memories.length ? "Use remembered blockers if they cover last week" : "Read last week's ops review for carried-over blockers",
    p.team ? "Use the known team list" : "Find the team thread for recipients",
    "Write the brief" + (p.redactCustomers ? " without customer names" : ""),
    "Email it to the team" + (p.internalOnly ? " (internal recipients only)" : ""),
  ],
  standup: () => ["Read this week's standup notes", "Write the standup update"],
  blockers: (p) => ["Read the ops review", p.askOwner ? "Ask about blockers without an owner" : "List blockers with owners"],
  "release-readiness": () => ["Read this week's ops review", "Search memory for older open blockers", "Say go or no-go"],
  "follow-ups": () => ["Find threads where I promised something", "Draft one follow-up per promise"],
  "release-handoff": () => ["Read the handoff checklist", "Find the release thread", "Send the checklist"],
  "review-prep": () => ["Find the review on the calendar", "Read its agenda", "List open decisions"],
  "review-brief": () => ["Find the review", "Read the agenda", "Read the review thread", "Send the brief to attendees"],
  "cleanup-drafts": (p) => [p.listBeforeDelete ? "List stale drafts first" : "Delete drafts", "Report what was removed"],
  recap: () => ["Read this week's notes", "Compare with last week", "Write the recap"],
};

export function createScriptedModel() {
  return {
    name: "scripted",
    async chat({ model, messages, tools = [] }) {
      const view = readPrompt(messages, tools);
      view.tier = tierOf(model);
      let action;
      if (!view.task.kind) action = { final: "I can't tell what this task needs." };
      else if (view.role === "planner") {
        const steps = [...(view.policy.verifyAccess ? ["Verify account access"] : []), ...PLAN[view.task.kind](view.policy)];
        action = { final: steps.map((s, i) => `${i + 1}. ${s}`).join("\n") };
      } else if (view.history.length >= view.stepBudget) action = { final: "Stopping: step budget exhausted." };
      else action = PROCEDURES[view.task.kind](context(view));
      const usage = {
        inputTokens: estimateTokens(JSON.stringify(messages)) + estimateTokens(JSON.stringify(tools)),
        outputTokens: estimateTokens(JSON.stringify(action)),
      };
      return { ...action, usage, model };
    },
  };
}
