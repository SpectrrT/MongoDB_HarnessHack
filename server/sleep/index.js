import { MemoryStore } from './memory.js';
import { PolicyStore } from './policy.js';
import { SleepStore, harnessHooks, historyFixtures } from './cycle.js';
import { voyageEmbedder } from './embed.js';
import { heuristicProposer, openRouterProposer } from './proposers.js';
import { openRouterProvider } from '../harness/workflow.js';

export async function createSleep(db, { embed = voyageEmbedder(), vectorMode } = {}) {
  const memory = new MemoryStore(db, embed, { vectorMode });
  const policy = new PolicyStore(db), reports = new SleepStore(db);
  await Promise.all([memory.initialize(), policy.initialize(), reports.initialize()]);
  return { db, memory, policy, reports };
}
// Without a model key the keyword proposer still runs, but held-out drafts cannot
// be produced, so every candidate is rejected rather than promoted on no evidence.
export function liveDeps(sleep) {
  const llm = process.env.OPENROUTER_API_KEY && process.env.OFFLOAD_MODEL;
  return { db: sleep.db, memory: sleep.memory, policy: sleep.policy,
    proposer: llm ? openRouterProposer() : heuristicProposer(),
    drafter: openRouterProvider(), fixtures: historyFixtures(sleep.db) };
}
export async function liveHooks(client) {
  return harnessHooks(await createSleep(client.db(process.env.MONGODB_DATABASE || 'offload_hackathon')));
}
