export function normalizeReplayPacket(source) {
  if (typeof source.task !== 'string' || !source.outputSchema) return source;
  const counts = source.history.reduce((counts, record) => ({...counts, [record.role]: (counts[record.role] || 0) + 1}), {});
  return {
    id: 'personal-onboarding-routing', title: 'Reconcile onboarding routing from chronological history',
    history: source.history, goal: source.task,
    input: Object.fromEntries(Object.entries(source).filter(([key]) => !['task', 'history'].includes(key))),
    source: {origin: 'Claude authored requests and actual earlier assistant reports'},
    disclosure: [`This frozen packet supplies ${counts.user || 0} authored requests and ${counts.assistant || 0} actual earlier assistant reports. Its source manifest states any selection limits.`,
      'The output is a reconstructed text-only routing configuration. Its twelve criteria are structural and lexical proxies, not a runnable UI or semantic-quality evaluation.'],
  };
}

export function replayUnits(packet) {
  return packet.history.map(record => ({id: record.id, text: JSON.stringify({role: record.role, timestamp: record.timestamp, text: record.text}),
    pinned: ['user', 'system'].includes(record.role) ? 'historical_user_instruction' : null}));
}

export function attachReplayContext(prompt, currentTask, units) {
  return JSON.stringify({...JSON.parse(prompt), brief: JSON.stringify({task: currentTask, history: units.map(({id, text}) => ({id, ...JSON.parse(text)}))})});
}
