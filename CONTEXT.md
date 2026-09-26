# CONTEXT.md — ubiquitous language for the REM / Lamarck project

Use these words, exactly, in code, docs, commit messages, and the demo. This file is also what the `/wait-what` skill
reaches for when a message needs re-pitching.

## The system

- **Harness** — everything around the model that decides how it plans, what it sees, what it may call, and how it is judged.
  In this project the harness is *data*: a versioned document, not a config file.
- **Genome** — the editable content of one harness version: rules, context policy, guardrails, tool scopes, model routing.
- **Rule** — a natural-language instruction in the genome (e.g. "verify Drive access before planning").
- **Guardrail** — an executable pre-tool-call check (declarative predicate, e.g. `deleteMany` requires a prior `find` with
  the same filter and a count ≤ N). Guardrails can be added, tightened, or loosened by an accepted edit.
- **Tool scope** — which tools/accounts/permissions the agent may use, at what breadth (e.g. Gmail read vs. Gmail send).
  Expanding a scope always requires an **ask**.
- **Context policy** — what gets injected into the model's context and how (schema summary, retrieved memories, retrieved
  skills, step budget, format of the working set).
- **Model routing** — which OpenRouter model handles which role (planner, executor, critic, consolidator). Part of the
  genome; evolves against cost and quality.
- **Harness version** — an immutable snapshot of a genome with a parent pointer, a diff from the parent, its fitness,
  and links to the edits that produced it. Versions form a **lineage**.

## Memory

- **Episode** — one raw, time-stamped event from the day: a tool call and its result, an observation, an error, a human
  correction, a demonstration step. Stored in `episodes`, embedded (autoEmbed on a summary field), expires by TTL once
  consolidated. Raw memory.
- **Memory** — a consolidated semantic memory: a fact or decision with confidence, recency, provenance (the episode ids it
  came from), and contradiction links. Stored in `memories`. Survives sleep; can be merged, demoted, or retired.
- **Skill** — procedural memory: a parameterized procedure distilled from repeated work or a demonstration, with a test
  (fixture + expected end state), success statistics, the scopes it needs, and an approval status
  (proposed → practiced → approved → autonomous). Stored in `skills`.
- **Demonstration** — a sequence of episodes produced by the human doing a task by hand (or correcting the agent).
  Raw material for distilling a skill.
- **Consolidation** — the night-time process that turns episodes into memories and skills. Its phases are **Replay**,
  **Merge**, **Distill**, **Evolve**, then queue **asks** and write the **morning brief**.
- **Forgetting** — deliberate: raw episodes expire by TTL after consolidation; low-importance, unreferenced memories decay.
  "Forgetting is a feature, and it's an index."

## Self-improvement

- **Gym** — the task suite used to score a harness: fixtures, tasks, and deterministic checkers. Split into a **train set**
  and a **held-out set**.
- **Fitness** — the composite score of a harness on the gym: lexicographic priority no collateral damage > success rate >
  cost/steps. Always reported with the individual metrics.
- **Weakness mining** — clustering failed or inefficient trajectories (vector search over episode summaries) into named
  failure patterns.
- **Edit** — a proposed, bounded change to a genome (add/modify rule, tighten/loosen guardrail, change scope, change
  context policy, change routing). Stored in `edits` with its **prediction**, and later its **outcome**.
- **Prediction** — the falsifiable claim attached to every edit before it is tested: which tasks it should flip, expected
  delta in pass rate and cost. Checked against the outcome; feeds the **track record**.
- **Validation** — running a candidate genome on train + held-out; the **no-regression gate** rejects any edit that breaks a
  previously passing task; accept only net-positive.
- **Track record** — aggregation of prediction-vs-outcome by edit type; injected into the proposer's prompt so the improver
  improves. (The recursive part.)
- **Proposer** — the model role that writes edits. It can only edit the harness, never the gym, fixtures, or checkers.

## Durable execution (the day loop)

- **Task** — a long-horizon unit of work the daytime agent executes (e.g. "weekly research brief").
- **Checkpoint** — the persisted execution state of a task after each step: plan, cursor, working set, pending effects.
  Stored in `checkpoints`. A task can pause and resume from its checkpoint on any worker, under any harness version.
- **Effect** — an external side effect (send email, create doc, update record). Every effect gets a deterministic
  **effect key** (task id + step + content hash) and a row in the **effects ledger** *before* execution; a unique index
  on the key makes retries exactly-once.
- **Paused-for-auth** — task state after a 401/expired token: the task parks, asks the human **once**, and a change stream on
  `connections` resumes it when the token is refreshed.
- **Connection** — a connected account (e.g. Google) with granted scopes and tokens, in `connections`.
- **Resume-under-new-version** — when a paused task resumes after a night, remaining steps are re-planned under the current
  harness version while committed effects are preserved.

## The cycle

- **Day** — execution + observation. **Night** — consolidation + evolution (offline, batched, gated). **Morning** — asks,
  brief, and the same task run again, measurably better.
- **Ask** — a permission request queued at night for anything that needs new authority: a new scope, an autonomous skill,
  a loosened guardrail. The human's decision is stored and shapes future asks (**risk tolerance**).
- **Morning brief** — the report the night writes: what merged, what was distilled, what edits were accepted/rejected with
  their predictions, metric deltas, and the queued asks.
- **Simulated day** — for demos and metrics, a "day" is a batch of gym tasks and a "night" is one consolidation run, so five
  days fit in an afternoon.

## Product / infra nouns

- **Atlas Sandbox** — the MongoDB Atlas cluster provided for the hackathon; everything must live there.
- **autoEmbed** — Atlas Vector Search field type (public preview, May 2026) that embeds a field with a Voyage 4 model on
  insert/update. Models: `voyage-4-large`, `voyage-4`, `voyage-4-lite`, `voyage-code-3`.
- **`$rankFusion`** — MongoDB hybrid search stage (8.1+) combining vector and text ranks. Fallback: app-side reciprocal rank
  fusion.
- **Change stream** — Atlas real-time feed of collection changes; drives the live UI and the resume-on-reconnect trigger.
- **Effects ledger**, **TTL index**, **time-series collection** (metrics), **transaction** (checkpoint + ledger atomicity).
- **OpenRouter** — one key, 500+ models; used for all model calls and for model routing experiments.
- **Voyage AI** — embeddings and rerankers (200M free tokens for the hackathon).
