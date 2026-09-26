import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createApp } from "../server/index.js";

// A run whose completion gate never clears ends "unverified" (not "done"), asks the owner once, and the owner's answer
// settles it. The end-state checks still judge the work itself.
test("REM: a run the completion gate rejects ends unverified and asks once", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "rem-unverified-"));
  try {
    const api = request.agent(createApp({ dataDir: dir, serveStatic: false }));
    await api.post("/api/rem/reset").expect(200);
    await api.post("/api/rem/connection").send({ provider: "drive", state: "valid" }).expect(200);

    // Day 0's weekly brief leaks a customer name, so the gate fails after its retry.
    const { body } = await api.post("/api/rem/run").send({ taskId: "weekly-brief" }).expect(200);
    assert.equal(body.run.status, "unverified");
    assert.equal(body.run.verdict.pass, false, "the checker still judges the work, independent of the label");

    const state = (await api.get("/api/rem/state").expect(200)).body;
    const asks = state.asks.filter((a) => a.kind === "verify" && a.runId === body.run.runId);
    assert.equal(asks.length, 1, "one ask per unverified run");
    assert.match(asks[0].text, /completion check scored \d+%, below \d+%/);

    await api.post(`/api/rem/asks/${asks[0]._id}`).send({ decision: "deny" }).expect(200);
    const after = (await api.get("/api/rem/state").expect(200)).body;
    assert.equal(after.runs.find((r) => r.runId === body.run.runId).status, "failed");
  } finally {
    await request(createApp({ dataDir: dir, serveStatic: false })).post("/api/rem/reset");
    await fs.rm(dir, { recursive: true, force: true });
  }
});
