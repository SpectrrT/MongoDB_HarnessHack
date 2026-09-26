# Sleep v2 (built September 26)

Sleep is the self-improving part of the harness (Statement One: Recursive
Harnessing). It reads corrections and failed checks from MongoDB Atlas,
finds recurring ones with vector similarity, proposes a change to the
harness policy, tests it on held-out cases, and promotes it only if it helps
without breaking anything. The next handoff run uses the new policy and
recalls relevant memories with Atlas Vector Search.

## Provenance

Pre-event: the local, keyword-based Sleep page (commit e933a06, src/pages/Sleep.jsx,
shared/workspace.js). Codex's durable runner (server/harness) is event work by
Ryan's Codex session. Built on September 26 for this feature:

- server/sleep/*: embeddings, memory store, policy store, checks, sleep cycle,
  proposers, API routes, worker.
- src/pages/Adapt.jsx ("Harness sleep" page), tests/sleep.test.js.
- Small hooks in server/harness/workflow.js, server/harness/worker.js,
  server/index.js, src/pages/Workspace.jsx (optional, default behavior unchanged).

## Run

1. .env (ignored): MONGODB_URI (event sandbox), MONGODB_DATABASE,
   OPENROUTER_API_KEY, OFFLOAD_MODEL, VOYAGE_API_KEY. Optional VOYAGE_MODEL,
   EMBEDDINGS_BASE_URL (Atlas Embedding API), SLEEP_VECTOR_MODE=atlas.
2. npm run build, then three terminals: npm run harness:server,
   npm run harness:worker, npm run sleep:worker.
3. The server creates one Atlas Vector Search index, memory_vector, on the
   memories collection (free tiers allow three). Wait until it is READY.
4. Open /app/harness, create a handoff. Open /app/adapt, save a correction.
   Repeat on a second handoff, add held-out fixtures (sleep_fixtures collection
   or more completed runs), run a sleep review.

## Collections

memories, harness_policies, harness_policy_heads, sleep_reports, sleep_fixtures,
plus Codex's harness_runs.

## Guarantees and limits

- Review stages are lease-fenced and checkpointed like harness runs; each side
  effect is guarded and idempotent. A resumed review may repeat model calls.
- Promotion and rollback are one compare-and-swap on the policy head.
- Proposals are data only: rules, retrieval settings, checks from a fixed
  registry. Tool requests always wait for a person.
- Checks verify structure (citations, blockers, owners, next steps, length),
  not factual accuracy. Pass rates are computed from stored per-case results.
- Atlas Vector Search is eventually consistent: a memory written seconds
  before a review may not be found by consolidation until indexed.
- Without a model key the keyword proposer still runs, but held-out drafts
  cannot be produced, so candidates are rejected, never promoted.
- Tests use local mode (exact cosine in process) and a hashing embedder;
  live Atlas and Voyage behavior is not verified until credentials exist.
