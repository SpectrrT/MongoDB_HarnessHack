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
test("sleep combines duplicate notes and versions a routine without losing approval", () => {
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
  assert.equal(s.skills[0].version, 2);
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
  assert.equal(s.memory[0].example, false);
  s = transition(s, { type: "session-end", payload: { id: "one" } });
  assert.equal(s.sessions[0].status, "ended");
});

test('existing workspaces gain new apps without losing prior work', () => {
  let s = createWorkspace(0);
  s.connections = [{id:'drive', name:'Google Drive', status:'connected'}];
  delete s.overnight;
  s.profile.name = 'Existing user';
  const next = advanceWorkspace(s, 1);
  assert.equal(next.profile.name, 'Existing user');
  assert.equal(next.connections.find(c => c.id === 'drive').status, 'connected');
  assert.equal(next.connections.length, 20);
  assert.deepEqual(next.overnight, []);
  assert.equal(advanceWorkspace(next, 2), next);
});
test('adding an app never grants account access', () => {
  const s = transition(createWorkspace(0), {type:'request-connection', payload:{id:'slack', requested:true}}, 1);
  assert.equal(s.connections.find(c => c.id === 'slack').requested, true);
  assert.equal(s.connections.find(c => c.id === 'slack').status, 'disconnected');
});
test('overnight tasks persist without pretending to execute', () => {
  const payload = {title:'Prepare update', brief:'Include open bugs. Leave out customer names.', deadline:86400000, budget:10000};
  let s = transition(createWorkspace(0), {type:'overnight',payload}, 1);
  assert.equal(s.overnight[0].runner, 'unconfigured');
  s = advanceWorkspace(s, 50000);
  assert.equal(s.overnight[0].tokensUsed, 0);
  assert.equal(s.overnight[0].status, 'queued');
  const id = s.overnight[0].id;
  s = transition(s, {type:'overnight', payload:{id,status:'paused'}}, 50001);
  s = transition(s, {type:'overnight', payload:{id,status:'queued'}}, 50002);
  assert.equal(s.overnight.length, 1);
  s = transition(s, {type:'overnight', payload:{id,status:'cancelled'}}, 50003);
  assert.throws(() => transition(s, {type:'overnight', payload:{id,status:'queued'}}, 50004), /cancelled/);
  assert.throws(() => transition(s, {type:'overnight', payload:{...payload,deadline:0}}, 1), /deadline/);
  assert.throws(() => transition(s, {type:'overnight', payload:{...payload,budget:1}}, 1), /budget/);
});
