const valid = value => Number.isFinite(value) && value >= 0;
export function summarizeSnapshots(cases, {answerModel, repeats = 1, expectedCases = cases.length} = {}) {
  const usage = rows => ({
    measuredTokens: rows.reduce((n, row) => n + (valid(row?.inputTokens) ? row.inputTokens : 0) + (valid(row?.outputTokens) ? row.outputTokens : 0), 0),
    known: rows.every(row => row?.usageKnown !== false && valid(row?.inputTokens) && valid(row?.outputTokens)),
    measuredCost: rows.reduce((n, row) => n + (valid(row?.cost ?? row?.reportedCost) ? (row.cost ?? row.reportedCost) : 0), 0),
    costKnown: rows.every(row => row?.costKnown !== false && valid(row?.cost ?? row?.reportedCost)),
  });
  const baselineRows = cases.flatMap(row => row.repeated?.baseline || (row.baseline ? [row.baseline] : []));
  const compactedRows = cases.flatMap(row => row.repeated?.compacted || (row.compacted ? [row.compacted] : []));
  const decisionRows = cases.flatMap(row => [row.metrics, row.restartMetrics, row.failureMetrics, ...(row.repeated?.decisionMetrics || [])].filter(Boolean));
  const baseline = usage(baselineRows), compacted = usage(compactedRows), decisions = usage(decisionRows);
  const complete = Boolean(answerModel) && cases.length === expectedCases && cases.every(row => !row.error && !row.answerError) &&
    baselineRows.length === expectedCases * repeats && compactedRows.length === expectedCases * repeats;
  const baselineTotal = complete && baseline.known ? baseline.measuredTokens : null;
  const compactedTotal = complete && compacted.known && decisions.known ? compacted.measuredTokens + decisions.measuredTokens : null;
  return {complete, expectedAnswersPerPath: expectedCases * repeats,
    baselinePassed: baselineRows.filter(row => row.pass).length, compactedPassed: compactedRows.filter(row => row.pass).length,
    baseline, compacted, decisions, baselineTotal, compactedTotal,
    tokenSavingsPercent: baselineTotal > 0 && compactedTotal !== null ? Number((100 * (1 - compactedTotal / baselineTotal)).toFixed(2)) : null,
    combinedCompactedCost: complete && compacted.costKnown && decisions.costKnown ? compacted.measuredCost + decisions.measuredCost : null};
}
