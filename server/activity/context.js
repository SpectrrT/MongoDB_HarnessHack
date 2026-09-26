// Computer history for the chat, like ChatGPT and Claude referencing past context: the sessions that match
// the question (Atlas hybrid search), plus the day's longer sessions when the question says today or
// yesterday. Private sessions never carry titles. Failures only mean the model gets no history.
import { dayString, workspaceId } from './store.js';

export async function historyContext(activity, messages) {
  if (!activity) return [];
  try {
    const question = [...messages].reverse().find((m) => m.role === 'user')?.text || '';
    const workspace = workspaceId();
    const { results } = await activity.search(workspace, question, { limit: 6 });
    const days = [];
    if (/\btoday\b/i.test(question)) days.push(activity.today());
    if (/\byesterday\b/i.test(question)) days.push(dayString(new Date(Date.now() - 86400e3), activity.timeZone));
    const daySessions = [];
    for (const day of days) {
      const { sessions } = await activity.timeline(workspace, { day });
      daySessions.push(...sessions.filter((s) => !s.idle && s.durationSec >= 120).slice(-20));
    }
    const time = (d) => new Date(d).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: activity.timeZone });
    const seen = new Set();
    return [...results, ...daySessions]
      .filter((s) => !seen.has(String(s._id)) && seen.add(String(s._id)))
      .slice(0, 30)
      .map((s) => ({
        day: s.day,
        time: `${time(s.start)}–${time(s.end)}`,
        minutes: Math.max(1, Math.round(s.durationSec / 60)),
        app: s.app,
        title: s.private ? null : s.title || null,
        site: s.domain || null,
        ...(s.days?.length > 1 ? { alsoOn: s.days.slice(0, 7) } : {}),
        ...(s.source === 'seed' ? { sample: true } : {}),
      }));
  } catch {
    return [];
  }
}

// The same history as short reference notes, the shape both chat providers already accept.
export function historyNotes(history, max = 8) {
  return history.slice(0, max).map((h, i) => ({
    id: `history-${i}`,
    source: h.sample ? 'Computer history (sample week)' : 'Computer history',
    text: [h.day, h.time, h.app, h.title, h.site, h.alsoOn ? `also on ${h.alsoOn.join(', ')}` : '']
      .filter(Boolean)
      .join(' · ')
      .slice(0, 360),
  }));
}
