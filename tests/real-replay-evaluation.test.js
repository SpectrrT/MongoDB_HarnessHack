import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeReplayEvaluation} from '../scripts/lib/real-replay-evaluation.mjs';

test('a nonzero count in a failed Python evaluation is never a passing artifact', () => {
  assert.deepEqual(normalizeReplayEvaluation({passed: 11, total: 12, allPassed: false, checks: {shape: true, dependency: false}}, true),
    {passed: false, checksPassed: 11, checksTotal: 12, failures: ['dependency']});
  assert.deepEqual(normalizeReplayEvaluation({passed: 12, total: 12, allPassed: true, checks: {shape: true}}, true),
    {passed: true, checksPassed: 12, checksTotal: 12, failures: []});
});

test('malformed or contradictory evaluator statuses cannot produce a success claim', () => {
  for (const value of [
    {passed: true, checksPassed: true, checksTotal: 1, failures: []},
    {passed: 1, checksPassed: 1, checksTotal: 1, failures: []},
    {passed: true, checksPassed: 0, checksTotal: 1, failures: []},
    {passed: false, checksPassed: 1, checksTotal: 1, failures: []},
    {passed: true, checksPassed: 1, checksTotal: 1, failures: ['contradiction']},
  ]) assert.throws(() => normalizeReplayEvaluation(value));
  assert.throws(() => normalizeReplayEvaluation({passed: 1, total: 1, allPassed: true, checks: {shape: 1}}, true));
  assert.deepEqual(normalizeReplayEvaluation({passed: false, checksPassed: 0, checksTotal: 31, failures: ['invalid-json']}),
    {passed: false, checksPassed: 0, checksTotal: 31, failures: ['invalid-json']});
});
