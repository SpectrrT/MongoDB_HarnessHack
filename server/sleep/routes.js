import { z } from 'zod';
import { PromotionConflict } from './policy.js';

const visible = ({ leaseToken, worker, fingerprint, workspace, ...rest }) => rest;
const key = z.string().min(1).max(100);

export function sleepRoutes(app, { sleep, harnessStore }) {
  const ready = res => sleep || void res.status(503).json({ error: 'Sleep requires the Atlas sandbox and an embedding key.' });
  const handle = fn => async (req, res, next) => {
    if (!ready(res)) return;
    try { await fn(req, res); }
    catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: 'Invalid request.' });
      if (error instanceof PromotionConflict) return res.status(409).json({ error: error.message });
      if (error.retryable) return res.status(503).json({ error: 'Embedding provider is busy. Try again.' });
      next(error);
    }
  };
  app.get('/api/sleep/status', (_, res) => res.json({ configured: !!sleep, vectorMode: sleep?.memory.vectorMode || null }));
  app.post('/api/sleep/runs', handle(async (req, res) => {
    const { requestKey } = z.object({ requestKey: key }).strict().parse(req.body);
    const report = await sleep.reports.start(req.workspaceKey, requestKey);
    res.status(202).json({ id: report._id, status: report.status });
  }));
  app.get('/api/sleep/runs/latest', handle(async (req, res) => {
    const report = await sleep.reports.latest(req.workspaceKey);
    res.json(report ? visible(report) : null);
  }));
  app.get('/api/sleep/runs/:id', handle(async (req, res) => {
    const report = await sleep.reports.get(req.workspaceKey, req.params.id);
    if (!report) return res.status(404).json({ error: 'Review not found.' });
    res.json(visible(report));
  }));
  app.post('/api/memories', handle(async (req, res) => {
    const body = z.object({ kind: z.enum(['note', 'fact']), text: z.string().trim().min(1).max(2000), requestKey: key.optional() }).strict().parse(req.body);
    const m = await sleep.memory.remember(req.workspaceKey, { kind: body.kind, text: body.text, source: { type: 'user' },
      ...(body.requestKey ? { key: `memory:${body.requestKey}` } : {}) });
    res.status(201).json({ id: m._id });
  }));
  app.post('/api/memories/corrections', handle(async (req, res) => {
    const body = z.object({ runId: key, text: z.string().trim().min(3).max(2000), requestKey: key.optional() }).strict().parse(req.body);
    if (!(await harnessStore?.get(req.workspaceKey, body.runId))) return res.status(404).json({ error: 'Run not found.' });
    const m = await sleep.memory.remember(req.workspaceKey, { kind: 'correction', text: body.text,
      source: { type: 'correction', runId: body.runId }, ...(body.requestKey ? { key: `correction:${body.requestKey}` } : {}) });
    res.status(201).json({ id: m._id });
  }));
  app.get('/api/sleep/policies', handle(async (req, res) => {
    await sleep.policy.active(req.workspaceKey);
    const { activeId, history, versions } = await sleep.policy.list(req.workspaceKey);
    res.json({ activeId, history, versions: versions.map(({ workspace, ...v }) => v) });
  }));
  app.post('/api/sleep/policies/rollback', handle(async (req, res) => {
    const { expectedActiveId } = z.object({ expectedActiveId: z.string().min(1).max(300) }).strict().parse(req.body);
    const restored = await sleep.policy.rollback(req.workspaceKey, expectedActiveId);
    res.json({ activeId: restored._id, version: restored.version });
  }));
}
