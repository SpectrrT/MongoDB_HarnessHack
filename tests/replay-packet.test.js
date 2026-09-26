import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeReplayPacket, replayUnits, attachReplayContext} from '../scripts/lib/replay-packet.mjs';

test('normalizing chronological packets preserves all supplied model fields and exact history', () => {
  const source = {packetVersion: 1, task: 'Reconcile current requirements', boundaries: ['No external actions'],
    outputSchema: {fields: ['state', 'citations']}, history: [
      {id: 'old', role: 'user', timestamp: '2026-01-01', text: 'Old "quoted" requirement\nwith Unicode café.'},
      {id: 'latest', role: 'assistant', timestamp: '2026-01-02', text: 'Observed correction \\ exact bytes.'},
    ]};
  const before = JSON.stringify(source), packet = normalizeReplayPacket(source), units = replayUnits(packet);
  const rendered = JSON.parse(attachReplayContext(JSON.stringify({instruction: 'Trusted file protocol', requiredChecks: [{path: 'artifact.json'}]}), {goal: packet.goal, input: packet.input}, units));
  assert.equal(rendered.instruction, 'Trusted file protocol');
  assert.deepEqual(rendered.requiredChecks, [{path: 'artifact.json'}]);
  const brief = JSON.parse(rendered.brief);
  assert.deepEqual(brief.history, source.history);
  assert.equal(brief.task.goal, source.task);
  assert.deepEqual(brief.task.input, {packetVersion: source.packetVersion, boundaries: source.boundaries, outputSchema: source.outputSchema});
  assert.equal(units[0].pinned, 'historical_user_instruction');
  assert.equal(JSON.stringify(source), before);
});

test('trusted replay role metadata is explicit and preserves exact records and mandatory instructions', () => {
  const packet = {history: ['user', 'system', 'developer', 'assistant'].map((role, i) => ({id: String(i), role, timestamp: '2026-01-01', text: 'Exact "text"\nwith Unicode café.'}))};
  const opaque = replayUnits(packet), typed = replayUnits(packet, {typedConversation: true});
  assert.deepEqual(opaque.map(u => u.text), typed.map(u => u.text));
  assert.ok(opaque.every(u => u.conversation === undefined));
  for (const [index, record] of typed.entries()) {
    assert.deepEqual(record.conversation, {schemaVersion: 1, role: packet.history[index].role});
    assert.equal(Boolean(record.pinned), index < 3);
  }
});
