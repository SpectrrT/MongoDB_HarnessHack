import { rehearse, rehearsalLevel } from "../rem/rehearse.js";
import { gymSkills } from "../rem/evolve.js";
import { withRem } from "./rem.js";

// Idle rehearsal (opt-in, REM_REHEARSE_IDLE=1): when nobody has acted in REM (a run, a sleep, an answer to an ask) for
// REM_REHEARSE_IDLE_MIN minutes (default 30), REM rehearses once on its own; the next one waits for the next action.
// Reading REM pages is not activity. Off by default so idle time and credits go to idle Sleep, which works on the
// owner's own task. A rehearsal never changes the harness: what breaks it waits for the night's Evolve.
export function createRemIdleRehearsal({
  idleMs = Number(process.env.REM_REHEARSE_IDLE_MIN || 30) * 60000,
  interval = 60000,
  enabled = process.env.REM_REHEARSE_IDLE === "1",
  now = Date.now,
  run = withRem,
} = {}) {
  let lastActivity = now(),
    armed = true,
    running = null,
    last = null;
  const start = () =>
    (running ??= run(async (rem) => ({
      at: new Date(now()).toISOString(),
      ...(await rehearse(rem.ctx, { night: rem.ctx.day, mode: "idle", skills: await gymSkills(rem.ctx.db) })),
    }))
      .then((out) => (last = out))
      .finally(() => (running = null)));
  const api = {
    touch() {
      lastActivity = now();
      armed = true;
    },
    async tick() {
      if (!enabled || running || !armed || now() - lastActivity < idleMs) return null;
      armed = false;
      return start();
    },
    start,
    status: () => ({ enabled, idleMinutes: idleMs / 60000, running: Boolean(running), lastActivity: new Date(lastActivity).toISOString(), last }),
    close() {
      clearInterval(timer);
    },
  };
  const timer = enabled && interval ? setInterval(() => void api.tick().catch(() => {}), interval) : null;
  timer?.unref?.();
  return api;
}

export function mountRemRehearsal(app, idle = createRemIdleRehearsal()) {
  app.use("/api/rem", (req, res, next) => {
    if (req.method === "POST" && req.path !== "/rehearse") idle.touch();
    next();
  });
  app.get("/api/rem/rehearsals", async (req, res, next) => {
    try {
      const view = await withRem(async (rem) => {
        const col = rem.ctx.db.collection("rehearsals");
        return {
          level: await rehearsalLevel(rem.ctx.db),
          recent: await col.find({}, { sort: { createdAt: -1 }, limit: 12, projection: { _id: 0 } }).toArray(),
          kept: await col.find({ kept: true, fixedVersion: null }, { projection: { _id: 0 } }).toArray(),
        };
      });
      res.json({ ...view, idle: idle.status() });
    } catch (e) {
      next(e);
    }
  });
  app.post("/api/rem/rehearse", async (req, res, next) => {
    try {
      res.json({ rehearsal: await idle.start() });
    } catch (e) {
      next(e);
    }
  });
  return idle;
}
