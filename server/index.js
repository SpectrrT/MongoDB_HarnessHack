import {loadLocalEnv} from "./env.js";
import {createAtlasStore} from "./atlas.js";
import { THEME_IDS } from "../shared/themes.js";
import { mountModel } from "./model.js";
import express from "express";
import helmet from "helmet";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { mountRem } from "./rem.js";
import {
  createWorkspace,
  transition,
  advanceWorkspace,
} from "../shared/workspace.js";
import { connectStore, RunConflict } from './harness/store.js';
import { inputSchema } from './harness/workflow.js';
import { sleepRoutes } from './sleep/routes.js';
import { activityRoutes } from './activity/routes.js';
const here = path.dirname(fileURLToPath(import.meta.url));
const types = [
  "request-connection",
  "overnight",
  "chat-start",
  "conversation-sleep",
  "chat-sleep-start",
  "chat-finish",
  "onboard",
  "settings",
  "profile",
  "connect",
  "expire",
  "suggestion",
  "start-run",
  "resume-run",
  "cancel-run",
  "save-draft",
  "new-conversation",
  "chat",
  "delete-conversation",
  "memory",
  "delete-memory",
  "session-start",
  "session-note",
  "session-end",
  "sleep",
  "cancel-sleep",
  "skill",
];
const schema = z
  .object({
    type: z.enum(types),
    payload: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();
const id = z.string().min(1).max(100),
  text = z.string().trim().min(1).max(4000);
const payloads = {
  "conversation-sleep": z.object({id,enabled:z.boolean()}).strict(),
  "chat-sleep-start":z.object({id,jobId:id,model:id,effort:z.enum(["low","medium","high","xhigh","max","ultra"]).optional()}).strict(),
  "request-connection": z.object({id, requested: z.boolean()}).strict(),
  overnight: z.union([
    z.object({title: z.string().trim().min(1).max(160), brief: text, deadline: z.number().finite(), budget: z.number().int().min(1000).max(1000000)}).strict(),
    z.object({id, status: z.enum(["queued", "paused", "cancelled"])}).strict(),
  ]),
  "chat-start": z.object({id,jobId:id,model:id,effort:z.enum(["low","medium","high","xhigh","max","ultra"]).optional(),text:z.string().min(1).max(20000),displayText:z.string().max(20000).optional(),files:z.array(z.object({name:z.string().max(120),characters:z.number().int().min(0).max(16000),preview:z.string().max(60000).regex(/^data:image\/webp;base64,[A-Za-z0-9+/]+=*$/).optional()})).max(6).optional(),notes:z.array(z.object({id,source:z.string().max(80),text:z.string().max(360)})).max(4)}),
  "chat-finish": z.object({id,jobId:id,text:z.string().max(20000).optional(),error:z.string().max(500).optional(),usage:z.record(z.string(),z.number()).optional(),agent:z.any().optional()}),
  onboard: z.object({
    name: z.string().trim().min(1).max(60),
    role: z.string().max(80).optional(),
  }),
  profile: z.object({ name: z.string().trim().min(1).max(60), email: z.union([z.email().max(254),z.literal("")]).optional(), avatar:z.string().max(40000).regex(/^(?:data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+=*)?$/).optional() }).strict(),
  settings: z
    .object({
      suggestions: z.boolean().optional(),
      notifications: z.boolean().optional(),
      sleepSchedule: z.boolean().optional(),
      sleepHour: z
        .string()
        .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/)
        .optional(),
      agentFolder:z.string().max(1000).optional(),
      modelConnected: z.boolean().optional(),
      modelProvider:z.enum(["codex","openrouter"]).optional(),
      openrouterModel:z.string().max(100).optional(),
      modelSelection: z.string().max(100).optional(),
      theme: z.enum(THEME_IDS).optional(),
      reasoningEffort: z.enum(["low","medium","high","xhigh","max","ultra"]).optional(),
      themeCustom: z.object({surface:z.string().regex(/^#[0-9a-f]{6}$/i),ink:z.string().regex(/^#[0-9a-f]{6}$/i),accent:z.string().regex(/^#[0-9a-f]{6}$/i),mode:z.enum(["light","dark"])}).strict().optional(),
    })
    .strict(),
  connect: z.object({
    id: z.enum(["drive", "gmail", "github", "calendar"]),
    disconnect: z.boolean().optional(),
  }),
  expire: z.object({ id: z.enum(["drive", "gmail", "github", "calendar"]) }),
  suggestion: z.object({
    id,
    status: z.enum(["dismissed", "pending", "snoozed"]),
  }),
  "start-run": z.object({ id }),
  "resume-run": z.object({ id }),
  "cancel-run": z.object({ id }),
  "save-draft": z.object({ id, text: z.string().max(20000) }),
  "new-conversation": z.object({ id: id.optional() }),
  chat: z.object({ id: id.optional(), text }),
  "delete-conversation": z.object({ id }),
  memory: z.object({
    text,
    source: z.string().max(120).optional(),
    kind: z.enum(["note", "decision", "rule", "preference"]).optional(),
  }),
  "delete-memory": z.object({ id }),
  "session-start": z.object({
    id: id.optional(),
    name: z.string().max(120).optional(),
    mode: z.enum(["notes", "audio", "screen", "both"]).optional(),
    consented: z.boolean().optional(),
    captureOwner: z.string().max(100).optional(),
  }),
  "session-note": z.object({ id, text }),
  "session-end": z.object({ id }),
  sleep: z.object({}),
  "cancel-sleep": z.object({ id }),
  skill: z.object({ id, enabled: z.boolean() }),
};
export function createApp({
  dataDir = process.env.OFFLOAD_DATA_DIR || path.join(here, "../.data"),
  serveStatic = true,
  harnessStore = null,
  sleep = null,
  atlas = null,
  activity = null,
} = {}) {
  const app = express(),
    queues = new Map(),
    rate = new Map();
  app.disable("x-powered-by");
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "blob:"],
          fontSrc: ["'self'"],
          connectSrc: ["'self'"],
          mediaSrc: ["'self'", "blob:"],
          objectSrc: ["'none'"],
        },
      },
    }),
  );
  app.use(express.json({ limit: "16mb" }));
  app.use("/api", (req, res, next) => {
    res.set("Cache-Control", "no-store");
    const origin = req.get("origin");
    if (origin) {
      let host;
      try {
        host = new URL(origin).hostname;
      } catch {
        return res.status(403).json({ error: "Invalid origin." });
      }
      if (
        !["localhost", "127.0.0.1"].includes(host) &&
        new URL(origin).host !== req.get("host")
      )
        return res.status(403).json({ error: "Origin not allowed." });
    }
    next();
  });
  app.get("/api/health", (_, res) =>
    res.json({ ok: true, mode: "local", schema: 1 }),
  );
  app.use("/api", async (req, res, next) => {
    if(req.path === "/openrouter/callback") return next();
    try {
      let token = req.headers.cookie
        ?.split(";")
        .map((x) => x.trim())
        .find((x) => x.startsWith("offload_demo="))
        ?.slice(13);
      if (!/^[a-f0-9]{64}$/.test(token || "")) {
        token = crypto.randomBytes(32).toString("hex");
        res.cookie("offload_demo", token, {
          httpOnly: true,
          sameSite: "strict",
          secure: process.env.NODE_ENV === "production" || req.get("host") === "offload.ai",
          maxAge: 30 * 86400000,
        });
      }
      req.workspaceKey = crypto
        .createHash("sha256")
        .update(token)
        .digest("hex");
      const key = req.workspaceKey,
        now = Date.now(),
        recent = (rate.get(key) || []).filter((t) => now - t < 60000);
      if (recent.length > 180)
        return res
          .status(429)
          .json({ error: "Too many requests. Try again shortly." });
      rate.set(key, [...recent, now]);
      next();
    } catch (e) {
      next(e);
    }
  });
  app.get('/api/harness/status', (_, res) => res.json({ configured: !!harnessStore, storage: harnessStore ? 'mongodb' : null }));
  app.post('/api/harness/runs', async (req, res, next) => {
    if (!harnessStore) return res.status(503).json({ error: 'Atlas harness storage is not configured.' });
    try {
      const body = z.object({ requestKey: z.string().min(1).max(100), input: inputSchema }).strict().parse(req.body);
      const run = await harnessStore.enqueue(req.workspaceKey, body.requestKey, body.input);
      res.status(202).json({ id: run._id, status: run.status });
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: 'Invalid handoff input.' });
      if (error instanceof RunConflict) return res.status(409).json({ error: error.message });
      next(error);
    }
  });
  app.get('/api/harness/runs/:id', async (req, res, next) => {
    if (!harnessStore) return res.status(503).json({ error: 'Atlas harness storage is not configured.' });
    try {
      const run = await harnessStore.get(req.workspaceKey, req.params.id);
      if (!run) return res.status(404).json({ error: 'Run not found.' });
      const { leaseToken, worker, fingerprint, workspace, ...visible } = run;
      res.json(visible);
    } catch (error) { next(error); }
  });
  sleepRoutes(app, { sleep, harnessStore });
  activityRoutes(app, { activity });
  async function access(req, fn) {
    const key = req.workspaceKey;
    const previous = queues.get(key) || Promise.resolve();
    const task = previous
      .catch(() => {})
      .then(async () => {
        await fs.mkdir(dataDir, { recursive: true, mode: 0o700 });
        const file = path.join(dataDir, key + ".json");
        let state;
        if(atlas){
          return atlas.update(key,s=>fn(advanceWorkspace(s)));
        }
        try {
          state = JSON.parse(await fs.readFile(file, "utf8"));
        } catch (e) {
          if (e.code !== "ENOENT") throw e;
          state = createWorkspace();
        }
        state = advanceWorkspace(state);
        const next = await fn(state);
        const temp = file + "." + crypto.randomUUID() + ".tmp";
        await fs.writeFile(temp, JSON.stringify(next), { mode: 0o600 });
        await fs.rename(temp, file);
        return next;
      });
    queues.set(key, task);
    try {
      return await task;
    } finally {
      if (queues.get(key) === task) queues.delete(key);
    }
  }
  mountModel(app,{dataDir,activity});
  app.get("/api/state", async (req, res, next) => {
    try {
      res.json(await access(req, (s) => s));
    } catch (e) {
      next(e);
    }
  });
  app.post("/api/action", async (req, res, next) => {
    try {
      const action = schema.parse(req.body);
      action.payload = payloads[action.type].parse(action.payload);
      res.json(await access(req, (s) => transition(s, action)));
    } catch (e) {
      if (e instanceof z.ZodError)
        return res.status(400).json({ error: "Invalid action payload." });
      if (
        /not found|first|Unknown|Enter|Write|Only|cannot|not ready|current session|No active|memory before/.test(
          e.message,
        )
      )
        return res.status(400).json({ error: e.message });
      next(e);
    }
  });
  app.post("/api/reset", async (req, res, next) => {
    try {
      res.json(await access(req, () => createWorkspace()));
    } catch (e) {
      next(e);
    }
  });
  mountRem(app);
  if (serveStatic) {
    const dist = path.join(here, "../dist");
    app.use(express.static(dist));
    app.get("/{*path}", (req, res) =>
      res.sendFile(path.join(dist, "index.html")),
    );
  }
  app.use((err, req, res, next) => {
    console.error("Request failed:", err.name);
    res
      .status(err.status || 500)
      .json({
        error:
          err.status === 413
            ? "Request too large."
            : "The local service could not save this change.",
      });
  });
  return app;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  loadLocalEnv();
  const port = Number(process.env.PORT || 5194);
  const connection = process.env.MONGODB_URI ? await connectStore() : null;
  const sleep = connection && process.env.VOYAGE_API_KEY
    ? await (await import('./sleep/index.js')).createSleep(connection.client.db(process.env.MONGODB_DATABASE || 'offload_hackathon')) : null;
  const atlas=process.env.MONGODB_URI?createAtlasStore():null;
  if(atlas)await atlas.ping();
  const activity = connection
    ? await (await import('./activity/store.js'))
        .createActivity(connection.client.db(process.env.MONGODB_DATABASE || 'offload_hackathon'), { log: console.warn })
        .catch((error) => (console.warn('Computer history is off:', error.message), null))
    : null;
  createApp({ harnessStore: connection?.store, sleep, atlas, activity }).listen(port, "127.0.0.1", () =>
    console.log(`Offload local service: http://127.0.0.1:${port}`),
  );
}
