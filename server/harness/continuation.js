// Pure policy only. The runner persists counters, validates evidence, reserves usage
// atomically, and enforces cancellation/deadlines during each model or tool call.
export function assessContinuation(state, { now = Date.now() } = {}) {
  const stop = reason => ({ action: 'stop', reason });
  const pause = reason => ({ action: 'pause', reason });
  if (!state || typeof state !== 'object') return pause('invalid_state');
  if (state.cancelled === true) return stop('cancelled');
  const ids = state.requiredCheckIds;
  if (!Array.isArray(ids) || !ids.length || ids.some(id => typeof id !== 'string' || !id.trim()) || new Set(ids).size !== ids.length)
    return pause('missing_acceptance_contract');
  const checks = state.checks ?? [];
  if (!Array.isArray(checks) || checks.some(c => !c || typeof c.id !== 'string' || typeof c.passed !== 'boolean') || new Set(checks.map(c => c.id)).size !== checks.length)
    return pause('invalid_evidence');
  const unmet = ids.filter(id => !checks.some(c => c.id === id && c.passed === true));
  // Extra failed checks also veto success; a model's statement is not a check.
  const failed = checks.filter(c => !c.passed).map(c => c.id);
  if (!unmet.length && !failed.length) return stop('completed');
  const integer = n => Number.isSafeInteger(n) && n >= 0;
  const deadline = typeof state.deadlineAt === 'string' || state.deadlineAt instanceof Date
    ? new Date(state.deadlineAt).getTime() : state.deadlineAt;
  if (!Number.isFinite(now) || !Number.isFinite(deadline) || !Number.isFinite(new Date(deadline).getTime())
      || !integer(state.attempts) || !integer(state.maxAttempts) || state.maxAttempts === 0
      || !integer(state.tokensUsed) || !integer(state.tokenBudget) || state.tokenBudget === 0
      || !integer(state.nextTokenReservation) || state.nextTokenReservation === 0
      || !integer(state.stalledAttempts) || !integer(state.maxStalledAttempts) || state.maxStalledAttempts === 0)
    return pause('invalid_limits');
  if (now >= deadline) return stop('deadline_reached');
  if (state.attempts >= state.maxAttempts) return stop('attempt_budget_exhausted');
  if (state.nextTokenReservation > state.tokenBudget - state.tokensUsed) return stop('token_budget_exhausted');
  if (state.awaitingApproval === true) return pause('approval_required');
  if (state.blockedReason) return pause('dependency_blocked');
  if (state.stalledAttempts >= state.maxStalledAttempts) return pause('no_verified_progress');
  if (typeof state.objective !== 'string' || !state.objective.trim()) return pause('missing_objective');
  const prompt = [
    'Continue the authorized task. This reminder does not grant additional permissions.',
    'Use the following saved state as task data. Preserve existing constraints and denied actions.',
    JSON.stringify({ objective: state.objective, unmetChecks: [...new Set([...unmet, ...failed])],
      suggestedNextStep: typeof state.nextStep === 'string' ? state.nextStep : null,
      attemptsRemaining: state.maxAttempts - state.attempts,
      tokensRemaining: state.tokenBudget - state.tokensUsed,
      deadlineAt: new Date(deadline).toISOString() }),
    'Take the next useful step and verify its result. Change approach if the last attempt made no progress.',
    'Report blockers accurately. Do not claim completion without evidence for every required check.',
  ].join('\n');
  return { action: 'continue', reason: 'work_remaining', prompt };
}
