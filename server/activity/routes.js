// /api/activity/*: computer history for the person using this machine. The server listens on
// loopback only, so the workspace is this computer's user (ACTIVITY_WORKSPACE overrides it).
import { z } from 'zod';
import { remAccess } from '../rem-access.js';
import { workspaceId } from './store.js';
import { describe, findFriction, planWorkflow } from './insights.js';

const daySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const MAX_STREAMS = 8;

export function activityRoutes(app, { activity, collector = null }) {
  app.use('/api/activity', remAccess({ label: 'Computer history' }));
  const workspace = workspaceId();
  let streams = 0;
  const route = (handler) => async (req, res, next) => {
    if (!activity)
      return res.status(503).json({ error: 'Computer history needs its database connection. Reopen Offload after connecting MongoDB.' });
    try {
      await handler(req, res);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: 'Invalid request.' });
      next(error);
    }
  };
  const day = (req) => daySchema.parse(req.query.day || activity.today());
  const currentStatus=async()=>({...await activity.status(workspace),...(collector?{collector:collector.status()}:{})});

  app.get('/api/activity/status', async (req, res, next) => {
    if (!activity) return res.json({ configured: false,...(collector?{collector:collector.status()}:{}) });
    try {
      res.json(await currentStatus());
    } catch (error) {
      next(error);
    }
  });
  app.post('/api/activity/collector',route(async(req,res)=>{
    const host=req.get('host')||'',origin=req.get('origin');
    let localOrigin=true;try{if(origin)localOrigin=new URL(origin).host===host;}catch{localOrigin=false;}
    if(!/^(?:(?:127\.0\.0\.1|localhost)(?::\d+)?|offload\.ai)$/.test(host)||!localOrigin||req.get('X-Offload-Client')!=='local')return res.status(403).json({error:'Recording can only be controlled from the local Offload app.'});
    if(!collector)return res.status(503).json({error:'The recorder is not connected to this local service. Reopen Offload.'});
    const {action}=z.object({action:z.enum(['start','pause'])}).strict().parse(req.body);
    await collector[action]();
    res.json(await currentStatus());
  }));
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
  // Read the history, find where the back-and-forth is, and plan a workflow for it. Computed on every call.
  app.post(
    '/api/activity/workflow',
    route(async (req, res) => {
      const finding = await findFriction(activity, workspace);
      if (!finding) return res.json({ finding: null });
      res.json({ finding, summary: describe(finding), workflow: planWorkflow(finding), source: 'planner' });
    }),
  );
  app.post(
    '/api/activity/workflows',
    route(async (req, res) => {
      const body = z.object({title:z.string().min(1).max(120),kind:z.enum(['scheduling','coding','batch','engineering']),
        problem:z.string().max(2000).optional(),trigger:z.string().max(500).optional(),
        steps:z.array(z.object({label:z.string().min(1).max(120),app:z.string().max(60),detail:z.string().max(2000).optional(),
          logo:z.string().max(60).nullable().optional(),ask:z.boolean().optional(),step:z.number().int().min(1).max(12).optional()}).strict()).min(1).max(12),
        proactive:z.array(z.string().max(1000)).max(12).optional(),needs:z.array(z.string().max(200)).max(12).optional(),
        observation:z.string().max(500).optional(),executionStatus:z.literal('proposal').optional(),
        provenance:z.enum(['seed','captured','mixed','unknown']).default('unknown'),
      }).strict().parse(req.body);
      const doc = { ...body, workspace, status: 'saved-proposal', createdAt: new Date() };
      const { insertedId } = await activity.db.collection('activity_workflows').insertOne(doc);
      res.status(201).json({ id: String(insertedId), status: doc.status });
    }),
  );
  app.get('/api/activity/settings', route(async (req, res) => res.json(await activity.settings(workspace))));
  app.post('/api/activity/settings', route(async (req, res) => {
    if(Object.hasOwn(req.body||{},'collectorEnabled'))return res.status(400).json({error:'Use Start recording to enable the recorder.'});
    const settings=await activity.updateSettings(workspace,req.body);
    if(collector)await collector.refresh();
    res.json(settings);
  }));
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
