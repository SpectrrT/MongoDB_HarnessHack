import test from 'node:test';
import assert from 'node:assert/strict';
import { sleepReviewText } from '../shared/sleep-review-text.js';
const report = 'Sleep produced a local candidate draft.\n\nGoal: Explore: Draft an index proposal.\n\nHypotheses are unverified: [{"label":"Unverified hypothesis","text":"An index may help."}]\n\nFile checks: solution.md: passed; evidence.md: passed\n\nThese checks verify the declared file criteria, not semantic correctness or completion of the broader goal.\n\nOutcome: completed';
test('saved Sleep report becomes readable without modifying its evidence', () => {
  const result = sleepReviewText(report);
  assert.match(result, /Your draft is ready to review/);
  assert.match(result, /still unverified: An index may help/);
  assert.match(result, /solution.md: passed; evidence.md: passed/);
  assert.match(result, /do not prove the proposed solution is correct/);
  assert.doesNotMatch(result, /\[\{|Outcome: completed|Goal: Explore:/);
  assert.match(report, /"label"/);
});
test('paused outcomes and failed file or counter checks remain visible', () => {
  const source = 'Sleep paused before verifying the candidate.\n\nFile checks: solution.md: missing required text\n\nOffline counter execution: {"passed":false,"observedStates":[0,1,1],"checks":[{"name":"second increment","passed":false,"error":"Expected 2, received 1"}]}\n\nOutcome: Budget exhausted';
  const result = sleepReviewText(source);
  assert.match(result, /Sleep paused/); assert.match(result, /missing required text/);
  assert.match(result, /did not pass/); assert.match(result, /Expected 2, received 1/); assert.match(result, /Budget exhausted/);
  assert.doesNotMatch(result, /\[\{|"passed"/);
});
test('unrecognized model output and artifact links remain verbatim', () => {
  const original = 'Proposed index: {tenantId: 1}. [Open solution](artifact:solution.md)';
  assert.equal(sleepReviewText(original), original);
});
