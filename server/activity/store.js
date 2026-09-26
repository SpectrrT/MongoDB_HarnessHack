// Computer history: which app, window and page you were on, sampled every few seconds and kept in
// MongoDB Atlas. Raw samples go to a time-series collection that forgets them after a week. One
// aggregation ($setWindowFields → $group → $merge) folds them into sessions. Sessions are searched with
// Atlas Search + Atlas Vector Search fused by $rankFusion, and mined for work you repeat.
import os from 'node:os';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { cosine, embedText } from '../../rem/embed.js';
import { hybridRank } from '../../rem/search.js';

export const RETENTION_DAYS = 7;
export const SAMPLE_MS = 5000;
export const GAP_MS = 30000;
export const IDLE_SECONDS = 120;
export const ACTIVE_SECONDS = 5;
export const MIN_STEP_SECONDS = 60;
export const BREAK_MS = 5 * 60e3;
export const MAX_ROUTINE_MS = 60 * 60e3;
export const TEXT_INDEX = 'activity_text';
export const DEFAULT_EXCLUDED = ['1Password', 'Keychain Access', 'Passwords', 'System Settings', 'loginwindow'];
export const BROWSERS = ['Google Chrome', 'Safari', 'Arc', 'Microsoft Edge', 'Brave Browser', 'Firefox', 'Chromium', 'Dia', 'Opera', 'Vivaldi'];
const PRIVATE_WINDOW = /\b(incognito|private browsing|inprivate)\b/i;

export const workspaceId = () => process.env.ACTIVITY_WORKSPACE || os.userInfo().username;
export const deviceId = () => process.env.ACTIVITY_DEVICE || os.hostname().replace(/\.local$/, '');
export const localTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
export const dayString = (date, timeZone) =>
  new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);

export const sampleSchema = z.object({
  ts: z.coerce.date(),
  app: z.string().trim().min(1).max(120),
  bundleId: z.string().max(200).nullish(),
  title: z.string().max(1000).nullish(),
  url: z.string().max(4000).nullish(),
  idle: z.boolean().default(false),
  active: z.boolean().optional(),
  private: z.boolean().optional(),
  source: z.enum(['collector', 'seed']).default('collector'),
}).strict();
export const samplesSchema = z.array(sampleSchema).max(20000);
export const settingsSchema = z.object({
  paused: z.boolean(),
  excludedApps: z.array(z.string().trim().min(1).max(120)).max(50),
  captureTitles: z.boolean(),
  captureUrls: z.boolean(),
}).partial().strict();

// Emails, long numbers (phones, cards, account ids) never reach the database.
export function redact(text) {
  if (!text) return null;
  const clean = String(text)
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[email]')
    .replace(/\b(?:\d[ -]?){12,19}\b/g, '[number]')
    .replace(/\b\d{7,}\b/g, '[number]')
    .replace(/\s+/g, ' ')
    .trim();
  return clean.slice(0, 300) || null;
}

// Keep the page's origin and path. Query strings and fragments often carry tokens, so they are dropped.
export function cleanUrl(raw) {
  if (!raw) return { url: null, domain: null };
  try {
    const u = new URL(raw);
    if (!['http:', 'https:'].includes(u.protocol)) return { url: null, domain: null };
    const domain = u.hostname.replace(/^www\./, '');
    const path = redact(decodeURIComponent(u.pathname)) || '/';
    return { url: `${u.origin}${path}`.slice(0, 300), domain };
  } catch {
    return { url: null, domain: null };
  }
}

export function normalizeSample(s, settings) {
  const excluded = new Set(settings.excludedApps.map((a) => a.toLowerCase()));
  const hidden = !!s.private || excluded.has(s.app.toLowerCase()) || PRIVATE_WINDOW.test(s.title || '');
  const { url, domain } = settings.captureUrls && !hidden && !s.idle ? cleanUrl(s.url) : { url: null, domain: null };
  return {
    ts: s.ts,
    app: s.app,
    bundleId: s.bundleId || null,
    title: hidden || s.idle || !settings.captureTitles ? null : redact(s.title),
    url,
    domain,
    idle: s.idle,
    active: s.idle ? false : (s.active ?? null),
    private: hidden,
    source: s.source,
  };
}

const textOf = (s) => [s.app, s.title, s.domain].filter(Boolean).join(' | ');
const stable = (value) =>
  JSON.stringify(value, (_, v) =>
    v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v,
  );

// The same window on several days is one result: the latest visit, with the days it recurred.
// $vectorSearch returns its nearest neighbours however unrelated they are, so an Atlas hit is kept only if it shares a
// word with the query (one typo allowed, like the text index's fuzzy match) or clears the vector floor the local ranker
// uses. Without this, a query that matches nothing still shows five confident results.
export const MIN_VECTOR = 0.25;
const oneEditApart = (a, b) => {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
};
const wordsOf = (text) => String(text || '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 1);
export function relevantHit(doc, query, queryVector, key) {
  const tokens = wordsOf([doc.app, doc.title, doc.domain, doc.url].filter(Boolean).join(' '));
  if (wordsOf(query).some((w) => tokens.some((t) => oneEditApart(w, t)))) return true;
  return cosine(queryVector, doc.vectors?.[key]) >= MIN_VECTOR;
}

function collapse(results, limit) {
  const groups = new Map();
  for (const r of results) {
    const key = `${r.source || 'collector'}\u0001${r.app}\u0001${r.title || ''}\u0001${r.url || r.domain || ''}`;
    const group = groups.get(key);
    if (!group) groups.set(key, { ...r, count: 1, days: [r.day] });
    else {
      group.count++;
      if (!group.days.includes(r.day)) group.days.push(r.day);
      if (r.start > group.start) Object.assign(group, { ...r, count: group.count, days: group.days, score: group.score });
    }
  }
  return [...groups.values()].slice(0, limit).map((g) => ({ ...g, days: g.days.sort().reverse() }));
}

// Voyage when VOYAGE_API_KEY is set (1024 dims, like Sleep v2), otherwise a local hashing embedder
// (256 dims). Each lives in its own field and vector index, so switching never mixes dimensions.
export function createActivityEmbedder() {
  const key = process.env.VOYAGE_API_KEY;
  if (!key) {
    return {
      key: 'local256',
      name: 'local hashing embedder (256 dims)',
      dims: 256,
      embed: async (texts) => texts.map((t) => embedText(t, 256)),
      embedQuery: async (text) => embedText(text, 256),
    };
  }
  const model = process.env.VOYAGE_MODEL || 'voyage-4';
  const baseUrl = (process.env.EMBEDDINGS_BASE_URL || 'https://api.voyageai.com/v1').replace(/\/$/, '');
  const call = async (input, inputType) => {
    const response = await fetch(`${baseUrl}/embeddings`, {
      method: 'POST',
      signal: AbortSignal.timeout(30000),
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ input, model, input_type: inputType, output_dimension: 1024 }),
    });
    if (!response.ok) throw new Error(`Voyage embeddings failed with status ${response.status}.`);
    const body = await response.json();
    return [...body.data].sort((a, b) => a.index - b.index).map((d) => d.embedding);
  };
  return {
    key: 'voyage1024',
    name: `${model} (1024 dims)`,
    dims: 1024,
    embed: async (texts) => {
      const out = [];
      for (let i = 0; i < texts.length; i += 64) out.push(...(await call(texts.slice(i, i + 64), 'document')));
      return out;
    },
    embedQuery: async (text) => (await call([text], 'query'))[0],
  };
}

export class ActivityStore {
  constructor(db, { embedder = createActivityEmbedder(), timeZone = localTimeZone(), log = () => {} } = {}) {
    this.db = db;
    this.events = db.collection('activity_events');
    this.sessions = db.collection('activity_sessions');
    this.settingsCollection = db.collection('activity_settings');
    this.routinesCollection = db.collection('activity_routines');
    this.embedder = embedder;
    this.timeZone = timeZone;
    this.vectorIndex = `activity_vector_${embedder.key}`;
    this.vectorPath = `vectors.${embedder.key}`;
    this.searchMode = { atlas: false, reason: 'search indexes not checked yet' };
    this.log = log;
  }

  today() {
    return dayString(new Date(), this.timeZone);
  }

  async initialize({ searchIndexes = true } = {}) {
    try {
      // Raw samples: a time-series collection with automatic expiry (forgetting is built in).
      await this.db.createCollection('activity_events', {
        timeseries: { timeField: 'ts', metaField: 'meta', granularity: 'seconds' },
        expireAfterSeconds: RETENTION_DAYS * 86400,
      });
    } catch (error) {
      if (error.codeName !== 'NamespaceExists') throw error;
    }
    await this.events.createIndex({ 'meta.workspace': 1, 'meta.device': 1, ts: 1 });
    await this.sessions.createIndex({ workspace: 1, day: 1, start: 1 });
    await this.sessions.createIndex({ workspace: 1, device: 1, start: -1 });
    await this.routinesCollection.createIndex({ workspace: 1, dayCount: -1 });
    if (searchIndexes) await this.ensureSearchIndexes();
    return this;
  }

  // Atlas Search (keywords, fuzzy) + Atlas Vector Search (meaning) on sessions. Off Atlas these calls
  // fail and search falls back to the same fusion computed in the app.
  async ensureSearchIndexes() {
    const specs = [
      {
        name: TEXT_INDEX,
        type: 'search',
        definition: {
          mappings: {
            dynamic: false,
            fields: {
              title: { type: 'string' },
              app: { type: 'string' },
              domain: { type: 'string', analyzer: 'lucene.simple' },
              url: { type: 'string', analyzer: 'lucene.simple' },
              workspace: { type: 'token' },
              day: { type: 'token' },
              idle: { type: 'boolean' },
            },
          },
        },
      },
      {
        name: this.vectorIndex,
        type: 'vectorSearch',
        definition: {
          fields: [
            { type: 'vector', path: this.vectorPath, numDimensions: this.embedder.dims, similarity: 'cosine' },
            { type: 'filter', path: 'workspace' },
            { type: 'filter', path: 'idle' },
            { type: 'filter', path: 'day' },
          ],
        },
      },
    ];
    try {
      const present = new Map((await this.sessions.listSearchIndexes().toArray()).map((i) => [i.name, i]));
      for (const spec of specs) {
        const current = present.get(spec.name);
        if (!current) await this.sessions.createSearchIndex(spec);
        else if (stable(current.latestDefinition) !== stable(spec.definition))
          await this.sessions.updateSearchIndex(spec.name, spec.definition);
      }
      this.searchMode = { atlas: true, reason: 'Atlas Search + Vector Search, fused with $rankFusion' };
    } catch (error) {
      this.searchMode = { atlas: false, reason: error.codeName || error.message };
    }
    return this.searchMode;
  }

  async settings(workspace) {
    const doc = (await this.settingsCollection.findOne({ _id: workspace })) || {};
    return {
      paused: doc.paused ?? false,
      excludedApps: doc.excludedApps ?? DEFAULT_EXCLUDED,
      captureTitles: doc.captureTitles ?? true,
      captureUrls: doc.captureUrls ?? true,
    };
  }

  async updateSettings(workspace, patch) {
    const clean = settingsSchema.parse(patch);
    await this.settingsCollection.updateOne(
      { _id: workspace },
      { $set: { ...clean, updatedAt: new Date() } },
      { upsert: true },
    );
    return this.settings(workspace);
  }

  async ingest(workspace, device, samples) {
    const parsed = samplesSchema.parse(samples);
    if (!parsed.length) return { inserted: 0 };
    const settings = await this.settings(workspace);
    const live = parsed.filter((s) => s.source === 'seed' || !settings.paused);
    if (!live.length) return { inserted: 0, paused: true };
    const docs = live.map((s) => ({ ...normalizeSample(s, settings), meta: { workspace, device } }));
    await this.events.insertMany(docs, { ordered: false });
    return { inserted: docs.length };
  }

  // Gaps and islands in one aggregation: a new session starts when the app, window or page changes
  // or when samples stop for more than GAP_MS. Session ids are the device plus the start time, so
  // rerunning the pipeline extends the open session instead of duplicating it.
  sessionizePipeline(workspace, device, from, to) {
    const prefix = createHash('sha1').update(`${workspace}\u0000${device}`).digest('hex').slice(0, 12);
    const timezone = this.timeZone;
    return [
      { $match: { 'meta.workspace': workspace, 'meta.device': device, ts: { $gte: from, $lte: to } } },
      {
        $set: {
          key: {
            $cond: [
              '$idle',
              { $concat: ['idle', '\u0001', { $ifNull: ['$source', 'collector'] }, '\u0001', { $dateToString: { date: '$ts', format: '%Y-%m-%d', timezone } }] },
              { $concat: ['$app', '\u0001', { $ifNull: ['$title', ''] }, '\u0001', { $ifNull: ['$url', ''] }, '\u0001', { $ifNull: ['$source', 'collector'] }, '\u0001', { $dateToString: { date: '$ts', format: '%Y-%m-%d', timezone } }] },
            ],
          },
        },
      },
      {
        $setWindowFields: {
          sortBy: { ts: 1 },
          output: {
            previousKey: { $shift: { output: '$key', by: -1, default: null } },
            previousTs: { $shift: { output: '$ts', by: -1, default: null } },
          },
        },
      },
      {
        $set: {
          boundary: {
            $cond: [
              {
                $or: [
                  { $eq: ['$previousTs', null] },
                  { $ne: ['$key', '$previousKey'] },
                  { $gt: [{ $subtract: ['$ts', '$previousTs'] }, GAP_MS] },
                ],
              },
              1,
              0,
            ],
          },
        },
      },
      {
        $setWindowFields: {
          sortBy: { ts: 1 },
          output: { sequence: { $sum: '$boundary', window: { documents: ['unbounded', 'current'] } } },
        },
      },
      {
        $group: {
          _id: '$sequence',
          start: { $min: '$ts' },
          last: { $max: '$ts' },
          samples: { $sum: 1 },
          app: { $first: '$app' },
          bundleId: { $first: '$bundleId' },
          title: { $first: '$title' },
          url: { $last: '$url' },
          domain: { $first: '$domain' },
          idle: { $first: '$idle' },
          private: { $max: '$private' },
          sources: { $addToSet: '$source' },
          activeSamples: { $sum: { $cond: [{ $eq: ['$active', true] }, 1, 0] } },
          knownSamples: { $sum: { $cond: [{ $eq: [{ $type: '$active' }, 'bool'] }, 1, 0] } },
        },
      },
      {
        $set: {
          _id: { $concat: [prefix, ':', { $toString: { $toLong: '$start' } }] },
          workspace,
          device,
          end: { $add: ['$last', SAMPLE_MS] },
          durationSec: { $round: [{ $divide: [{ $subtract: [{ $add: ['$last', SAMPLE_MS] }, '$start'] }, 1000] }, 0] },
          day: { $dateToString: { date: '$start', format: '%Y-%m-%d', timezone } },
          hour: { $hour: { date: '$start', timezone } },
          weekday: { $isoDayOfWeek: { date: '$start', timezone } },
          label: {
            $cond: [
              '$idle',
              'Away',
              { $cond: [{ $and: [{ $ne: ['$domain', null] }, { $in: ['$app', BROWSERS] }] }, '$domain', '$app'] },
            ],
          },
          source: { $cond: [{ $in: ['seed', '$sources'] }, 'seed', 'collector'] },
          // Share of samples with keyboard or mouse input: hands-on work versus reading or watching.
          activeShare: {
            $cond: [{ $gt: ['$knownSamples', 0] }, { $round: [{ $divide: ['$activeSamples', '$knownSamples'] }, 2] }, null],
          },
          updatedAt: '$$NOW',
        },
      },
      { $unset: ['last', 'sources', 'activeSamples', 'knownSamples'] },
      { $merge: { into: 'activity_sessions', on: '_id', whenMatched: 'merge', whenNotMatched: 'insert' } },
    ];
  }

  async sessionize(workspace, device, { from, to = new Date() } = {}) {
    if (!from) {
      const latest = await this.sessions
        .find({ workspace, device }, { projection: { start: 1 } })
        .sort({ start: -1 })
        .limit(1)
        .next();
      from = latest ? latest.start : new Date(+to - 24 * 3600e3);
    }
    await this.events.aggregate(this.sessionizePipeline(workspace, device, from, to)).toArray();
    try {
      return await this.embedPending(workspace);
    } catch (error) {
      this.log(`Embedding sessions failed; they stay keyword-searchable: ${error.message}`);
      return { embedded: 0 };
    }
  }

  async embedPending(workspace, { limit = 500 } = {}) {
    const pending = await this.sessions
      .find({ workspace, idle: false, [this.vectorPath]: { $exists: false } }, { projection: { app: 1, title: 1, domain: 1 } })
      .limit(limit)
      .toArray();
    if (!pending.length) return { embedded: 0 };
    const texts = [...new Set(pending.map(textOf))];
    const vectors = await this.embedder.embed(texts);
    const byText = new Map(texts.map((t, i) => [t, vectors[i]]));
    await this.sessions.bulkWrite(
      pending.map((s) => ({
        updateOne: { filter: { _id: s._id }, update: { $set: { [this.vectorPath]: byText.get(textOf(s)), text: textOf(s) } } },
      })),
      { ordered: false },
    );
    return { embedded: pending.length };
  }

  async timeline(workspace, { day }) {
    const sessions = await this.sessions
      .find({ workspace, day }, { projection: { vectors: 0, text: 0, updatedAt: 0, workspace: 0 } })
      .sort({ start: 1 })
      .limit(5000)
      .toArray();
    return { day, sessions };
  }

  async stats(workspace, { day }) {
    const [facets] = await this.sessions
      .aggregate([
        { $match: { workspace, day, idle: false } },
        {
          $facet: {
            totals: [
              {
                $group: {
                  _id: null,
                  totalSec: { $sum: '$durationSec' },
                  activeSec: { $sum: { $multiply: ['$durationSec', { $ifNull: ['$activeShare', 0] }] } },
                  sessions: { $sum: 1 },
                  first: { $min: '$start' },
                  last: { $max: '$end' },
                },
              },
            ],
            byApp: [
              {
                $group: {
                  _id: '$app',
                  seconds: { $sum: '$durationSec' },
                  activeSec: { $sum: { $multiply: ['$durationSec', { $ifNull: ['$activeShare', 0] }] } },
                  sessions: { $sum: 1 },
                },
              },
              { $sort: { seconds: -1 } },
              { $limit: 10 },
              { $project: { _id: 0, app: '$_id', seconds: 1, activeSec: { $round: ['$activeSec', 0] }, sessions: 1 } },
            ],
            byHour: [
              { $group: { _id: '$hour', seconds: { $sum: '$durationSec' } } },
              { $sort: { _id: 1 } },
              { $project: { _id: 0, hour: '$_id', seconds: 1 } },
            ],
            focus: [{ $match: { durationSec: { $gte: 1500 } } }, { $count: 'blocks' }],
            labels: [{ $sort: { start: 1 } }, { $project: { _id: 0, label: 1 } }],
          },
        },
      ])
      .toArray();
    const totals = facets.totals[0] || { totalSec: 0, sessions: 0, first: null, last: null };
    const labels = facets.labels.map((l) => l.label);
    const switches = labels.filter((label, i) => i > 0 && label !== labels[i - 1]).length;
    return {
      day,
      totalSec: totals.totalSec,
      activeSec: Math.round(totals.activeSec || 0),
      sessions: totals.sessions,
      switches,
      focusBlocks: facets.focus[0]?.blocks || 0,
      first: totals.first,
      last: totals.last,
      byApp: facets.byApp,
      byHour: facets.byHour,
    };
  }

  // The local hashing embedder matches shared words, not meaning, so it counts half as much as keywords;
  // with Voyage embeddings both sides count equally.
  rankFusionPipeline(workspace, query, queryVector, limit) {
    const semantic = this.embedder.key !== 'local256';
    return [
      {
        $rankFusion: {
          input: {
            pipelines: {
              vector: [
                {
                  $vectorSearch: {
                    index: this.vectorIndex,
                    path: this.vectorPath,
                    queryVector,
                    numCandidates: 300,
                    limit: semantic ? 50 : 20,
                    filter: { workspace, idle: false },
                  },
                },
              ],
              text: [
                {
                  $search: {
                    index: TEXT_INDEX,
                    compound: {
                      should: [{ text: { query, path: ['title', 'app', 'domain', 'url'], fuzzy: { maxEdits: 1 } } }],
                      minimumShouldMatch: 1,
                      filter: [{ equals: { path: 'workspace', value: workspace } }, { equals: { path: 'idle', value: false } }],
                    },
                  },
                },
                { $limit: 50 },
              ],
            },
          },
          combination: { weights: { vector: semantic ? 1 : 0.5, text: 1 } },
        },
      },
      { $limit: limit },
      { $project: { start: 1, end: 1, durationSec: 1, app: 1, title: 1, domain: 1, url: 1, vectors: 1, day: 1, label: 1, source: 1, private: 1, activeShare: 1 } },
    ];
  }

  async search(workspace, query, { limit = 10 } = {}) {
    const q = String(query || '').trim().slice(0, 200);
    if (!q) return { mode: this.searchMode.atlas ? 'atlas-hybrid' : 'local', results: [] };
    let queryVector;
    try { queryVector = await this.embedder.embedQuery(q); }
    catch (error) {
      this.log(`Query embedding failed; using keyword search: ${error.message}`);
      queryVector = new Array(this.embedder.dims).fill(0);
    }
    if (this.searchMode.atlas) {
      try {
        const results = (await this.sessions.aggregate(this.rankFusionPipeline(workspace, q, queryVector, Math.min(100, limit * 10))).toArray())
          .filter((r) => relevantHit(r, q, queryVector, this.embedder.key))
          .map(({ vectors, ...r }) => r);
        return { mode: 'atlas-hybrid', results: collapse(results.map((r, i) => ({ ...r, score: 1 / (60 + i + 1) })), limit) };
      } catch (error) {
        this.log(`Atlas hybrid search failed, ranking in the app instead: ${error.message}`);
      }
    }
    const docs = await this.sessions
      .find({ workspace, idle: false }, { projection: { updatedAt: 0 } })
      .sort({ start: -1 })
      .limit(5000)
      .toArray();
    const zero = new Array(this.embedder.dims).fill(0);
    const hits = hybridRank(docs, {
      query: q,
      queryVector,
      textOf: (d) => [d.app, d.title, d.domain, d.url].filter(Boolean).join(' '),
      vectorOf: (d) => d.vectors?.[this.embedder.key] || zero,
      k: Math.min(100, limit * 10),
      minVector: 0.25,
    });
    return {
      mode: 'local',
      results: collapse(
        hits.map(({ doc, rrf }) => {
          const { vectors, text, workspace: _, ...visible } = doc;
          return { ...visible, score: rrf };
        }),
        limit,
      ),
    };
  }

  // Work you repeat. Each day splits into stretches at breaks (away time, or a gap longer than
  // BREAK_MS). A stretch of 2 to 6 steps that takes under an hour and recurs on several days, or many
  // times, is a routine worth handing off; long working blocks are not. Consecutive visits to the same
  // place collapse, and steps under a minute are ignored. Cached candidates preserve the human's
  // decision (candidate, approved, dismissed) across reruns.
  routinesPipeline(workspace, { since, minDays, minCount }) {
    const perDay = { device: '$device', day: '$day', source: '$source' };
    const minutes = { $divide: [{ $subtract: ['$end', '$start'] }, 60000] };
    return [
      {
        $match: {
          workspace,
          start: { $gte: since },
          private: { $ne: true },
          $or: [{ idle: true }, { durationSec: { $gte: MIN_STEP_SECONDS } }],
        },
      },
      {
        $setWindowFields: {
          partitionBy: perDay,
          sortBy: { start: 1 },
          output: {
            previousEnd: { $shift: { output: '$end', by: -1, default: null } },
            previousIdle: { $shift: { output: '$idle', by: -1, default: true } },
          },
        },
      },
      {
        $set: {
          breakBefore: {
            $cond: [
              {
                $or: [
                  '$idle',
                  '$previousIdle',
                  { $eq: ['$previousEnd', null] },
                  { $gt: [{ $subtract: ['$start', '$previousEnd'] }, BREAK_MS] },
                ],
              },
              1,
              0,
            ],
          },
        },
      },
      {
        $setWindowFields: {
          partitionBy: perDay,
          sortBy: { start: 1 },
          output: { stretch: { $sum: '$breakBefore', window: { documents: ['unbounded', 'current'] } } },
        },
      },
      { $match: { idle: false } },
      {
        $setWindowFields: {
          partitionBy: { device: '$device', day: '$day', source: '$source', stretch: '$stretch' },
          sortBy: { start: 1 },
          output: { previousLabel: { $shift: { output: '$label', by: -1, default: null } } },
        },
      },
      { $set: { labelBoundary: { $cond: [{ $ne: ['$label', '$previousLabel'] }, 1, 0] } } },
      {
        $setWindowFields: {
          partitionBy: { device: '$device', day: '$day', source: '$source', stretch: '$stretch' },
          sortBy: { start: 1 },
          output: { step: { $sum: '$labelBoundary', window: { documents: ['unbounded', 'current'] } } },
        },
      },
      // Merge adjacent visits without losing their final end time. Dropping duplicate labels
      // understated routine duration and could turn a long working block into a short routine.
      {
        $group: {
          _id: { device: '$device', day: '$day', source: '$source', stretch: '$stretch', step: '$step' },
          device: { $first: '$device' }, day: { $first: '$day' }, source: { $first: '$source' },
          stretch: { $first: '$stretch' }, label: { $first: '$label' }, title: { $first: '$title' },
          start: { $min: '$start' }, end: { $max: '$end' }, hour: { $first: '$hour' },
          weekday: { $first: '$weekday' }, activeShare: { $avg: '$activeShare' },
        },
      },
      { $sort: { device: 1, day: 1, start: 1 } },
      {
        $group: {
          _id: { device: '$device', day: '$day', source: '$source', stretch: '$stretch' },
          steps: { $push: '$label' },
          titles: { $push: '$title' },
          start: { $min: '$start' },
          end: { $max: '$end' },
          hour: { $first: '$hour' },
          weekday: { $first: '$weekday' },
          source: { $first: '$source' },
          handsOn: { $avg: '$activeShare' },
        },
      },
      {
        $match: {
          'steps.1': { $exists: true },
          'steps.6': { $exists: false },
          $expr: { $lte: [{ $subtract: ['$end', '$start'] }, MAX_ROUTINE_MS] },
        },
      },
      {
        $group: {
          _id: {
            $concat: [
              workspace,
              ':',
              { $ifNull: ['$source', 'collector'] },
              ':',
              {
                $reduce: {
                  input: '$steps',
                  initialValue: '',
                  in: { $concat: ['$$value', { $cond: [{ $eq: ['$$value', ''] }, '', ' → '] }, '$$this'] },
                },
              },
            ],
          },
          steps: { $first: '$steps' },
          titles: { $last: '$titles' },
          count: { $sum: 1 },
          days: { $addToSet: '$_id.day' },
          weekdays: { $addToSet: '$weekday' },
          typicalHour: { $median: { input: '$hour', method: 'approximate' } },
          earliestHour: { $min: '$hour' },
          latestHour: { $max: '$hour' },
          minutes: { $median: { input: minutes, method: 'approximate' } },
          sources: { $addToSet: '$source' },
          lastSeen: { $max: '$start' },
          handsOn: { $avg: '$handsOn' },
        },
      },
      { $set: { dayCount: { $size: '$days' } } },
      { $match: { $or: [{ dayCount: { $gte: minDays } }, { count: { $gte: minCount } }] } },
      {
        $set: {
          workspace,
          days: { $sortArray: { input: '$days', sortBy: 1 } },
          weekdays: { $sortArray: { input: '$weekdays', sortBy: 1 } },
          typicalHour: { $round: ['$typicalHour', 0] },
          minutes: { $round: ['$minutes', 0] },
          handsOn: { $round: ['$handsOn', 2] },
          source: { $cond: [{ $gt: [{ $size: '$sources' }, 1] }, 'mixed', { $first: '$sources' }] },
          updatedAt: '$$NOW',
        },
      },
      { $unset: 'sources' },
      { $merge: { into: 'activity_routines', on: '_id', whenMatched: 'merge', whenNotMatched: 'insert' } },
    ];
  }

  async routines(workspace, { days = 28, minDays = 3, minCount = 4 } = {}) {
    const since = new Date(Date.now() - days * 86400e3);
    // Read the current candidates first so a stale cache entry cannot survive missing evidence.
    // Use candidate ids rather than comparing client and database clocks.
    const pipeline = this.routinesPipeline(workspace, { since, minDays, minCount });
    const candidates = await this.sessions.aggregate(pipeline.slice(0, -1)).toArray();
    if (!candidates.length) return [];
    await this.routinesCollection.bulkWrite(candidates.map(({ _id, ...fields }) => ({
      updateOne: { filter: { _id }, update: { $set: fields }, upsert: true },
    })));
    const found = await this.routinesCollection
      .find({ workspace, status: { $ne: 'dismissed' }, _id: { $in: candidates.map(r => r._id) } }, { projection: { workspace: 0 } })
      .sort({ dayCount: -1, count: -1, minutes: -1 })
      .limit(12)
      .toArray();
    return found.map((r) => {
      const spanDays = (new Date(r.days.at(-1)) - new Date(r.days[0])) / 86400e3;
      const weekly = r.days.length >= 3 && r.weekdays.length === 1 && spanDays >= 14 && r.latestHour - r.earliestHour <= 1;
      return { ...r, status: r.status || 'candidate', cadence: weekly ? 'weekly' : 'repeated', timeZone: this.timeZone };
    });
  }

  async decide(workspace, id, decision) {
    return this.routinesCollection.findOneAndUpdate(
      { _id: id, workspace },
      { $set: { status: decision === 'approve' ? 'approved' : 'dismissed', decidedAt: new Date() } },
      { returnDocument: 'after', projection: { workspace: 0 } },
    );
  }

  async forget(workspace, { from, to }) {
    const events = await this.events.deleteMany({ 'meta.workspace': workspace, ts: { $gte: from, $lt: to } });
    const sessions = await this.sessions.deleteMany({ workspace, start: { $lt: to }, end: { $gt: from } });
    // Routine titles and counts are derived from sessions. Remove the cached copies as well.
    // The next read rebuilds candidates only from surviving source sessions.
    const routines = await this.routinesCollection.deleteMany({ workspace });
    return { deletedEvents: events.deletedCount, deletedSessions: sessions.deletedCount, deletedRoutines: routines.deletedCount };
  }

  async status(workspace) {
    const [settings, devices] = await Promise.all([
      this.settings(workspace),
      this.sessions
        .aggregate([
          { $match: { workspace } },
          { $sort: { end: -1 } },
          { $group: { _id: '$device', lastSeen: { $max: '$end' }, source: { $first: '$source' }, sources: { $addToSet: '$source' } } },
          { $sort: { lastSeen: -1 } },
          { $limit: 5 },
          { $project: { _id: 0, device: '$_id', lastSeen: 1, source: 1, sources: 1 } },
        ])
        .toArray(),
    ]);
    return {
      configured: true,
      workspace,
      paused: settings.paused,
      search: this.searchMode.atlas ? 'atlas-hybrid' : 'local',
      embedder: this.embedder.name,
      retentionDays: RETENTION_DAYS,
      today: this.today(),
      devices,
    };
  }

  watchSettings(workspace, onChange) {
    const stream = this.settingsCollection.watch([{ $match: { 'documentKey._id': workspace } }]);
    stream.on('change', () => onChange());
    stream.on('error', (error) => this.log(`Settings change stream stopped: ${error.message}`));
    return () => stream.close().catch(() => {});
  }

  // Change streams feed the page live: new or growing sessions, and pause/resume.
  watch(workspace, onChange) {
    const sessions = this.sessions.watch(
      [{ $match: { operationType: { $in: ['insert', 'update', 'replace'] }, 'fullDocument.workspace': workspace } }],
      { fullDocument: 'updateLookup' },
    );
    sessions.on('change', (change) => onChange({ type: 'session', id: change.documentKey?._id }));
    sessions.on('error', (error) => onChange({ type: 'error', message: error.message }));
    const stopSettings = this.watchSettings(workspace, () => onChange({ type: 'settings' }));
    return () => {
      sessions.close().catch(() => {});
      stopSettings();
    };
  }
}

export async function createActivity(db, options) {
  return new ActivityStore(db, options).initialize();
}
