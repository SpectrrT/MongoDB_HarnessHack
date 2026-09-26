import { CONNECTIONS } from './connections.js';
// Additive migration: preserve saved work and connection choices.
export function upgradeWorkspace(state) {
  const missing = CONNECTIONS.filter(c => !state.connections.some(x => x.id === c.id));
  if (!missing.length && Array.isArray(state.overnight) && state.copyVersion === 1) return state;
  const clean = value => String(value).replace(/\b(?:s[a]mple|d[e]mo)\b/gi, 'example');
  return {...state, revision: state.revision + 1, copyVersion: 1,
    suggestions: state.suggestions.map(s => ({...s, reason: clean(s.reason), evidence: s.evidence.map(clean)})),
    memory: state.memory.map(m => ({...m, source: clean(m.source)})),
    audit: state.audit.map(a => ({...a, text: clean(a.text)})),
    connections: [...state.connections, ...missing.map(c => ({...c}))],
    overnight: state.overnight || []};
}
export function updateOvernight(state, payload, now) {
  if (payload.id) {
    const task = state.overnight.find(t => t.id === payload.id);
    if (!task) throw Error('Task not found.');
    if (!['paused', 'queued', 'cancelled'].includes(payload.status)) throw Error('Invalid task status.');
    if (task.status === 'cancelled') throw Error('This task has been cancelled.');
    if (payload.status === 'queued' && task.deadline <= now) throw Error('The deadline has passed. Create a task with a new deadline.');
    task.status = payload.status;
    task.updatedAt = now;
    return;
  }
  const title = String(payload.title || '').trim();
  const brief = String(payload.brief || '').trim();
  const deadline = Number(payload.deadline), budget = Number(payload.budget);
  if (!title || title.length > 160) throw Error('Add a task title of up to 160 characters.');
  if (!brief || brief.length > 4000) throw Error('Describe the result you want in up to 4,000 characters.');
  if (!Number.isFinite(deadline) || deadline <= now || deadline > now + 31 * 86400000) throw Error('Choose a deadline within the next 31 days.');
  if (!Number.isInteger(budget) || budget < 1000 || budget > 1000000) throw Error('Choose a token budget between 1,000 and 1,000,000.');
  state.overnight.unshift({id: crypto.randomUUID(), title, brief, deadline, budget,
    status: 'queued', runner: 'unconfigured', tokensUsed: 0, createdAt: now, updatedAt: now});
}
