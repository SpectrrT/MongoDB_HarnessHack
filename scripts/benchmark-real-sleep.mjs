import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash, randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {MongoMemoryServer} from 'mongodb-memory-server';
import {MongoClient} from 'mongodb';
import {SleepExecutionStore} from '../server/sleep/execution-store.js';
import {sleepExecutionTick, taskDirectory} from '../server/sleep/execution.js';
import {sleepOpenRouterExecutor} from '../server/sleep/execution-provider.js';
import {createContextCompactor} from '../server/context/compaction.js';
import {createJevScorer} from '../server/context/jev.js';

const args = process.argv.slice(2);
const value = flag => args.includes(flag) ? args[args.indexOf(flag) + 1] : null;
const packetPath = value('--packet'), privateRoot = value('--private-output'), publicOutput = value('--output');
if (!packetPath || !privateRoot || !publicOutput) throw Error('Required: --packet, --private-output, --output.');
const trials = Number(value('--trials') || 3), startTrial = Number(value('--start-trial') || 1), model = value('--model') || 'openai/gpt-4o-mini';
if (!Number.isInteger(trials) || trials < 1 || trials > 3 || !Number.isInteger(startTrial) || startTrial < 1 || startTrial + trials > 4) throw Error('Trial numbers must be within 1 to 3.');
if (!process.env.OPENROUTER_API_KEY) throw Error('Configure the existing private OpenRouter key.');
const sourceBytes = await fs.readFile(packetPath), sourcePacket = JSON.parse(sourceBytes);
const onboarding = typeof sourcePacket.task === 'string' && sourcePacket.outputSchema;
const packet = onboarding ? {
  id: 'personal-onboarding-routing', title: 'Reconcile onboarding routing from chronological history',
  history: sourcePacket.history, goal: sourcePacket.task,
  input: Object.fromEntries(Object.entries(sourcePacket).filter(([key]) => !['task', 'history'].includes(key))),
  source: {origin: 'Claude authored requests and selected actual earlier assistant reports'},
  disclosure: ['The frozen onboarding packet uses 39 authored requests and four curated actual earlier assistant reports.',
    'The output is a reconstructed text-only routing configuration. Its twelve criteria are structural and lexical proxies, not a runnable UI or semantic-quality evaluation.'],
} : sourcePacket;
if (!Array.isArray(packet.history) || typeof packet.goal !== 'string' || !packet.id) throw Error('Invalid frozen packet.');
const evaluatorPath = value('--evaluator') || path.join(path.dirname(packetPath), 'evaluate.mjs');
const evaluatorCommand = evaluatorPath.endsWith('.py') ? 'python3' : process.execPath;
const evaluatorBytes = await fs.readFile(evaluatorPath);
const hash = value => createHash('sha256').update(value).digest('hex');
const frozenFiles = [packetPath, evaluatorPath, ...(value('--checks') ? [value('--checks')] : []), ...(value('--manifest') ? [value('--manifest')] : [])];
const frozenHashes = new Map(await Promise.all(frozenFiles.map(async file => [file, hash(await fs.readFile(file))])));
async function verifyFrozen() {for (const [file, digest] of frozenHashes) if (hash(await fs.readFile(file)) !== digest) throw Error('A frozen benchmark input or evaluator changed.');}
const brief = JSON.stringify({goal: packet.goal, input: packet.input || {}});
if (brief.length > 4000) throw Error('Packet current task exceeds the production Sleep brief limit.');
const units = packet.history.map(record => ({id: record.id, text: JSON.stringify({role: record.role, timestamp: record.timestamp, text: record.text}),
  pinned: ['user', 'system'].includes(record.role) ? 'historical_user_instruction' : null}));
const rawChars = units.reduce((n, record) => n + record.text.length, 0);
const report = {
  schema: 2, createdAt: new Date().toISOString(), id: packet.id, title: packet.title,
  mode: 'Reconstructed offline artifact replay through production Sleep generation, file writing and declared file checks',
  adapter: 'Benchmark-only immutable historical context attachment. Production Sleep has no context compaction/retrieval integration.',
  model, scorerPolicy: createJevScorer().policyVersion, trials, startTrial,
  provenance: {packetSha256: hash(sourceBytes), evaluatorSha256: hash(evaluatorBytes),
    frozenFiles: Object.fromEntries([...frozenHashes].map(([file, digest]) => [path.basename(file), digest])),
    origin: packet.source?.origin, sessionSpanHours: packet.source?.sessionSpanHours,
    observedReturnGapSeconds: packet.source?.observedReturnGapSeconds,
    cutoffAt: packet.source?.cutoffAt, historyRecords: units.length, authoredTextChars: packet.history.reduce((n, record) => n + record.text.length, 0), serializedHistoryChars: rawChars},
  policy: {budgetChars: 16000, recentCount: 2, threshold: 0.25, maxAttempts: 3, tokenBudget: 100000,
    maxOutputTokens: packet.limits?.maxOutputTokens || 1800, tools: [], storage: 'Fresh temporary local MongoDB, real driver'},
  disclosure: [...(packet.disclosure || []),
    'User and system instructions are pinned. The production 16000-character selection budget is unchanged; no artificial context pressure.',
    'Both arms use identical current inputs, model, generation parameters, local file permissions, declared file checks and repair limits.',
    'Private evaluator and future outcomes are never included in model requests. The evaluator runs only after both artifacts in a pair exist; its failures never feed repair.',
    'Production declared file checks assess JSON and existence only. Independent reconstructed criteria decide benchmark success.',
    'Raw private history, prompts and generated artifact content are not included in this public receipt.',
    'Each paid attempt is recorded, including failed requests. Unknown provider usage makes token totals unknown.',
    'No retrieval tools are exposed, matching the production Sleep executor. This does not measure arbitrary archive recovery.',
    'Source session duration and observed idle gaps do not establish historical background execution or elapsed-time speedup.'],
  implementation: {}, pairs: [],
};
for (const file of ['server/context/compaction.js', 'server/context/jev.js', 'server/context/repeat-evidence.js', 'server/sleep/execution.js', 'server/sleep/execution-store.js', 'server/sleep/execution-provider.js', 'scripts/benchmark-real-sleep.mjs']) report.implementation[file] = hash(await fs.readFile(new URL('../' + file, import.meta.url)));
await fs.mkdir(privateRoot, {recursive: true, mode: 0o700});
await fs.mkdir(path.dirname(publicOutput), {recursive: true});
async function save() {await fs.writeFile(publicOutput, JSON.stringify(report, null, 2) + '\n');}
const mongo = await MongoMemoryServer.create(), client = new MongoClient(mongo.getUri());
await client.connect();
const db = client.db('real_sleep_replay'), store = new SleepExecutionStore(db, {leaseMs: 120000});
await store.initialize();
const nonnegative = value => Number.isFinite(value) && value >= 0;
function summarizeReceipts(receipts) {
  const known = receipts.every(r => r.finished && nonnegative(r.inputTokens) && nonnegative(r.outputTokens));
  const costKnown = receipts.every(r => r.finished && nonnegative(r.cost));
  const measuredTokens = receipts.reduce((n, r) => n + (nonnegative(r.inputTokens) ? r.inputTokens : 0) + (nonnegative(r.outputTokens) ? r.outputTokens : 0), 0);
  return {known, costKnown, measuredTokens, totalTokens: known ? measuredTokens : null,
    measuredCost: receipts.reduce((n, r) => n + (nonnegative(r.cost) ? r.cost : 0), 0)};
}
async function runArm(pair, arm) {
  const row = {arm, calls: [], startedAt: new Date().toISOString()}, started = performance.now();
  pair[arm] = row; await save();
  let kept = units;
  const compactor = createContextCompactor({db, scorer: createJevScorer(), budgetChars: report.policy.budgetChars});
  if (arm === 'compacted') {
    const selectionStarted = performance.now();
    try {
      const selected = await compactor.select({runId: `real-${randomUUID()}`, goal: packet.goal, units});
      kept = selected.units; row.selection = selected.metrics;
    } catch (error) {
      row.selection = error.metrics; row.status = 'context-needs-review'; row.error = 'Context selection did not fit its unchanged production policy.';
    }
    row.selectionLatencyMs = Math.round(performance.now() - selectionStarted); await save();
  }
  if (row.error) {
    row.decisionTokens = (row.selection?.inputTokens || 0) + (row.selection?.outputTokens || 0);
    row.totalTokens = null; row.elapsedMs = Math.round(performance.now() - started);
    return {row};
  }
  const history = kept.map(({id, text}) => ({id, ...JSON.parse(text)}));
  const contextBrief = JSON.stringify({task: JSON.parse(brief), history});
  // The adapter expands the brief before provider execution. Extend the same
  // production reservation by a conservative byte bound for that added context.
  const contextBytes = Buffer.byteLength(contextBrief);
  const armStore = new SleepExecutionStore(db, {leaseMs: 120000});
  const reserve = armStore.reserve.bind(armStore);
  armStore.reserve = (task, amount) => reserve(task, amount + contextBytes);
  const workspace = `real-replay-${randomUUID()}`;
  const task = await armStore.enqueue(workspace, 'artifact', {title: packet.title.slice(0, 160), brief,
    deadline: Date.now() + 900000, budget: report.policy.tokenBudget, maxAttempts: report.policy.maxAttempts,
    checks: [{path: 'artifact.json', contains: [], minBytes: 2, json: true}], writeFiles: ['artifact.json']});
  const fetcher = async (url, options) => {
    const start = performance.now(), request = JSON.parse(options.body);
    const receipt = {attempt: row.calls.length + 1, requestSha256: hash(options.body), requestChars: options.body.length, finished: false};
    row.calls.push(receipt); await save();
    try {
      const response = await fetch(url, options);
      receipt.httpStatus = response.status;
      let body;
      try {body = await response.clone().json();} catch {}
      receipt.inputTokens = body?.usage?.prompt_tokens ?? null;
      receipt.outputTokens = body?.usage?.completion_tokens ?? null;
      receipt.cost = body?.usage?.cost ?? null;
      receipt.reportedModel = body?.model || request.model;
      receipt.finished = true;
      if (body) {
        await fs.writeFile(path.join(artifactRoot, `response-${receipt.attempt}.private.json`), JSON.stringify(body, null, 2) + '\n', {mode: 0o600});
        try {
          const plan = JSON.parse(body.choices?.[0]?.message?.content || '');
          receipt.outputShape = {outerKeys: Object.keys(plan), fileContentTypes: Array.isArray(plan.files) ? plan.files.map(file => typeof file.content) : null};
        } catch {receipt.outputShape = {invalidJson: true};}
      }
      return response;
    } catch (error) {receipt.error = error.name || 'Request failed'; throw error;}
    finally {receipt.latencyMs = Math.round(performance.now() - start); await save();}
  };
  const productionProvider = sleepOpenRouterExecutor({model, fetcher});
  const executor = async options => {
    const prompt = JSON.parse(options.prompt);
    return productionProvider({...options, prompt: JSON.stringify({...prompt, brief: contextBrief})});
  };
  executor.retrySafe = productionProvider.retrySafe;
  const artifactRoot = path.join(privateRoot, `trial-${pair.trial}`, arm);
  await fs.mkdir(artifactRoot, {recursive: true, mode: 0o700});
  let result;
  for (let step = 0; step < report.policy.maxAttempts + 1; step++) {
    result = await sleepExecutionTick(armStore, executor, {taskId: task._id, workspace, root: artifactRoot,
      maxOutputTokens: report.policy.maxOutputTokens, callTimeoutMs: 90000});
    await fs.writeFile(path.join(artifactRoot, 'terminal-task.private.json'), JSON.stringify(result, null, 2) + '\n', {mode: 0o600});
    if (!result || result.status !== 'queued') break;
  }
  row.status = result?.status || 'not-claimed'; row.repairs = result?.repairs || 0;
  row.terminalReason = result?.reason || null;
  row.terminalError = result?.error ? (/^(The model returned invalid file JSON\.|invalid-output-path|Sleep model request failed \(\d+\)\.)$/.test(result.error) ? result.error : 'Execution error details retained privately') : null;
  row.finalReservation = result?.tokensReserved || 0;
  row.declaredChecks = result?.checkResults || [];
  row.runtimeChargedTokens = result?.tokensUsed || 0; row.runtimeUnknownUsage = result?.usageUnknown || 0;
  row.mainUsage = summarizeReceipts(row.calls);
  const decisionKnown = !row.selection || row.selection.usageKnown === true;
  row.decisionTokens = row.selection ? row.selection.inputTokens + row.selection.outputTokens : 0;
  row.totalTokens = row.mainUsage.known && decisionKnown ? row.mainUsage.measuredTokens + row.decisionTokens : null;
  const artifact = result?.artifacts?.find(a => a.path === 'artifact.json');
  let privateArtifactPath;
  if (artifact) {
    const artifactPath = path.join(taskDirectory(artifactRoot, result), artifact.directory, artifact.path);
    const bytes = await fs.readFile(artifactPath);
    row.artifactSha256 = hash(bytes); row.artifactBytes = bytes.length;
    // Local path stays private and is never serialized into the public receipt.
    privateArtifactPath = artifactPath;
  }
  row.elapsedMs = Math.round(performance.now() - started);
  return {row, privateArtifactPath};
}
try {
  for (let trial = startTrial; trial < startTrial + trials; trial++) {
    await verifyFrozen();
    const pair = {trial, order: trial % 2 ? ['baseline', 'compacted'] : ['compacted', 'baseline']};
    report.pairs.push(pair);
    const paths = new Map();
    for (const arm of pair.order) {
      const {privateArtifactPath} = await runArm(pair, arm);
      paths.set(arm, privateArtifactPath);
      await save();
    }
    await verifyFrozen();
    for (const arm of pair.order) {
      const row = pair[arm], file = paths.get(arm);
      if (file) {
        const evaluated = spawnSync(evaluatorCommand, [evaluatorPath, file], {encoding: 'utf8', timeout: 10000});
        if ([0, 1].includes(evaluated.status)) {
          try {const checked = JSON.parse(evaluated.stdout); row.evaluation = evaluatorPath.endsWith('.py') ? {
            passed: checked.allPassed === true, checksPassed: checked.passed, checksTotal: checked.total,
            failures: Object.entries(checked.checks || {}).filter(([, pass]) => !pass).map(([name]) => name),
          } : {passed: checked.passed, checksPassed: checked.checksPassed, checksTotal: checked.checksTotal, failures: checked.failures};}
          catch {row.evaluation = {passed: false, error: 'Evaluator returned invalid JSON'};}
        } else row.evaluation = {passed: false, error: 'Frozen evaluator did not complete'};
      } else row.evaluation = {passed: false, error: 'No generated artifact'};
    }
    pair.compactionOnlyRegression = Boolean(pair.baseline.evaluation?.passed && !pair.compacted.evaluation?.passed);
    await save();
    console.log(JSON.stringify({trial, baseline: {status: pair.baseline.status, tokens: pair.baseline.totalTokens, ...pair.baseline.evaluation}, compacted: {status: pair.compacted.status, tokens: pair.compacted.totalTokens, ...pair.compacted.evaluation}}));
  }
  const aggregate = arm => {
    const rows = report.pairs.map(pair => pair[arm]), known = rows.every(row => Number.isFinite(row.totalTokens));
    return {trials: rows.length, artifactsGenerated: rows.filter(row => row.artifactSha256).length,
      passed: rows.filter(row => row.evaluation?.passed).length,
      checksPassed: rows.reduce((n, row) => n + (row.evaluation?.checksPassed || 0), 0),
      checksTotal: rows.every(row => Number.isFinite(row.evaluation?.checksTotal)) ? rows.reduce((n, row) => n + row.evaluation.checksTotal, 0) : null,
      totalTokens: known ? rows.reduce((n, row) => n + row.totalTokens, 0) : null,
      decisionTokens: rows.reduce((n, row) => n + (row.decisionTokens || 0), 0),
      decisionCalls: rows.reduce((n, row) => n + (row.selection?.decisionCalls || 0), 0),
      mainCalls: rows.reduce((n, row) => n + row.calls.length, 0),
      elapsedMs: rows.reduce((n, row) => n + row.elapsedMs, 0)};
  };
  const baseline = aggregate('baseline'), compacted = aggregate('compacted');
  report.summary = {baseline, compacted, compactionOnlyRegressions: report.pairs.filter(pair => pair.compactionOnlyRegression).length,
    tokenSavingsPercent: baseline.totalTokens > 0 && compacted.totalTokens !== null ? Number((100 * (1 - compacted.totalTokens / baseline.totalTokens)).toFixed(2)) : null};
  await save(); console.log(JSON.stringify(report.summary));
  if (baseline.passed !== trials || compacted.passed !== trials || baseline.totalTokens === null || compacted.totalTokens === null) process.exitCode = 1;
} finally {await client.close(); await mongo.stop();}
