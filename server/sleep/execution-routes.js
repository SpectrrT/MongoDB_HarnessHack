import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { RunConflict } from '../harness/store.js';
import { executionInput, visibleTask } from './execution-store.js';
import { taskDirectory } from './execution.js';

export function sleepExecutionRoutes(app, { store, root, enabled = false }) {
  app.get('/api/sleep/tasks/status', (_, res) => res.json({ configured: !!store, enabled: !!store && enabled,
    scope: 'isolated-local-files', provider: 'openrouter' }));
  const handle = fn => async (req, res, next) => {
    if (!store) return res.status(503).json({ error: 'Sleep task storage needs MongoDB. Saved legacy tasks are unchanged.' });
    try { await fn(req, res); }
    catch (e) {
      if (e instanceof z.ZodError) return res.status(400).json({ error: 'Add a valid task, deadline, budget and output checks.' });
      if (e instanceof RunConflict) return res.status(409).json({ error: e.message });
      next(e);
    }
  };
  app.get('/api/sleep/tasks', handle(async (req, res) => res.json((await store.list(req.workspaceKey)).map(visibleTask))));
  app.post('/api/sleep/tasks', handle(async (req, res) => {
    const body = z.object({ requestKey: z.string().min(1).max(100), input: executionInput }).strict().parse(req.body);
    const task = await store.enqueue(req.workspaceKey, body.requestKey, body.input);
    res.status(202).json(visibleTask(task));
  }));
  app.get('/api/sleep/tasks/:id', handle(async (req, res) => {
    const task = await store.get(req.workspaceKey, req.params.id);
    if (!task) return res.status(404).json({ error: 'Task not found.' });
    res.json(visibleTask(task));
  }));
  app.post('/api/sleep/tasks/:id/control', handle(async (req, res) => {
    const { action } = z.object({ action: z.enum(['pause', 'resume', 'cancel', 'approve']) }).strict().parse(req.body);
    const task = await store.control(req.workspaceKey, req.params.id, action);
    if (!task) return res.status(404).json({ error: 'Task not found or changed. Refresh and try again.' });
    res.json(visibleTask(task));
  }));
  app.get('/api/sleep/tasks/:id/artifacts/:name', handle(async (req, res) => {
    const task = await store.get(req.workspaceKey, req.params.id);
    if(task&&!await store.validateSource(task))return res.status(409).json({error:'Meeting source changed. This artifact was withdrawn.'});
    const artifact = task?.artifacts.find(a => a.path === req.params.name);
    if (!artifact) return res.status(404).json({ error: 'Artifact not found.' });
    const file = path.join(taskDirectory(root, task), artifact.directory, artifact.path);
    let content;
    try { content = await fs.readFile(file); } catch { return res.status(404).json({ error: 'Artifact unavailable on this worker.' }); }
    if (createHash('sha256').update(content).digest('hex') !== artifact.sha256) return res.status(409).json({ error: 'Artifact changed after verification.' });
    res.set('Content-Type', 'text/plain; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="${artifact.path}"`);
    res.send(content);
  }));
}
