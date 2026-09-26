import test from "node:test";
import assert from "node:assert/strict";
import {
  createWorkspace,
  transition,
  advanceWorkspace,
  activeSuggestions,
} from "../shared/workspace.js";
test("draft resumes from checkpoint and never repeats receipts", () => {
  let s = createWorkspace(0);
  s = transition(s, { type: "connect", payload: { id: "drive" } }, 0);
  s = transition(s, { type: "start-run", payload: { id: "weekly-update" } }, 0);
  const id = s.runs[0].id;
  s = advanceWorkspace(s, 1900);
  assert.equal(s.runs[0].checkpoint, 1);
  s = transition(s, { type: "expire", payload: { id: "drive" } }, 2000);
  s = advanceWorkspace(s, 2100);
  assert.equal(s.runs[0].status, "blocked");
  s = transition(s, { type: "connect", payload: { id: "drive" } }, 2200);
  s = transition(s, { type: "resume-run", payload: { id } }, 2300);
  s = advanceWorkspace(s, 10000);
  assert.equal(s.runs[0].status, "ready");
  assert.deepEqual(s.runs[0].receipts, [0, 1, 2, 3]);
  assert.match(s.runs[0].draft, /Customer names are excluded/);
  const n = transition(
    s,
    { type: "start-run", payload: { id: "weekly-update" } },
    11000,
  );
  assert.equal(n.runs.length, 1);
});
test("sleep combines duplicate notes and preserves unchanged approved routines", () => {
  let s = createWorkspace(0);
  s = transition(s, { type: "memory", payload: { text: s.memory[0].text } }, 1);
  s = transition(s, { type: "sleep" }, 2);
  s = advanceWorkspace(s, 9000);
  assert.equal(s.memory.length, 3);
  assert.equal(s.sleepHistory[0].duplicates, 1);
  assert.equal(s.skills[0].enabled, false);
  s = transition(
    s,
    { type: "skill", payload: { id: s.skills[0].id, enabled: true } },
    10000,
  );
  s = transition(s, { type: "sleep" }, 11000);
  s = advanceWorkspace(s, 20000);
  assert.equal(s.skills.length, 1);
  assert.equal(s.skills[0].version, 1);
  assert.equal(s.skills[0].enabled, true);
});
test("snoozed suggestions return only when due", () => {
  let s = createWorkspace(0);
  s = transition(
    s,
    { type: "suggestion", payload: { id: "weekly-update", status: "snoozed" } },
    1,
  );
  assert.equal(activeSuggestions(s, 100).length, 7);
  s = advanceWorkspace(s, 86400002);
  assert.equal(activeSuggestions(s, 86400002).length, 8);
});
test("cannot save an unfinished task or resume without a connection", () => {
  let s = createWorkspace(0);
  s = transition(s, { type: "start-run", payload: { id: "weekly-update" } }, 0);
  s = advanceWorkspace(s, 2000);
  const id = s.runs[0].id;
  assert.throws(
    () => transition(s, { type: "resume-run", payload: { id } }, 2001),
    /Reconnect/,
  );
  assert.throws(
    () => transition(s, { type: "save-draft", payload: { id, text: "fake" } }),
    /not ready/,
  );
});
test("notes session has explicit lifecycle and stores decisions", () => {
  let s = createWorkspace();
  s = transition(s, {
    type: "session-start",
    payload: { id: "one", mode: "notes" },
  });
  assert.throws(
    () => transition(s, { type: "session-start" }),
    /End the current/,
  );
  s = transition(s, {
    type: "session-note",
    payload: { id: "one", text: "Exclude the customer name." },
  });
  assert.equal(s.memory[0].sample, false);
  s = transition(s, { type: "session-end", payload: { id: "one" } });
  assert.equal(s.sessions[0].status, "ended");
});

test("sleep only creates supported candidates and reapproves changed versions", () => {
  let s = createWorkspace(0);
  s = transition(s, { type: "sleep" }, 1);
  s = advanceWorkspace(s, 8000);
  const id = s.skills[0].id;
  s = transition(s, { type: "skill", payload: { id, enabled: true } }, 8001);
  s = transition(s, { type: "memory", payload: { text: "Weekly updates must include delivery dates." } }, 8002);
  s = transition(s, { type: "sleep" }, 8003);
  s = advanceWorkspace(s, 16000);
  assert.equal(s.skills[0].version, 2);
  assert.equal(s.skills[0].enabled, false);
  assert.equal(s.skills[0].previousVersions.length, 1);
  assert.equal(s.sleepHistory[0].results[0].outcome, "updated");
  s = createWorkspace(0);
  s.memory = [{ id: "a", text: "Buy milk", source: "Note", kind: "note" }];
  s = transition(s, { type: "sleep" }, 1);
  s = advanceWorkspace(s, 8000);
  assert.equal(s.skills.length, 0);
});
test("cancelled reviews do not mutate memory or create skills", () => {
  let s = createWorkspace(0);
  s = transition(s, { type: "sleep" }, 1);
  const original = structuredClone(s.memory);
  s = transition(s, { type: "cancel-sleep", payload: { id: s.sleepHistory[0].id } }, 2);
  s = advanceWorkspace(s, 9000);
  assert.deepEqual(s.memory, original);
  assert.equal(s.skills.length, 0);
  assert.equal(s.sleepHistory[0].status, "cancelled");
});
test("review snapshots exclude later notes and respect deleted memories", () => {
  let s = createWorkspace(0);
  s = transition(s, { type: "sleep" }, 1);
  s = transition(s, { type: "delete-memory", payload: { id: "m1" } }, 2);
  s = transition(s, { type: "memory", payload: { text: "Weekly update includes dates" } }, 3);
  s = advanceWorkspace(s, 9000);
  assert.equal(s.skills.length, 0);
  assert.equal(s.memory.some(m => m.text === "Weekly update includes dates"), true);
});
test("scheduled reviews run once per local day", () => {
  let s = createWorkspace(0);
  s.settings.sleepSchedule = true;
  s.settings.sleepHour = "00:00";
  const now = new Date(2026, 8, 25, 12).getTime();
  s = advanceWorkspace(s, now);
  s = advanceWorkspace(s, now + 9000);
  s = advanceWorkspace(s, now + 20000);
  assert.equal(s.sleepHistory.length, 1);
  assert.equal(s.sleepHistory[0].status, "completed");
});
