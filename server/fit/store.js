// Harness fit in MongoDB Atlas. fit_turns holds redacted agent turns (never raw prompts or tool output),
// fit_edits every proposed edit with its backtest, and fit_harness the versioned harness per agent:
// parent, diff and the edits that produced it, like REM's lineage. A unique index on the version keeps
// two evolutions from committing the same version.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { turnsFromClaudeCode } from './turns.js';
import { MECHANISMS, analyze, harnessPatch } from './evolve.js';

// Claude Code keeps one log per session under ~/.claude/projects/<the project path with dashes>.
export const claudeProjectDir = (project = process.env.FIT_PROJECT || process.cwd()) =>
  path.join(os.homedir(), '.claude', 'projects', path.resolve(project).replace(/[^A-Za-z0-9]/g, '-'));

export class FitStore {
  constructor(db) {
    this.turns = db.collection('fit_turns');
    this.harness = db.collection('fit_harness');
    this.edits = db.collection('fit_edits');
  }

  async initialize() {
    await this.turns.createIndex({ workspace: 1, agent: 1, start: 1 });
    await this.harness.createIndex({ workspace: 1, agent: 1, version: -1 }, { unique: true });
    await this.edits.createIndex({ workspace: 1, agent: 1 });
    return this;
  }

  async ingestTurns(workspace, turns) {
    if (!turns.length) return { turns: 0 };
    await this.turns.bulkWrite(
      turns.map((t) => {
        const { promptRaw, ...stored } = t;
        return { replaceOne: { filter: { _id: t._id }, replacement: { ...stored, workspace, ingestedAt: new Date() }, upsert: true } };
      }),
      { ordered: false },
    );
    return { turns: turns.length };
  }

  async ingestClaudeCode(workspace, { dir = claudeProjectDir(), agent = 'claude-code' } = {}) {
    const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl')) : [];
    const turns = files.flatMap((f) =>
      turnsFromClaudeCode(fs.readFileSync(path.join(dir, f), 'utf8').split('\n'), { agent }).map((t, i) => ({
        ...t,
        _id: `${agent}:${t.session}:${i}`,
      })),
    );
    await this.ingestTurns(workspace, turns);
    return { files: files.length, turns: turns.length };
  }

  current(workspace, agent) {
    return this.harness.findOne({ workspace, agent }, { sort: { version: -1 } });
  }

  // Backtest every mechanism on the recorded turns, then commit a new harness version when the accepted
  // set changed. Asks the person approved count as accepted.
  async evolve(workspace, agent) {
    const turns = await this.turns.find({ workspace, agent }).sort({ start: 1 }).toArray();
    const analysis = analyze(turns);
    const approved = new Set(
      (await this.edits.find({ workspace, agent, approval: 'approved' }, { projection: { id: 1 } }).toArray()).map((e) => e.id),
    );
    for (const p of analysis.proposals) if (p.decision === 'ask' && approved.has(p.id)) p.decision = 'accepted';
    const accepted = analysis.proposals.filter((p) => p.decision === 'accepted');
    const current = await this.current(workspace, agent);
    const before = new Map((current?.edits || []).map((e) => [e.id, e]));
    const diff = [
      ...accepted.filter((p) => !before.has(p.id)).map((p) => `+ ${p.type} ${p.id}: ${p.text}`),
      ...accepted.filter((p) => before.has(p.id) && before.get(p.id).text !== p.text).map((p) => `~ ${p.type} ${p.id}: ${p.text}`),
      ...[...before.values()].filter((e) => !accepted.some((p) => p.id === e.id)).map((e) => `- ${e.type} ${e.id}: ${e.text}`),
    ];
    let version = current;
    if (diff.length) {
      const next = (current?.version || 0) + 1;
      version = {
        _id: `${workspace}:${agent}:v${next}`,
        workspace,
        agent,
        version: next,
        parent: current?.version || 0,
        edits: accepted.map(({ id, type, text, pattern, prediction, reason }) => ({ id, type, text, pattern, prediction, reason })),
        diff,
        basedOn: { turns: analysis.turns, frustrated: analysis.frustrated, sessions: analysis.sessions },
        createdAt: new Date(),
      };
      await this.harness.insertOne(version);
    }
    const now = new Date();
    await this.edits.bulkWrite(
      analysis.proposals.map((p) => ({
        updateOne: {
          filter: { _id: `${workspace}:${agent}:${p.id}` },
          update: { $set: { workspace, agent, ...p, updatedAt: now }, $setOnInsert: { firstSeen: now } },
          upsert: true,
        },
      })),
      { ordered: false },
    );
    return { analysis, version, changed: diff.length > 0, patch: version ? harnessPatch(version) : '' };
  }

  async decide(workspace, agent, id, decision) {
    return this.edits.findOneAndUpdate(
      { _id: `${workspace}:${agent}:${id}`, decision: 'ask' },
      { $set: { approval: decision === 'approve' ? 'approved' : 'denied', decidedAt: new Date() } },
      { returnDocument: 'after' },
    );
  }

  // Friction by signal, intent and tool in one aggregation, the latest harness and its lineage, and each
  // accepted edit's outcome: how often its pattern showed up before and after the version that added it.
  async report(workspace, agent) {
    const [stats] = await this.turns
      .aggregate([
        { $match: { workspace, agent } },
        {
          $facet: {
            totals: [
              {
                $group: {
                  _id: null,
                  turns: { $sum: 1 },
                  toolCalls: { $sum: '$toolCount' },
                  frustrated: { $sum: { $cond: [{ $gt: ['$friction', 0] }, 1, 0] } },
                  safetyBlocks: { $sum: '$blockedSafety' },
                  sessions: { $addToSet: '$session' },
                  first: { $min: '$start' },
                  last: { $max: '$end' },
                },
              },
              { $set: { sessions: { $size: '$sessions' } } },
            ],
            bySignal: [
              { $project: { signal: { $objectToArray: '$reaction' }, interrupted: 1 } },
              { $unwind: '$signal' },
              { $match: { 'signal.v': true, 'signal.k': { $ne: 'any' } } },
              { $group: { _id: '$signal.k', turns: { $sum: 1 } } },
              { $sort: { turns: -1 } },
            ],
            interrupted: [{ $match: { interrupted: true } }, { $count: 'turns' }],
            byIntent: [
              { $group: { _id: '$intent', turns: { $sum: 1 }, frustrated: { $sum: { $cond: [{ $gt: ['$friction', 0] }, 1, 0] } } } },
              { $sort: { turns: -1 } },
            ],
            byTool: [
              { $unwind: '$tools' },
              {
                $group: {
                  _id: '$tools.name',
                  calls: { $sum: 1 },
                  inFrustratedTurns: { $sum: { $cond: [{ $gt: ['$friction', 0] }, 1, 0] } },
                  blocked: { $sum: { $cond: [{ $ifNull: ['$tools.blocked', false] }, 1, 0] } },
                  errors: { $sum: { $cond: [{ $and: [{ $eq: ['$tools.ok', false] }, { $not: [{ $ifNull: ['$tools.blocked', false] }] }] }, 1, 0] } },
                },
              },
              { $sort: { calls: -1 } },
              { $limit: 10 },
            ],
            frustrated: [
              { $match: { friction: { $gt: 0 } } },
              { $sort: { friction: -1, start: -1 } },
              { $limit: 12 },
              {
                $project: {
                  prompt: 1, intent: 1, friction: 1, reaction: 1, interrupted: 1, toolCount: 1, toolNames: 1,
                  blockedSafety: 1, boundary: 1, durationSec: 1, silenceSec: 1, start: 1, reply: 1,
                },
              },
            ],
          },
        },
      ])
      .toArray();
    const harness = await this.current(workspace, agent);
    const lineage = await this.harness
      .find({ workspace, agent }, { projection: { version: 1, parent: 1, diff: 1, createdAt: 1, basedOn: 1 } })
      .sort({ version: 1 })
      .toArray();
    const proposals = await this.edits.find({ workspace, agent }, { projection: { workspace: 0, agent: 0 } }).toArray();
    const outcomes = [];
    if (harness) {
      const turns = await this.turns.find({ workspace, agent }, { sort: { start: 1 } }).toArray();
      for (const edit of harness.edits) {
        const m = MECHANISMS.find((x) => x.id === edit.id);
        if (!m) continue;
        const added = lineage.find((v) => v.diff?.some((d) => d.includes(` ${edit.id}:`)))?.createdAt || harness.createdAt;
        const beforeTurns = turns.filter((t) => t.start < added), afterTurns = turns.filter((t) => t.start >= added);
        outcomes.push({
          id: edit.id,
          before: { turns: beforeTurns.length, hits: beforeTurns.filter(m.addresses).length },
          after: { turns: afterTurns.length, hits: afterTurns.filter(m.addresses).length },
        });
      }
    }
    const totals = stats.totals[0] || { turns: 0, toolCalls: 0, frustrated: 0, safetyBlocks: 0, sessions: 0 };
    return {
      agent,
      totals: { ...totals, interrupted: stats.interrupted[0]?.turns || 0 },
      bySignal: stats.bySignal.map((s) => ({ signal: s._id, turns: s.turns })),
      byIntent: stats.byIntent.map((s) => ({ intent: s._id, turns: s.turns, frustrated: s.frustrated })),
      byTool: stats.byTool.map((s) => ({ tool: s._id, calls: s.calls, inFrustratedTurns: s.inFrustratedTurns, blocked: s.blocked, errors: s.errors })),
      frustrated: stats.frustrated,
      harness,
      lineage,
      proposals,
      outcomes,
      patch: harness ? harnessPatch(harness) : '',
    };
  }
}

export async function createFit(db) {
  return new FitStore(db).initialize();
}
