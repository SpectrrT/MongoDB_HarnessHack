# Completion contract

When a completion evaluator is configured, `done` requires a finite probability between zero and one at or above the current harness threshold, and explicit, well-formed acceptance evidence with no failed deterministic checks. Missing evidence cannot establish success. Deterministic failures veto the estimate even if the model returns 0.99.

The agent makes one additional bounded repair attempt after a rejected final answer, subject to its step budget. If that attempt still fails, its status is `incomplete`, its proposed final answer is preserved, and `completion` records the reasons and attempts. A generic resume does not reset the repair allowance. Step-budget exhaustion in the tool loop remains `failed`.

The API reviews terminal incomplete runs so their failed outcomes and corrections reach Sleep. The REM view distinguishes verified completion from incomplete work. The gym's independent deterministic checkers continue to evaluate candidates without requiring a probability provider.

This fixes false success reporting. It does not by itself implement an unlimited repair loop, a generic goal scheduler, calibrated probabilities, or verified external actions. An explicitly configured Jev gate fails closed on missing credentials, provider errors, timeouts and invalid probability output. Offline stub evaluation is only used when selected by configuration, and it also requires evidence. The source and unavailable reason remain visible in each completion record.

Verification: `tests/completion-safety.test.js`, `tests/rem-consolidation.test.js`, `tests/rem-api.test.js`, and the desktop/mobile REM flow.


# Authority changes

Approving a scope grant or weakened guardrail triggers validation against the current harness. The candidate must preserve passing train and held-out tasks, introduce no new collateral damage, and not worsen composite fitness. Newly passing tasks also undergo adversarial checks. Unknown tools and edits that no longer change the harness are rejected.

Human permission and validation outcome are stored separately. A rejected candidate does not change the harness. Provider errors and a changed baseline leave the ask open for a retry. The approval record, evaluated harness version and edit outcome commit in one MongoDB transaction. Duplicate approvals create only one version. The UI shows validation failures rather than silently treating permission as promotion.

Verification includes a disposable MongoDB replica set exercising concurrent approvals and rollback after an injected commit failure. These checks use fixture models and task suites; they establish gate behavior, not universal safety of unseen tools.


# Local REM access

The shared REM demo API requires loopback transport and a local Host header. Browser requests must have a matching Origin. Mutating requests, including run, simulate, reset, sleep, connection changes and approvals, require `X-Offload-Client: local`. The UI supplies this header; same-origin event streams remain usable. Production mode disables the shared API.

These restrictions protect a local demonstration against remote access and cross-origin mutation. They are not multi-user identity or authorization. Do not expose the API through a public proxy without implementing authenticated workspace isolation.


# Continuation policy integration contract

`server/harness/continuation.js` exports `assessContinuation(state, { now })`. It is a pure decision and reminder builder. It is not yet connected to a runner, scheduler or UI. It returns `continue`, `pause`, or `stop` with a machine-readable reason. Only `stop/completed` establishes success; every other stop leaves work unfinished.

Supply a persisted snapshot with `objective`, `deadlineAt` (epoch milliseconds or ISO date), `attempts`, `maxAttempts`, `tokensUsed`, `tokenBudget`, `nextTokenReservation`, `stalledAttempts`, `maxStalledAttempts`, `requiredCheckIds`, and `checks` containing unique `{ id, passed }` entries. Optional fields are `cancelled`, `awaitingApproval`, `blockedReason`, and `nextStep`. Missing evidence leaves work remaining. Missing acceptance criteria, malformed evidence and missing limits pause execution. All required checks must pass and no additional check may fail to establish success.

The runner owns authorization, trusted evidence scoped to the current goal and artifact version, persistence, wakeups, leases and atomic token reservation. Count attempts across restarts; never reset them on a continuation prompt. Count a stall when an attempt adds no verified milestone or useful artifact change. Model self-reports and repeated text are not progress. Cancellation, deadline expiry and usage enforcement must also interrupt in-flight calls; evaluating this helper only between calls is insufficient. A continuation decision does not itself reserve budget or prevent concurrent workers.

On `continue`, pass the reminder with the existing task constraints and relevant saved state. On `pause`, save the reason and surface the blocker instead of automatically repeating the same prompt. On `stop`, retain the artifact, evidence and unfinished criteria. The reminder asks for the next useful step and evidence, without inventing positive feedback or granting more authority. Runner integration must exercise restart, fencing, reservation, blocked-state wakeup and stop behavior end to end before claiming autonomous continuation works.


# Process restart evidence

`tests/harness-process.test.js` uses a disposable real MongoDB server and three separate Node processes. It kills the first worker with SIGKILL after the context checkpoint commits and a draft call starts. The second worker waits for the unchanged lease to expire and completes the handoff. Four unique receipts remain, the old lease cannot commit, and the third worker makes no further provider call for the terminal run. The draft provider is a fixture and runs twice because the first draft call was interrupted.

This verifies the durable handoff worker's checkpoint and fencing behavior under real process death. It does not establish exactly-once external provider effects, live Atlas availability, or persistence of the separate REM simulated world.


# Persistent REM fixture provider

Mongo-backed REM selects `createPersistentWorld`; memory-backed demos and gym scratch worlds remain isolated in-memory fixtures. `engine.world` reports `mongo-fixture` or `memory-fixture`. This does not add Gmail/Drive credentials or call an external service.

A transaction commits the mutated fixture snapshot and its uniquely keyed provider receipt together. Replaying a key returns the prior result, including a zero-result delete; different arguments under the same key reject. Sequence numbers survive startup, and transactional simulated human restoration prevents a corrected deletion from returning after restart. Changed fixture versions fail explicitly instead of silently resetting stored state. The existing explicit demo reset clears these collections along with other demo data.

`tests/persistent-world.test.js` covers facade selection, snapshots, concurrent adapters, argument conflict, no-op receipts, correction persistence and rollback. `tests/rem-process.test.js` kills an actual worker after its provider transaction and before the effects ledger commit, then resumes in a different process after natural lease expiry. The model is scripted and completion scoring is off in this durability test: its success assertion concerns checkpoint recovery and one simulated send, not task quality or model calibration.

The provider snapshot is one bounded demo document and remains subject to MongoDB's document size limit. This adapter does not make unsupported exactly-once claims for real external services. Those require service-side idempotency or a reliable external reconciliation API.
