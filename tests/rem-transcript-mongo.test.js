import test from "node:test";
import assert from "node:assert/strict";
import {MongoMemoryReplSet} from "mongodb-memory-server";
import {BSON} from "mongodb";
import {createMongoDb} from "../rem/db/mongo.js";
import {ensureIndexes} from "../rem/db/index.js";
import {createTranscriptStore, ensureTranscriptIndexes} from "../rem/transcript.js";
import {createAgent, seedConnections} from "../rem/agent.js";
import {GEN0, checkGuardrails} from "../rem/harness.js";
import {createClock} from "../rem/util.js";
import {createLocalEmbedder} from "../rem/embed.js";
import {claimEffect, commitEffect, CrashError} from "../rem/ledger.js";

const usage = {inputTokens: 10, outputTokens: 2};
const entry = (step, count = 1) => ({step, call: {name: "drive.list", args: {folder: "drafts"}}, result: {count, files: [{id: `file-${step}`}]}});
const checkpoint = (runId, transcript = []) => ({runId, step: transcript.length, transcript});
const guardGenome = {guardrails: [{id: "listed", description: "Delete only a small listed set.", predicate: {tool: "drive.delete", listTool: "drive.list", type: "prior-list", maxCount: 2}}]};

test("canonical transcript integration with a real local MongoDB replica set", {timeout: 60000}, async t => {
  const mongo = await MongoMemoryReplSet.create({replSet: {count: 1, storageEngine: "wiredTiger"}});
  const connections = [];
  async function connect(name) {
    const db = await createMongoDb({uri: mongo.getUri(), dbName: name});
    db.atlasSearch = false;
    connections.push(db);
    return db;
  }
  const evidence = {provider: "real local MongoDB replica set; deterministic task models; no Atlas or external model API", cases: []};
  try {
    const db = await connect("transcript_integration");
    evidence.mongoVersion = (await db.client.db("admin").command({buildInfo: 1})).version;
    await ensureIndexes(db, {search: false});
    await ensureTranscriptIndexes(db);
    await t.test("pre-existing collections restart through a fresh MongoDB connection", async () => {
      const transcript = [entry(1), {...entry(2), result: {body: "\u03bb source ".repeat(12000)}}];
      const store = createTranscriptStore(db);
      await db.collection("checkpoints").insertOne(checkpoint("persisted", transcript));
      const migrated = await store.migrate(await db.collection("checkpoints").findOne({runId: "persisted"}));
      assert.equal(migrated.transcript.length, 0, "oversized legacy history moves out of the checkpoint");
      const restarted = await connect(db.databaseName), freshStore = createTranscriptStore(restarted);
      await freshStore.ready();
      const page = await freshStore.readPage("persisted");
      assert.deepEqual(page.entries, transcript);
      const partDocs = await restarted.collection("rem_transcript_parts").find({runId: "persisted"}).toArray();
      const maxPartBsonBytes = Math.max(...partDocs.map(doc => BSON.calculateObjectSize(doc)));
      assert.ok(maxPartBsonBytes < 65536);
      assert.equal(await restarted.collection("rem_transcript_events").countDocuments({runId: "persisted"}), 2);
      evidence.cases.push({name: "restart_existing_collections", canonicalEvents: 2, parts: partDocs.length, maxPartBsonBytes, checkpointBsonBytes: BSON.calculateObjectSize(migrated), passed: true});
    });
    await t.test("MongoDB abort rolls back effect, canonical parts, guard proofs, and cursor", async () => {
      const store = createTranscriptStore(db);
      await db.collection("checkpoints").insertOne(checkpoint("rollback"));
      const cp = await store.migrate(await db.collection("checkpoints").findOne({runId: "rollback"}));
      await claimEffect(db, {effectKey: "rollback-effect", runId: cp.runId, step: 1, call: entry(1).call, now: 0});
      await assert.rejects(db.withTransaction(async session => {
        await commitEffect(db, {effectKey: "rollback-effect", result: {ok: true}, outcome: "executed", now: 1}, session);
        const working = await store.append(cp, {...entry(1), effectKey: "rollback-effect"}, session);
        await db.collection("checkpoints").updateOne({runId: cp.runId}, {$set: {...working, step: 1}}, {session});
        throw new CrashError("after-checkpoint-update");
      }), CrashError);
      assert.equal((await db.collection("effects").findOne({effectKey: "rollback-effect"})).status, "pending");
      assert.equal((await db.collection("checkpoints").findOne({runId: cp.runId})).step, 0);
      for (const name of ["rem_transcript_events", "rem_transcript_parts", "rem_transcript_guards"])
        assert.equal(await db.collection(name).countDocuments({runId: cp.runId}), 0);
      evidence.cases.push({name: "transaction_rollback", rolledBackCollections: 5, committedTranscriptDocuments: 0, passed: true});
    });
    await t.test("stale migration cannot overwrite a newer prior-list proof", async () => {
      const store = createTranscriptStore(db);
      const stale = checkpoint("migration-race", [entry(1, 1)]);
      await db.collection("checkpoints").insertOne(stale);
      const cp = await store.migrate({...stale});
      await db.withTransaction(async session => {
        const working = await store.append(cp, entry(2, 9), session);
        await db.collection("checkpoints").updateOne({runId: cp.runId}, {$set: {...working, step: 2}}, {session});
      });
      // Simulates a paused migration waking with its old checkpoint snapshot after takeover.
      await store.migrate(stale);
      const current = await db.collection("checkpoints").findOne({runId: cp.runId});
      const call = {name: "drive.delete", args: {folder: "drafts"}};
      const history = await store.guardHistory(current, guardGenome, call);
      assert.equal(history[0].result.count, 9);
      assert.equal(checkGuardrails(guardGenome, call, history).ok, false);
      const query = {runId: cp.runId, tool: "drive.list", kind: "filter"};
      const proof = await db.collection("rem_transcript_guards").findOne(query);
      const plan = await db.collection("rem_transcript_guards").find({...query, proof: proof.proof, step: {$lte: current.step}}).explain("executionStats");
      assert.match(JSON.stringify(plan.queryPlanner.winningPlan), /transcript_guard_proof/);
      assert.equal(plan.executionStats.totalDocsExamined, 1);
      evidence.cases.push({name: "migration_guard_race", retainedLatestCount: 9, guardAllowed: false, indexedDocumentsExamined: 1, passed: true});
    });
    await t.test("stale selection cannot replace another worker's working context", async () => {
      const store = createTranscriptStore(db);
      await db.collection("checkpoints").insertOne({...checkpoint("selection-race", [entry(1)]), status: "running", driver: "old"});
      const stale = await store.migrate(await db.collection("checkpoints").findOne({runId: "selection-race"}));
      await db.collection("checkpoints").updateOne({runId: stale.runId}, {$set: {driver: "new", transcriptRevision: "new-revision"}});
      await assert.rejects(store.select(stale, [], "old-revision"), /ownership/i);
      assert.equal((await db.collection("checkpoints").findOne({runId: stale.runId})).transcriptRevision, "new-revision");
      evidence.cases.push({name: "selection_lease_race", staleWrites: 0, passed: true});
    });
    await t.test("fresh agent reconciles one external effect after transaction interruption", async () => {
      const clock = createClock(); await seedConnections(db, {now: clock.now()});
      const external = new Map(); let effects = 0, crash = true;
      const world = {async execute(name, args, {effectKey}) {effects++; const result = {messageId: "one-message", to: args.to}; external.set(effectKey, {result}); return result;}, findEffect: key => external.get(key)};
      const model = {async chat({messages}) {
        if (messages[0].content.includes("Role: planner")) return {final: "Send once.", usage};
        return messages.some(m => m.role === "tool") ? {final: "Sent once.", usage} : {toolCall: {name: "gmail.send", args: {to: ["team@offload.test"], subject: "Fixture", body: "Fixture"}}, usage};
      }};
      const options = {world, model, clock, episodes: false, embedder: createLocalEmbedder(), harness: async () => ({version: 0, genome: GEN0}), chaos: {expireNow: () => false, async point(point) {if (crash && point === "after-commit") {crash = false; throw new CrashError(point);}}}};
      await assert.rejects(createAgent({...options, db}).startRun({kind: "test", instruction: "Send the internal fixture once.", runId: "recover"}), CrashError);
      assert.equal((await db.collection("effects").findOne({runId: "recover"})).status, "pending");
      await db.collection("checkpoints").updateOne({runId: "recover"}, {$set: {leaseUntil: new Date(0)}});
      const freshDb = await connect(db.databaseName);
      const run = await createAgent({...options, db: freshDb, chaos: null}).resumeRun("recover");
      assert.equal(run.status, "done"); assert.equal(effects, 1);
      assert.equal(run.transcript[0].effectOutcome, "reconciled");
      assert.equal(await freshDb.collection("rem_transcript_events").countDocuments({runId: "recover"}), 1);
      evidence.cases.push({name: "effect_recovery", externalEffects: effects, committedEvents: 1, passed: true});
    });
    await t.test("late model replies cannot overwrite completion or execute another effect", async () => {
      const clock = createClock(); await seedConnections(db, {now: clock.now()});
      let lateEffects = 0;
      const replies = [{final: "Stale result.", usage}, {toolCall: {name: "gmail.send", args: {to: ["team@offload.test"], subject: "Stale", body: "Stale"}}, usage}];
      for (const [index, staleReply] of replies.entries()) {
        let release, entered;
        const blocked = new Promise(resolve => {release = resolve;});
        const waiting = new Promise(resolve => {entered = resolve;});
        const oldModel = {async chat({messages}) {
          if (messages[0].content.includes("Role: planner")) return {final: "Plan.", usage};
          entered(); await blocked; return staleReply;
        }};
        const runId = `late-model-${index}`;
        const options = {db, clock, episodes: false, world: {async execute() {lateEffects++; return {messageId: "unexpected"};}, findEffect() {return null;}}, embedder: createLocalEmbedder(), harness: async () => ({version: 0, genome: GEN0})};
        const oldRun = createAgent({...options, model: oldModel}).startRun({kind: "test", instruction: "Finish the fixture.", runId});
        await waiting;
        await db.collection("checkpoints").updateOne({runId}, {$set: {leaseUntil: new Date(0)}});
        const next = await createAgent({...options, model: {async chat() {return {final: "Replacement result.", usage};}}}).resumeRun(runId);
        assert.equal(next.status, "done");
        release();
        await assert.rejects(oldRun, /ownership/i);
        assert.equal((await db.collection("checkpoints").findOne({runId})).final, "Replacement result.");
      }
      assert.equal(lateEffects, 0);
      evidence.cases.push({name: "late_model_lease_race", staleRepliesRejected: replies.length, staleFinalWrites: 0, staleExternalEffects: lateEffects, passed: true});
    });
    t.diagnostic(JSON.stringify(evidence));
  } finally {
    await Promise.allSettled(connections.map(db => db.close()));
    await mongo.stop();
  }
});
