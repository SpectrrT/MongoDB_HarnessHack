// Deterministic acceptance checks veto a model's completion estimate.
export function completionRecord({ verdict, evidence, threshold, attempts, at }) {
  const valid = Number.isFinite(verdict.p) && verdict.p >= 0 && verdict.p <= 1;
  const failures = Array.isArray(evidence?.failures) ? evidence.failures : [];
  const checksPassed = evidence?.pass !== false && failures.length === 0;
  const reasons = [...new Set([
    ...(Array.isArray(verdict.reasons) ? verdict.reasons : []),
    ...failures,
    ...(!checksPassed && !failures.length ? ["Deterministic acceptance checks failed."] : []),
    ...(!valid ? ["Completion evaluator returned an invalid probability."] : []),
  ])];
  return {
    p: valid ? verdict.p : null,
    threshold,
    passed: valid && verdict.p >= threshold && checksPassed,
    checksPassed,
    attempts,
    source: verdict.source,
    reasons,
    tokens: verdict.tokens ?? 0,
    at,
  };
}
