// Aggregate recorded app transitions, then propose a workflow for user review.
// Window metadata does not prove task intent, meeting contents, or achievable time savings.

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
    windowDays:days, sampleSessionCount:counts.seed, liveSessionCount:counts.captured,
    evidence:sessions.slice(-30).map(s=>({id:String(s.id),timestamp:new Date(s.start).toISOString(),source:s.source,title:s.title,label:s.label})),
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
    meetingTimes: [],
    places: [],
    titleMentions: { times: meetingTimes, places },
    timeline: sessions
      .filter((s) => s.sec >= 30)
      .slice(-14)
      .map((s) => ({ label: s.label, name: appInfo(s.label).name, minutes: Math.max(1, Math.round(s.sec / 60)) })),
    night,
    nights,
    sample: sessions.every((s) => s.source === 'seed'),
    sessions: sessions.length,
  };
}

// Describe observations separately from the proposed workflow.
export function describe(f) {
  const names = f.apps.map((a) => a.name);
  const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0];
  const source = f.provenance === 'mixed' ? 'Mixed-source history' : f.provenance === 'unknown' ? 'History with unknown provenance' : null;
  return `${source ? `${source} shows activity` : 'Activity'} across ${list} on ${f.days} dates in the last ${f.lookbackDays || f.windowDays || 28} days, around ${f.window}. Recorded sessions averaged ${f.minutesPerDay} minutes and ${f.switchesPerDay} app switches per date in that hour. Window names do not establish what the task was.`;
}

export function planWorkflow(f) {
  const has = (label) => f.apps.some((a) => a.label === label);
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
    return {
      kind: 'scheduling',
      title: 'Explore a scheduling routine',
      problem: 'Mail and calendar windows recur together. This could be scheduling work; confirm the task before setting up a routine.',
      trigger: 'A scheduling request you select after connecting the required accounts',
      steps: [
        { app: 'Gmail', logo: 'gmail', label: 'Read the thread', detail: 'With authorized access, read a selected thread and confirm attendees, duration and proposed times' },
        { app: 'Google Calendar', logo: 'calendar', label: 'Find the overlap', detail: 'Check available calendars and explicitly supplied working hours; ask for any missing access' },
        { app: 'Codex', logo: 'openai', label: 'Draft the reply', detail: 'Draft possible slots using confirmed time zones and availability' },
        { app: 'You', logo: null, label: 'Review with you', detail: 'Show the draft and the slots before anything is sent', ask: true },
        { app: 'Google Calendar', logo: 'calendar', label: 'Confirm the next step', detail: 'Only send an invitation after you approve the exact attendees, time and contents', ask: true },
      ],
      proactive: [
        'Consider batching draft replies after you confirm this is recurring work',
        'Review a recurring slot only after checking actual availability',
      ],
      needs: ['Gmail: authorized thread access', 'Google Calendar: authorized availability access', 'Separate approval before sending or booking'],
      observation,
      executionStatus:'proposal',
    };
  }
  if (has('Codex') && (has('Code') || has('Terminal') || has('github.com'))) {
    return {
      kind: 'coding',
      title: 'Explore a repeatable edit-test routine',
      problem: 'Editor, terminal and Codex windows recur. This may be an edit-test loop; the history does not record a failure or its cause.',
      trigger: 'A test command and workspace you explicitly choose',
      steps: [
        { app: 'Terminal', logo: null, label: 'Read the failure', detail: 'Collect the failing test and its output' },
        { app: 'Codex', logo: 'openai', label: 'Propose a fix', detail: 'Draft a change with the reasoning' },
        { app: 'You', logo: null, label: 'Review with you', detail: 'Show the diff before applying it', ask: true },
        { app: 'Terminal', logo: null, label: 'Re-run and report', detail: 'Run the tests again and summarize' },
      ],
      proactive: ['Propose a test schedule after confirming the repository and commands', 'Summarize recorded test results after a real run'],
      needs: ['Local tools: read files and run commands'],
      observation,
      executionStatus:'proposal',
    };
  }
  const names = f.apps.map((a) => a.name);
  return {
    kind: 'batch',
    title: `Explore a routine across ${names.join(', ')}`,
    problem: `These app windows recur in the same hour. Confirm whether they belong to one task before combining them.`,
    trigger: 'A time or event you choose after confirming the task',
    steps: [
      ...f.apps.map((a, i) => ({ app: a.name, logo: a.logo, label: `Collect what you need from ${a.name}`, detail: `${a.visitsPerDay} recorded visits per observed date; ask which information is needed and confirm access`, step: i + 1 })),
      { app: 'You', logo: null, label: 'Review with you', detail: 'Show one summary instead of the round trips', ask: true },
    ],
    proactive: ['Choose what a useful summary should contain, then test it on a real example'],
    needs: names.map((n) => `${n}: read`),
    observation,
    executionStatus:'proposal',
  };
}
