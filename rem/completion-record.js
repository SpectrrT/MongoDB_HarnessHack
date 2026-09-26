// Deterministic acceptance checks veto a model's completion estimate.
export const hasCompletionEvidence = evidence => Boolean(
  evidence && Array.isArray(evidence.failures) &&
  (evidence.pass === undefined || typeof evidence.pass === 'boolean')
);

const tokenCount = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
export const knownTokenSubtotal = usage => (tokenCount(usage?.inputTokens) ?? 0) +
  (tokenCount(usage?.outputTokens) ?? 0) + (tokenCount(usage?.unattributedTokens) ?? 0);

// A total-only receipt does not establish an input/output split. Partial receipts still
// contribute their known subtotal, while the flags say whether more usage may be missing.
export function completionReceipt(verdict = {}) {
  const stub = verdict.source === 'stub';
  const inputTokens = tokenCount(verdict.inputTokens) ?? (stub ? 0 : null);
  const outputTokens = tokenCount(verdict.outputTokens) ?? (stub ? 0 : null);
  const reportedTotal = tokenCount(verdict.tokens);
  const splitTotal = knownTokenSubtotal({inputTokens, outputTokens});
  const hasSplit = inputTokens !== null || outputTokens !== null;
  const tokens = reportedTotal !== null ? Math.max(reportedTotal, splitTotal) : hasSplit ? splitTotal : null;
  const cost = Number.isFinite(verdict.cost) && verdict.cost >= 0 ? verdict.cost : stub ? 0 : null;
  const contradictoryTotal = reportedTotal !== null && reportedTotal < splitTotal;
  return {
    inputTokens, outputTokens, tokens,
    unattributedTokens: tokens === null ? null : tokens - splitTotal,
    cost,
    usageKnown: verdict.usageKnown !== false && !contradictoryTotal &&
      (reportedTotal !== null || (inputTokens !== null && outputTokens !== null)),
    costKnown: verdict.costKnown !== false && cost !== null,
  };
}

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
    available: valid,
    reasons,
    ...completionReceipt(verdict),
    at,
  };
}
