import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createApp } from "../server/index.js";
import { withRem } from "../server/rem.js";
import { retireEpisodes, MAX_EPISODE_JSON_CHARS } from "../rem/episode-archive.js";

test("REM episode API accepts its own continuation beyond 32MiB through the final page", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "rem-archive-api-"));
  const api = request.agent(createApp({ dataDir: dir, serveStatic: false })).set("X-Offload-Client", "local");
  const original = { _id: "escaped-api", consolidated: false, raw: "\u0000".repeat(5593400) };
  try {
    await api.post("/api/rem/reset").expect(200);
    await withRem(async rem => {
      await rem.ctx.db.collection("episodes").insertOne(original);
      await retireEpisodes(rem.ctx.db, { _id: original._id }, { now: Date.now(), remove: true });
    });
    const first = await api.get(`/api/rem/episodes/${original._id}?offset=33552000&limit=8000`).expect(200);
    assert.equal(first.body.nextOffset, 33560000); assert.equal(first.body.text.length, 8000);
    const final = await api.get(`/api/rem/episodes/${original._id}?offset=${first.body.nextOffset}&limit=8000`).expect(200);
    assert.equal(final.body.nextOffset, null); assert.ok(final.body.text.length <= 8000);
    assert.equal(first.body.text + final.body.text, JSON.stringify(original).slice(33552000));
    await api.get(`/api/rem/episodes/${original._id}?offset=${MAX_EPISODE_JSON_CHARS + 1}`).expect(400);
  } finally { await api.post("/api/rem/reset"); await fs.rm(dir, { recursive: true, force: true }); }
});

test("REM API: run, pause for auth, reconnect, sleep, ask, simulate and reset", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "rem-api-"));
  try {
    const api = request.agent(createApp({ dataDir: dir, serveStatic: false })).set("X-Offload-Client", "local");
    await api.post("/api/rem/reset").expect(200);
    const start = await api.get("/api/rem/state").expect(200);
    assert.equal(start.body.harness.version, 0);
    assert.deepEqual(start.body.harness.genome.rules, []);
    assert.equal(start.body.day, 1);

    await api.post("/api/rem/run").send({ taskId: "rm -rf" }).expect(400);
    await api.post("/api/rem/connection").send({ provider: "dropbox", state: "valid" }).expect(400);
    await api.post("/api/rem/simulate").send({ days: 50 }).expect(400);

    await api.post("/api/rem/connection").send({ provider: "drive", state: "expired" }).expect(200);
    const paused = await api.post("/api/rem/run").send({ taskId: "weekly-update" }).expect(200);
    assert.equal(paused.body.run.kind, "weekly-brief", "Offload suggestion ids map to REM tasks");
    assert.equal(paused.body.run.status, "paused_for_auth");
    const waiting = await api.get("/api/rem/state").expect(200);
    assert.deepEqual(waiting.body.asks.map((a) => a.text), ["Reconnect Google Drive"]);

    const reconnected = await api.post("/api/rem/connection").send({ provider: "drive", state: "valid" }).expect(200);
    assert.equal(reconnected.body.resumed.length, 1);
    assert.equal(reconnected.body.resumed[0].status, "incomplete");
    assert.equal(reconnected.body.resumed[0].completion.passed, false);
    assert.ok(reconnected.body.resumed[0].verdict.collateral.includes("customer-name-leak"));

    const night = await api.post("/api/rem/sleep").expect(200);
    assert.match(night.body.brief.text, /^Morning brief · night 1 · harness v0 → v1/);
    assert.equal(night.body.day, 2);
    const archive = await api.get('/api/rem/archive?limit=2').expect(200);
    assert.equal(archive.body.episodes.length, 2);
    const archivedId = archive.body.episodes[0].id;
    const raw = await api.get(`/api/rem/episodes/${archivedId}?limit=80`).expect(200);
    assert.equal(raw.body.source, 'archive');
    assert.equal(raw.body.text.length, 80);
    assert.equal(raw.body.referenceOnly, true);
    await api.get('/api/rem/archive?limit=5000').expect(400);
    await api.get(`/api/rem/episodes/${archivedId}?limit=9000`).expect(400);
    const morning = await api.get("/api/rem/state").expect(200);
    assert.equal(morning.body.harness.version, 1);
    const ask = morning.body.asks.find((a) => a.kind === "skill.autonomous");
    assert.equal(ask.text, "Want me to send the brief myself next time? (needs Gmail send scope)");
    const decided = await api.post(`/api/rem/asks/${ask._id}`).send({ decision: "approve" }).expect(200);
    assert.equal(decided.body.ask.status, "approved");
    await api.post("/api/rem/asks/nope").send({ decision: "approve" }).expect(400);

    const sim = await api.post("/api/rem/simulate").send({ days: 1 }).expect(200);
    assert.equal(sim.body.days.length, 1);
    assert.equal(sim.body.days[0].meta.day, 2);
    const after = await api.get("/api/rem/state").expect(200);
    assert.ok(after.body.edits.length >= 3 && after.body.edits.every((e) => !("embedding" in e)));
    assert.ok(after.body.effects.every((e) => e.status === "committed"));
    assert.equal(after.body.metrics.length, 1);

    await api.post("/api/rem/reset").expect(200);
    await api.get(`/api/rem/episodes/${archivedId}`).expect(404);
    assert.deepEqual((await api.get('/api/rem/archive').expect(200)).body.episodes, []);
    assert.equal((await api.get("/api/rem/state").expect(200)).body.harness.version, 0);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("REM stream sends Server-Sent Events from the database change stream", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "rem-sse-"));
  const server = createApp({ dataDir: dir, serveStatic: false }).listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const abort = new AbortController();
  try {
    const res = await fetch(`${base}/api/rem/stream`, { signal: abort.signal });
    assert.match(res.headers.get("content-type"), /^text\/event-stream/);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let text = "";
    while (!text.includes("event: hello")) text += decoder.decode((await reader.read()).value);
    await fetch(`${base}/api/rem/connection`, {
      method: "POST",
      headers: { "content-type": "application/json", "X-Offload-Client": "local" },
      body: JSON.stringify({ provider: "gmail", state: "expired" }),
    });
    while (!text.includes('"collection":"connections"')) text += decoder.decode((await reader.read()).value);
    assert.match(text, /"operationType":"update"/);
  } finally {
    abort.abort();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(dir, { recursive: true, force: true });
  }
});
