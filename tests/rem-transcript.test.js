import test from "node:test";
import assert from "node:assert/strict";
import {createMemoryDb, ensureIndexes} from "../rem/db/index.js";
import {createAgent, seedConnections} from "../rem/agent.js";
import {createTranscriptStore, TRANSCRIPT_PART_CHARS, WORKING_TRANSCRIPT_BYTES} from "../rem/transcript.js";
import {GEN0} from "../rem/harness.js";
import {createLocalEmbedder} from "../rem/embed.js";
import {createClock} from "../rem/util.js";
import {createContextCompactor} from "../server/context/compaction.js";
import {CrashError} from "../rem/ledger.js";

const usage = {inputTokens: 10, outputTokens: 2};
const scorer = {name: "deterministic-retention-fixture", async score({units}) {
  return {scores: units.map(unit => ({id: unit.id, probability: 0.01})), usage: {inputTokens: 40, outputTokens: 4, cost: 0}};
}};
const bytes = value => Buffer.byteLength(JSON.stringify(value));
const messagesOf = entries => entries.flatMap(t => [
  {role: "assistant", content: null, tool_calls: [{id: `call_${t.step}`, type: "function", function: {name: t.call.name, arguments: JSON.stringify(t.call.args || {})}}]},
  {role: "tool", tool_call_id: `call_${t.step}`, content: JSON.stringify(t.error ? {error: t.error} : t.result ?? null)},
]);
async function setup({budget = 16000, world, model, genome = GEN0, compaction = true, chaos = null} = {}) {
  const db = createMemoryDb(), clock = createClock();
  await ensureIndexes(db, {search: false});
  await seedConnections(db, {now: clock.now()});
  const options = {db, clock, world, model, chaos, harness: async () => ({version: 0, genome}),
    embedder: createLocalEmbedder(), episodes: false,
    compactor: compaction ? createContextCompactor({db, scorer, budgetChars: budget, recentCount: 1}) : null};
  return {db, options, agent: createAgent(options)};
}

test("300 evolving steps resume on a new worker with bounded checkpoint and model context", async t => {
  const totalSteps = 300;
  let executorCalls = 0, maxPromptBytes = 0, maxCheckpointBytes = 0, modelToolBytes = 0, recovered = false;
  const checkpoints = [];
  const model = {async chat({messages}) {
    maxPromptBytes = Math.max(maxPromptBytes, bytes(messages));
    modelToolBytes += bytes(messages.filter(m => m.role === "tool" || m.tool_calls));
    if (messages[0].content.includes("Role: planner")) return {final: "Inspect each record, recover the first, then report.", usage};
    executorCalls++;
    const previous = messages.filter(m => m.tool_calls).at(-1)?.tool_calls[0];
    const step = previous ? Number(previous.id.slice(5)) : 0;
    if (previous?.function.name === "context.read") {
      const result = JSON.parse(messages.filter(m => m.role === "tool").at(-1).content);
      recovered = result.text.includes("source-1:");
    }
    if (step === 180) return {toolCall: {name: "context.read", args: {id: "step-1"}}, usage};
    if (step >= totalSteps) return {final: recovered ? "Verified the old source and all records." : "Missing source.", usage};
    return {toolCall: {name: "calendar.list", args: {sequence: step + 1}}, usage};
  }};
  const world = {async call(name, args) {return {events: [{description: `source-${args.sequence}: ${"observation material ".repeat(190)}`}]};}};
  const genome = structuredClone(GEN0); genome.contextPolicy.stepBudget = 320;
  const {db, options, agent} = await setup({world, model, genome});
  const parts = db.collection("rem_transcript_parts"), originalFind = parts.find.bind(parts);
  let historicalPartQueries = 0;
  parts.find = (...args) => {historicalPartQueries++; return originalFind(...args);};
  async function observe({step}) {
    const cp = await db.collection("checkpoints").findOne({runId: "long"});
    maxCheckpointBytes = Math.max(maxCheckpointBytes, bytes(cp));
    if ([1, 120, 300].includes(step)) checkpoints.push({step, checkpointBytes: bytes(cp), canonicalBytes: cp.transcriptState.bytes});
    if (step === 120) throw new CrashError("worker-restart");
  }
  await assert.rejects(agent.startRun({kind: "test", instruction: "Inspect the records and retrieve the first source after step 180.", runId: "long", onStep: observe}), CrashError);
  await db.collection("checkpoints").updateOne({runId: "long"}, {$set: {leaseUntil: new Date(0)}});
  const restarted = createAgent(options);
  const run = await restarted.resumeRun("long", {onStep: observe});
  assert.equal(run.status, "done"); assert.equal(run.step, totalSteps); assert.ok(recovered);
  assert.equal(executorCalls, totalSteps + 1, "restart reuses all committed steps");
  assert.equal(run.transcriptComplete, false, "large histories are paginated, never returned wholesale");
  assert.ok(maxCheckpointBytes < 30000, `checkpoint grew to ${maxCheckpointBytes}`);
  assert.ok(maxPromptBytes < 25000, `model prompt grew to ${maxPromptBytes}`);
  assert.equal(historicalPartQueries, 0, "ordinary steps and restart never reload archived raw history");
  const all = []; let afterStep = 0;
  for (;;) {
    const page = await restarted.readTranscript("long", {afterStep}); all.push(...page.entries);
    if (!page.nextStep) break; afterStep = page.nextStep;
  }
  assert.deepEqual(all.map(entry => entry.step), Array.from({length: totalSteps}, (_, i) => i + 1));
  assert.equal(all[180].call.name, "context.read");
  assert.equal(await db.collection("rem_transcript_events").countDocuments({runId: "long"}), totalSteps);
  const baselineReplayBytes = all.reduce((sum, _, i) => sum + bytes(messagesOf(all.slice(0, i + 1))), 2);
  const checkpoint = await db.collection("checkpoints").findOne({runId: "long"});
  const baselineCheckpointBytes = bytes({...checkpoint, transcript: all});
  assert.ok(modelToolBytes < baselineReplayBytes * 0.04);
  const evidence = {fixture: "300 evolving tool exchanges, one fresh-worker restart, one old-source retrieval", provider: "none; deterministic model and retention fixture", totalSteps, executorCalls,
    canonicalBytes: run.transcriptState.bytes, maxCheckpointBytes, baselineCheckpointBytes, maxPromptBytes, modelToolBytes, baselineReplayBytes,
    decisionCalls: run.usage.compactionCalls, decisionInputTokens: run.usage.compactionInputTokens, decisionOutputTokens: run.usage.compactionOutputTokens, historicalPartQueriesDuringRun: 0, checkpoints};
  t.diagnostic(JSON.stringify(evidence));
});

test("changed goal re-evaluates omitted canonical evidence before another model call", async () => {
  let calls = 0, sawOldSource = false, rechecked = false;
  const model = {async chat({messages}) {
    if (messages[0].content.includes("Role: planner")) return {final: "Inspect records.", usage};
    if (messages[1].content === "Recover the first source.") {
      sawOldSource = messages.some(m => m.role === "tool" && m.content.includes("original-source-1:"));
      return {final: "Recovered source.", usage};
    }
    return {toolCall: {name: "calendar.list", args: {sequence: ++calls}}, usage};
  }};
  const {db, options} = await setup({budget: 4000, model, world: {async call(name, args) {return {events: [{description: `original-source-${args.sequence}: ${"source detail ".repeat(100)}`}]};}}});
  options.compactor = createContextCompactor({db, budgetChars: 4000, recentCount: 1, scorer: {name: "goal-retention-fixture", async score({units, goal}) {
    if (goal === "Recover the first source." && units.some(u => u.id === "step-1")) rechecked = true;
    return {scores: units.map(u => ({id: u.id, probability: goal === "Recover the first source." && u.id === "step-1" ? 0.99 : 0.01})), usage: {inputTokens: 40, outputTokens: 4, cost: 0}};
  }}});
  await assert.rejects(createAgent(options).startRun({kind: "test", instruction: "Inspect records.", runId: "goal-change", onStep: ({step}) => {if (step === 10) throw new CrashError("review");}}), CrashError);
  const cp = await db.collection("checkpoints").findOne({runId: "goal-change"});
  assert.ok(!cp.transcript.some(entry => entry.step === 1));
  await db.collection("checkpoints").updateOne({runId: cp.runId}, {$set: {instruction: "Recover the first source.", leaseUntil: new Date(0)}});
  const run = await createAgent(options).resumeRun(cp.runId);
  assert.equal(run.status, "done"); assert.ok(rechecked); assert.ok(sawOldSource);
});

test("full-history prior-list guards survive omission and still reject unseen files", async () => {
  let calls = 0, executions = 0;
  const model = {async chat({messages}) {
    if (messages[0].content.includes("Role: planner")) return {final: "List, inspect, then delete authorized files.", usage};
    calls++;
    if (calls === 1) return {toolCall: {name: "drive.list", args: {folder: "drafts"}}, usage};
    if (calls < 13) return {toolCall: {name: "calendar.list", args: {sequence: calls}}, usage};
    if (calls <= 14) return {toolCall: {name: "drive.delete", args: {ids: [calls === 13 ? "listed-file" : "unseen-file"]}}, usage};
    return {final: "Finished the authorized deletion.", usage};
  }};
  const world = {async call(name) {return name === "drive.list" ? {files: [{id: "listed-file"}], count: 1} : {events: [{description: "observations ".repeat(150)}]};},
    async execute() {executions++; return {deleted: true, count: 1};}, findEffect() {return null;}};
  const genome = structuredClone(GEN0);
  genome.guardrails = [{id: "listed-only", description: "Delete only listed files.", predicate: {type: "prior-list", tool: "drive.delete", listTool: "drive.list", maxCount: 2}}];
  const {agent, db} = await setup({world, model, genome, budget: 4000});
  let omitted = false;
  const run = await agent.startRun({kind: "test", runId: "guard", instruction: "Delete only authorized files.", onStep: async ({step}) => {
    if (step === 12) omitted = !(await db.collection("checkpoints").findOne({runId: "guard"})).transcript.some(t => t.step === 1);
  }});
  assert.ok(omitted); assert.equal(executions, 1);
  assert.equal(run.transcript[12].effectOutcome, "executed");
  assert.equal(run.transcript[13].guardrail, "listed-only");
});

test("oversized Unicode exchange persists as bounded parts and pauses without bloating checkpoint", async () => {
  const model = {async chat({messages}) {return messages[0].content.includes("Role: planner") ? {final: "Read.", usage} : {toolCall: {name: "calendar.list", args: {}}, usage};}};
  const source = "large source \u03bb".repeat(20000);
  const {agent, db} = await setup({model, world: {async call() {return {events: [{description: source}]};}}});
  const run = await agent.startRun({kind: "test", instruction: "Inspect source.", runId: "large"});
  assert.equal(run.status, "needs_review"); assert.equal(run.step, 1);
  const checkpoint = await db.collection("checkpoints").findOne({runId: "large"});
  assert.ok(bytes(checkpoint) < WORKING_TRANSCRIPT_BYTES);
  assert.equal(checkpoint.transcript.length, 0);
  const chunks = await db.collection("rem_transcript_parts").find({runId: "large"}).toArray();
  assert.ok(chunks.length > 1); assert.ok(chunks.every(c => c.text.length <= TRANSCRIPT_PART_CHARS && bytes(c) < 66000));
  const store = createTranscriptStore(db);
  assert.equal((await store.readPage("large")).entries[0].result.events[0].description, source);
  assert.ok((await store.read({runId: "large", id: "step-1", part: 1})).text);
  assert.ok((await store.read({runId: "other", id: "step-1"})).error);
});

test("transaction rollback removes canonical parts together with effect commit and cursor", async () => {
  const effects = new Map(); let executions = 0;
  const world = {async execute(name, args, {effectKey}) {executions++; const result = {messageId: "sent-once", to: args.to}; effects.set(effectKey, {result}); return result;}, findEffect: effectKey => effects.get(effectKey)};
  const model = {async chat({messages}) {
    if (messages[0].content.includes("Role: planner")) return {final: "Send once.", usage};
    return messages.some(m => m.role === "tool") ? {final: "Sent.", usage} : {toolCall: {name: "gmail.send", args: {to: ["team@offload.test"], subject: "Test", body: "Test"}}, usage};
  }};
  const {db, options, agent} = await setup({world, model});
  const checkpoints = db.collection("checkpoints"), original = checkpoints.updateOne.bind(checkpoints);
  let crash = true;
  checkpoints.updateOne = async (filter, update, opts) => {
    if (crash && update.$set?.step === 1) {crash = false; throw new CrashError("after-transcript-write");}
    return original(filter, update, opts);
  };
  await assert.rejects(agent.startRun({kind: "test", instruction: "Send the internal test message once.", runId: "atomic"}), CrashError);
  assert.equal((await checkpoints.findOne({runId: "atomic"})).step, 0);
  assert.equal((await db.collection("effects").findOne({runId: "atomic"})).status, "pending");
  assert.equal(await db.collection("rem_transcript_events").countDocuments({runId: "atomic"}), 0);
  assert.equal(await db.collection("rem_transcript_parts").countDocuments({runId: "atomic"}), 0);
  await checkpoints.updateOne({runId: "atomic"}, {$set: {leaseUntil: new Date(0)}});
  const run = await createAgent(options).resumeRun("atomic");
  assert.equal(run.status, "done"); assert.equal(executions, 1);
  assert.equal(run.transcript[0].effectOutcome, "reconciled");
  assert.equal(await db.collection("rem_transcript_events").countDocuments({runId: "atomic"}), 1);
});

test("legacy checkpoints migrate idempotently and retain the latest prior-list count", async () => {
  const db = createMemoryDb(); const store = createTranscriptStore(db); await store.ready();
  const transcript = [1, 8].map((count, i) => ({step: i + 1, call: {name: "drive.list", args: {folder: "drafts"}}, result: {count, files: [{id: `f${i}`}]} }));
  await db.collection("checkpoints").insertOne({runId: "legacy", step: 2, transcript});
  let cp = await store.migrate(await db.collection("checkpoints").findOne({runId: "legacy"}));
  cp = await store.migrate(cp);
  assert.equal(cp.transcriptState.count, 2);
  assert.equal(await db.collection("rem_transcript_events").countDocuments({runId: "legacy"}), 2);
  const genome = {guardrails: [{predicate: {tool: "drive.delete", listTool: "drive.list", type: "prior-list"}}]};
  assert.equal((await store.guardHistory(cp, genome, {name: "drive.delete", args: {folder: "drafts"}}))[0].result.count, 8);
  await db.collection("rem_transcript_parts").updateOne({runId: "legacy", step: 1}, {$set: {text: "corrupt"}});
  await assert.rejects(store.readPage("legacy"), /integrity/);
});
