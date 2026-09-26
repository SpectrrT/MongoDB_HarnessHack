// Friction in computer history, and a workflow that would remove it. One aggregation finds the hour of the
// day with the most back-and-forth between apps across several days; the planner turns that finding into
// steps Offload could run, asking before anything that sends or books. A model can refine the plan in chat;
// without one, this plan is the answer.

const APPS = {
  'mail.google.com': { name: 'Gmail', logo: 'gmail' },
  'calendar.google.com': { name: 'Google Calendar', logo: 'calendar' },
  'docs.google.com': { name: 'Google Docs', logo: 'drive' },
  'drive.google.com': { name: 'Google Drive', logo: 'drive' },
  'github.com': { name: 'GitHub', logo: 'github' },
  'linear.app': { name: 'Linear', logo: 'linear' },
  'cloud.mongodb.com': { name: 'MongoDB Atlas', logo: 'mongodb' },
  'mongodb.com': { name: 'MongoDB Docs', logo: 'mongodb' },
  Codex: { name: 'Codex', logo: 'openai' },
  ChatGPT: { name: 'ChatGPT', logo: 'openai' },
  Slack: { name: 'Slack', logo: 'slack' },
  Figma: { name: 'Figma', logo: 'figma' },
  Notion: { name: 'Notion', logo: 'notion' },
  Code: { name: 'VS Code', logo: null },
  Terminal: { name: 'Terminal', logo: null },
  'zoom.us': { name: 'Zoom', logo: null },
};
export const appInfo = (label) => APPS[label] || { name: label, logo: null };

const clock = (hour, minute = 0) =>
  new Date(Date.UTC(2000, 0, 1, hour, minute)).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' });

export async function findFriction(activity, workspace, { days = 14 } = {}) {
  const since = new Date(Date.now() - days * 86400e3);
  const [hot] = await activity.sessions
    .aggregate([
      { $match: { workspace, start: { $gte: since }, idle: false, private: { $ne: true } } },
      {
        $setWindowFields: {
          partitionBy: { device: '$device', day: '$day' },
          sortBy: { start: 1 },
          output: { previous: { $shift: { output: '$label', by: -1, default: null } } },
        },
      },
      {
        $group: {
          _id: { day: '$day', hour: '$hour' },
          switches: { $sum: { $cond: [{ $and: [{ $ne: ['$previous', null] }, { $ne: ['$previous', '$label'] }] }, 1, 0] } },
          seconds: { $sum: '$durationSec' },
          sessions: {
            $push: { label: '$label', title: '$title', sec: '$durationSec', start: '$start', minute: { $minute: '$start' }, source: '$source' },
          },
        },
      },
      {
        $group: {
          _id: '$_id.hour',
          days: { $addToSet: '$_id.day' },
          switches: { $sum: '$switches' },
          seconds: { $sum: '$seconds' },
          sessions: { $push: '$sessions' },
        },
      },
      { $set: { dayCount: { $size: '$days' } } },
      { $match: { dayCount: { $gte: 2 } } },
      { $set: { switchesPerDay: { $divide: ['$switches', '$dayCount'] } } },
      { $sort: { switchesPerDay: -1, seconds: -1 } },
      { $limit: 1 },
    ])
    .toArray();
  if (!hot || hot.switchesPerDay < 4) return null;

  const sessions = hot.sessions.flat().sort((a, b) => new Date(a.start) - new Date(b.start));
  const byApp = new Map();
  for (const s of sessions) {
    const row = byApp.get(s.label) || { label: s.label, ...appInfo(s.label), visits: 0, seconds: 0 };
    row.visits++;
    row.seconds += s.sec;
    byApp.set(s.label, row);
  }
  const apps = [...byApp.values()].sort((a, b) => b.visits - a.visits).slice(0, 3);
  const titles = new Map();
  for (const s of sessions) if (s.title) titles.set(s.title, (titles.get(s.title) || 0) + 1);
  const [topTitle, topTitleVisits = 0] = [...titles.entries()].sort((a, b) => b[1] - a[1])[0] || [];
  const text = sessions.map((s) => s.title || '').join(' ');
  const meetingTimes = [...new Set([...text.matchAll(/\b(\d{1,2}:\d{2}\s?[AP]M)\s?[–-]/g)].map((m) => m[1]))];
  const places = [...new Set(text.match(/\b(Sydney|Dublin|New York|London|Bangalore|Tel Aviv|San Francisco|Singapore)\b/g) || [])];
  const minutes = sessions.map((s) => s.minute).sort((a, b) => a - b);
  const startMinute = minutes[Math.floor(minutes.length / 4)] ?? 0;
  const dayCount = hot.dayCount;
  return {
    hour: hot._id,
    window: `${clock(hot._id, startMinute)}`,
    days: dayCount,
    minutesPerDay: Math.round(hot.seconds / dayCount / 60),
    switchesPerDay: Math.round(hot.switchesPerDay),
    apps: apps.map(({ label, name, logo, visits, seconds }) => ({
      label,
      name,
      logo,
      visitsPerDay: Math.round(visits / dayCount),
      minutesPerDay: Math.round(seconds / dayCount / 60),
    })),
    topTitle: topTitle ? topTitle.replace(/\s+-\s+(Gmail|Google Calendar|Google Docs)$/, '') : null,
    topTitleVisitsPerDay: Math.round(topTitleVisits / dayCount),
    meetingTimes,
    places,
    timeline: sessions
      .filter((s) => s.sec >= 30)
      .slice(-14)
      .map((s) => ({ label: s.label, name: appInfo(s.label).name, minutes: Math.max(1, Math.round(s.sec / 60)) })),
    sample: sessions.every((s) => s.source === 'seed'),
    sessions: sessions.length,
  };
}

// The finding as one plain sentence, then the workflow that would take the loop off the person's plate.
export function describe(f) {
  const names = f.apps.map((a) => a.name);
  const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0];
  const when = f.hour >= 20 || f.hour < 5 ? 'nights' : 'days';
  return `On ${f.days} ${when} in the last two weeks, around ${f.window}, you spent about ${f.minutesPerDay} minutes bouncing between ${list}, switching ${f.switchesPerDay} times each ${when === 'nights' ? 'night' : 'day'}.`;
}

export function planWorkflow(f) {
  const has = (label) => f.apps.some((a) => a.label === label);
  const who = f.places.length > 1 ? `${f.places.slice(0, -1).join(', ')} and ${f.places.at(-1)}` : f.places[0] || 'everyone';
  const saves = `about ${f.minutesPerDay} minutes and ${f.switchesPerDay} app switches a night`;
  if (has('mail.google.com') && has('calendar.google.com')) {
    const late = f.meetingTimes.find((t) => /^(12|1[01]):\d{2}\s?PM$|^(12|[1-5]):\d{2}\s?AM$/.test(t));
    return {
      kind: 'scheduling',
      title: 'Schedule across time zones for you',
      problem: `Scheduling by hand${f.places.length ? ` with ${who}` : ''}${late ? `, and the meeting still lands at ${late}` : ''}.`,
      trigger: `A scheduling thread arrives in Gmail${f.topTitle ? `, like "${f.topTitle}"` : ''}`,
      steps: [
        { app: 'Gmail', logo: 'gmail', label: 'Read the thread', detail: 'Pull out who needs to meet, how long, and the times already proposed' },
        { app: 'Google Calendar', logo: 'calendar', label: 'Find the overlap', detail: `Check free and busy time for ${who}, inside working hours` },
        { app: 'Codex', logo: 'openai', label: 'Draft the reply', detail: 'Offer three slots in each person’s time zone, in your voice' },
        { app: 'You', logo: null, label: 'Ask you once', detail: 'Show the draft and the slots before anything is sent', ask: true },
        { app: 'Google Calendar', logo: 'calendar', label: 'Book and confirm', detail: late ? `Send the invite, and flag it when ${late} is the only overlap` : 'Send the invite and add the agenda from the thread' },
      ],
      proactive: [
        late ? `Stop booking you at ${late}: propose the next morning’s overlap instead` : 'Batch scheduling replies into one pass a day',
        'Keep a standing slot that works for every time zone',
        'Answer “does this time work?” threads while you sleep',
      ],
      needs: ['Gmail: read and send', 'Google Calendar: read and write'],
      saves,
    };
  }
  if (has('Codex') && (has('Code') || has('Terminal') || has('github.com'))) {
    return {
      kind: 'coding',
      title: 'Hand the edit-test loop to Codex',
      problem: 'Switching between the editor, the terminal and Codex to fix the same failure.',
      trigger: 'A test run fails',
      steps: [
        { app: 'Terminal', logo: null, label: 'Read the failure', detail: 'Collect the failing test and its output' },
        { app: 'Codex', logo: 'openai', label: 'Propose a fix', detail: 'Draft a change with the reasoning' },
        { app: 'You', logo: null, label: 'Ask you once', detail: 'Show the diff before applying it', ask: true },
        { app: 'Terminal', logo: null, label: 'Re-run and report', detail: 'Run the tests again and summarize' },
      ],
      proactive: ['Run the tests before you look at them', 'Summarize what failed overnight'],
      needs: ['Local tools: read files and run commands'],
      saves,
    };
  }
  const names = f.apps.map((a) => a.name);
  return {
    kind: 'batch',
    title: `Batch your ${names.join(', ')} loop`,
    problem: `The same back-and-forth between ${names.join(', ')} most days.`,
    trigger: `Around ${f.window}`,
    steps: [
      ...f.apps.map((a, i) => ({ app: a.name, logo: a.logo, label: `Collect what you need from ${a.name}`, detail: `${a.visitsPerDay} visits a day today`, step: i + 1 })),
      { app: 'You', logo: null, label: 'Ask you once', detail: 'Show one summary instead of the round trips', ask: true },
    ],
    proactive: ['Prepare the summary before you start'],
    needs: names.map((n) => `${n}: read`),
    saves,
  };
}
