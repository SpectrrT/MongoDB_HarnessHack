import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createMemoryDb} from '../rem/db/index.js';
import {createContextCompactor, ContextBudgetError} from '../server/context/compaction.js';
import {executionPrompt} from '../server/sleep/execution.js';
import {normalizeReplayPacket, replayUnits, attachReplayContext} from './lib/replay-packet.mjs';

const args = process.argv.slice(2), value = flag => args.includes(flag) ? args[args.indexOf(flag) + 1] : null;
const packetPath = value('--packet'), output = value('--output'), model = value('--model') || 'openai/gpt-4.1-mini';
if (!packetPath || !output) throw Error('Required: --packet and --output.');
const budgetChars = Number(value('--context-budget') || 16000), tokenBudget = 100000;
const conversationHistory = args.includes('--typed-conversation') ? {schemaVersion: 1, instructionsComplete: true} : null;
const bytes = await fs.readFile(packetPath), packet = normalizeReplayPacket(JSON.parse(bytes)), units = replayUnits(packet, {typedConversation: Boolean(conversationHistory)});
const brief = JSON.stringify({goal: packet.goal, input: packet.input || {}}), maxOutputTokens = packet.limits?.maxOutputTokens || 1800;
let decisions = [];
const selector = createContextCompactor({db: createMemoryDb(), budgetChars, maxDecisionCalls: 0,
  scorer: {name: 'Offline protection audit only', async score() {throw Error('Model calls are forbidden during preflight');}}});
try {decisions = (await selector.select({runId: 'private-preflight', goal: packet.goal, units, conversationHistory})).decisions;}
catch (error) {if (!(error instanceof ContextBudgetError)) throw error; decisions = error.metrics.decisions;}
const byId = new Map(units.map(unit => [unit.id, unit]));
const protectedRecords = decisions.filter(decision => !['uncertain', 'jev', 'identical_read'].includes(decision.reason)), protection = {};
for (const decision of protectedRecords) {
  const bucket = protection[decision.reason] ||= {records: 0, chars: 0};
  bucket.records++; bucket.chars += byId.get(decision.id).text.length;
}
const task = {input: {title: packet.title, brief, checks: [{path: 'artifact.json', contains: [], minBytes: 2, json: true}]}, checkResults: []};
const prompt = attachReplayContext(executionPrompt(task), JSON.parse(brief), units);
const catalog = await (await fetch('https://openrouter.ai/api/v1/models', {signal: AbortSignal.timeout(15000)})).json();
const metadata = catalog.data.find(candidate => candidate.id === model);
const hash = value => createHash('sha256').update(value).digest('hex');
const report = {
  createdAt: new Date().toISOString(), mode: 'Protection and reservation preflight. No decision or answer model calls.',
  packetSha256: hash(bytes), model, modelMetadataSource: 'https://openrouter.ai/api/v1/models',
  contextLength: metadata?.context_length ?? null, modelMaxOutput: metadata?.top_provider?.max_completion_tokens ?? null,
  records: units.length, roles: packet.history.reduce((counts, record) => (counts[record.role] = (counts[record.role] || 0) + 1, counts), {}),
  authoredTextChars: packet.history.reduce((n, record) => n + record.text.length, 0),
  authoredTextCodePoints: packet.history.reduce((n, record) => n + [...record.text].length, 0),
  characterMeasurement: 'Chars and selector budgets use JavaScript UTF-16 code units. Code points are reported separately.',
  serializedUnitChars: units.reduce((n, unit) => n + unit.text.length, 0), maximumUnitChars: Math.max(...units.map(unit => unit.text.length)),
  budgetChars, conversationHistory, protectedRecords: protectedRecords.length, protectedChars: protectedRecords.reduce((n, decision) => n + byId.get(decision.id).text.length, 0), protection,
  currentBriefChars: brief.length, fullPromptUtf8Bytes: Buffer.byteLength(prompt),
  conservativeReservation: Buffer.byteLength(prompt) + 512 + maxOutputTokens, tokenBudget, maxOutputTokens,
  scoringCalls: 0, scoringTokens: 0, modelCalls: 0,
  note: 'The byte-based reservation is a conservative admission bound, not measured model tokens. Fitting the protected floor does not guarantee scored context fits.',
  implementation: {},
};
for (const file of ['server/context/compaction.js', 'server/sleep/execution.js', 'scripts/lib/replay-packet.mjs', 'scripts/preflight-real-context.mjs']) report.implementation[file] = hash(await fs.readFile(new URL('../' + file, import.meta.url)));
report.admitted = report.protectedChars <= budgetChars && report.conservativeReservation <= tokenBudget && report.conservativeReservation <= report.contextLength && maxOutputTokens <= report.modelMaxOutput && brief.length <= 4000;
report.boundaries = [
  ...(report.protectedChars > budgetChars ? ['Protected records alone exceed the unchanged context budget.'] : []),
  ...(report.conservativeReservation > tokenBudget ? ['The conservative full-context reservation exceeds the configured task budget.'] : []),
  ...(!report.contextLength || report.conservativeReservation > report.contextLength ? ['The conservative reservation does not fit a verified model context window.'] : []),
  ...(brief.length > 4000 ? ['Current task exceeds the production brief limit.'] : []),
];
await fs.mkdir(path.dirname(output), {recursive: true}); await fs.writeFile(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
