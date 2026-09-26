# Sleep context compaction

## Problem statement and scope

The project brief calls Statement Two **Long Horizon Engineering**: a harness should retain coherent memory over very long sessions, continue toward long-term goals, and learn from hard metrics. This change implements and measures a context-selection component for that goal. It does not demonstrate billions of tokens, weeks of operation, or general task improvement.

The product section is **Sleep**. Context memory appears as a tab within Sleep. The implementation is on local branch `ryan/jev-context`, based on the submission repository's `integration` commit `d2a377c`. No push or deployment is part of this change.

Yesterday's local Sleep review, today's separate chat/Slow task experiments, and the current REM integration were reviewed. This branch builds on the current submission repository, `SpectrrT/MongoDB_HarnessHack`. It does not merge the separate, uncommitted chat-Sleep experiment worktree.

## What runs

`server/context/jev.js` calls the typed Jev decisions endpoint. Each candidate gets a probability of needing retention and its complementary omission probability. These are model estimates, not a correctness guarantee or a distribution normalized across all records. The fixed default omits only below P(keep) = 0.25; the threshold has not been broadly calibrated.

`server/context/compaction.js` applies the policy:

1. Below 16,000 characters of tool history, make no selection calls.
2. Archive originals in MongoDB documents of at most 16,000 characters each before omitting anything.
3. Preserve recent exchanges, explicitly pinned records, detected constraints and open loops, errors, and committed effects. System instructions and the user task remain outside selection.
4. Remove redundant copies of identical, idempotent read results without Jev. The latest copy stays eligible for retention; original records remain archived.
5. Batch other candidates, at most eight records and 10,000 source characters per Jev request, at most 16 requests per selection.
6. Retain malformed, uncertain, unavailable, and unscored decisions. If retained context cannot fit, persist `needs_review` instead of silently dropping it.
7. Cache valid decisions by run, source digest, goal, model, and explicit task-state revision. Changing the goal, plan, harness version, or completion feedback invalidates reuse. New evidence whose significance is not reflected in that revision is a remaining limitation.
8. Keep complete tool-call/result pairs and original chronological order. The model can use `context.list` and `context.read` to retrieve omitted evidence within its own run.

`rem/agent.js` invokes selection before planner and executor requests. Decision tokens are included in run usage and separately identified. A fresh worker can resume a context pause after explicit review and an adequate budget. The user-facing model's instructions, effect ledger and checks are independent of Jev selection.

The separate Jev completion gate already in REM was not expanded by this work. This feature uses Jev for compaction only. Native Codex chat and the separate OpenRouter chat loop do not pass through this REM integration.

## Research applied

[StateComp, September 23, 2026](https://arxiv.org/abs/2609.27298) treats compression readiness as dependent on current state and separates prediction from executing a worthwhile rewrite. Sleep adapts those principles with pressure gating, complete-exchange boundaries, and state-keyed decision reuse. It does not reproduce the paper's trained hidden-state router or claim its reported savings.

[Anthropic, September 29, 2025](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) describes compaction, external notes, and just-in-time retrieval. Sleep uses reversible omission: working context becomes smaller while original evidence remains addressable. Its additional deterministic duplicate-read pass avoids an auxiliary model call for exact redundancy.

[TypeSafe's API reference](https://docs.typesafe.ai/introduction/quickstart) defines the Noul probability interface used here. TypeSafe direct uses `jev-1.13.0`; OpenRouter uses `typesafe/jev-1.13`. No text summary generation is required.

## Enable in the project

Install normal project dependencies with `npm ci`. Configure the existing gitignored environment with `MONGODB_URI` pointing at the event sandbox and the intended `REM_DB_NAME`. Set `REM_COMPACTION=jev` and either `TYPESAFE_API_KEY` or `OPENROUTER_API_KEY`. No key belongs in a commit. The normal server entrypoint loads `.env`.

The default REM task driver is scripted. Set `REM_MODEL=openrouter` with `OPENROUTER_API_KEY` if you intend actual model-driven task execution. The UI reports selector, database, and task model separately. Open `/app/sleep`, then **Context memory**, to inspect recorded run selections.

Tests can inject a compactor with a smaller `budgetChars`; applications can tune the budget by constructing `createContextCompactor({db, budgetChars, recentCount, threshold})`. `budgetChars` bounds selected serialized tool exchanges, not the entire model prompt or token count.

Reproduce the local checks:

```sh
npm test
npm run build
npm run context:benchmark
```

Reproduce the live retention and repeated-answer experiment, supplying credentials through your existing private environment:

```sh
node scripts/benchmark-context.mjs --live --atlas --answer-model openai/gpt-4o-mini --repeats 5 --output /absolute/path/report.json
node scripts/benchmark-context.mjs --live --answer-model openai/gpt-4o-mini --stress --output /absolute/path/challenge.json
```

The benchmark uses synthetic records, an isolated `sleep_context_eval` Atlas database, new run ids, and no database reset. Its default is a labeled deterministic fixture, not live Jev. For live mode it can read the existing local TypeSafe key file when no API key is configured. Expected answers stay in the evaluator and are not passed to Jev.

## Measured evidence on September 26, 2026

Initial direct TypeSafe retention: four tasks, all eight required facts retained; selection took 333 to 539 ms with in-memory storage. Tool-history text shrank from approximately 7,200 to 150 characters. This is character reduction, not token savings.

The paired Atlas experiment used the same `openai/gpt-4o-mini` answer model and exact JSON checks on both paths. Each of four task snapshots was answered five times per path. Full context used 26,640 provider-reported input and output tokens. Selected context plus all initial Jev decision tokens used 14,878 tokens, 44.15% fewer. Both paths passed all 20 answer checks. Restarted selection made zero new Jev calls for unchanged state.

On the first answer alone, compaction was worse: approximately 3,200 to 3,400 total tokens versus 1,330. The measured benefit comes from reuse across subsequent calls. Repeated identical snapshots are an optimistic microbenchmark, not an evolving long-horizon task suite. Provider caching, model quality on complex tasks, changing goals, and recovery calls may change the result.

Batching archive and decision writes reduced Atlas selection latency from 4.45 to 8.22 seconds in the first run to 0.96 to 1.82 seconds in the second run. This is an observed before/after measurement, not a controlled latency study.

The separate challenge set checks cross-batch references, changed dated assignments, denied sending permission, and exact artifact names/hashes. Both answer paths passed all four exact checks in the initial challenge run. One irrelevant proofreading-status record was omitted, correctly, but the initial retention evaluator incorrectly counted every supplied fact as required. The revised evaluator explicitly requires only the permission record for that task. The original and corrected result files are retained for audit.

Automated checks cover archive isolation, complete tool exchanges, raw evidence recovery, restart cache reuse, task-state invalidation, provider outages, malformed probabilities, chunking/pagination, cancellation, identical reads, permission protection, context pause, and reviewed resume. Browser tests cover the Sleep tab and the existing day/night REM workflow at desktop and mobile sizes.

## Remaining limits

- The existing REM checkpoint still stores its canonical full transcript. This feature bounds the model's selected tool history, but that checkpoint has not been converted into an unbounded event stream. MongoDB's document size limit means this is not a billion-token implementation.
- Character budgets are not model-specific token budgets. System prompts, tools, archive notices and the current goal add overhead.
- Regex protection supplements caller-supplied pins; it cannot identify every implicit constraint.
- Whole records over 8,000 characters remain protected instead of being semantically split. Too much critical or recovered evidence pauses the run.
- Archive retrieval is available but arbitrary agents are not guaranteed to know when omitted evidence has become relevant.
- The current REM API remains a shared local demo. Per-user authentication and production isolation are separate work.
- Paid calls interrupted before their usage response may incur charges that the application cannot measure. Such failures are labeled unknown usage.

The next substantive milestone is to move the canonical transcript out of the checkpoint into indexed event records, then run evolving multi-stage tasks with held-out checks, interruptions, retrieval, and total cost-per-success accounting. That work is required before claiming the full scale of Statement Two.
