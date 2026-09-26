import test from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import request from 'supertest';
import { embedText } from '../rem/embed.js';
import { ActivityStore, cleanUrl, redact } from '../server/activity/store.js';
import { SAMPLE_DEVICE, seedSampleWeek } from '../server/activity/seed.js';
import { createApp } from '../server/index.js';
import express from 'express';
import { mountModel } from '../server/model.js';
import { parseBrowserTab } from '../server/activity/capture.js';
import { historyContext } from '../server/activity/context.js';
import { findFriction, planWorkflow, describe } from '../server/activity/insights.js';

const embedder = {
  key: 'local256',
  name: 'test embedder',
  dims: 256,
  embed: async (texts) => texts.map((t) => embedText(t, 256)),
  embedQuery: async (text) => embedText(text, 256),
};
const TZ = 'America/New_York';
const at = (minute) => new Date(Date.UTC(2026, 8, 21, 13, 0) + minute * 60e3); // Mon Sep 21, 9:00 AM ET
const span = (from, to, sample) => {
  const out = [];
  for (let t = +at(from); t < +at(to); t += 5000) out.push({ ts: new Date(t), ...sample });
  return out;
};

test('computer history on MongoDB', async (t) => {
  const mongo = await MongoMemoryServer.create();
  const client = new MongoClient(mongo.getUri());
  await client.connect();
  let n = 0;
  const make = async (options = {}) => new ActivityStore(client.db(`activity${n++}`), { embedder, timeZone: TZ, ...options }).initialize();
  try {
    await t.test('emails, long numbers and query strings never reach the database', async () => {
      assert.equal(redact('Reply to jane.doe@example.com about 5551234567'), 'Reply to [email] about [number]');
      assert.deepEqual(cleanUrl('https://www.example.com/a/b?token=secret#frag'), {
        url: 'https://www.example.com/a/b',
        domain: 'example.com',
      });
      assert.deepEqual(parseBrowserTab('__OFFLOAD_PRIVATE__'), { private: true, url: null, title: null });
      assert.deepEqual(parseBrowserTab('https://example.com/page\nNormal title'), { url: 'https://example.com/page', title: 'Normal title' });
      assert.deepEqual(cleanUrl('file:///Users/me/notes.txt'), { url: null, domain: null });
      const s = await make();
      await s.ingest('me', 'mac', [
        { ts: at(0), app: '1Password', title: 'Bank login' },
        { ts: at(0.1), app: 'Google Chrome', title: 'New Incognito Tab', url: 'https://example.com/private' },
        { ts: at(0.15), app: 'Google Chrome', private: true, title: 'A normal-looking private tab', url: 'https://example.com/secret' },
        { ts: at(0.2), app: 'Google Chrome', title: 'Invoice for jane.doe@example.com', url: 'https://mail.google.com/mail/u/0/?id=1' },
      ]);
      const rows = await s.events.find({}, { sort: { ts: 1 } }).toArray();
      assert.deepEqual(rows.map((r) => [r.app, r.title, r.url, r.private]), [
        ['1Password', null, null, true],
        ['Google Chrome', null, null, true],
        ['Google Chrome', null, null, true],
        ['Google Chrome', 'Invoice for [email]', 'https://mail.google.com/mail/u/0/', false],
      ]);
      await assert.rejects(s.ingest('me', 'mac', [{ ts: 'not a date', app: 'x' }]));
    });

    await t.test('pausing stops recorded samples but not the sample week', async () => {
      const s = await make();
      await s.updateSettings('me', { paused: true });
      assert.deepEqual(await s.ingest('me', 'mac', [{ ts: at(0), app: 'Code' }]), { inserted: 0, paused: true });
      assert.equal((await s.ingest('me', 'mac', [{ ts: at(0), app: 'Code', source: 'seed' }])).inserted, 1);
    });

    await t.test('one aggregation turns samples into sessions and extends the open one', async () => {
      const s = await make();
      await s.ingest('me', 'mac', [
        ...span(0, 10, { app: 'Code', title: 'store.js — offload', active: true }),
        ...span(10, 12, { app: 'Google Chrome', title: 'Docs', url: 'https://docs.google.com/document/d/x/edit' }),
        ...span(13, 15, { app: 'Google Chrome', title: 'Docs', url: 'https://docs.google.com/document/d/x/edit' }),
        ...span(15, 20, { app: 'Terminal', idle: true }),
      ]);
      await s.sessionize('me', 'mac', { from: at(0), to: at(60) });
      const first = await s.sessions.find({}, { sort: { start: 1 } }).toArray();
      assert.deepEqual(first.map((x) => [x.label, x.durationSec, x.idle]), [
        ['Code', 600, false],
        ['docs.google.com', 120, false],
        ['docs.google.com', 120, false], // a gap over 30 s starts a new session
        ['Away', 300, true],
      ]);
      assert.equal(first[0].day, '2026-09-21');
      assert.equal(first[0].activeShare, 1, 'hands-on share from keyboard or mouse input');
      assert.equal(first[1].activeShare, null, 'unknown when the collector did not report input');
      assert.equal(first[0].hour, 9);
      assert.ok(first[0].vectors.local256.length === 256, 'sessions are embedded for vector search');
      assert.equal(first[3].vectors, undefined, 'away time is not embedded');

      await s.ingest('me', 'mac', span(20, 25, { app: 'Terminal', idle: true }));
      await s.sessionize('me', 'mac', { to: at(60) });
      const second = await s.sessions.find({}, { sort: { start: 1 } }).toArray();
      assert.equal(second.length, 4);
      assert.equal(second[3]._id, first[3]._id);
      assert.equal(second[3].durationSec, 600);
    });

    await t.test('different pages and local dates remain distinct sessions', async () => {
      const s = await make();
      const midnight = new Date('2026-09-22T04:00:00Z');
      await s.ingest('me', 'mac', [
        { ts: new Date(+midnight - 5000), app: 'Google Chrome', title: 'Untitled', url: 'https://docs.google.com/document/a' },
        { ts: midnight, app: 'Google Chrome', title: 'Untitled', url: 'https://docs.google.com/document/a' },
        { ts: new Date(+midnight + 5000), app: 'Google Chrome', title: 'Untitled', url: 'https://docs.google.com/document/b' },
      ]);
      await s.sessionize('me', 'mac', { from: new Date(+midnight - 5000), to: new Date(+midnight + 10000) });
      const rows = await s.sessions.find({}).sort({ start: 1 }).toArray();
      assert.equal(rows.length, 3);
      assert.deepEqual(rows.map(r => r.day), ['2026-09-21', '2026-09-22', '2026-09-22']);
      assert.equal((await s.stats('me', { day: '2026-09-22' })).totalSec, 10);
    });

    await t.test('seeded evidence never increases a recorded routine or search count', async () => {
      const s = await make({ timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone });
      const seeded = await seedSampleWeek(s, { workspace: 'me' });
      const rows = await s.sessions.find({ workspace: 'me' }).toArray();
      await s.sessions.insertMany(rows.map(r => ({ ...r, _id: `recorded:${r._id}`, device: 'mac', source: 'collector' })));
      const routines = await s.routines('me');
      assert.equal(routines.length, seeded.routines.length * 2);
      assert.ok(routines.every(r => r.dayCount === 5 && r.count === 5));
      assert.deepEqual([...new Set(routines.map(r => r.source))].sort(), ['collector', 'seed']);
      const hits = (await s.search('me', 'weekly brief')).results.filter(r => /Weekly brief/.test(r.title));
      assert.equal(hits.length, 2);
      assert.deepEqual(hits.map(r => r.count), [5, 5]);
      await s.sessions.deleteMany({ workspace: 'me' });
      assert.deepEqual(await s.routines('me'), [], 'stale cached routines cannot outlive their source evidence');
    });

    await t.test('collapsing adjacent app visits preserves duration and rejects long routines', async () => {
      const s = await make();
      const base = new Date(); base.setHours(9, 0, 0, 0);
      const sessions = [];
      for (let day = 1; day <= 4; day++) {
        for (const [index, [minute, duration, app]] of [[0, 5, 'Mail'], [5, 5, 'Code'], [10, 65, 'Code']].entries()) {
          const start = new Date(+base - day * 86400e3 + minute * 60e3);
          sessions.push({ _id: `${day}:${index}`, workspace: 'me', device: 'mac', source: 'collector',
            start, end: new Date(+start + duration * 60e3), durationSec: duration * 60,
            day: start.toISOString().slice(0, 10), hour: 9, weekday: 1, app, label: app,
            title: `File ${index}`, idle: false, activeShare: 1 });
        }
      }
      await s.sessions.insertMany(sessions);
      assert.deepEqual(await s.routines('me'), [], '75 minutes of work must not become a 10-minute routine');
    });

    await t.test('weekly cadence requires three matching weekdays and consistent local hours', async () => {
      const s = await make();
      const monday = new Date(); monday.setUTCHours(13, 0, 0, 0);
      monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7);
      const rows = [];
      for (const week of [1, 2, 3]) for (const [step, app] of ['Mail', 'Docs'].entries()) {
        const start = new Date(+monday - week * 7 * 86400e3 + step * 180000);
        rows.push({ _id: `${week}:${step}`, workspace: 'me', device: 'mac', source: 'collector',
          start, end: new Date(+start + 180000), durationSec: 180, day: start.toISOString().slice(0,10),
          hour: 9, weekday: 1, label: app, app, title: 'Weekly work', idle: false, activeShare: 1 });
      }
      await s.sessions.insertMany(rows);
      const routines = await s.routines('me');
      assert.equal(routines.length, 1);
      assert.equal(routines[0].cadence, 'weekly');
      assert.equal(routines[0].dayCount, 3);
      assert.equal(routines[0].timeZone, TZ);
      await s.sessions.updateMany({ _id: /^1:/ }, { $set: { hour: 16 } });
      assert.equal((await s.routines('me'))[0].cadence, 'repeated', 'inconsistent hours are not a weekly time pattern');
    });

    await t.test('a failed embedding provider still permits keyword retrieval', async () => {
      const s = await make({ embedder: { ...embedder, embedQuery: async () => { throw new Error('provider unavailable'); } } });
      await s.ingest('me', 'mac', span(0, 3, { app: 'Code', title: 'Orchid release notes' }));
      await s.sessionize('me', 'mac', { from: at(0), to: at(5) });
      const found = await s.search('me', 'Orchid release');
      assert.equal(found.mode, 'local');
      assert.equal(found.results[0].title, 'Orchid release notes');
    });

    await t.test('stats: time per app, switches and focus blocks, without away time', async () => {
      const s = await make();
      await s.ingest('me', 'mac', [
        ...span(0, 30, { app: 'Code', title: 'a.js', active: true }),
        ...span(30, 35, { app: 'Slack', title: 'team' }),
        ...span(35, 40, { app: 'Code', title: 'b.js' }),
        ...span(40, 60, { app: 'Code', idle: true }),
      ]);
      await s.sessionize('me', 'mac', { from: at(0), to: at(90) });
      const stats = await s.stats('me', { day: '2026-09-21' });
      assert.equal(stats.totalSec, 2400);
      assert.equal(stats.activeSec, 1800);
      assert.equal(stats.sessions, 3);
      assert.equal(stats.switches, 2);
      assert.equal(stats.focusBlocks, 1);
      assert.deepEqual(stats.byApp.map((a) => [a.app, a.seconds]), [['Code', 2100], ['Slack', 300]]);
    });

    await t.test('routines: short stretches between breaks that recur are found; decisions stick', async () => {
      const s = await make({ timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone });
      const seeded = await seedSampleWeek(s, { workspace: 'me', today: new Date() });
      assert.equal(seeded.days, 5);
      const brief = seeded.routines.find((r) => r.steps.join(' → ') === 'mail.google.com → docs.google.com → Slack');
      assert.ok(brief, 'the morning brief routine is found');
      assert.equal(brief.dayCount, 5);
      assert.equal(brief.typicalHour, 9);
      assert.equal(brief.source, 'seed');
      assert.deepEqual(
        seeded.routines.map((r) => r.steps.join(' → ')).sort(),
        ['linear.app → Slack → mail.google.com', 'mail.google.com → docs.google.com → Slack'],
        'long working blocks between breaks are not routines',
      );
      assert.equal((await s.decide('me', brief._id, 'approve')).status, 'approved');
      const again = await s.routines('me');
      assert.equal(again.find((r) => r._id === brief._id).status, 'approved');
      const other = again.find((r) => r._id !== brief._id);
      await s.decide('me', other._id, 'dismiss');
      assert.ok(!(await s.routines('me')).some((r) => r._id === other._id));
      assert.deepEqual(await seedSampleWeek(s, { workspace: 'me' }), { skipped: true, existing: seeded.sessions });
    });

    await t.test('search ranks by words and meaning; forget removes a range', async () => {
      const s = await make({ timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone });
      await seedSampleWeek(s, { workspace: 'me' });
      const found = await s.search('me', 'weekly brief doc');
      assert.equal(found.mode, 'local');
      assert.match(found.results[0].title, /Weekly brief/);
      assert.equal(found.results[0].days.length, 5, 'the same window on five days is one result');
      assert.equal(new Set(found.results.map((r) => r.title)).size, found.results.length);
      assert.equal(found.results[0].source, 'seed');
      assert.equal(found.results[0].vectors, undefined);
      const day = await s.sessions.findOne({ device: SAMPLE_DEVICE }, { sort: { start: 1 } });
      const from = new Date(+day.start - 60e3), to = new Date(+day.start + 16 * 3600e3);
      const gone = await s.forget('me', { from, to });
      assert.ok(gone.deletedSessions > 10 && gone.deletedEvents > 1000);
      assert.equal(await s.sessions.countDocuments({ day: day.day }), 0);
      assert.ok(gone.deletedRoutines > 0);
      assert.equal(await s.routinesCollection.countDocuments({ workspace: 'me' }), 0);
    });

    await t.test('API: off without MongoDB; timeline, search, settings and routines with it', async () => {
      const off = createApp({ serveStatic: false });
      assert.deepEqual((await request(off).get('/api/activity/status').expect(200)).body, { configured: false });
      await request(off).get('/api/activity/timeline').expect(503);

      const s = await make({ timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone });
      const seeded = await seedSampleWeek(s, { workspace: process.env.ACTIVITY_WORKSPACE || (await import('node:os')).userInfo().username });
      const api = createApp({ serveStatic: false, activity: s });
      const status = (await request(api).get('/api/activity/status').expect(200)).body;
      assert.equal(status.configured, true);
      assert.equal(status.search, 'local');
      assert.equal(status.devices[0].device, SAMPLE_DEVICE);
      await request(api).get('/api/activity/status').set('Host', 'attacker.example').expect(403);
      await request(api).get('/api/activity/status').set('Origin', 'https://attacker.example').expect(403);
      await request(api).post('/api/activity/settings').send({ paused: true }).expect(403);
      const day = (await s.sessions.findOne({}, { sort: { start: -1 } })).day;
      const timeline = (await request(api).get(`/api/activity/timeline?day=${day}`).expect(200)).body;
      assert.ok(timeline.sessions.length > 10 && !('vectors' in timeline.sessions[0]));
      await request(api).get('/api/activity/timeline?day=yesterday').expect(400);
      assert.ok((await request(api).get('/api/activity/search?q=pull%20requests').expect(200)).body.results.length);
      assert.equal((await request(api).post('/api/activity/settings').set('X-Offload-Client', 'local').send({ paused: true }).expect(200)).body.paused, true);
      await request(api).post('/api/activity/settings').set('X-Offload-Client', 'local').send({ paused: 'yes' }).expect(400);
      const routines = (await request(api).get('/api/activity/routines').expect(200)).body.routines;
      assert.equal(routines.length, seeded.routines.length);
      await request(api).post(`/api/activity/routines/${encodeURIComponent(routines[0]._id)}`).set('X-Offload-Client', 'local').send({ decision: 'later' }).expect(400);
      const decided = (await request(api).post(`/api/activity/routines/${encodeURIComponent(routines[0]._id)}`).set('X-Offload-Client', 'local').send({ decision: 'approve' }).expect(200)).body;
      assert.equal(decided.routine.status, 'approved');
      await request(api).post('/api/activity/forget').set('X-Offload-Client', 'local').send({ from: '2026-09-21T10:00:00Z', to: '2026-09-20T10:00:00Z' }).expect(400);
    });
    await t.test('chat: the model gets matching computer history, labeled when it is sample data', async () => {
      const s = await make({ timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone });
      await seedSampleWeek(s, { workspace: process.env.ACTIVITY_WORKSPACE || (await import('node:os')).userInfo().username });
      const question = [{ role: 'user', text: 'When did I last work on the weekly brief?' }];
      const history = await historyContext(s, question);
      assert.match(history[0].title, /Weekly brief/);
      assert.equal(history[0].sample, true);
      assert.equal(history[0].alsoOn.length, 5);
      assert.deepEqual(await historyContext(null, question), []);

      let prompt = '';
      const app = express();
      app.use(express.json());
      app.use((req, res, next) => ((req.workspaceKey = 'one'), next()));
      mountModel(app, {
        dataDir: (await import('node:fs')).mkdtempSync((await import('node:path')).join((await import('node:os')).tmpdir(), 'offload-fit-')),
        enabled: true,
        activity: s,
        status: async () => ({ connected: true, models: [{ id: 'm', efforts: ['low'] }] }),
        run: async (job) => ((prompt = job.prompt), { text: 'ok' }),
      });
      await request(app)
        .post('/api/model/jobs')
        .set('Host', '127.0.0.1:5194')
        .set('X-Offload-Client', 'local')
        .send({ requestId: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb', model: 'm', messages: question, notes: [] })
        .expect(202);
      for (let i = 0; i < 100 && !prompt; i++) await new Promise((r) => setTimeout(r, 20));
      assert.match(prompt, /Computer history \(sample week\)/);
      assert.match(prompt, /Weekly brief/);
    });
    await t.test('workflow from history: the busiest back-and-forth hour becomes a plan that asks before sending', async () => {
      const s = await make({ timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone });
      const me = process.env.ACTIVITY_WORKSPACE || (await import('node:os')).userInfo().username;
      assert.equal(await findFriction(s, me), null, 'no history, no finding');
      await seedSampleWeek(s, { workspace: me });
      const finding = await findFriction(s, me);
      assert.equal(finding.hour, 23);
      assert.equal(finding.days, 5);
      assert.deepEqual(finding.apps.map((a) => a.name).sort(), ['Codex', 'Gmail', 'Google Calendar']);
      assert.match(finding.topTitle, /Scheduling: Atlas Vector Search sync/);
      assert.ok(finding.meetingTimes.includes('12:00 AM'));
      assert.equal(finding.sample, true);
      assert.match(describe(finding), /5 nights/);
      const plan = planWorkflow(finding);
      assert.equal(plan.kind, 'scheduling');
      assert.ok(plan.steps.some((step) => step.ask), 'the plan asks once before sending');
      assert.match(plan.problem, /12:00 AM/);
      const api = createApp({ serveStatic: false, activity: s });
      const body = (await request(api).post('/api/activity/workflow').set('X-Offload-Client','local').send({}).expect(200)).body;
      assert.equal(body.workflow.title, plan.title);
      assert.equal((await request(api).post('/api/activity/workflows').set('X-Offload-Client','local').send(body.workflow).expect(201)).body.status, 'saved-proposal');
      assert.equal(await s.db.collection('activity_workflows').countDocuments(), 1);
    });
  } finally {
    await client.close();
    await mongo.stop();
  }
});
