import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {createMemoryDb} from '../../rem/db/index.js';
import {createContextCompactor} from '../../server/context/compaction.js';
import {createJevScorer} from '../../server/context/jev.js';
import {EVIDENCE_POLICY_VERSION} from '../../server/context/evidence-policy.js';
import {evolvingCases, exactAnswer} from '../fixtures/evolving-context.mjs';
import {answer, BUDGET, MODEL, REASONING, RESPONSES, ENDPOINT, recordingFetch, totals, sha256, loadSdk} from './protocol.mjs';

const args = process.argv.slice(2), live = args.includes('--live');
const output = args.includes('--output') ? args[args.indexOf('--output') + 1] : null;
if (!output) throw Error('Pass --output to retain every result. Existing files are never overwritten.');
try {await fs.access(output); throw Error('Output already exists; refuse to overwrite experimental evidence.');} catch (error) {if (error.code !== 'ENOENT') throw error;}
loadSdk();
if (live && !process.env.TYPESAFE_API_KEY) {
  try {process.env.TYPESAFE_API_KEY = (await fs.readFile(path.join(os.homedir(), '.typesafe/key'), 'utf8')).trim();} catch {}
}
if (live && !process.env.OPENROUTER_API_KEY) throw Error('Configure the existing OpenRouter key privately.');
const provider = process.env.TYPESAFE_API_KEY ? 'typesafe' : 'openrouter';
const decisionEndpoint = provider === 'typesafe' ? 'https://api.typesafe.ai/v1/systemone' : 'https://openrouter.ai/api/alpha/decisions';
const policy = {budgetChars: 3000, recentCount: 1, threshold: 0.25};
const report = {
  createdAt: new Date().toISOString(), mode: live ? 'live paired reference comparison' : 'offline protocol fixture, not model quality evidence',
  reference: 'OpenAI Agents SDK reference harness', treatment: 'Offload context selection and archive recovery',
  protocol: {model: MODEL, answerProvider: 'OpenRouter', endpoint: ENDPOINT, budget: BUDGET, contextPolicy: policy, reasoningEffort: REASONING ?? null, evidencePolicy: EVIDENCE_POLICY_VERSION,
    adapter: RESPONSES ? 'Responses SDK loop in both arms' : 'Chat Completions SDK reference and Offload loop',
    sdk: {'@openai/agents': '0.18.0', openai: '7.23.0', zod: '4.2.1'}, node: process.version, platform: `${process.platform}/${process.arch}`, tracing: false, automaticRetries: 0,
    sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], {encoding: 'utf8'}).trim(),
    sources: ['https://developers.openai.com/api/docs/guides/agents/models', 'https://developers.openai.com/api/docs/guides/agents/quickstart', 'https://developers.openai.com/api/docs/guides/agents/running-agents'],
    tools: ['context_read', 'context_list'], database: 'in-memory synthetic archive, identical access in both arms',
    decisionProvider: live ? provider : 'fixture', decisionModel: live ? (provider === 'typesafe' ? 'jev-1.13.0' : 'typesafe/jev-1.13') : null,
  },
  methodology: 'One paired run of the unchanged three-task/twelve-stage evolving-context fixture. Reference receives full accumulated evidence, Offload receives its selected evidence. Both share the identical system prompt, user schema, archive tool schemas and implementation, exact JSON checker, model, OpenRouter endpoint, configured temperature or reasoning effort, output limit and four-model-turn budget. Actual SDK Runner executes the reference agent; the Offload arm uses its existing answer loop with the same explicit default strict:false and stream:false fields emitted by the SDK. There is no persistent SDK session: both arms start fresh model state per stage from the prescribed evidence. Calls alternate reference-first and Offload-first by stage. Expected answers remain evaluator-only. Offline tests compared exact first and recovery wire requests. No score tuning or live retries.',
  accounting: 'Every network attempt is captured below the SDK/Offload/Jev layers, with raw request, response and usage but no HTTP headers. All reported input/output tokens include repeated prompts, tool schema, and retrieval follow-ups. Offload totals include selection, restart checks and all answer/retrieval calls. Missing usage or cost makes that total unknown, while known subtotals remain visible. Reported provider costs can reflect cache effects. MongoDB/tool execution uses no model tokens and its compute cost is not priced.',
  adapterNote: RESPONSES ? 'Both arms use the identical OpenAI Responses SDK Runner and archive tools. Only Offload applies its production selector and canonical archive. Stateless store:false; reasoning medium; same four-call and 4096-token per-call budgets. This isolates the context policy rather than comparing different API interfaces.' : null,
  limitations: ['This is a configured OpenAI Agents SDK reference harness, not Codex, Claude Code or a full product comparison. Using a frontier model does not make this a benchmark of its native product harness.', 'Small synthetic suite, one paired run, no statistical significance or general long-horizon claim.', `The answer model is ${MODEL} in both arms; Jev is extra Offload work, separately metered.`, 'Full history is an explicit reference configuration, not an assertion about the SDK default context strategy.', 'One stage uses only previous selected context plus new evidence and requires an explicit archive read. Other stages pass accumulated records to selection; this does not validate bounded history scanning.', 'Provider routing and caching are not controlled beyond the same OpenRouter endpoint and model; response provider identifiers are retained when returned.', 'No SDK session persistence, built-in compaction, handoffs, hosted tools or other unconfigured capabilities are evaluated.'],
  implementation: {}, cases: [], receipts: [],
};
for (const file of ['protocol.mjs', 'run.mjs', 'package-lock.json', '../fixtures/evolving-context.mjs', '../../server/context/compaction.js', '../../server/context/jev.js', '../../server/context/evidence-policy.js', '../../server/context/repeat-evidence.js']) {
  report.implementation[file] = sha256(await fs.readFile(new URL(file, import.meta.url), 'utf8'));
}
const db = createMemoryDb();
await db.collection('context_archive').createIndex({runId: 1, unitId: 1, part: 1});
await db.collection('context_decisions').createIndex({runId: 1, stateKey: 1});
async function save() {await fs.mkdir(path.dirname(output), {recursive: true}); await fs.writeFile(output, JSON.stringify(report, null, 2) + '\n');}
function fixtureFetch(stage, recovery) {
  let count = 0;
  return async () => {
    count++;
    const call = recovery && count === 1;
    return new Response(JSON.stringify({id: `offline-${count}`, object: 'chat.completion', created: 1, model: MODEL,
      choices: [{index: 0, finish_reason: call ? 'tool_calls' : 'stop', message: call ? {role: 'assistant', content: null, tool_calls: [{id: 'offline-read', type: 'function', function: {name: 'context_read', arguments: JSON.stringify({id: stage.requiredRetrieval})}}]} : {role: 'assistant', content: JSON.stringify(stage.expected)}}],
      usage: {prompt_tokens: 10, completion_tokens: 3, cost: 0}}), {headers: {'Content-Type': 'application/json'}});
  };
}
try {
  for (const scenario of evolvingCases) {
    const runId = `agents-reference-${scenario.id}-${randomUUID()}`, scenarioResult = {id: scenario.id, runId, stages: []};
    report.cases.push(scenarioResult);
    let history = [...scenario.initial], previous = [];
    for (const stage of scenario.stages) {
      history.push(...stage.append);
      const context = {case: scenario.id, stage: stage.id};
      const row = {id: stage.id, goal: stage.goal, expected: stage.expected, canonicalRecordCount: history.length, workingSetOnly: Boolean(stage.workingSetOnly)};
      scenarioResult.stages.push(row);
      const scorer = live ? createJevScorer({provider, fetchImpl: recordingFetch({receipts: report.receipts, context: {...context, arm: 'offload', phase: 'decision'}, endpoint: decisionEndpoint, decision: true})}) : {
        name: 'offline fixture', async score({units}) {return {scores: units.map(unit => ({id: unit.id, probability: unit.text.startsWith('Office newsletter') ? 0.02 : 0.99})), usage: {inputTokens: 0, outputTokens: 0, cost: 0}};},
      };
      const options = {db, scorer, ...policy}, compactor = createContextCompactor(options);
      const units = stage.workingSetOnly ? [...previous, ...stage.append] : history;
      row.selectionRecordCount = units.length;
      let selection;
      const started = performance.now();
      try {
        selection = await compactor.select({runId, goal: stage.goal, units});
        row.metrics = selection.metrics; row.decisions = selection.decisions; row.retainedIds = selection.units.map(u => u.id);
        row.requiredRetained = (stage.required || []).every(id => row.retainedIds.includes(id));
        const replay = await createContextCompactor(options).select({runId, goal: stage.goal, units});
        row.restartMetrics = replay.metrics; row.restartSameSelection = JSON.stringify(replay.units) === JSON.stringify(selection.units);
        previous = selection.units;
      } catch (error) {row.selectionError = 'Context selection failed'; row.metrics = error.metrics ?? null;}
      row.selectionAndRestartLatencyMs = Math.round(performance.now() - started);
      const order = scenarioResult.stages.length % 2 ? ['reference', 'offload'] : ['offload', 'reference'];
      row.callOrder = order;
      for (const arm of order) {
        if (arm === 'offload' && !selection) {row.offload = {answer: null, pass: false, error: 'Selection blocked'}; continue;}
        row[arm] = await answer({engine: arm === 'reference' ? 'sdk' : 'offload', goal: stage.goal, units: arm === 'reference' ? history : selection.units,
          compactor, runId, receipts: report.receipts, context: {...context, arm, phase: 'answer'}, apiKey: live ? process.env.OPENROUTER_API_KEY : 'offline-no-network',
          fetchImpl: live ? fetch : fixtureFetch(stage, arm === 'offload' && Boolean(stage.requiredRetrieval))});
        row[arm].pass = exactAnswer(row[arm].answer, stage.expected);
      }
      if (stage.requiredRetrieval) row.archiveRecoveryPass = Boolean(row.offload?.pass && row.offload.retrievals?.some(r => r.tool === 'context_read' && r.input.id === stage.requiredRetrieval && r.found));
      console.log(JSON.stringify({case: scenario.id, stage: stage.id, referencePass: row.reference.pass, offloadPass: row.offload.pass, selectionError: row.selectionError, receipts: report.receipts.length}));
      await save();
    }
  }
} catch (error) {report.error = 'Benchmark interrupted by harness failure'; report.errorType = error?.name; process.exitCode = 1;}
finally {
  const rows = report.cases.flatMap(c => c.stages);
  const reference = totals(report.receipts.filter(r => r.arm === 'reference'));
  const offload = totals(report.receipts.filter(r => r.arm === 'offload'));
  const decisions = totals(report.receipts.filter(r => r.phase === 'decision'));
  const completed = rows.length === 12 && rows.every(r => r.reference && r.offload);
  report.summary = {tasks: report.cases.length, stages: rows.length, complete: completed,
    referencePassed: rows.filter(r => r.reference?.pass).length, offloadPassed: rows.filter(r => r.offload?.pass).length,
    regressions: rows.filter(r => r.reference?.pass && !r.offload?.pass).map(r => r.id),
    improvements: rows.filter(r => !r.reference?.pass && r.offload?.pass).map(r => r.id),
    reference, offload, decisions, totalExperiment: totals(report.receipts),
    allInTokenSavingsPercent: completed && reference.totalTokens > 0 && offload.totalTokens !== null ? Number((100 * (1 - offload.totalTokens / reference.totalTokens)).toFixed(2)) : null,
    allInCostSavingsPercent: completed && reference.cost > 0 && offload.cost !== null ? Number((100 * (1 - offload.cost / reference.cost)).toFixed(2)) : null,
    archiveRecoveryChecks: rows.filter(r => r.archiveRecoveryPass !== undefined).length, archiveRecoveryPassed: rows.filter(r => r.archiveRecoveryPass).length,
    restartDecisionCalls: rows.reduce((n, row) => n + (row.restartMetrics?.decisionCalls || 0), 0),
    selectionFailures: rows.filter(r => r.selectionError).length,
    referenceAnswerLatencyMs: rows.reduce((n, row) => n + (row.reference?.latencyMs || 0), 0),
    offloadSelectionAndAnswerLatencyMs: rows.reduce((n, row) => n + (row.selectionAndRestartLatencyMs || 0) + (row.offload?.latencyMs || 0), 0),
  };
  report.completedAt = new Date().toISOString();
  console.log(JSON.stringify(report.summary)); await save(); await db.close?.();
  if (!completed || rows.some(r => !r.reference?.pass || !r.offload?.pass || !r.requiredRetained || !r.restartSameSelection || r.archiveRecoveryPass === false)) process.exitCode = 1;
}
