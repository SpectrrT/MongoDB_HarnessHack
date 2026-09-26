// npm run fit: read this project's Claude Code session logs, store redacted turns in Atlas, backtest the
// harness edits on them, commit a new harness version if the accepted set changed, and print the report.
import { MongoClient } from 'mongodb';
import { fileURLToPath } from 'node:url';
import { workspaceId } from '../activity/store.js';
import { claudeProjectDir, createFit } from './store.js';
import { signalsOf } from './evolve.js';

const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0) + '%';

export function printReport({ analysis, version, changed, patch }, log = console.log) {
  const a = analysis;
  log(`Harness fit · Claude Code on this project: ${a.sessions} sessions, ${a.turns} turns, ${a.toolCalls} tool calls`);
  log(`Friction: ${a.frustrated} of ${a.turns} turns (${pct(a.frustrated, a.turns)}) ended with a correction, a push, impatience, a repeat or an interruption.`);
  log('\nTools the agent used, against how the turn went:');
  for (const t of a.tools.slice(0, 6))
    log(`  ${t.tool.padEnd(32)} ${String(t.calls).padStart(4)} calls · ${pct(t.inFrustratedTurns, t.calls).padStart(4)} in frustrated turns${t.blocked ? ` · ${t.blocked} blocked` : ''}${t.errors ? ` · ${t.errors} errors` : ''}`);
  log('\nProposed edits, backtested on your own turns:');
  for (const p of a.proposals) {
    const mark = p.decision === 'accepted' ? '✓' : p.decision === 'ask' ? '?' : '✗';
    log(`${mark} ${p.id} (${p.type}): ${p.reason}${p.prediction.frictionShare ? ` · ${pct(p.prediction.frictionShare, 1)} of the friction` : ''}`);
    for (const e of p.evidence.slice(0, 2)) log(`     "${e.prompt.slice(0, 72)}" [${e.signals.join('+')}]`);
  }
  if (!a.permissionBlocks)
    log(`No tool-access changes: all ${a.safetyBlocks} blocks were safety checks, and Harness fit never loosens those.`);
  if (changed) {
    log(`\nCommitted harness v${version.version} (parent v${version.parent}):`);
    for (const line of version.diff) log(`  ${line.slice(0, 150)}`);
  } else log(`\nHarness v${version?.version ?? 0} is unchanged: the same edits passed the gate.`);
  if (patch) log(`\nFor CLAUDE.md:\n${patch}`);
}

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error('Set MONGODB_URI in .env (see .env.example).');
    process.exit(1);
  }
  const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  await client.connect();
  try {
    const fit = await createFit(client.db(process.env.MONGODB_DATABASE || 'offload_hackathon'));
    const workspace = workspaceId();
    const ingested = await fit.ingestClaudeCode(workspace, { dir: claudeProjectDir() });
    if (!ingested.turns) return console.log(`No Claude Code sessions found in ${claudeProjectDir()}.`);
    printReport(await fit.evolve(workspace, 'claude-code'));
  } finally {
    await client.close();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
export { signalsOf };
