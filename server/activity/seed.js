// Seeds a sample work week of computer history (the five weekdays before today) so repeated routines
// can be shown before the collector has recorded several real days. Every sample is stored with
// source "seed" on the device "sample-week", and the app labels it as sample data.
//   npm run activity:seed             seed once
//   npm run activity:seed -- --reset  replace an earlier sample week
import { MongoClient } from 'mongodb';
import { fileURLToPath } from 'node:url';
import { createActivity, workspaceId, SAMPLE_MS } from './store.js';

export const SAMPLE_DEVICE = 'sample-week';
const BUNDLES = {
  'Google Chrome': 'com.google.Chrome',
  Slack: 'com.tinyspeck.slackmacgap',
  'zoom.us': 'us.zoom.xos',
  Code: 'com.microsoft.VSCode',
  Terminal: 'com.apple.Terminal',
  Figma: 'com.figma.Desktop',
  Notion: 'notion.id',
};

const isoWeek = (date) => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  return Math.ceil(((d - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86400e3 + 1) / 7);
};

// `active` is the chance that a sample saw keyboard or mouse input (hands-on versus reading).
const gmail = { app: 'Google Chrome', url: 'https://mail.google.com/mail/u/0/', title: 'Inbox - Gmail', active: 0.45 };
const slack = { app: 'Slack', title: 'team (Channel) - Offload - Slack', active: 0.6 };
const linear = { app: 'Google Chrome', url: 'https://linear.app/offload/team/OFF/active', title: 'Active issues · Offload · Linear', active: 0.5 };

// One workday. `at` is a local start time; other blocks follow the previous one. `interrupt` inserts
// short Slack checks, which split long blocks the way real days do.
const dayPlan = (week) => [
  { at: [9, 2], minutes: 9, ...gmail },
  { minutes: 18, app: 'Google Chrome', url: 'https://docs.google.com/document/d/weekly-brief/edit', title: `Weekly brief — W${week} - Google Docs`, active: 0.85 },
  { minutes: 6, ...slack },
  { at: [10, 0], minutes: 15, app: 'zoom.us', title: 'Zoom Meeting', active: 0.15 },
  { minutes: 10, ...linear },
  { minutes: 65, app: 'Code', title: 'store.js — offload', active: 0.8, interrupt: true },
  { minutes: 7, app: 'Terminal', title: 'offload — npm test', active: 0.7 },
  { minutes: 22, app: 'Google Chrome', url: 'https://github.com/SpectrrT/MongoDB_HarnessHack/pulls', title: 'Pull requests · SpectrrT/MongoDB_HarnessHack', active: 0.4 },
  { at: [12, 35], minutes: 45, app: 'Code', idle: true },
  { minutes: 28, app: 'Figma', title: 'Offload — History page', active: 0.75 },
  { minutes: 18, app: 'Google Chrome', url: 'https://www.mongodb.com/docs/atlas/atlas-vector-search/vector-search-overview/', title: 'Atlas Vector Search Overview - MongoDB Docs', active: 0.2 },
  { minutes: 50, app: 'Code', title: 'routes.js — offload', active: 0.8, interrupt: true },
  { minutes: 12, app: 'Notion', title: 'Release notes', active: 0.8 },
  { at: [17, 5], minutes: 7, ...linear },
  { minutes: 5, ...slack },
  { minutes: 6, ...gmail },
];

// Small deterministic generator so every run seeds the same week.
function random(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function sampleWeekDays(today = new Date(), count = 5) {
  const days = [];
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  while (days.length < count) {
    d.setDate(d.getDate() - 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) days.unshift(new Date(d));
  }
  return days;
}

export function sampleDay(date) {
  const rand = random(date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate());
  const samples = [];
  const blocks = [];
  let cursor = null;
  for (const block of dayPlan(isoWeek(date))) {
    if (block.at) {
      const start = new Date(date.getFullYear(), date.getMonth(), date.getDate(), block.at[0], block.at[1]);
      start.setMinutes(start.getMinutes() + Math.round(rand() * 6 - 2));
      if (!cursor || start > cursor) cursor = start;
    }
    const minutes = block.minutes * (0.8 + rand() * 0.4);
    const end = new Date(+cursor + minutes * 60e3);
    if (block.interrupt) {
      const breakAt = new Date(+cursor + (0.3 + rand() * 0.4) * minutes * 60e3);
      const breakEnd = new Date(+breakAt + (60 + rand() * 90) * 1000);
      blocks.push({ ...block, start: cursor, end: breakAt }, { ...slack, start: breakAt, end: breakEnd }, { ...block, start: breakEnd, end });
    } else blocks.push({ ...block, start: cursor, end });
    cursor = new Date(+end + Math.round(rand() * 90) * 1000);
  }
  for (const b of blocks) {
    for (let t = +b.start; t < +b.end; t += SAMPLE_MS) {
      samples.push({
        ts: new Date(t),
        app: b.app,
        bundleId: BUNDLES[b.app] || null,
        title: b.idle ? null : b.title || null,
        url: b.idle ? null : b.url || null,
        idle: !!b.idle,
        active: !b.idle && rand() < (b.active ?? 0.6),
        source: 'seed',
      });
    }
  }
  return samples;
}

export async function seedSampleWeek(activity, { workspace = workspaceId(), reset = false, today = new Date() } = {}) {
  const existing = await activity.sessions.countDocuments({ workspace, device: SAMPLE_DEVICE });
  if (existing && !reset) return { skipped: true, existing };
  if (existing) {
    await activity.events.deleteMany({ 'meta.workspace': workspace, 'meta.device': SAMPLE_DEVICE });
    await activity.sessions.deleteMany({ workspace, device: SAMPLE_DEVICE });
    await activity.routinesCollection.deleteMany({ workspace, source: 'seed' });
  }
  let samples = 0;
  const days = sampleWeekDays(today);
  for (const date of days) {
    const day = sampleDay(date);
    for (let i = 0; i < day.length; i += 5000) await activity.ingest(workspace, SAMPLE_DEVICE, day.slice(i, i + 5000));
    samples += day.length;
    await activity.sessionize(workspace, SAMPLE_DEVICE, { from: day[0].ts, to: new Date(+day.at(-1).ts + 1) });
  }
  const sessions = await activity.sessions.countDocuments({ workspace, device: SAMPLE_DEVICE });
  const routines = await activity.routines(workspace);
  return { days: days.length, samples, sessions, routines };
}

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error('Set MONGODB_URI in .env (see .env.example).');
    process.exit(1);
  }
  const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  await client.connect();
  try {
    const activity = await createActivity(client.db(process.env.MONGODB_DATABASE || 'offload_hackathon'), { log: console.warn });
    const result = await seedSampleWeek(activity, { reset: process.argv.includes('--reset') });
    if (result.skipped) console.log(`A sample week already exists (${result.existing} sessions). Use -- --reset to replace it.`);
    else {
      console.log(`Seeded a sample week: ${result.days} days, ${result.samples} samples, ${result.sessions} sessions (source "seed").`);
      for (const r of result.routines) console.log(`  routine: ${r.steps.join(' → ')} · ${r.dayCount} days · ${r.count} times`);
    }
  } finally {
    await client.close();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
