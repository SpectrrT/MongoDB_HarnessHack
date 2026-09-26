// /api/activity/*: computer history for the person using this machine. The server listens on
// loopback only, so the workspace is this computer's user (ACTIVITY_WORKSPACE overrides it).
import { z } from 'zod';
import { workspaceId } from './store.js';

const daySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const MAX_STREAMS = 8;

export function activityRoutes(app, { activity }) {
  const workspace = workspaceId();
  let streams = 0;
  const route = (handler) => async (req, res, next) => {
    if (!activity)
      return res.status(503).json({ error: 'Computer history needs MongoDB. Set MONGODB_URI and run npm run harness:server.' });
    try {
      await handler(req, res);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: 'Invalid request.' });
      next(error);
    }
  };
  const day = (req) => daySchema.parse(req.query.day || activity.today());

  app.get('/api/activity/status', async (req, res, next) => {
    if (!activity) return res.json({ configured: false });
    try {
      res.json(await activity.status(workspace));
    } catch (error) {
      next(error);
    }
  });
  app.get('/api/activity/timeline', route(async (req, res) => res.json(await activity.timeline(workspace, { day: day(req) }))));
  app.get('/api/activity/stats', route(async (req, res) => res.json(await activity.stats(workspace, { day: day(req) }))));
  app.get(
    '/api/activity/search',
    route(async (req, res) => {
      const q = z.string().trim().min(1).max(200).parse(req.query.q);
      const limit = z.coerce.number().int().min(1).max(25).default(10).parse(req.query.limit);
      res.json(await activity.search(workspace, q, { limit }));
    }),
  );
  app.get('/api/activity/routines', route(async (req, res) => res.json({ routines: await activity.routines(workspace) })));
  app.post(
    '/api/activity/routines/:id',
    route(async (req, res) => {
      const { decision } = z.object({ decision: z.enum(['approve', 'dismiss']) }).strict().parse(req.body);
      const routine = await activity.decide(workspace, String(req.params.id).slice(0, 400), decision);
      if (!routine) return res.status(404).json({ error: 'Routine not found.' });
      res.json({ routine: { ...routine, status: routine.status || 'candidate' } });
    }),
  );
  app.get('/api/activity/settings', route(async (req, res) => res.json(await activity.settings(workspace))));
  app.post('/api/activity/settings', route(async (req, res) => res.json(await activity.updateSettings(workspace, req.body))));
  app.post(
    '/api/activity/forget',
    route(async (req, res) => {
      const range = z
        .object({ from: z.coerce.date(), to: z.coerce.date() })
        .strict()
        .refine((r) => r.from < r.to && r.to - r.from <= 31 * 86400e3)
        .parse(req.body);
      res.json(await activity.forget(workspace, range));
    }),
  );
  app.get(
    '/api/activity/stream',
    route(async (req, res) => {
      if (streams >= MAX_STREAMS) return res.status(429).json({ error: 'Too many live views open.' });
      streams++;
      res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
      res.flushHeaders();
      res.write('retry: 3000\n\n');
      const send = (event) => res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      let stop = () => {};
      try {
        stop = activity.watch(workspace, send);
      } catch (error) {
        send({ type: 'error', message: error.message });
      }
      const ping = setInterval(() => res.write(': ping\n\n'), 25000);
      req.on('close', () => {
        streams--;
        clearInterval(ping);
        stop();
      });
    }),
  );
}
