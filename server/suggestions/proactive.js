import { actionDraftSupported } from './action-draft.js';
import { digest } from './history.js';

const DAY = 86400000;
const WEEK = 7 * DAY;
const sourceView = row => ({ id: row._id, sessionId: row.sessionId, date: row.timestamp, locator: row.locator });
const revisionOf = rows => digest(rows.map(row => [row._id, row.textHash]));

// These candidates only prepare local, source-quoted drafts. Observations never grant execution authority.
export function proactiveOpportunities(rows, now = new Date()) {
  const opportunities = [];
  const chronological = [...rows].sort((a, b) => +a.timestamp - +b.timestamp || a._id.localeCompare(b._id));
  const constraints = chronological.filter(row => ['constraint', 'correction'].includes(row.kind));
  const meetings = new Map();
  for (const row of chronological) if (row.meeting) {
    const group = meetings.get(row.meeting.id) || [];
    group.push(row); meetings.set(row.meeting.id, group);
  }
  for (const [id, notes] of meetings) {
    const latest = notes.at(-1), meeting = latest.meeting;
    if (meeting.status === 'cancelled') continue;
    const starts = +new Date(meeting.startsAt), ends = +new Date(meeting.endsAt);
    let kind;
    if (meeting.status === 'scheduled' && starts > +now && starts <= +now + DAY) kind = 'meeting-prep';
    if (meeting.status === 'completed' && ends <= +now && ends > +now - 7 * DAY) kind = 'meeting-followup';
    if (!kind) continue;
    const sources = [...new Map([...constraints, ...notes].map(row => [row._id, row])).values()]
      .sort((a, b) => +a.timestamp - +b.timestamp || a._id.localeCompare(b._id));
    if (sources.length > 30 || sources.reduce((n, row) => n + row.text.length, 0) > 24000) continue;
    opportunities.push({ kind, triggerId: id, title: `${kind === 'meeting-prep' ? 'Prepare for' : 'Follow up on'} ${meeting.title}`,
      reason: kind === 'meeting-prep' ? 'This saved meeting starts within 24 hours. Prepare an agenda from its source notes.'
        : 'This meeting is marked completed. Turn its saved notes into a source-linked action checklist.',
      meeting, actionSourceId: latest._id, sources, revision: revisionOf(sources), expiresAt: new Date(kind === 'meeting-prep' ? starts : ends + 7 * DAY),
      completionMeaning: 'A source-checked local draft is ready. Meeting actions have not been executed.',
      outputLabel: kind === 'meeting-prep' ? 'Meeting brief' : 'Meeting action checklist' });
  }
  const routines = new Map();
  for (const row of chronological) if (row.kind === 'routine' && +row.timestamp > +now - 56 * DAY) {
    const key = row.text.trim().toLowerCase().replace(/\s+/g, ' ');
    const group = routines.get(key) || []; group.push(row); routines.set(key, group);
  }
  for (const [key, observations] of routines) {
    const latest = observations.at(-1), weekday = latest.timestamp.getUTCDay(), hour = latest.timestamp.getUTCHours();
    // Fixed UTC timing is explicit. Three weeks of app visits alone do not prove a routine.
    const matched = observations.filter(row => row.timestamp.getUTCDay() === weekday && row.timestamp.getUTCHours() === hour);
    const byWeek = new Map(matched.map(row => [Math.floor((+row.timestamp - Date.UTC(1970, 0, 5)) / WEEK), row]));
    if (byWeek.size < 3) continue;
    const sources = [...byWeek.values()].slice(-8);
    const nextAt = new Date(+latest.timestamp + WEEK);
    if (+nextAt <= +now || +nextAt > +now + WEEK) continue;
    opportunities.push({kind: 'weekly-routine', triggerId: digest(key), title: 'Prepare a weekly routine',
      reason: `The same explicitly saved activity appears in ${sources.length} separate weeks, on the same UTC weekday and hour. Review it before scheduling anything.`,
      sources, revision: revisionOf(sources), nextAt, expiresAt: nextAt,
      completionMeaning: 'A local routine plan is ready. No recurring task has been scheduled.', outputLabel: 'Weekly routine plan' });
  }
  return opportunities.map(opportunity => ({...opportunity, evidence: opportunity.sources.map(sourceView)}));
}

export function proactiveDraft(input, records) {
  const claims = records.map(record => ({ text: record.text, sourceId: record.id }));
  const actionItems = input.kind === 'meeting-followup' ? claims.filter(claim => claim.sourceId === input.actionSourceId).flatMap(claim => claim.text.split(/\r?\n/)
    .filter(line => /^\s*(?:[-*]\s*)?(?:action(?: item)?|todo|follow[- ]?up)\s*:/i.test(line))
    .map(text => ({text, sourceId: claim.sourceId, status: 'not_started', draftSupported: actionDraftSupported(text)}))) : [];
  return {title: input.title, claims, actionItems};
}

export function proactiveArtifactLines(input, draft) {
  const lines = [`# ${draft.title}`, '', input.completionMeaning, ''];
  if (input.meeting) lines.push(`Meeting: ${input.meeting.title}`, `Starts: ${input.meeting.startsAt}`, `Ends: ${input.meeting.endsAt}`, '');
  if (input.kind === 'meeting-prep') lines.push('## Preparation', '', '- Review the source notes below.', '- Confirm the agenda and any unanswered questions with the meeting owner.', '- Check unresolved constraints before the meeting.', '');
  if (input.kind === 'meeting-followup') {
    lines.push('## Action items from the latest notes', '', 'Earlier notes remain below for reference. This checklist only quotes the latest saved meeting note.', '');
    if (!draft.actionItems.length) lines.push('No explicitly labeled action items were found. Review the notes before assigning work.', '');
    else for (const item of draft.actionItems) lines.push(`- [ ] ${item.text} [source:${item.sourceId}]`);
    lines.push('', 'Items remain not started. Starting this task only prepared this checklist. Sending messages, editing accounts, and other external actions need their own authorization.', '');
  }
  if (input.kind === 'weekly-routine') lines.push('## Routine to review', '', `Next occurrence inferred from weekly observations: ${input.nextAt}`, 'Times are shown in UTC. This is a pattern to confirm, not a calendar appointment.', '', '- Confirm the task, timing, scope, and required account access.', '- Start a single local draft before approving a recurring task.', '');
  lines.push('## Source notes', '');
  return lines;
}
