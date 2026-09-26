// The task environment: a fixture workspace (Drive notes, Gmail threads, Calendar) and the tools
// that operate on a per-run scratch copy of it.
import { clone, deepFreeze, weekNumber } from "./util.js";

export const INTERNAL_DOMAIN = "offload.test";
export const PROVIDERS = Object.freeze({
  drive: "Google Drive",
  gmail: "Gmail",
  calendar: "Google Calendar",
});
export const personEmail = (name) => `${name.toLowerCase()}@${INTERNAL_DOMAIN}`;
export const isInternal = (address) => String(address).toLowerCase().endsWith(`@${INTERNAL_DOMAIN}`);

export class AuthError extends Error {
  constructor(provider, state = "expired") {
    super(`${PROVIDERS[provider] || provider} access ${state} (401)`);
    this.name = "AuthError";
    this.status = 401;
    this.provider = provider;
  }
}

export class ToolError extends Error {
  constructor(message) {
    super(message);
    this.name = "ToolError";
  }
}

const str = { type: "string" };
const filter = {
  folder: str,
  week: { type: "string", description: "Week label such as W33" },
  query: { type: "string", description: "Case-insensitive text the title contains" },
  titlePrefix: str,
  olderThan: { type: "string", description: "Only files from weeks before this one" },
};
const message = {
  to: { type: "array", items: str },
  subject: str,
  body: str,
  threadId: str,
};
export const TOOLS = deepFreeze({
  "drive.list": {
    provider: "drive",
    effect: false,
    description: "List Drive files by folder, week, title text, title prefix or age.",
    parameters: { type: "object", properties: filter },
  },
  "drive.read": {
    provider: "drive",
    effect: false,
    description: "Read one Drive file.",
    parameters: { type: "object", properties: { id: str }, required: ["id"] },
  },
  "drive.delete": {
    provider: "drive",
    effect: true,
    description: "Move Drive files to the trash: pass ids, or a filter with the drive.list fields.",
    parameters: { type: "object", properties: { ids: { type: "array", items: str }, ...filter } },
  },
  "gmail.search": {
    provider: "gmail",
    effect: false,
    description: "Search Gmail threads by text, label or week.",
    parameters: { type: "object", properties: { query: str, label: str, week: str } },
  },
  "gmail.read": {
    provider: "gmail",
    effect: false,
    description: "Read a Gmail thread, including its reply-all recipients.",
    parameters: { type: "object", properties: { id: str }, required: ["id"] },
  },
  "gmail.draft": {
    provider: "gmail",
    effect: true,
    description: "Create a Gmail draft.",
    parameters: { type: "object", properties: message, required: ["to", "subject", "body"] },
  },
  "gmail.send": {
    provider: "gmail",
    effect: true,
    description: "Send an email.",
    parameters: { type: "object", properties: message, required: ["to", "subject", "body"] },
  },
  "calendar.list": {
    provider: "calendar",
    effect: false,
    description: "List calendar events for a week.",
    parameters: { type: "object", properties: { week: str } },
  },
  "context.read": {
    provider: null, effect: false,
    description: "Recover an archived tool exchange from this run. Start at part 0; request further parts if needed.",
    parameters: {type: "object", properties: {id: str, part: {type: "integer", minimum: 0}, digest: str}, required: ["id"]},
  },
  "context.list": {
    provider: null, effect: false,
    description: "List archived context ids from this run in pages of 20.",
    parameters: {type: "object", properties: {offset: {type: "integer", minimum: 0}}},
  },
  "memory.search": {
    provider: null,
    effect: false,
    description: "Search consolidated memories (hybrid vector + keyword search).",
    parameters: { type: "object", properties: { query: str, k: { type: "number" } }, required: ["query"] },
  },
  "ask.owner": {
    provider: null,
    effect: false,
    description: "Ask the human who owns an action item that has no owner.",
    parameters: { type: "object", properties: { item: str }, required: ["item"] },
  },
  "auth.check": {
    provider: null,
    effect: false,
    description: "Verify account access before planning; refreshes tokens that are about to expire.",
    parameters: { type: "object", properties: { providers: { type: "array", items: str } } },
  },
});

export function renderLine(type, { title, owner, customer, subject, value, via = "requested by" }) {
  if (type === "DECISION") return `DECISION: ${subject} → ${value}`;
  let line = `${type}: ${title}`;
  if (owner !== undefined) line += ` (owner: ${owner || "none"})`;
  if (customer) line += ` — ${via} ${customer}`;
  return line;
}

const LINE =
  /^(SHIPPED|BLOCKER|RESOLVED|DECISION NEEDED|DECISION|ACTION|NOTE|DONE|NEXT|CHECK|OPEN): (.+?)(?: \(owner: ([^)]+)\))?(?: — (?:requested by|for) (.+))?$/;
export function parseLine(line) {
  const m = LINE.exec(String(line).trim());
  if (!m) return null;
  const [, type, rest, owner, customer] = m;
  if (type === "DECISION" && rest.includes(" → ")) {
    const [subject, value] = rest.split(" → ");
    return { type, title: rest, subject, value };
  }
  return {
    type,
    title: rest,
    owner: owner === undefined ? undefined : owner === "none" ? null : owner,
    customer: customer || null,
  };
}

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const doc = (id, title, folder, week, author, lines) => ({
  id,
  title,
  folder,
  week,
  author,
  body: lines.join("\n"),
});

// Builds a workspace from weekly events. `truth` is only for checkers; tools never expose it.
export function buildWorkspace({
  name,
  user = personEmail("Sam"),
  team = ["Maya", "Ravi", "Jin", "Sam"].map(personEmail),
  customers = [],
  weeks = [],
  teamThread = null,
  releaseCc = [],
  files = [],
  threads = [],
}) {
  const out = { name, user, team, files: [...files], threads: [...threads], calendar: [] };
  const truth = { customers, team, user, weeks: {}, staleDrafts: [], realDocs: [] };
  const open = new Map();
  weeks.forEach((w, i) => {
    const wk = w.week.toLowerCase();
    const author = team[i % team.length];
    for (const title of w.resolved || []) open.delete(title);
    for (const [title, owner] of w.opened || []) open.set(title, owner ?? null);
    const shipped = (w.shipped || []).map(([title, owner, customer]) => ({ title, owner, customer }));
    const actions = (w.actions || []).map(([title, owner, customer]) => ({ title, owner, customer }));
    const opened = (w.opened || []).map(([title, owner]) => ({ title, owner: owner ?? null }));
    const decisions = (w.decisions || []).map(([subject, value]) => ({ subject, value }));
    const openNow = [...open].map(([title, owner]) => ({ title, owner }));
    truth.weeks[w.week] = {
      shipped,
      actions,
      opened,
      decisions,
      resolved: w.resolved || [],
      open: openNow,
      checklist: (w.checklist || []).map(([title, owner]) => ({ title, owner })),
      agenda: w.agenda || [],
      decisionsNeeded: w.decisionsNeeded || [],
      review: w.review || null,
      promises: w.promises || [],
      standupBlockers: opened,
    };
    const eng = [
      ...shipped.map((x) => renderLine("SHIPPED", x)),
      ...opened.map((x) => renderLine("BLOCKER", x)),
      ...(w.resolved || []).map((title) => renderLine("RESOLVED", { title })),
      ...decisions.map((x) => renderLine("DECISION", x)),
      ...actions.map((x) => renderLine("ACTION", { ...x, via: "for" })),
      ...(w.noise || []).map((title) => renderLine("NOTE", { title })),
    ];
    out.files.push(doc(`notes-${wk}`, `Eng sync notes — ${w.week}`, "Notes", w.week, author, eng));
    out.files.push(
      doc(`standup-${wk}`, `Standup notes — ${w.week}`, "Standup", w.week, author, [
        ...shipped.map((x) => renderLine("DONE", { ...x, via: "for" })),
        ...actions.map((x) => renderLine("NEXT", { ...x, via: "for" })),
        ...opened.map((x) => renderLine("BLOCKER", x)),
      ]),
    );
    out.files.push(
      doc(`ops-${wk}`, `Ops review — ${w.week}`, "Ops", w.week, author, [
        ...openNow.map((x) => renderLine("BLOCKER", x)),
        ...(w.resolved || []).map((title) => renderLine("RESOLVED", { title })),
      ]),
    );
    if (w.checklist)
      out.files.push(
        doc(`release-${wk}`, `Release handoff — ${w.week}`, "Releases", w.week, author,
          truth.weeks[w.week].checklist.map((x) => renderLine("CHECK", x))),
      );
    if (w.agenda) {
      const agendaId = `agenda-${wk}`;
      out.files.push(
        doc(agendaId, `Product review agenda — ${w.week}`, "Agendas", w.week, author,
          w.agenda.map((title) => renderLine("OPEN", { title }))),
      );
      out.calendar.push({
        id: `event-${wk}-review`,
        title: `Product review — ${w.week}`,
        week: w.week,
        day: "Thu",
        attendees: w.review?.attendees || team,
        agendaDocId: agendaId,
      });
    }
    if (w.decisionsNeeded)
      out.threads.push({
        id: `thread-${wk}-review`,
        subject: `Review ${w.week} prep`,
        week: w.week,
        labels: ["Review"],
        participants: team,
        messages: [
          { from: team[0], body: w.decisionsNeeded.map((title) => renderLine("DECISION NEEDED", { title })).join("\n") },
        ],
      });
    (w.promises || []).forEach((p, j) =>
      out.threads.push({
        id: `thread-${wk}-promise-${j + 1}`,
        subject: `Re: ${p.subject}`,
        week: w.week,
        labels: ["Follow-up"],
        participants: [user, ...p.with],
        messages: [
          { from: p.with[0], body: p.ask },
          { from: user, body: p.text },
        ],
      }),
    );
    if (w.checklist)
      out.threads.push({
        id: `thread-${wk}-release`,
        subject: `Release ${w.week}`,
        week: w.week,
        labels: ["Release"],
        participants: [...team, ...releaseCc],
        messages: [{ from: team[0], body: `Release ${w.week} handoff checklist is in Drive.` }],
      });
  });
  if (teamThread)
    out.threads.push({
      id: "thread-team",
      subject: "Team: weekly updates",
      week: null,
      labels: ["Team"],
      participants: teamThread,
      messages: [{ from: team[0], body: "Weekly updates go here. Reply-all keeps everyone in the loop." }],
    });
  truth.staleDrafts = out.files.filter((f) => f.stale).map((f) => f.id);
  truth.realDocs = out.files.filter((f) => !f.stale).map((f) => f.id);
  return deepFreeze({ ...out, truth });
}

function matchesFilter(file, { folder, week, query, titlePrefix, olderThan } = {}) {
  if (folder && file.folder.toLowerCase() !== String(folder).toLowerCase()) return false;
  if (week && file.week !== week) return false;
  if (query && !file.title.toLowerCase().includes(String(query).toLowerCase())) return false;
  if (titlePrefix && !file.title.startsWith(titlePrefix)) return false;
  if (olderThan && !(weekNumber(file.week) < weekNumber(olderThan))) return false;
  return true;
}
const listing = (f) => ({ id: f.id, title: f.title, folder: f.folder, week: f.week });
const EFFECT_HEADER = "X-Effect-Key";

// Per-run scratch copy: tools mutate this copy only; the fixture stays frozen.
export function createWorld(workspace) {
  const state = {
    files: clone(workspace.files),
    threads: clone(workspace.threads),
    calendar: clone(workspace.calendar),
    trash: [],
    drafts: [],
    sent: [],
  };
  const executed = [];
  let seq = 0;
  const liveFiles = () => state.files.filter((f) => !f.trashed);
  const thread = (id) => {
    const t = state.threads.find((x) => x.id === id);
    if (!t) throw new ToolError(`Thread ${id} not found.`);
    return t;
  };
  const read = {
    "drive.list": (args = {}) => {
      const files = liveFiles().filter((f) => matchesFilter(f, args)).map(listing);
      return { files, count: files.length };
    },
    "drive.read": ({ id } = {}) => {
      const f = liveFiles().find((x) => x.id === id);
      if (!f) throw new ToolError(`File ${id} not found.`);
      return { id: f.id, title: f.title, folder: f.folder, week: f.week, author: f.author, body: f.body };
    },
    "gmail.search": ({ query, label, week } = {}) => {
      const terms = String(query || "").toLowerCase().split(/\s+/).filter(Boolean);
      const threads = state.threads
        .filter((t) => !label || t.labels.some((l) => l.toLowerCase() === String(label).toLowerCase()))
        .filter((t) => !week || t.week === week)
        .filter((t) => {
          const text = [t.subject, ...t.labels, ...t.messages.map((m) => m.body)].join(" ").toLowerCase();
          return terms.every((term) => text.includes(term));
        })
        .map((t) => ({ id: t.id, subject: t.subject, week: t.week, labels: t.labels }));
      return { threads, count: threads.length };
    },
    "gmail.read": ({ id } = {}) => {
      const t = thread(id);
      return {
        id: t.id,
        subject: t.subject,
        week: t.week,
        participants: t.participants,
        replyAll: t.participants.filter((p) => p !== workspace.user),
        messages: t.messages,
      };
    },
    "calendar.list": ({ week } = {}) => ({
      events: state.calendar.filter((e) => !week || e.week === week),
    }),
  };
  const effects = {
    "drive.delete": (args = {}, meta) => {
      const hits = Array.isArray(args.ids)
        ? liveFiles().filter((f) => args.ids.includes(f.id))
        : Object.keys(args).length
          ? liveFiles().filter((f) => matchesFilter(f, args))
          : [];
      for (const f of hits) {
        f.trashed = true;
        state.trash.push({ id: f.id, title: f.title, effectKey: meta.effectKey, runId: meta.runId });
      }
      return { deleted: hits.map((f) => f.id), count: hits.length };
    },
    "gmail.draft": (args, meta) => {
      const draft = {
        id: `draft-${++seq}`,
        to: [args.to].flat(),
        subject: args.subject,
        body: args.body,
        threadId: args.threadId || null,
        runId: meta.runId,
        headers: { [EFFECT_HEADER]: meta.effectKey },
      };
      state.drafts.push(draft);
      return { draftId: draft.id, to: draft.to };
    },
    "gmail.send": (args, meta) => {
      const sent = {
        id: `msg-${++seq}`,
        to: [args.to].flat(),
        subject: args.subject,
        body: args.body,
        threadId: args.threadId || null,
        runId: meta.runId,
        headers: { [EFFECT_HEADER]: meta.effectKey },
      };
      state.sent.push(sent);
      return { messageId: sent.id, to: sent.to };
    },
  };
  return {
    workspace,
    state,
    executed,
    user: workspace.user,
    isEffect: (name) => Boolean(TOOLS[name]?.effect),
    async call(name, args) {
      if (!read[name]) throw new ToolError(`Unknown tool ${name}.`);
      return read[name](args || {});
    },
    async execute(name, args, meta) {
      if (!effects[name]) throw new ToolError(`Unknown effect ${name}.`);
      executed.push({ effectKey: meta.effectKey, tool: name, runId: meta.runId });
      return effects[name](args || {}, meta);
    },
    // Crash recovery: the effect key travels with the side effect, so a retry can find it.
    findEffect(effectKey) {
      const sent = state.sent.find((m) => m.headers[EFFECT_HEADER] === effectKey);
      if (sent) return { tool: "gmail.send", result: { messageId: sent.id, to: sent.to } };
      const draft = state.drafts.find((d) => d.headers[EFFECT_HEADER] === effectKey);
      if (draft) return { tool: "gmail.draft", result: { draftId: draft.id, to: draft.to } };
      const trashed = state.trash.filter((t) => t.effectKey === effectKey);
      if (trashed.length)
        return { tool: "drive.delete", result: { deleted: trashed.map((t) => t.id), count: trashed.length } };
      return null;
    },
  };
}
