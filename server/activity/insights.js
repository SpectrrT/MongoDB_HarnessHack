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

const cleanTitle = (title) => (title ? title.replace(/\s+-\s+(Gmail|Google Calendar|Google Docs)$/, '') : null);
const dayLabel = (day) => new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });

export async function findFriction(activity, workspace, { days = 28 } = {}) {
  const at = (d) => new Date(d).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: activity.timeZone || 'UTC' });
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
            $push: { label: '$label', title: '$title', sec: '$durationSec', start: '$start', day: '$day', id: '$_id', minute: { $minute: {date:'$start',timezone:activity.timeZone||'UTC'} }, source: '$source' },
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
      { $match: { $or: [{switchesPerDay:{$gte:4}},{switchesPerDay:{$gte:3},dayCount:{$gte:3}}] } },
      { $sort: { switchesPerDay: -1, seconds: -1 } },
      { $limit: 1 },
    ])
    .toArray();
  if (!hot || (hot.switchesPerDay < 4 && !(hot.switchesPerDay >= 3 && hot.dayCount >= 3))) return null;

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
  // The most recent night as a timestamped agenda, and one line per night for the expanded view.
  const byDay = new Map();
  for (const s of sessions) byDay.set(s.day, [...(byDay.get(s.day) || []), s]);
  const lastDay = [...byDay.keys()].sort().at(-1);
  const night = {
    day: lastDay,
    date: dayLabel(lastDay),
    sessions: byDay.get(lastDay).filter((s) => s.sec >= 30).map((s) => ({ time: at(s.start), label: s.label, ...appInfo(s.label), title: cleanTitle(s.title), minutes: Math.max(1, Math.round(s.sec / 60)) })),
  };
  const nights = [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([day, list]) => ({ day, date: dayLabel(day), start: at(list[0].start), minutes: Math.round(list.reduce((sum, s) => sum + s.sec, 0) / 60), switches: list.filter((s, i) => i > 0 && s.label !== list[i - 1].label).length }));
  const counts={seed:0,captured:0,unknown:0};
  for(const session of sessions)counts[session.source==='seed'?'seed':session.source==='collector'?'captured':'unknown']++;
  const sources=Object.keys(counts).filter(key=>counts[key]>0);
  const provenance=sources.length>1?'mixed':sources[0]||'unknown';
  return {
    hour: hot._id,
    lookbackDays:days,timeZone:activity.timeZone||'UTC',provenance,sourceCounts:counts,sourceIds:sessions.map(session=>String(session.id)),
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
    night,
    nights,
    sample: sessions.every((s) => s.source === 'seed'),
    sessions: sessions.length,
  };
}

// The finding as one plain sentence, then the workflow that would take the loop off the person's plate.
export function describe(f) {
  const names = f.apps.map((a) => a.name);
  const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0];
  const when = f.hour >= 20 || f.hour < 5 ? 'nights' : 'days';
  return `On ${f.days} ${when} in the last ${f.lookbackDays||28} days, around ${f.window}, you spent about ${f.minutesPerDay} minutes bouncing between ${list}, switching ${f.switchesPerDay} times each ${when === 'nights' ? 'night' : 'day'}.`;
}

export function planWorkflow(f) {
  const has = (label) => f.apps.some((a) => a.label === label);
  const who = f.places.length > 1 ? `${f.places.slice(0, -1).join(', ')} and ${f.places.at(-1)}` : f.places[0] || 'everyone';
  const observation = `Observed: about ${f.minutesPerDay} minutes and ${f.switchesPerDay} app switches per recorded day. Time savings have not been measured.`;
  if(has('cloud.mongodb.com')&&has('github.com')&&/query|index|explain/i.test(f.topTitle||''))return {
    kind:'engineering',title:'Prepare a database query review',
    problem:'Repeated activity across Atlas and the source repository suggests a query-review workflow to confirm.',
    trigger:'Before the next confirmed query review',
    steps:[
      {app:'MongoDB Atlas',logo:'mongodb',label:'Collect supplied evidence',detail:'Gather the supplied query shape, baseline metrics and existing issue notes. Mark missing inputs.'},
      {app:'GitHub',logo:'github',label:'Compare staging plans',detail:'Review owner-provided explain plans against query code. Do not execute queries or create indexes.'},
      {app:'Offload',label:'Draft rollout and rollback',detail:'Prepare a local checklist with proposed checks and unknown owners or thresholds clearly marked.'},
      {app:'You',label:'Review the draft',detail:'Confirm the plan and permissions before any database or issue changes.',ask:true},
    ],proactive:['Prepare review notes from supplied evidence','Suggest next steps after the review'],
    needs:['Selected query and meeting notes','Permission for a local draft'],observation,executionStatus:'proposal',
  };
  if (has('mail.google.com') && has('calendar.google.com')) {
    const late = f.meetingTimes.find((t) => /^(12|1[01]):\d{2}\s?PM$|^(12|[1-5]):\d{2}\s?AM$/.test(t));
    return {
      kind: 'scheduling',
      title: 'Schedule across time zones for you',
      problem: `Repeated scheduling-related activity${f.places.length ? ` mentioning ${who}` : ''}${late ? `. Saved titles mention ${late}` : ''}. Confirm the meeting details before acting.`,
      trigger: `A scheduling thread arrives in Gmail${f.topTitle ? `, like "${f.topTitle}"` : ''}`,
      steps: [
        { app: 'Gmail', logo: 'gmail', label: 'Read the thread', detail: 'Pull out who needs to meet, how long, and the times already proposed' },
        { app: 'Google Calendar', logo: 'calendar', label: 'Find the overlap', detail: `Check free and busy time for ${who}, inside working hours` },
        { app: 'Codex', logo: 'openai', label: 'Draft the reply', detail: 'Offer three slots in each person’s time zone, in your voice' },
        { app: 'You', logo: null, label: 'Ask you once', detail: 'Show the draft and the slots before anything is sent', ask: true },
        { app: 'Google Calendar', logo: 'calendar', label: 'Book and confirm', detail: late ? `Send the invite, and flag it when ${late} is the only overlap` : 'Send the invite and add the agenda from the thread' },
      ],
      proactive: [
        late ? `If ${late} is a confirmed meeting time, consider the next morning’s overlap` : 'Batch scheduling replies into one pass a day',
        'Keep a standing slot that works for every time zone',
        'Draft scheduling replies for review while you sleep',
      ],
      needs: ['Gmail: read and send', 'Google Calendar: read and write'],
      observation,
      executionStatus:'proposal',
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
      observation,
      executionStatus:'proposal',
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
    observation,
    executionStatus:'proposal',
  };
}
