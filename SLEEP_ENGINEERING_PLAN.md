# Sleep engineering plan

Proposed architecture, September 26. This is an implementation specification, not a claim that these capabilities are built.

## Product contract

A failed check or user correction starts an investigation. Sleep generates competing hypotheses, proposes executable policy changes, tests them in isolation, repairs the original result, and promotes a reusable improvement only when independent evaluation supports it. No improvement is a valid result. Unclear subjective preferences produce concrete choices for the user.

Fix this and Improve overnight use the same engine. They differ in queue priority, time budget, and whether the user is waiting. Sleeping longer is not required: finish when the budget expires, improvement plateaus, or all accepted criteria pass.

## Components

Retain React, Express, the MongoDB Node driver and the existing separate worker. Add a Sleep coordinator and a task adapter boundary. Do not rewrite around another orchestration framework for this milestone.

- Feedback intake: ties explicit feedback and objective failures to immutable run evidence. Sentiment alone does not become a requirement.
- Investigator: reads failed inputs, selected context, outputs and checks. Produces hypotheses, confidence and proposed experiments.
- Policy compiler: validates typed candidate configurations and compiles them to an executable graph of existing allowed operations.
- Trial workers: run baseline and candidates against frozen fixtures using the same executor used for real tasks.
- Evaluator: independently checks task outcomes; does not let candidates edit tests, labels, scores or budgets.
- Promotion controller: applies versioned, measured changes to new runs with compare-and-swap and rollback.
- Scheduler: creates resumable cycles even when no browser is open. Requires an always-running service; a closed laptop cannot host this reliably.

## Lifecycle and checkpoint boundaries

queued -> snapshot -> diagnose -> propose -> development_trials -> select -> holdout_gate -> repair -> awaiting_approval/promote -> report -> completed

Any stage may pause for budget, cancellation, missing access or needed user input. Persist stage inputs and decisions before dispatching children. Failure recovery loads those decisions instead of asking the proposer to recreate the same experiment.

A cycle launches child trial jobs with a unique key of cycle, candidate, case and repetition. A duplicated coordinator dispatch must return the existing job. Workers claim jobs with leases and fencing tokens, as in the existing runner. Add per-step attempt limits, cancellation checks, workflow schema version, model configuration snapshot and policy version.

## What is allowed to change

Candidate policy is structured data, never arbitrary JavaScript in the server process. The first version may change:

- Context selection: recency weighting, topic matching, unresolved-item priority, source diversity and context budget within fixed limits.
- Workflow: insert approved retrieval or validation operations, split extraction from drafting, reconcile conflicting records before decision.
- Verification: select from trusted checks and request additional evidence on a failed check.
- Retry: bounded attempts and alternate approved read-only tool routes.
- Output: structured artifact fields and presentation instructions.

Keep workspace authorization, approved tool ceiling, evaluator implementation, protected tests, spending limits and promotion criteria immutable to candidates. A candidate can narrow tool access but cannot expand the user's grants.

Proposer returns parent policy hash, hypothesis, typed policy patch, rationale and predicted effect. The compiler rejects unknown operations, cycles, unbounded loops, permission expansion, excessive context and missing required checks. Real execution must interpret every accepted field; no decorative policy settings.

This supports open-ended model-proposed combinations inside a bounded operation vocabulary. It does not claim unrestricted self-modifying code. Arbitrary generated tools require a separate secure runtime and are deferred.

## Task adapter

Each supported task implements:

1. snapshot(input, grants): freezes source IDs, versions and allowed access.
2. execute(snapshot, compiledPolicy, memoryView): returns a structured artifact and trace.
3. evaluate(artifact, privateExpectedState): returns objective metrics and failure evidence.

First adapter: release readiness. Structured project event records describe blocker creation, resolution and reopening, decisions and timestamps. The model produces a readiness decision, blocker IDs and cited event IDs. A separate deterministic reducer computes ground truth from the event history.

Checks cover exact unresolved blocker sets, readiness decision, temporal consistency, valid citations and required output fields. Include both ready and blocked projects so always saying 'blocked' cannot pass. Contradictory or genuinely insufficient evidence has an explicit needs-review outcome. The initial benchmark proves structured project-record reasoning, not arbitrary software release safety.

## Experimental design

Start with a small suite: four development cases, six protected gate cases, and two final demonstration cases. Include stale blockers, reopened issues, misleading recent notes, long irrelevant histories and clean releases. These counts are a hackathon starting point, not statistical proof.

Run the baseline honestly. Do not intentionally corrupt it or promise failure if it succeeds. If no failure reproduces, use a different observed failure or report no improvement.

Generate at most three candidates in the first round. Compare them on development cases using identical source snapshots and model settings. On the best candidate, change one component back to baseline to test whether the supposed cause explains the gain.

Select one candidate before the protected gate. Run baseline and candidate on the same gate cases with two repetitions initially. Fixed temperature does not guarantee deterministic model output. Cache only identical immutable trial inputs and identify reused results.

Promotion criteria for the demo:

- Zero permission or protected-check violations.
- No readiness-decision regression on any protected case/repetition.
- Strict improvement on the predeclared primary metric, correct readiness plus exact blocker set.
- Cost and latency remain within declared budgets.

Report raw counts, repetitions and failures, not a general claim of reliability. Candidate generation sees development evidence only. The coordinator gets the gate result; it must not feed protected examples back to the proposer. Repeated tuning against one holdout leaks information, so failed gate candidates require fresh protected cases or human review. Final demo cases remain unused until demonstration.

## Storage and consistency

All collections are scoped by workspace; timestamps and provenance are mandatory.

- sleep_cycles: stage, source run IDs, feedback IDs, frozen snapshot hashes, candidate IDs, child job IDs, budget ledger, stop reason and report.
- harness_policies: immutable specification, parent ID/hash, compiler version and evidence reference. Content hash identifies the policy.
- policy_heads: active version per workspace and task type. Atomic compare-and-swap prevents a stale cycle overwriting a newer promotion; log promotion history with the head change atomically.
- harness_runs: pinned policy ID, executor schema version, model settings, checkpoint and bounded step data. Completed work never changes when a new policy is promoted.
- experiment_trials: candidate, case version, repetition, artifact, trace reference, evaluator version, scores, cost and latency. Unique compound dispatch key.
- feedback_events: correction or failure, originating run, observed result and accepted requirements.
- memories: evidence references, scope, confidence, creation time, supersededBy and retention policy. Task-local observations do not become universal preferences automatically.
- schedules: timezone, next occurrence and unique scheduled occurrence ID.

Keep bulky traces/artifacts outside growing coordinator documents. Use separate artifact records or object storage for larger content. Avoid an unbounded receipt array in long-horizon jobs.

Promote by atomically changing policy_heads with a promotion-history entry. A run pins that version when created. Rollback moves the head for new runs; it does not silently rewrite in-flight work. Memory writes get stable operation keys so recovery can reconcile partial completion.

## Budget and scheduling

Before every paid call, atomically reserve a conservative maximum cost and a trial slot against the cycle budget. Settle against actual usage afterward. A crashed call with unknown billing keeps its reservation until reconciled, rather than permitting unlimited retries. If provider pricing cannot be bounded, enforce call/token ceilings and do not advertise a precise dollar cap.

Stop on deadline, exhausted budget, cancellation, invalid credentials, or plateau. Distinguish retryable infrastructure failures from a completed trial with a bad score.

Suggested initial experiment limits: three candidates, one development round, one protected gate, two parallel trials. Configuration defaults are not authorization to spend or provision hosting.

For overnight operation, use a supervised worker and scheduler on an authorized server. Persist timezone-aware next-run times, deduplicate schedule occurrences, and bound missed-run catch-up. Browser settings only configure the server schedule.

## API and UI

POST /api/sleep/feedback: submit correction tied to a run.
POST /api/sleep/cycles: start Fix this or Improve overnight with explicit limits.
GET /api/sleep/cycles/:id: stage, real trials, budget and report.
POST /api/sleep/cycles/:id/cancel: stop new trials and fence pending commits.
POST /api/sleep/cycles/:id/promote: guarded activation after gate and applicable approval.
POST /api/sleep/policies/:id/rollback: restore an eligible prior version.

Reuse the Sleep page with four panels: problem and acceptance criteria; experiment list with live actual results; policy diff and promotion decision; repaired artifact and morning report. Keep unchanged/failed candidates visible. Show rejected hypotheses, no-winner outcomes and uncertainty.

## Engineering sequence and acceptance tests

1. Build release fixtures and independent evaluator. Acceptance: clean releases, unresolved and reopened blockers, stale facts and ambiguous cases scored correctly; always-blocked strategy fails.
2. Implement policy schema/compiler and release executor. Acceptance: changing policy changes retrieved context or execution trace; invalid graphs and permission increases rejected.
3. Persist policies and cross-run evidence. Acceptance: old runs retain old versions, corrected memories supersede rather than silently overwrite, workspace isolation enforced.
4. Implement experiment coordinator on durable jobs. Acceptance: competing hypotheses produce real trials; duplicate dispatch cannot create duplicate trials; budget reservations survive crash.
5. Implement protected gate and promotion. Acceptance: no gain, regressions and missing evaluations block promotion; concurrent promotion conflicts; rollback affects only new runs.
6. Connect existing UI to real cycles. Acceptance: actual metrics and artifact visible; reload resumes tracking; no fake progress or fabricated scores.
7. Run live Atlas and model integration, then SIGKILL a child process mid-cycle. Acceptance: recovery finishes remaining jobs without duplicate internal artifacts and logs any repeated model calls.
8. Add overnight schedule and concise morning report. Acceptance: closed-browser operation, timezone handling, missed-run behavior and cycle budget limits.

Do not delay steps 1-6 for extra integrations or vector search. Exact, scoped retrieval is sufficient to establish the experiment loop. Add semantic retrieval once its contribution can be measured.

## Demo contract

Three-minute story: observed failure -> explicit feedback -> competing experiments -> independently verified gain -> executable policy diff -> new-task success -> recovery evidence.

An accelerated cycle uses the same state machine and executor as overnight mode with smaller workload limits. Display actual durations. Rehearse live; a labeled recording is a fallback, never passed off as live.

## Current boundary and dependencies

Already built: basic MongoDB run storage, renewable fenced leases, four-stage handoff, model adapter, local integration tests and browser UI.
Not yet built: this Sleep coordinator, policy compiler, benchmark, protected gate, long-term memory, promotion and scheduling.
Live dependencies: event Atlas sandbox connection and configured model key. Production hosting also requires real authentication, spend controls and deployment authorization. Prior-work eligibility and public distribution rights remain submission requirements.
