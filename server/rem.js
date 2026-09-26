// REM API. One shared demo instance for every visitor (not per-visitor like /api/state): the
// engine's harness, memory and ledger are the thing being demonstrated. Mutations run one at a time.
import { z } from "zod";
import { remAccess } from "./rem-access.js";
import { createRem } from "../rem/index.js";
import { review } from "../rem/cycle.js";
import { createEmbedder } from "../rem/embed.js";
import { createModel } from "../rem/model.js";
import { OFFLOAD_ALIASES, TASK_KINDS } from "../rem/tasks.js";

let instance = null;
let queue = Promise.resolve();
const clients = new Set();

// Tonight: in-memory db. Tomorrow: MONGODB_URI (Atlas Sandbox), REM_MODEL=openrouter, REM_EMBEDDINGS=voyage.
async function build({ fresh = false } = {}) {
  let db;
  if (process.env.MONGODB_URI) {
    const { createMongoDb } = await import("../rem/db/mongo.js");
    db = await createMongoDb({ uri: process.env.MONGODB_URI, dbName: process.env.REM_DB_NAME || "rem" });
    if (fresh) await db.dropDatabase();
  }
  return createRem({ ...(db ? { db } : {}), model: createModel(), embedder: createEmbedder() });
}
const getRem = (opts) => (instance ??= build(opts));
function exclusive(fn) {
  const run = queue.then(fn, fn);
  queue = run.catch(() => {});
  return run;
}

const schemas = {
  run: z
    .object({
      taskId: z.enum([...Object.keys(TASK_KINDS), ...Object.keys(OFFLOAD_ALIASES)]),
      week: z.string().regex(/^W\d{2}$/).optional(),
    })
    .strict(),
  connection: z
    .object({ provider: z.enum(["drive", "gmail", "calendar"]), state: z.enum(["expired", "valid"]) })
    .strict(),
  decision: z
    .object({ decision: z.enum(["approve", "deny"]), answer: z.string().trim().min(1).max(80).optional() })
    .strict(),
  simulate: z.object({ days: z.number().int().min(1).max(10) }).strict(),
};

const runSummary = (cp) =>
  cp && {
    runId: cp.runId,
    kind: cp.kind,
    title: cp.title,
    week: cp.week,
    day: cp.day,
    status: cp.status,
    provider: cp.provider ?? null,
    steps: cp.turns,
    cost: cp.usage?.cost ?? 0,
    interventions: cp.interventions,
    harnessVersion: cp.harnessVersion,
    versions: cp.versions,
    plan: cp.plan,
    final: cp.final,
    verdict: cp.verdict ?? null,
    completion: cp.completion ?? null,
    injected: cp.injected ?? null,
    compaction: cp.compaction ?? null,
  };

// Change events for the live feed: small, no vectors.
function feedEvent(e) {
  const d = e.fullDocument || {};
  return {
    collection: e.ns.coll,
    operationType: e.operationType,
    id: String(e.documentKey?._id ?? ""),
    runId: d.runId,
    status: d.status ?? d.outcome?.status,
    kind: d.kind,
    tool: d.tool,
    text: d.summary || d.text || d.description || d.final || undefined,
    version: d.version,
    effectKey: d.effectKey,
  };
}

async function reviewFinished(rem) {
  const done = await rem.ctx.db.collection("checkpoints").find({ status: { $in: ["done", "incomplete", "failed"] }, verdict: { $exists: false } }).toArray();
  for (const run of done) await review(rem.ctx, run);
  return rem.ctx.db
    .collection("checkpoints")
    .find({ runId: { $in: done.map((r) => r.runId) } })
    .toArray();
}

export function mountRem(app) {
  app.use("/api/rem", remAccess());
  const handle = (fn) => async (req, res, next) => {
    try {
      res.json(await fn(req, res));
    } catch (e) {
      if (e instanceof z.ZodError) return res.status(400).json({ error: "Invalid REM request." });
      if (/^(Unknown|Ask not found)/.test(e.message)) return res.status(400).json({ error: e.message });
      next(e);
    }
  };
  const body = (req) => req.body ?? {};

  app.get(
    "/api/rem/state",
    handle(async () => (await getRem()).state()),
  );
  app.get("/api/rem/archive", handle(async req => {
    const query = z.object({ runId: z.string().min(1).max(200).optional(), kind: z.string().min(1).max(200).optional(),
      after: z.string().min(1).max(200).optional(), limit: z.coerce.number().int().min(1).max(50).default(20) }).strict().parse(req.query);
    return (await getRem()).episodeArchive(query);
  }));
  app.get("/api/rem/episodes/:id", handle(async (req, res) => {
    const id = z.string().min(1).max(200).parse(req.params.id);
    const query = z.object({ offset: z.coerce.number().int().min(0).max(33554432).default(0),
      limit: z.coerce.number().int().min(1).max(8000).default(4000) }).strict().parse(req.query);
    const result = await (await getRem()).episode(id, query);
    if (!result) { res.status(404); return { error: "Episode not found." }; }
    return result;
  }));
  app.post(
    "/api/rem/run",
    handle((req) =>
      exclusive(async () => {
        const { taskId, week } = schemas.run.parse(body(req));
        const rem = await getRem();
        const run = await rem.runTask(taskId, { week });
        const reviewed = (await reviewFinished(rem)).find((r) => r.runId === run.runId);
        return { run: runSummary(reviewed || run) };
      }),
    ),
  );
  app.post(
    "/api/rem/connection",
    handle((req) =>
      exclusive(async () => {
        const { provider, state } = schemas.connection.parse(body(req));
        const rem = await getRem();
        await rem.setConnection(provider, state);
        await rem.settle();
        return {
          connection: await rem.ctx.db.collection("connections").findOne({ provider }),
          resumed: (await reviewFinished(rem)).map(runSummary),
        };
      }),
    ),
  );
  app.post(
    "/api/rem/sleep",
    handle(() =>
      exclusive(async () => {
        const rem = await getRem();
        const brief = await rem.sleep();
        return { day: rem.day, brief };
      }),
    ),
  );
  app.post(
    "/api/rem/asks/:id",
    handle((req) =>
      exclusive(async () => {
        const { decision, answer } = schemas.decision.parse(body(req));
        const rem = await getRem();
        return { ask: await rem.decide(String(req.params.id), decision, { answer }) };
      }),
    ),
  );
  app.post(
    "/api/rem/simulate",
    handle((req) =>
      exclusive(async () => {
        const { days } = schemas.simulate.parse(body(req));
        const rem = await getRem();
        const out = await rem.simulateDays(days);
        return { day: rem.day, days: out.map(({ brief, dayResult, ...metrics }) => ({ ...metrics, brief: brief.text })) };
      }),
    ),
  );
  app.post(
    "/api/rem/reset",
    handle(() =>
      exclusive(async () => {
        const old = instance;
        instance = null;
        for (const res of clients) {
          res.write("event: reset\ndata: {}\n\n");
          res.end();
        }
        if (old) {
          const previous = await old;
          await previous.close();
          await previous.ctx.db.close?.();
        }
        const rem = await getRem({ fresh: true });
        return { ok: true, day: rem.day };
      }),
    ),
  );
  // Server-Sent Events fed by a database change stream (Atlas: db.watch()).
  app.get("/api/rem/stream", async (req, res, next) => {
    try {
      const rem = await getRem();
      res.set({ "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive" });
      res.flushHeaders();
      const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      const harness = await rem.harness();
      send("hello", { day: rem.day, week: rem.week, harness: harness.version });
      const stream = rem.ctx.db.watch(
        [{ $match: { "ns.coll": { $nin: ["metrics"] } } }],
        { fullDocument: "updateLookup" },
      );
      stream.on("change", (e) => send("change", feedEvent(e)));
      const keepAlive = setInterval(() => res.write(": keep-alive\n\n"), 15000);
      clients.add(res);
      req.on("close", () => {
        clearInterval(keepAlive);
        clients.delete(res);
        stream.close();
      });
    } catch (e) {
      next(e);
    }
  });
}

// A REM operation outside a request (idle rehearsal, the rehearsals view), queued behind the API's own work.
export const withRem = (fn) => exclusive(async () => fn(await getRem()));
