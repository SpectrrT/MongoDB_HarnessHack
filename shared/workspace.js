import { THEME_IDS } from "./themes.js";
import { CONNECTIONS } from "./connections.js";
import { upgradeWorkspace, updateOvernight } from "./overnight.js";
// The same deterministic local engine runs locally in the browser and behind the API.
// It never calls an external account, sends a message, or executes generated code.
export const SCHEMA_VERSION = 1;
const uid = () => globalThis.crypto.randomUUID();
const clone = (x) => structuredClone(x);
export function createWorkspace(now = Date.now()) {
  const suggestions = [
    [
      "weekly-update",
      "Prepare the Friday update",
      "You collected project changes on the last four Fridays.",
      "Google Drive",
      "28 min",
      4,
      "Writing",
    ],
    [
      "follow-up",
      "Draft a reply to the open design review",
      "The review has two unanswered questions and a deadline tomorrow.",
      "Gmail",
      "12 min",
      2,
      "Email",
    ],
    [
      "standup",
      "Turn today’s notes into a standup",
      "Your work sessions contain decisions that are not in the task list yet.",
      "Notes",
      "8 min",
      5,
      "Writing",
    ],
    [
      "release",
      "Check the next release handoff",
      "The last two handoffs used the same checklist.",
      "GitHub",
      "18 min",
      2,
      "Development",
    ],
    [
      "meeting",
      "Prepare for the product review",
      "You usually gather open decisions before this meeting.",
      "Calendar",
      "15 min",
      3,
      "Planning",
    ],
    [
      "blockers",
      "Collect the unresolved blockers",
      "Several example tasks still need an owner.",
      "Notes",
      "6 min",
      3,
      "Planning",
    ],
    [
      "recap",
      "Write the week’s project recap",
      "A short summary could replace another pass through your notes.",
      "Google Drive",
      "16 min",
      3,
      "Writing",
    ],
    [
      "follow-through",
      "Draft the promised follow-ups",
      "Your example work session contains two follow-up commitments.",
      "Gmail",
      "10 min",
      2,
      "Email",
    ],
  ].map(([id, title, reason, source, estimate, occurrences, category], i) => ({
    id,
    title,
    reason,
    source,
    estimate,
    occurrences,
    category,
    status: "pending",
    snoozedUntil: null,
    createdAt: now - i * 3600000,
    evidence: [
      `${occurrences} related examples in example history`,
      `${source} example workspace`,
    ],
  }));
  return {
    version: SCHEMA_VERSION,
    copyVersion: 1,
    revision: 0,
    createdAt: now,
    profile: { name: "", role: "Product team", onboarded: false },
    settings: {
      suggestions: true,
      notifications: false,
      sleepSchedule: false,
      sleepHour: "22:00",
      theme: "light",
    },
    connections: CONNECTIONS.map(c => ({...c})),
    overnight: [],
    suggestions,
    memory: [
      {
        id: "m1",
        text: "Include the export bug in the Friday update. Keep the customer’s name out.",
        source: "Example work conversation",
        createdAt: now - 86400000,
        kind: "decision",
        example: true,
      },
      {
        id: "m2",
        text: "Ask for an owner when an action has no assignee.",
        source: "Example project review",
        createdAt: now - 7200000,
        kind: "rule",
        example: true,
      },
      {
        id: "m3",
        text: "Keep the weekly update short. Group changes under shipped, next, and blocked.",
        source: "Example correction",
        createdAt: now - 3600000,
        kind: "preference",
        example: true,
      },
    ],
    sessions: [],
    conversations: [],
    runs: [],
    skills: [],
    sleepHistory: [],
    audit: [],
    lastSleepDay: null,
  };
}
const providerFor = (s) =>
  ({
    "Google Drive": "drive",
    Gmail: "gmail",
    GitHub: "github",
    Calendar: "calendar",
  })[s];
function required(x, message) {
  if (!x) throw new Error(message);
  return x;
}
function record(s, text, now) {
  s.audit.unshift({ id: uid(), text, at: now });
  s.audit = s.audit.slice(0, 150);
}
export function transition(current, action, now = Date.now()) {
  const s = clone(upgradeWorkspace(current));
  const { type, payload: p = {} } = action;
  switch (type) {
    case "request-connection": {
      const c = required(s.connections.find(c => c.id === p.id), "Connection not found.");
      required(typeof p.requested === "boolean", "Choose whether to add this app.");
      c.requested = p.requested;
      c.updatedAt = now;
      record(s, `${p.requested ? "Added" : "Removed"} ${c.name} setup`, now);
      break;
    }
    case "overnight":
      updateOvernight(s, p, now);
      record(s, p.id ? "Updated overnight task" : "Queued overnight task. Worker setup needed.", now);
      break;
    case "onboard":
      s.profile = {
        name: String(p.name || "")
          .trim()
          .slice(0, 60),
        role: p.role || "Product team",
        onboarded: true,
      };
      required(s.profile.name, "Enter your first name.");
      record(s, "Completed local onboarding", now);
      break;
    case "settings": {
      const keys = [
        "suggestions",
        "notifications",
        "sleepSchedule",
        "sleepHour",
        "theme",
        "agentFolder",
        "modelConnected",
        "modelSelection",
        "modelProvider",
        "openrouterModel",
        "reasoningEffort",
        "themeCustom",
      ];
      if (p.theme) required(THEME_IDS.includes(p.theme), "Unknown theme.");
      if (p.reasoningEffort) required(["low","medium","high","xhigh","max","ultra"].includes(p.reasoningEffort), "Unknown reasoning effort.");
      for (const k of keys) if (k in p) s.settings[k] = p[k];
      break;
    }
    case "profile":
      s.profile.name = String(p.name).trim().slice(0, 60);
      required(s.profile.name, "Enter your first name.");
      if('email' in p){const email=String(p.email).trim();required(email.length<=254&&(!email||/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)),"Enter a valid email.");s.profile.email=email;}
      if('avatar' in p){required(typeof p.avatar==='string'&&p.avatar.length<=40000&&(!p.avatar||/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(p.avatar)),"Choose a valid profile image.");s.profile.avatar=p.avatar;}
      break;
    case "connect": {
      const c = required(
        s.connections.find((c) => c.id === p.id),
        "Connection not found.",
      );
      c.status = p.disconnect ? "disconnected" : "connected";
      c.updatedAt = now;
      record(
        s,
        `${p.disconnect ? "Disconnected" : "Connected"} ${c.name} example account`,
        now,
      );
      break;
    }
    case "expire": {
      const c = required(
        s.connections.find((c) => c.id === p.id),
        "Connection not found.",
      );
      c.status = "expired";
      record(s, `${c.name} local access expired`, now);
      break;
    }
    case "suggestion": {
      const a = required(
        s.suggestions.find((x) => x.id === p.id),
        "Suggestion not found.",
      );
      required(
        ["dismissed", "pending", "snoozed"].includes(p.status),
        "Unknown suggestion status.",
      );
      a.status = p.status;
      a.snoozedUntil = p.status === "snoozed" ? now + 86400000 : null;
      break;
    }
    case "start-run": {
      const suggestion = required(
        s.suggestions.find((x) => x.id === p.id),
        "Suggestion not found.",
      );
      const existing = s.runs.find(
        (r) =>
          r.suggestionId === p.id &&
          ["running", "blocked", "ready"].includes(r.status),
      );
      if (existing) return s;
      const run = {
        id: uid(),
        suggestionId: p.id,
        title: suggestion.title,
        provider: providerFor(suggestion.source),
        status: "running",
        checkpoint: 0,
        startedAt: now,
        updatedAt: now,
        steps: [
          "Read selected example context",
          "Apply saved rules",
          "Prepare a local draft",
          "Check the draft",
        ],
        draft: "",
        saved: false,
        receipts: [],
      };
      s.runs.unshift(run);
      suggestion.status = "active";
      record(s, `Started ${run.title}`, now);
      break;
    }
    case "resume-run": {
      const r = required(
        s.runs.find((x) => x.id === p.id),
        "Task not found.",
      );
      required(r.status === "blocked", "Only blocked tasks can resume.");
      required(
        !r.provider ||
          s.connections.find((x) => x.id === r.provider)?.status ===
            "connected",
        "Reconnect the example account first.",
      );
      r.status = "running";
      r.startedAt = now - r.checkpoint * 1800;
      r.updatedAt = now;
      record(s, `Resumed ${r.title} at step ${r.checkpoint + 1}`, now);
      break;
    }
    case "cancel-run": {
      const r = required(
        s.runs.find((x) => x.id === p.id),
        "Task not found.",
      );
      required(
        ["running", "blocked"].includes(r.status),
        "This task cannot be cancelled.",
      );
      r.status = "cancelled";
      const sg = s.suggestions.find((x) => x.id === r.suggestionId);
      if (sg) sg.status = "pending";
      record(s, `Cancelled ${r.title}`, now);
      break;
    }
    case "save-draft": {
      const r = required(
        s.runs.find((x) => x.id === p.id),
        "Task not found.",
      );
      required(
        r.status === "ready" || r.status === "completed",
        "The draft is not ready.",
      );
      r.draft = String(p.text).slice(0, 20000);
      r.saved = true;
      r.status = "completed";
      r.updatedAt = now;
      const sg = s.suggestions.find((x) => x.id === r.suggestionId);
      if (sg) sg.status = "completed";
      record(s, `Saved a local draft: ${r.title}`, now);
      break;
    }
    case "new-conversation":
      s.conversations.unshift({
        id: p.id || uid(),
        title: "New conversation",
        createdAt: now,
        messages: [],
      });
      break;
    case "conversation-state": {
      const c=required(s.conversations.find(c=>c.id===p.id),"Conversation not found.");
      required(['archive','delete','restore'].includes(p.action),'Choose a conversation action.');
      c.listStatus=p.action==='restore'?null:p.action==='delete'?'deleted':'archived';break;
    }
    case "conversation-title": {
      const c=s.conversations.find(c=>c.id===p.id);if(c&&!c.generatedTitle){c.title=String(p.title).trim().slice(0,70)||c.title;c.generatedTitle=true;}break;
    }
    case "conversation-sleep": {
      const c=required(s.conversations.find(c=>c.id===p.id),"Conversation not found.");c.sleepEnabled=!!p.enabled;break;
    }
    case "chat-sleep-start": {
      const c=required(s.conversations.find(c=>c.id===p.id),"Conversation not found.");
      if(c.pending||c.sleepJobId===p.jobId)break;c.sleepJobId=p.jobId;c.pending={id:p.jobId,model:p.model,effort:p.effort,notes:[],sleep:true};break;
    }
    case "chat-start": {
      let c = s.conversations.find(c => c.id === p.id);
      if (!c) { c = {id:p.id, title:String(p.text).slice(0,48), createdAt:now, messages:[]}; s.conversations.unshift(c); }
      required(!c.pending, "A reply is already in progress.");
      if(!c.messages.length)c.title=String(p.displayText || p.text).trim().slice(0,48);
      c.messages.push({id:uid(), role:"user", text:String(p.text).slice(0,20000), ...(typeof p.displayText==="string"?{displayText:p.displayText.slice(0,20000)}:{}), files:Array.isArray(p.files)?p.files.slice(0,6).map(f=>({name:String(f.name).slice(0,120),characters:Number(f.characters)||0,...(typeof f.preview==='string'&&f.preview.length<=60000&&/^data:image\/webp;base64,[A-Za-z0-9+/]+=*$/.test(f.preview)?{preview:f.preview}:{})})):[], at:now});
      c.pending = {id:p.jobId, model:p.model, effort:p.effort, notes:p.notes || []};
      c.error = null;
      break;
    }
    case "chat-finish": {
      const c = required(s.conversations.find(c => c.id === p.id), "Conversation not found.");
      if(c.pending?.id !== p.jobId) break;
      if(p.text) c.messages.push({id:uid(), role:"assistant", text:String(p.text).slice(0,20000), at:now, model:c.pending.model, effort:c.pending.effort, notes:c.pending.notes, usage:p.usage,agent:p.agent,sleep:!!c.pending.sleep});
      c.pending = null; c.error = p.error || null;
      break;
    }
    case "chat": {
      let c = s.conversations.find((x) => x.id === p.id);
      if (!c) {
        c = {
          id: p.id || uid(),
          title: String(p.text).slice(0, 48),
          createdAt: now,
          messages: [],
        };
        s.conversations.unshift(c);
      }
      const t = String(p.text).trim().slice(0, 4000);
      required(t, "Write a message first.");
      c.title = c.messages.length ? c.title : t.slice(0, 48);
      c.messages.push({ id: uid(), role: "user", text: t, at: now });
      const reply = /sleep|routine|learn/i.test(t)
        ? "The sleep review can combine your notes into a routine. Open Sleep to review the evidence and run the example checks. You decide whether to enable the result."
        : /connect|login|sign in/i.test(t)
          ? "Open Connections to link a example account. This local can pause a task when access expires and resume from its last saved step. It does not access a real account."
          : "I can help you work through this in the local. Choose a suggested task to prepare a draft from example context, or save this message as a memory for the next review. A live model is not connected yet.";
      c.messages.push({
        id: uid(),
        role: "assistant",
        text: reply,
        at: now + 1,
      });
      break;
    }
    case "delete-conversation":
      s.conversations = s.conversations.filter((x) => x.id !== p.id);
      break;
    case "memory": {
      const text = String(p.text || "")
        .trim()
        .slice(0, 4000);
      required(text, "Write a note first.");
      s.memory.unshift({
        id: uid(),
        text,
        source: p.source || "Your note",
        createdAt: now,
        kind: p.kind || "note",
        example: false,
      });
      record(s, "Saved a memory", now);
      break;
    }
    case "delete-memory":
      s.memory = s.memory.filter((x) => x.id !== p.id);
      break;
    case "session-start":
      required(
        !s.sessions.some((x) => x.status === "active"),
        "End the current session first.",
      );
      s.sessions.unshift({
        id: p.id || uid(),
        name: p.name || "Work session",
        mode: p.mode || "notes",
        status: "active",
        startedAt: now,
        notes: [],
        consented: !!p.consented,
        captureOwner: p.captureOwner,
      });
      record(s, "Started a work session", now);
      break;
    case "session-note": {
      const a = required(
        s.sessions.find((x) => x.id === p.id && x.status === "active"),
        "No active session.",
      );
      const t = String(p.text || "")
        .trim()
        .slice(0, 4000);
      required(t, "Write a note first.");
      a.notes.push(t);
      s.memory.unshift({
        id: uid(),
        text: t,
        source: a.name,
        createdAt: now,
        kind: "decision",
        example: false,
      });
      break;
    }
    case "session-end": {
      const a = required(
        s.sessions.find((x) => x.id === p.id),
        "Session not found.",
      );
      a.status = "ended";
      a.endedAt = now;
      record(s, "Ended work session", now);
      break;
    }
    case "sleep": {
      if (s.sleepHistory.some((x) => x.status === "running")) return s;
      required(s.memory.length, "Add a memory before reviewing.");
      s.sleepHistory.unshift({
        id: uid(),
        startedAt: now,
        status: "running",
        inputCount: s.memory.length,
        phase: 0,
        inputs: clone(s.memory),
      });
      record(s, "Started a local sleep review", now);
      break;
    }
    case "cancel-sleep": {
      const review = required(s.sleepHistory.find(x => x.id === p.id && x.status === "running"), "No running review.");
      review.status = "cancelled";
      review.endedAt = now;
      delete review.inputs;
      record(s, "Cancelled sleep review", now);
      break;
    }
    case "skill": {
      const a = required(
        s.skills.find((x) => x.id === p.id),
        "Routine not found.",
      );
      if (p.enabled) required(a.checks.length && a.checks.every(x => x.passed), "Resolve failed checks before approval.");
      a.enabled = !!p.enabled;
      if (a.enabled) a.approvedVersion = a.version;
      record(s, `${a.enabled ? "Enabled" : "Paused"} ${a.name}`, now);
      break;
    }
    default:
      throw new Error("Unknown action.");
  }
  s.revision++;
  return s;
}
function draftFor(s, r) {
  const context = s.memory.map((x) => x.text).join("\n");
  if (r.suggestionId === "weekly-update" || r.suggestionId === "recap")
    return `# Weekly product update\n\n## Shipped\n- Prepared the export bug summary from the example task list.\n- Collected the latest project decisions.\n\n## Next\n- Confirm an owner for the export fix.\n- Review the release checklist before Friday.\n\n## Blocked\n- The export task still needs an owner.\n\n## Notes\nCustomer names are excluded from this draft.\n\n---\nLocal workspace draft. Review against your real project before use.`;
  return `# ${r.title}\n\nThis local draft uses the context you selected.\n\n${
    context
      ? context
          .split("\n")
          .map((x) => "- " + x)
          .join("\n")
      : "No context selected yet."
  }\n\n## Next step\nReview the open decisions and confirm the owner before sharing.\n\n---\nLocal workspace draft. Nothing has been sent.`;
}
export function advanceWorkspace(current, now = Date.now()) {
  const upgraded = upgradeWorkspace(current);
  let s = clone(upgraded),
    changed = upgraded !== current;
  for (const a of s.suggestions) {
    if (a.status === "snoozed" && a.snoozedUntil <= now) {
      a.status = "pending";
      a.snoozedUntil = null;
      changed = true;
    }
  }
  for (const r of s.runs) {
    if (r.status !== "running") continue;
    if (
      r.provider &&
      s.connections.find((x) => x.id === r.provider)?.status !== "connected"
    ) {
      r.status = "blocked";
      r.updatedAt = now;
      record(
        s,
        `Saved progress for ${r.title}. Account access is needed.`,
        now,
      );
      changed = true;
      continue;
    }
    const next = Math.min(4, Math.floor((now - r.startedAt) / 1800));
    if (next > r.checkpoint) {
      for (let i = r.checkpoint; i < next; i++)
        if (!r.receipts.includes(i)) r.receipts.push(i);
      r.checkpoint = next;
      r.updatedAt = now;
      changed = true;
    }
    if (r.checkpoint === 4) {
      r.status = "ready";
      r.draft = draftFor(s, r);
      record(s, `Draft ready: ${r.title}`, now);
      changed = true;
    }
  }
  for (const review of s.sleepHistory) {
    if (review.status !== "running") continue;
    const phase = Math.min(4, Math.floor((now - review.startedAt) / 1800));
    if (phase !== review.phase) {
      review.phase = phase;
      changed = true;
    }
    if (phase === 4) {
      const inputs = (review.inputs || clone(s.memory)).filter(m => s.memory.some(x => x.id === m.id));
      const normalized = text => text.toLowerCase().replace(/\s+/g, " ").trim();
      const seen = new Map();
      const duplicateIds = new Set();
      for (const m of inputs) {
        const key = normalized(m.text);
        if (seen.has(key)) duplicateIds.add(m.id);
        else seen.set(key, m);
      }
      s.memory = s.memory.filter(m => !duplicateIds.has(m.id));
      review.duplicates = duplicateIds.size;
      review.status = "completed";
      review.endedAt = now;
      review.results = [];
      const notes = [...seen.values()];
      const patterns = [
        { key: "weekly-update", name: "Weekly project update", match: /friday|weekly|recap|standup/i },
        { key: "follow-up", name: "Follow-up preparation", match: /follow.up|reply|email/i },
        { key: "release", name: "Release handoff", match: /release|handoff|deploy/i },
        { key: "meeting", name: "Meeting preparation", match: /meeting|agenda/i },
      ];
      for (const pattern of patterns) {
        const evidence = notes.filter(m => pattern.match.test(m.text));
        if (evidence.length < 2) continue;
        const rules = [...new Set(notes.filter(m => ["rule", "preference"].includes(m.kind) || evidence.includes(m)).map(m => m.text))];
        const signature = JSON.stringify({ evidence: evidence.map(m => m.text).sort(), rules: [...rules].sort() });
        const existing = s.skills.find(x => x.key === pattern.key);
        if (existing?.signature === signature) {
          review.results.push({ id: existing.id, name: existing.name, version: existing.version, outcome: "unchanged" });
          continue;
        }
        const skill = {
          id: existing?.id || uid(), key: pattern.key, name: pattern.name,
          description: "Prepare a draft using the saved instructions below. Approval saves this routine; automatic execution is not connected.",
          enabled: false, version: (existing?.version || 0) + 1,
          createdAt: now, signature, sourceIds: evidence.map(m => m.id),
          evidence: evidence.map(m => ({ id: m.id, text: m.text, source: m.source })),
          rules, checks: [
            { name: "At least two distinct supporting notes", passed: evidence.length >= 2 },
            { name: "Every instruction comes from saved context", passed: rules.every(rule => notes.some(m => m.text === rule)) },
            { name: "Output requires review before external action", passed: true },
          ],
          example: evidence.every(m => m.example ?? m.sample),
          previousVersions: existing ? [...(existing.previousVersions || []), { version: existing.version, rules: existing.rules, createdAt: existing.createdAt }].slice(-10) : [],
        };
        s.skills = s.skills.filter(x => x.key !== skill.key);
        s.skills.unshift(skill);
        review.results.push({ id: skill.id, name: skill.name, version: skill.version, outcome: existing ? "updated" : "created" });
      }
      delete review.inputs;
      record(s, `Sleep review finished: ${review.results.length} supported routines, ${review.duplicates} duplicate notes consolidated`, now);
      changed = true;
    }
  }
  // Scheduling is local to a running app. A cloud/background scheduler is not connected.
  if (s.settings.sleepSchedule) {
    const d = new Date(now),
      day = d.toLocaleDateString("en-CA"),
      time = d.toTimeString().slice(0, 5);
    if (
      time >= s.settings.sleepHour &&
      s.lastSleepDay !== day &&
      s.memory.length &&
      !s.sleepHistory.some((x) => x.status === "running")
    ) {
      s = transition(s, { type: "sleep" }, now);
      s.lastSleepDay = day;
      changed = true;
    }
  }
  if (changed) s.revision++;
  return changed ? s : current;
}
export function activeSuggestions(s, now = Date.now()) {
  return s.settings.suggestions
    ? s.suggestions.filter(
        (x) =>
          x.status === "pending" ||
          (x.status === "snoozed" && x.snoozedUntil <= now),
      )
    : [];
}
