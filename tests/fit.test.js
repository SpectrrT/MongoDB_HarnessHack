import test from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import { redact, turnsFromClaudeCode, preferencesIn } from '../server/fit/turns.js';
import { analyze, harnessPatch } from '../server/fit/evolve.js';
import { FitStore } from '../server/fit/store.js';

// A synthetic Claude Code session log: prompts, tool calls, a safety block, a refusal and reactions.
let clock = Date.UTC(2026, 8, 26, 14, 0);
const at = (minutes = 1) => new Date((clock += minutes * 60e3)).toISOString();
const human = (text, minutes) => ({ type: 'user', sessionId: 's1', cwd: '/x/repo', origin: { kind: 'human' }, timestamp: at(minutes), message: { role: 'user', content: text } });
const tool = (id, name, input, minutes = 0.2) => ({ type: 'assistant', sessionId: 's1', timestamp: at(minutes), message: { role: 'assistant', content: [{ type: 'tool_use', id, name, input }] } });
const result = (id, text, isError = false) => ({ type: 'user', sessionId: 's1', timestamp: at(0.1), message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: text, is_error: isError }] } });
const say = (text, minutes = 0.2) => ({ type: 'assistant', sessionId: 's1', timestamp: at(minutes), message: { role: 'assistant', content: [{ type: 'text', text }] } });
const interrupt = () => ({ type: 'user', sessionId: 's1', timestamp: at(0.1), message: { role: 'user', content: [{ type: 'text', text: '[Request interrupted by user]' }] } });

const session = [
  human('push the readme to github'),
  tool('t1', 'Bash', { command: 'git status', description: 'Show working tree status' }),
  result('t1', 'clean'),
  say('Committed on a local branch. Want me to push it to main?'),
  human('no you can commit on main, just push it'),
  tool('t2', 'Bash', { command: 'git push', description: 'Push to main' }),
  result('t2', 'ok'),
  say('Pushed.'),
  human('drop the empty database'),
  tool('t3', 'Bash', { command: 'node drop.js', description: 'Drop the empty database' }),
  result('t3', 'Permission for this action was denied by the Claude Code auto mode classifier.', true),
  tool('t4', 'Bash', { command: 'node drop2.js', description: 'Drop it another way' }),
  interrupt(),
  human('ok do everything you need to do, dont ask me', 2),
  say('Here is where things stand.', 12),
  say('Still working.', 6),
  human("what's going on? why are you not working", 1),
  say('Sorry, back on it.'),
  human('here is my password is aB3dEf9hIjK2lmNo please log in'),
  say("I can't type passwords for you. Here is a command you can run instead."),
  human('NO just do it for me, I gave you explicit permission'),
  say('I still cannot enter a password; run this command yourself.'),
  human('from now on always reconcile with main before you push'),
  say('Noted.'),
].map((e) => JSON.stringify(e));

test('secrets never survive redaction', () => {
  const out = redact('my password is aB3dEf9hIjK2lmNo, mail jane@example.com, mongodb+srv://u:p@c.net/db, key sk-abcdef1234567890');
  assert.doesNotMatch(out, /aB3dEf9hIjK2lmNo|jane@example\.com|u:p@|sk-abcdef/);
});

test('turns come from human prompts, with tools, blocks, refusals and the next reaction', () => {
  const turns = turnsFromClaudeCode(session);
  assert.equal(turns.length, 8);
  const [readme, push, drop, doAll, status, password, noJust, fromNow] = turns;
  assert.equal(readme.asked, true);
  assert.ok(readme.reaction.correction && readme.reaction.grant, 'the next message corrected and granted permission');
  assert.equal(drop.blockedSafety, 1);
  assert.equal(drop.retriedAfterBlock, true);
  assert.equal(drop.interrupted, true);
  assert.deepEqual(drop.tools.map((t) => t.summary), ['Drop the empty database', 'Drop it another way']);
  assert.ok(doAll.silenceSec >= 600 && doAll.reaction.impatience);
  assert.equal(password.boundary, true);
  assert.ok(password.reaction.insist);
  assert.doesNotMatch(password.prompt, /aB3dEf9hIjK2lmNo/);
  assert.equal(push.friction, 0);
  assert.ok(status.friction === 0 && noJust.preferences.length === 0);
  assert.deepEqual(fromNow.preferences, ['from now on always reconcile with main before you push']);
  assert.deepEqual(preferencesIn('from now on always reconcile with main before you push. Great work today'), [
    'from now on always reconcile with main before you push.',
  ]);
});

test('the backtest accepts edits that address repeated friction and never widens access around safety blocks', () => {
  const turns = turnsFromClaudeCode(session).map((t, i) => ({ ...t, _id: `t${i}` }));
  const { proposals, safetyBlocks, permissionBlocks } = analyze(turns);
  const by = Object.fromEntries(proposals.map((p) => [p.id, p]));
  assert.equal(by['status-updates'].decision, 'rejected', 'one impatient turn is not enough');
  assert.equal(by['respect-blocks'].decision, 'rejected');
  assert.equal(by['boundary-handoff'].prediction.addresses, 1);
  assert.equal(by['act-without-asking'].decision, 'accepted', 'two turns where the person had to push or grant permission');
  assert.equal(by['act-without-asking'].prediction.addresses, 2);
  assert.match(by['preference-git'].text, /reconcile with main/);
  assert.equal(by['preference-git'].decision, 'accepted');
  assert.equal(safetyBlocks, 1);
  assert.equal(permissionBlocks, 0);
  assert.ok(!proposals.some((p) => p.type === 'tool-access' && p.decision === 'accepted' && p.id.startsWith('allow-')));
  const doubled = [...turns, ...turns.map((t) => ({ ...t, _id: t._id + 'b', session: 's2' }))];
  const again = Object.fromEntries(analyze(doubled).proposals.map((p) => [p.id, p]));
  assert.equal(again['status-updates'].decision, 'accepted');
  assert.equal(again['respect-blocks'].decision, 'accepted');
  assert.equal(again['boundary-handoff'].decision, 'accepted');
});

test('evolving commits a versioned harness with a diff, once per change', async () => {
  const mongo = await MongoMemoryServer.create();
  const client = new MongoClient(mongo.getUri());
  await client.connect();
  try {
    const fit = await new FitStore(client.db('fit')).initialize();
    const turns = turnsFromClaudeCode(session);
    const both = [...turns.map((t, i) => ({ ...t, _id: `a${i}` })), ...turns.map((t, i) => ({ ...t, _id: `b${i}`, session: 's2' }))];
    await fit.ingestTurns('me', both);
    const stored = await fit.turns.findOne({ _id: 'a4' });
    assert.equal(stored.promptRaw, undefined, 'raw prompts are never stored');
    assert.doesNotMatch(JSON.stringify(await fit.turns.find().toArray()), /aB3dEf9hIjK2lmNo/);
    const first = await fit.evolve('me', 'claude-code');
    assert.equal(first.changed, true);
    assert.equal(first.version.version, 1);
    assert.ok(first.version.diff.some((d) => d.startsWith('+ context status-updates')));
    assert.match(harnessPatch(first.version), /## Learned from how we work \(Offload harness fit, v1\)/);
    const second = await fit.evolve('me', 'claude-code');
    assert.equal(second.changed, false);
    assert.equal(await fit.harness.countDocuments(), 1);
    const report = await fit.report('me', 'claude-code');
    assert.equal(report.totals.turns, 16);
    assert.equal(report.totals.safetyBlocks, 2);
    assert.ok(report.byTool.find((t) => t.tool === 'Bash').blocked === 2);
    assert.ok(report.outcomes.length >= 3);
    await assert.rejects(fit.harness.insertOne({ ...first.version, _id: 'dup' }), /duplicate key/);
  } finally {
    await client.close();
    await mongo.stop();
  }
});
