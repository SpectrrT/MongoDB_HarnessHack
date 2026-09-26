// npm run rem:langsmith: the REM gym as LangSmith experiments.
//
// Upserts a "offload-rem-gym" dataset from the gym's fixed train + held-out task specs (one example
// per task, split tagged), then runs the gym once per genome as its own LangSmith experiment: one
// example per task, each example's run scored by REM's own pass/fail checker plus cost and step
// count. Two genomes are compared side by side:
//   - by default, gen 0 vs. whatever candidate edit evolve() finds and accepts against the gym on
//     this run (both are run in-memory with the deterministic ScriptedModel, so this is fast and
//     reproducible; if no edit is accepted, gen 0 is compared against itself and the script says so);
//   - with --versions=FROM:TO, two committed harness versions read from MONGODB_URI's "harnesses"
//     collection instead (use this to compare real accepted nights).
//
// Requires LANGSMITH_API_KEY. Get one at smith.langchain.com (Settings -> API Keys).
import { Client } from "langsmith";
import { evaluate } from "langsmith/evaluation";
import { GYM, runGymTask } from "../rem/gym.js";
import { GEN0 } from "../rem/harness.js";
import { evolve } from "../rem/evolve.js";
import { createRem } from "../rem/index.js";
import { round } from "../rem/util.js";

const DATASET = "offload-rem-gym";

if (!process.env.LANGSMITH_API_KEY) {
  console.error(
    "LANGSMITH_API_KEY is not set.\n" +
      "Sign up at https://smith.langchain.com, create an API key (Settings -> API Keys), then:\n" +
      "  export LANGSMITH_API_KEY=lsv2_...\n" +
      "  npm run rem:langsmith",
  );
  process.exit(1);
}

const TASKS = [...GYM.train, ...GYM.heldOut];

async function upsertDataset(client) {
  if (!(await client.hasDataset({ datasetName: DATASET })))
    await client.createDataset(DATASET, {
      description: "REM gym: the fixed train + held-out task specs run every night. One example per task.",
    });
  const have = new Set();
  for await (const ex of client.listExamples({ datasetName: DATASET })) if (ex.metadata?.taskId) have.add(ex.metadata.taskId);
  const missing = TASKS.filter((t) => !have.has(t.id));
  if (missing.length)
    await client.createExamples(
      missing.map((t) => ({
        dataset_name: DATASET,
        inputs: { taskId: t.id, kind: t.kind, week: t.week, instruction: t.instruction },
        outputs: { expectedPass: true },
        metadata: { taskId: t.id, split: t.split, kind: t.kind },
        split: t.split,
      })),
    );
  console.log(`Dataset "${DATASET}": ${have.size} example(s) already there, ${missing.length} added.`);
}

// Parent vs. child genome to compare. --versions=FROM:TO reads two committed harness versions from
// Mongo; otherwise runs evolve() once from gen 0 in-memory and compares it against whatever it finds.
async function genomesToCompare() {
  const versionsArg = process.argv.find((a) => a.startsWith("--versions="));
  if (versionsArg) {
    const [from, to] = versionsArg.slice("--versions=".length).split(":").map(Number);
    if (!Number.isInteger(from) || !Number.isInteger(to)) throw new Error("--versions=FROM:TO needs two integers, e.g. --versions=0:1");
    const { createMongoDb } = await import("../rem/db/mongo.js");
    const db = await createMongoDb({});
    const [parent, child] = await Promise.all([
      db.collection("harnesses").findOne({ version: from }),
      db.collection("harnesses").findOne({ version: to }),
    ]);
    if (!parent) throw new Error(`No harness version ${from} in ${db.databaseName}.`);
    if (!child) throw new Error(`No harness version ${to} in ${db.databaseName}.`);
    return { parentGenome: parent.genome, parentLabel: `v${from}`, childGenome: child.genome, childLabel: `v${to}` };
  }
  console.log("No --versions=FROM:TO given: running evolve() once from gen 0 (in-memory, ScriptedModel) to find a candidate...");
  const rem = await createRem();
  const evolved = await evolve(rem.ctx, { night: 1, proposer: rem.ctx.proposer });
  if (!evolved.committed) {
    console.log("No edit was accepted against the gym from gen 0; comparing gen 0 against itself.");
    return { parentGenome: GEN0, parentLabel: "gen0", childGenome: GEN0, childLabel: "gen0-repeat" };
  }
  console.log(`evolve() accepted v${evolved.committed.version} over gen 0: ${evolved.committed.editIds.length} edit(s) committed.`);
  return { parentGenome: GEN0, parentLabel: "gen0", childGenome: evolved.committed.genome, childLabel: `v${evolved.committed.version}` };
}

async function runExperiment(client, genome, label) {
  const rem = await createRem();
  const skills = [];
  const target = async (input) => {
    const t = TASKS.find((x) => x.id === input.taskId);
    const r = await runGymTask(t, genome, { model: rem.ctx.model, embedder: rem.ctx.embedder, skills });
    return {
      pass: r.pass,
      endState: r.endState,
      collateral: r.collateral,
      failures: r.failures,
      steps: r.steps,
      cost: round(r.cost, 6),
      tokens: r.tokens,
      tags: r.tags,
    };
  };
  // Every task expects to pass with no collateral damage; these three evaluators score exactly that,
  // reusing the gym's own checker (checkRun, via runGymTask) rather than re-judging the transcript.
  const evaluators = [
    ({ run }) => ({ key: "pass", score: run.outputs?.pass ? 1 : 0, comment: run.outputs?.failures?.join("; ") || undefined }),
    ({ run }) => ({ key: "no_collateral", score: run.outputs?.collateral?.length ? 0 : 1, comment: run.outputs?.collateral?.join("; ") || undefined }),
    ({ run }) => ({ key: "cost_usd", score: run.outputs?.cost ?? 0 }),
    ({ run }) => ({ key: "steps", score: run.outputs?.steps ?? 0 }),
  ];
  return evaluate(target, {
    data: DATASET,
    evaluators,
    client,
    experimentPrefix: `rem-gym-${label}`,
    metadata: { harnessLabel: label, routing: genome.routing, contextPolicy: genome.contextPolicy },
    maxConcurrency: 4,
  });
}

const client = new Client();
await upsertDataset(client);
const { parentGenome, parentLabel, childGenome, childLabel } = await genomesToCompare();
console.log(`Running the gym on "${parentLabel}" and "${childLabel}" as two LangSmith experiments (dataset "${DATASET}")...`);
const [parentResults, childResults] = await Promise.all([runExperiment(client, parentGenome, parentLabel), runExperiment(client, childGenome, childLabel)]);
console.log(`Done. "${parentResults.experimentName}" and "${childResults.experimentName}" are in the LangSmith UI under dataset "${DATASET}" - open them side by side to compare pass rate, cost and steps per task.`);
