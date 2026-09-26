export function normalizeReplayEvaluation(value, python = false) {
  const passed = python ? value?.allPassed : value?.passed;
  const checksPassed = python ? value?.passed : value?.checksPassed;
  const checksTotal = python ? value?.total : value?.checksTotal;
  if (typeof passed !== 'boolean' || !Number.isSafeInteger(checksPassed) || !Number.isSafeInteger(checksTotal) || checksTotal < 1 || checksPassed < 0 || checksPassed > checksTotal || passed !== (checksPassed === checksTotal)) throw Error('Invalid evaluator counts or pass status.');
  if (python && value.checks !== undefined && (!value.checks || typeof value.checks !== 'object' || Array.isArray(value.checks) || Object.values(value.checks).some(pass => typeof pass !== 'boolean'))) throw Error('Invalid evaluator check values.');
  if (python && value.checks !== undefined && (Object.keys(value.checks).length !== checksTotal || Object.values(value.checks).filter(Boolean).length !== checksPassed)) throw Error('Evaluator check counts disagree with its summary.');
  const failures = python ? Object.entries(value.checks || {}).filter(([, pass]) => !pass).map(([name]) => name) : value.failures;
  if (!Array.isArray(failures) || failures.some(failure => typeof failure !== 'string') || (passed && failures.length)) throw Error('Invalid evaluator failures.');
  return {passed, checksPassed, checksTotal, failures};
}
