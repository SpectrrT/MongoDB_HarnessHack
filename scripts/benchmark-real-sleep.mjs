import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash, randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {MongoMemoryServer} from 'mongodb-memory-server';
import {MongoClient} from 'mongodb';
import {SleepExecutionStore} from '../server/sleep/execution-store.js';
import {sleepExecutionTick, taskDirectory, executionPrompt} from '../server/sleep/execution.js';
import {sleepOpenRouterExecutor} from '../server/sleep/execution-provider.js';
import {createContextCompactor} from '../server/context/compaction.js';
import {createJevScorer} from '../server/context/jev.js';
import {normalizeReplayEvaluation} from './lib/real-replay-evaluation.mjs';
import {normalizeReplayPacket, replayUnits, attachReplayContext} from './lib/replay-packet.mjs';

const args = process.argv.slice(2);
const value = flag => args.includes(flag) ? args[args.indexOf(flag) + 1] : null;
const packetPath = value('--packet'), privateRoot = value('--private-output'), publicOutput = value('--output');
if (!packetPath || !privateRoot || !publicOutput) throw Error('Required: --packet, --private-output, --output.');
const trials = Number(value('--trials') || 3), startTrial = Number(value('--start-trial') || 1), model = value('--model') || 'openai/gpt-4o-mini';
if (!Number.isInteger(trials) || trials < 1 || trials > 3 || !Number.isInteger(startTrial) || startTrial < 1 || startTrial + trials > 4) throw Error('Trial numbers must be within 1 to 3.');
if (!process.env.OPENROUTER_API_KEY) throw Error('Configure the existing private OpenRouter key.');
const sourceBytes = await fs.readFile(packetPath), sourcePacket = JSON.parse(sourceBytes);
const packet = normalizeReplayPacket(sourcePacket);
if (!Array.isArray(packet.history) || typeof packet.goal !== 'string' || !packet.id) throw Error('Invalid frozen packet.');
const evaluatorPath = value('--evaluator') || path.join(path.dirname(packetPath), 'evaluate.mjs');
const evaluatorCommand = evaluatorPath.endsWith('.py') ? 'python3' : process.execPath;
const evaluatorBytes = await fs.readFile(evaluatorPath);
const hash = value => createHash('sha256').update(value).digest('hex');
const frozenFiles = [packetPath, evaluatorPath, ...(value('--checks') ? [value('--checks')] : []), ...(value('--manifest') ? [value('--manifest')] : []), ...(value('--audit-manifest') ? [value('--audit-manifest')] : [])];
const frozenHashes = new Map(await Promise.all(frozenFiles.map(async file => [file, hash(await fs.readFile(file))])));
async function verifyFrozen() {for (const [file, digest] of frozenHashes) if (hash(await fs.readFile(file)) !== digest) throw Error('A frozen benchmark input or evaluator changed.');}
const audit = value('--audit-manifest') ? JSON.parse(await fs.readFile(value('--audit-manifest'))) : null;
const auditedSpan = audit ? (Date.parse(audit.sourceLastTimestamp) - Date.parse(audit.sourceFirstTimestamp)) / 3600000 : null;
const brief = JSON.stringify({goal: packet.goal, input: packet.input || {}});
if (brief.length > 4000) throw Error('Packet current task exceeds the production Sleep brief limit.');
const conversationHistory = args.includes('--typed-conversation') ? {schemaVersion: 1, instructionsComplete: true} : null;
const units = replayUnits(packet, {typedConversation: Boolean(conversationHistory)});
const rawChars = units.reduce((n, record) => n + record.text.length, 0);
const report = {
  schema: 2, createdAt: new Date().toISOString(), id: packet.id, title: packet.title,
  mode: 'Reconstructed offline artifact replay through production Sleep generation, file writing and declared file checks',
  evaluationPhase: args.includes('--development') ? 'Preregistered development configuration after observed failures. Prompt, model and any opted-in typed-history policy differ from initial frozen trials; no separate causal attribution.' : 'Frozen initial configuration',
  adapter: 'Benchmark-only immutable historical context attachment. Production Sleep has no context compaction/retrieval integration.',
  model, scorerPolicy: createJevScorer().policyVersion, trials, startTrial,
  provenance: {packetSha256: hash(sourceBytes), evaluatorSha256: hash(evaluatorBytes),
    frozenFiles: Object.fromEntries([...frozenHashes].map(([file, digest]) => [path.basename(file), digest])),
    origin: packet.source?.origin, sessionSpanHours: Number.isFinite(auditedSpan) ? auditedSpan : packet.source?.sessionSpanHours,
    observedReturnGapSeconds: audit?.gapAuditNotForModels?.lastAssistantToFirstUserReturnSeconds ?? packet.source?.observedReturnGapSeconds,
    gapMeaning: audit?.gapAuditNotForModels?.interpretation ?? packet.source?.gapMeaning,
    cutoffAt: audit?.cutoff?.timestamp ?? packet.source?.cutoffAt,
    curatedSourceCounts: audit?.counts, curatedAssistantSourceLines: audit?.assistantLines,
    historyRecords: units.length, authoredTextChars: packet.history.reduce((n, record) => n + record.text.length, 0),
    authoredTextCodePoints: packet.history.reduce((n, record) => n + [...record.text].length, 0),
    characterMeasurement: 'Chars and selector budgets use JavaScript UTF-16 code units. Code points are reported separately.', serializedHistoryChars: rawChars},
  policy: {budgetChars: 16000, recentCount: 2, threshold: 0.25, conversationHistory, maxAttempts: 3, tokenBudget: 100000,
    maxOutputTokens: packet.limits?.maxOutputTokens || 1800, tools: [], storage: 'Fresh temporary local MongoDB, real driver'},
  disclosure: [...(packet.disclosure || []),
    'User, system and developer instructions are pinned. The production 16000-character selection budget is unchanged; no artificial context pressure.',
    'Both arms use identical current inputs, model, generation parameters, local file permissions, declared file checks and repair limits.',
    'Private evaluator and future outcomes are never included in model requests. The evaluator runs only after both artifacts in a pair exist; its failures never feed repair.',
    'Production declared file checks assess JSON and existence only. Independent reconstructed criteria decide benchmark success.',
    'Raw private history, prompts and generated artifact content are not included in this public receipt.',
    'Each paid attempt is recorded, including failed requests. Unknown provider usage makes token totals unknown.',
    'No retrieval tools are exposed, matching the production Sleep executor. This does not measure arbitrary archive recovery.',
    'Source session duration and observed idle gaps do not establish historical background execution or elapsed-time speedup.'],
  implementation: {}, pairs: [],
};
for (const file of ['server/context/compaction.js', 'server/context/jev.js', 'server/context/repeat-evidence.js', 'server/sleep/execution.js', 'server/sleep/execution-store.js', 'server/sleep/execution-provider.js', 'scripts/benchmark-real-sleep.mjs', 'scripts/lib/real-replay-evaluation.mjs', 'scripts/lib/replay-packet.mjs']) report.implementation[file] = hash(await fs.readFile(new URL('../' + file, import.meta.url)));
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
  const row = {arm, calls: [], decisionCalls: [], startedAt: new Date().toISOString()}, started = performance.now();
  pair[arm] = row; await save();
  const artifactRoot = path.join(privateRoot, `trial-${pair.trial}`, arm);
  await fs.mkdir(artifactRoot, {recursive: true, mode: 0o700});
  const decisionFetch = async (url, options) => {
    const start = performance.now();
    const receipt = {attempt: row.decisionCalls.length + 1, requestSha256: hash(options.body), requestChars: options.body.length, finished: false};
    row.decisionCalls.push(receipt); await save();
    try {
      const response = await fetch(url, options);
      receipt.httpStatus = response.status;
      let body;
      try {body = await response.clone().json();} catch {}
      receipt.inputTokens = body?.usage?.input_tokens ?? null;
      receipt.outputTokens = body?.usage?.output_tokens ?? null;
      receipt.cost = body?.usage?.cost ?? null;
      receipt.finished = true;
      if (body) await fs.writeFile(path.join(artifactRoot, `decision-response-${receipt.attempt}.private.json`), JSON.stringify(body, null, 2) + '\n', {mode: 0o600});
      return response;
    } catch (error) {receipt.error = error.name || 'Request failed'; throw error;}
    finally {receipt.latencyMs = Math.round(performance.now() - start); await save();}
  };
  let kept = units;
  const compactor = createContextCompactor({db, scorer: createJevScorer({fetchImpl: decisionFetch}), budgetChars: report.policy.budgetChars});
  if (arm === 'compacted') {
    const selectionStarted = performance.now();
    try {
      const selected = await compactor.select({runId: `real-${randomUUID()}`, goal: packet.goal, units, conversationHistory});
      kept = selected.units; row.selection = selected.metrics;
    } catch (error) {
      row.selection = error.metrics; row.status = 'context-needs-review'; row.error = 'Context selection did not fit its unchanged production policy.';
    }
    row.selectionLatencyMs = Math.round(performance.now() - selectionStarted); await save();
  }
  row.decisionUsage = summarizeReceipts(row.decisionCalls);
  if (row.error) {
    row.decisionTokens = row.decisionUsage.measuredTokens;
    row.mainUsage = summarizeReceipts(row.calls);
    row.measuredTokens = row.decisionUsage.measuredTokens;
    row.measuredCost = row.decisionUsage.measuredCost;
    row.costKnown = row.decisionUsage.costKnown;
    row.totalTokens = null; row.elapsedMs = Math.round(performance.now() - started);
    return {row};
  }
  const expandPrompt = prompt => attachReplayContext(prompt, JSON.parse(brief), kept);
  // Reserve against the exact expanded prompt, including escaped context strings.
  const armStore = new SleepExecutionStore(db, {leaseMs: 120000});
  const reserve = armStore.reserve.bind(armStore);
  armStore.reserve = (task, amount) => {
    const original = executionPrompt(task);
    return reserve(task, amount + Math.max(0, Buffer.byteLength(expandPrompt(original)) - Buffer.byteLength(original)));
  };
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
          receipt.outputShape = {hasSummary: Object.hasOwn(plan, 'summary'), hasFiles: Object.hasOwn(plan, 'files'), fileContentTypes: Array.isArray(plan.files) ? plan.files.map(file => typeof file.content) : null};
        } catch {receipt.outputShape = {invalidJson: true};}
      }
      return response;
    } catch (error) {receipt.error = error.name || 'Request failed'; throw error;}
    finally {receipt.latencyMs = Math.round(performance.now() - start); await save();}
  };
  const productionProvider = sleepOpenRouterExecutor({model, fetcher});
  const executor = async options => {
    return productionProvider({...options, prompt: expandPrompt(options.prompt)});
  };
  executor.retrySafe = productionProvider.retrySafe;
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
  const decisionKnown = row.decisionUsage.known && (!row.selection || row.selection.usageKnown === true);
  row.decisionTokens = row.decisionUsage.measuredTokens;
  row.measuredTokens = row.mainUsage.measuredTokens + row.decisionTokens;
  row.measuredCost = row.mainUsage.measuredCost + row.decisionUsage.measuredCost;
  row.costKnown = row.mainUsage.costKnown && row.decisionUsage.costKnown;
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
          try {row.evaluation = normalizeReplayEvaluation(JSON.parse(evaluated.stdout), evaluatorPath.endsWith('.py'));}
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
      measuredTokens: rows.reduce((n, row) => n + row.measuredTokens, 0),
      providerReportedCostUSD: rows.every(row => row.costKnown) ? rows.reduce((n, row) => n + row.measuredCost, 0) : null,
      decisionTokens: rows.reduce((n, row) => n + (row.decisionTokens || 0), 0),
      decisionCalls: rows.reduce((n, row) => n + (row.selection?.decisionCalls || 0), 0),
      mainCalls: rows.reduce((n, row) => n + row.calls.length, 0),
      elapsedMs: rows.reduce((n, row) => n + row.elapsedMs, 0)};
  };
  const baseline = aggregate('baseline'), compacted = aggregate('compacted');
  const identicalRequests = report.pairs.every(pair => pair.baseline.calls.length === pair.compacted.calls.length && pair.baseline.calls.every((call, i) => call.requestSha256 === pair.compacted.calls[i].requestSha256));
  const noContextChange = report.pairs.every(pair => pair.compacted.selection?.beforeChars === pair.compacted.selection?.afterChars && pair.compacted.selection?.decisionCalls === 0);
  report.summary = {baseline, compacted, compactionOnlyRegressions: report.pairs.filter(pair => pair.compactionOnlyRegression).length,
    comparison: identicalRequests && noContextChange ? 'identical-input generation variation' : 'paired full-context and selected-context requests',
    savingsAttribution: identicalRequests && noContextChange ? 'No compaction occurred. Token and check differences cannot be attributed to compaction.' : 'Observed paired result only, not a general causal guarantee.',
    compactionChangedInputs: !noContextChange,
    tokenSavingsPercent: baseline.totalTokens > 0 && compacted.totalTokens !== null ? Number((100 * (1 - compacted.totalTokens / baseline.totalTokens)).toFixed(2)) : null};
  await save(); console.log(JSON.stringify(report.summary));
  if (baseline.passed !== trials || compacted.passed !== trials || baseline.totalTokens === null || compacted.totalTokens === null) process.exitCode = 1;
} finally {await client.close(); await mongo.stop();}
