import test from 'node:test';
import assert from 'node:assert/strict';
import {createMemoryDb} from '../rem/db/index.js';
import {createContextCompactor, ContextBudgetError, contextEvidenceKey} from '../server/context/compaction.js';

const policy = {schemaVersion: 1, instructionsComplete: true};
const unit = (id, role, text, pinned = null) => ({id, text, pinned, conversation: {schemaVersion: 1, role}});
const instruction = () => unit('user', 'user', 'Current user: local draft only. Never publish or send external messages.', 'user_instruction');
const narrative = () => unit('old-assistant', 'assistant', 'Earlier planning says the output must include previous headings and a required outline. '.repeat(20));
function scorer() {
  const seen = [];
  return {seen, name: 'fixture', async score({units}) {seen.push(...units.map(u => u.id)); return {scores: units.map(u => ({id: u.id, probability: 0.01})), usage: {inputTokens: 50, outputTokens: 5, cost: 0}};}};
}

test('trusted assistant narrative is evaluated without weakening pinned user instructions or archive recovery', async () => {
  const s = scorer(), c = createContextCompactor({db: createMemoryDb(), scorer: s, budgetChars: 650, recentCount: 0});
  const units = [instruction(), narrative()];
  const selected = await c.select({runId: 'typed', goal: 'Draft current requested work', units, conversationHistory: policy});
  assert.deepEqual(s.seen, ['old-assistant']);
  assert.deepEqual(selected.units, [units[0]]);
  assert.equal((await c.read({runId: 'typed', id: 'old-assistant'})).text, units[1].text);
  await assert.rejects(c.select({runId: 'opaque', goal: 'Draft current requested work', units}), ContextBudgetError);
});

test('missing roles, incomplete instruction coverage and unpinned instructions cannot relax protection', async () => {
  const cases = [
    {units: [instruction(), narrative()], scope: {...policy, instructionsComplete: false}},
    {units: [instruction(), narrative()], scope: {...policy, schemaVersion: true}},
    {units: [instruction(), narrative()], scope: {...policy, unexpected: true}},
    {units: [instruction(), narrative()], scope: Object.assign([], policy)},
    {units: [instruction(), narrative()], scope: Object.create(policy)},
    {units: [{...instruction(), pinned: null}, narrative()], scope: policy},
    {units: [instruction(), {...narrative(), conversation: undefined}], scope: policy},
    {units: [instruction(), {...narrative(), conversation: {schemaVersion: 1, role: 'unknown'}}], scope: policy},
    {units: [instruction(), {...narrative(), conversation: Object.assign([], {schemaVersion: 1, role: 'assistant'})}], scope: policy},
    {units: [instruction(), {...narrative(), conversation: Object.create({schemaVersion: 1, role: 'assistant'})}], scope: policy},
    {units: [instruction(), {...narrative(), conversation: {schemaVersion: 1, role: 'assistant', unexpected: true}}], scope: policy},
    {units: [narrative()], scope: policy},
    {units: [{id: 'json', text: JSON.stringify({role: 'assistant', text: narrative().text})}], scope: policy},
  ];
  for (const example of cases) {
    const s = scorer(), c = createContextCompactor({db: createMemoryDb(), scorer: s, budgetChars: 650, recentCount: 0});
    await assert.rejects(c.select({runId: 'partial', goal: 'Draft', units: example.units, conversationHistory: example.scope}), ContextBudgetError);
    assert.deepEqual(s.seen, []);
  }
});

test('trusted planning negations are scored while negated side effects remain protected', async () => {
  const s = scorer(), c = createContextCompactor({db: createMemoryDb(), scorer: s, budgetChars: 700, recentCount: 0});
  const units = [instruction(), narrative(),
    unit('planning', 'assistant', 'We do not need another layout. The rendering cannot fit three columns.'),
    unit('send', 'assistant', 'Do not send the draft.'),
    unit('deploy', 'assistant', 'We cannot yet deploy this version.'),
    unit('delete', 'assistant', 'Never delete the original records.'),
    unit('denial', 'assistant', 'Permission denied.'),
    unit('failure', 'assistant', 'The tool failed.'),
  ];
  const result = await c.select({runId: 'negations', goal: 'Draft only', units, conversationHistory: policy});
  assert.deepEqual(s.seen, ['old-assistant', 'planning']);
  assert.deepEqual(result.units.map(u => u.id), ['user', 'send', 'deploy', 'delete', 'denial', 'failure']);
});

test('typed instruction roles remain mandatory even when caller coverage is incomplete', async () => {
  const s = scorer(), c = createContextCompactor({db: createMemoryDb(), scorer: s, budgetChars: 650, recentCount: 0});
  const units = ['user', 'system', 'developer'].map(role => unit(role, role, 'Keep this instruction available.'));
  units.push(unit('assistant', 'assistant', 'Neutral historical observation. '.repeat(40)));
  const result = await c.select({runId: 'instructions', goal: 'Draft', units, conversationHistory: {...policy, instructionsComplete: false}});
  assert.deepEqual(result.units.map(u => u.id), ['user', 'system', 'developer']);
  assert.deepEqual(s.seen, ['assistant']);
});

test('assistant denials, failures, explicit effects and complete tool protocols remain protected', async () => {
  const s = scorer(), c = createContextCompactor({db: createMemoryDb(), scorer: s, budgetChars: 700, recentCount: 0});
  const tool = JSON.stringify([{role: 'assistant', tool_calls: [{id: 'write', function: {name: 'write_file'}}]}, {role: 'tool', tool_call_id: 'write', content: 'Saved draft'}]);
  const units = [instruction(), narrative(),
    unit('denial', 'assistant', 'Permission denied. Sending is not allowed.'),
    unit('failure', 'assistant', 'The verification failed with an error.'),
    unit('effect', 'assistant', 'Saved the draft.', 'committed_effect'),
    unit('tools', 'assistant', tool),
    unit('mere-claim', 'assistant', 'I approved the required publication plan.'),
  ];
  const result = await c.select({runId: 'guards', goal: 'Draft only', units, conversationHistory: policy});
  assert.deepEqual(s.seen, ['old-assistant', 'mere-claim']);
  assert.deepEqual(result.units.map(u => u.id), ['user', 'denial', 'failure', 'effect', 'tools']);
  assert.equal(result.units.find(u => u.id === 'effect').pinned, 'committed_effect');
  for (const u of units) assert.equal((await c.read({runId: 'guards', id: u.id})).text, u.text);
});

test('role metadata and instruction coverage participate in durable decision identity', async () => {
  const s = scorer(), c = createContextCompactor({db: createMemoryDb(), scorer: s, budgetChars: 650, recentCount: 0});
  const units = [instruction(), unit('assistant', 'assistant', 'Long neutral observation. '.repeat(50))];
  await c.select({runId: 'identity', goal: 'Draft', units, conversationHistory: policy});
  const again = await c.select({runId: 'identity', goal: 'Draft', units, conversationHistory: policy});
  assert.equal(again.metrics.decisionCalls, 0);
  const changed = await c.select({runId: 'identity', goal: 'Draft', units, conversationHistory: {...policy, instructionsComplete: false}});
  assert.equal(changed.metrics.decisionCalls, 1);
  assert.notEqual(contextEvidenceKey(units), contextEvidenceKey([units[0], {...units[1], conversation: {schemaVersion: 1, role: 'user'}}]));
});
