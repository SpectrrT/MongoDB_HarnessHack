import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createApp } from "../server/index.js";
test("API isolates visitors, persists edits, and rejects cross-origin writes", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "offload-test-"));
  try {
    const app = createApp({ dataDir: dir, serveStatic: false }),
      a = request.agent(app),
      b = request.agent(app);
    await a.get("/api/state").expect(200);
    await a
      .post("/api/action")
      .send({ type: "onboard", payload: { name: "A" } })
      .expect(200);
    const mine = await a.get("/api/state"),
      other = await b.get("/api/state");
    assert.equal(mine.body.profile.name, "A");
    assert.equal(other.body.profile.name, "");
    await a
      .post("/api/action")
      .set("Origin", "https://evil.example")
      .send({ type: "sleep" })
      .expect(403);
    await a
      .post("/api/action")
      .send({ type: "execute-code", payload: {} })
      .expect(400);
    const files = await fs.readdir(dir);
    assert.equal(files.filter((x) => x.endsWith(".json")).length, 2);
    assert.equal(files.filter((x) => x.endsWith(".tmp")).length, 0);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
test("API validates settings and account identifiers", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "offload-validation-"));
  try {
    const api = request.agent(createApp({ dataDir: dir, serveStatic: false }));
    await api
      .post("/api/action")
      .send({ type: "settings", payload: { sleepHour: { bad: true } } })
      .expect(400);
    await api
      .post("/api/action")
      .send({ type: "connect", payload: { id: "arbitrary" } })
      .expect(400);
    await api
      .post("/api/action")
      .send({ type: "settings", payload: { sleepHour: "25:99" } })
      .expect(400);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
test("API cancels a review and persists its history", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "offload-sleep-"));
  try {
    const api = request.agent(createApp({ dataDir: dir, serveStatic: false }));
    const started = await api.post("/api/action").send({ type: "sleep" }).expect(200);
    const id = started.body.sleepHistory[0].id;
    await api.post("/api/action").send({ type: "cancel-sleep", payload: { id } }).expect(200);
    const result = await api.get("/api/state").expect(200);
    assert.equal(result.body.sleepHistory[0].status, "cancelled");
    assert.equal(result.body.skills.length, 0);
    await api.post("/api/action").send({ type: "cancel-sleep", payload: {} }).expect(400);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
