// Only prepares text for a user-reviewed form. This does not create or activate a task.
export function routineDraftFromAction(action) {
  if (action?.kind !== 'repeat-work' || !Array.isArray(action.evidence) || !action.evidence.length) return null;
  const sources = action.evidence.slice(0, 5).map(e => `[source:${String(e.id).slice(0, 120)}] ${String(e.timestamp || '').slice(0, 40)}\n${String(e.text || '').slice(0, 450)}`);
  return [
    'Plan a routine for the repeated work in this history.',
    'First confirm the actual task, its inputs, the output I want and which apps it needs. These are window visits, not proof of task contents or a weekly schedule. Ask for missing details.',
    'Prepare a local draft for review. Do not send messages or change external accounts. I will choose a schedule and explicitly activate it after planning.',
    'Recorded evidence:', ...sources,
  ].join('\n\n').slice(0, 4000);
}
