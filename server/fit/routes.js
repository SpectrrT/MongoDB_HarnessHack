// /api/fit/*: how agents worked for the person on this machine, and the harness evolved from it.
import { z } from 'zod';
import { workspaceId } from '../activity/store.js';
import { claudeProjectDir } from './store.js';

const agentSchema = z.enum(['claude-code']).default('claude-code');

export function fitRoutes(app, { fit }) {
  const workspace = workspaceId();
  const route = (handler) => async (req, res, next) => {
    if (!fit) return res.status(503).json({ error: 'Harness fit needs MongoDB. Set MONGODB_URI and run npm run harness:server.' });
    try {
      await handler(req, res);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: 'Invalid request.' });
      next(error);
    }
  };
  // Reading Claude Code's session logs is opt-in: they can hold secrets, even though only redacted excerpts are stored.
  const readLogs = process.env.FIT_READ_CLAUDE_LOGS === '1';
  app.get('/api/fit/status', (req, res) => res.json({ configured: !!fit, readsLogs: !!fit && readLogs, source: fit && readLogs ? claudeProjectDir() : null }));
  app.get('/api/fit/report', route(async (req, res) => res.json(await fit.report(workspace, agentSchema.parse(req.query.agent)))));
  // Backtest the stored turns (and, if enabled, read the latest session logs first); commit a new harness
  // version when the accepted edits changed.
  app.post(
    '/api/fit/evolve',
    route(async (req, res) => {
      const agent = agentSchema.parse(req.body?.agent);
      const ingested = readLogs ? await fit.ingestClaudeCode(workspace, { agent }) : { files: 0, turns: 0, skipped: 'FIT_READ_CLAUDE_LOGS is not 1' };
      const { changed, version } = await fit.evolve(workspace, agent);
      res.json({ ingested, changed, version: version?.version ?? 0, report: await fit.report(workspace, agent) });
    }),
  );
  app.post(
    '/api/fit/edits/:id',
    route(async (req, res) => {
      const { decision } = z.object({ decision: z.enum(['approve', 'deny']) }).strict().parse(req.body);
      const edit = await fit.decide(workspace, 'claude-code', String(req.params.id).slice(0, 200), decision);
      if (!edit) return res.status(404).json({ error: 'No pending ask with that id.' });
      res.json({ edit });
    }),
  );
}
