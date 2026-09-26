// Deterministic acceptance checks veto a model's completion estimate.
export const hasCompletionEvidence = evidence => Boolean(
  evidence && Array.isArray(evidence.failures) &&
  (evidence.pass === undefined || typeof evidence.pass === 'boolean')
);
export function completionRecord({ verdict, evidence, threshold, attempts, at }) {
  verdict ||= {};
  const valid = verdict.available !== false && Number.isFinite(verdict.p) && verdict.p >= 0 && verdict.p <= 1;
  const failures = Array.isArray(evidence?.failures) ? evidence.failures : [];
  const checksKnown = hasCompletionEvidence(evidence);
  const checksPassed = checksKnown && evidence.pass !== false && failures.length === 0;
  const reasons = [...new Set([
    ...(Array.isArray(verdict.reasons) ? verdict.reasons : []),
    ...failures,
    ...(!checksKnown ? ["Required acceptance evidence is unavailable."] : []),
    ...(checksKnown && !checksPassed && !failures.length ? ["Deterministic acceptance checks failed."] : []),
    ...(!valid ? ["Completion evaluator returned an invalid probability."] : []),
  ])];
  return {
    p: valid ? verdict.p : null,
    threshold,
    passed: valid && verdict.p >= threshold && checksPassed,
    checksPassed,
    checksKnown,
    attempts,
    source: verdict.source,
    reasons,
    tokens: verdict.tokens ?? 0,
    at,
  };
}
