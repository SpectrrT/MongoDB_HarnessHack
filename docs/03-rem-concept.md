# REM (Replay · Evolve · Merge) — the merged concept

**One-liner:** "Agents that sleep, and wake up with a better harness."

**Pitch paragraph:** REM is an agent harness with a circadian cycle. By day it does long-horizon work through your connected
accounts, durably, so an expired login or a crash never loses progress or duplicates an action. By night it sleeps: it replays
the day, merges duplicate memories and drops noise, distills repeated work into tested skills, and evolves its own rules,
guardrails, tool access, and model routing against a held-out task suite. In the morning it asks once for anything new it
wants to do on its own, and it is measurably better than yesterday.

It merges four ideas: Lamarck (metric-gated self-evolving harness), Understudy (learn routines, practice, ask permission,
hand off), Agents That Sleep (nightly consolidation), and the auth-resilient durable-execution harness. It targets both
problem statements: Statement One (the harness evolves its own rules, guardrails, tool access, context policy, routing — and
fits a specific user through asks) and Statement Two (coherent memory that stays small and accurate as it grows, durable
long-horizon execution, learning from hard metric signals).

## Why the pieces lock together (not just stack)

- **Durable execution is the precondition for sleep.** You can't have a nightly cycle unless in-flight tasks can pause and
  resume — and the deep version resumes *under a new harness version* the next morning while preserving already-committed
  side effects.
- **Sleep is the answer to the biggest objection to Lamarck.** Self-modification mid-task is unstable and invites reward
  hacking, so REM only evolves offline, in a batch, gated by validation — exactly the way biological consolidation is offline.
- **Understudy's skill distillation is what sleep produces** (procedural memory), and its "want me to handle this next time?"
  is the safety valve on Lamarck's tool-access evolution: the harness can propose new authority, but only a human grants it,
  and the grants and refusals become memory that teaches the harness this user's risk tolerance (Statement One's "fit a
  specific user").
- **Lamarck's metric-gated evolution makes "measurably better the next morning" true** rather than vibes.
- Every teammate's idea keeps its own moment on stage (interrupt-and-resume, before/after sleep, the morning ask, the harness
  diff), which matters for four people committing to one thing.

## The day loop (Floyd + Understudy)

1. Connect Google once; pick scopes (Drive read, Gmail send, …). Tokens live in `connections`.
2. The agent works a recurring long-horizon task — the demo task is a **weekly research brief**: read new docs in a Drive
   folder, cross-reference with what it remembers from previous weeks (so memory visibly matters), write the brief, send it.
3. Every step checkpoints to Atlas (`checkpoints`).
4. Every side effect is written to the **effects ledger before execution** with a deterministic effect key (task id + step +
   content hash) under a unique index. A retry after a crash or a 401 finds the committed effect and skips it → exactly-once
   emails, no duplicate docs. Checkpoint + ledger writes are atomic (transaction).
5. When access expires, the task parks itself as `paused_for_auth` and asks the human **once**. A change stream on
   `connections` sees the refreshed token and resumes the task from its checkpoint.
6. If the harness changed overnight, the resume re-plans remaining steps under the new version but preserves committed effects
   (**resume-under-new-version**).
7. Demonstrations are episodes in the same store: when the user does a step by hand or corrects the agent, that trace is raw
   material for the night.

## The night loop, staged like sleep (Ryan + Lamarck + Understudy)

1. **Replay** — re-read the day's episodes in order; compute per-task metrics.
2. **Merge** — cluster near-duplicate memories via vector search; fold each cluster into one memory with provenance links to
   its source episodes; resolve contradictions by recency and confidence; drop noise (low-importance episodes referenced by no
   consolidated memory). Raw episodes then expire via TTL. Pitch line: "forgetting is a feature, and it's an index."
3. **Distill** — mine repeated work (recurring tool-call sequences and embedding clusters across days and demonstrations);
   synthesize a parameterized skill with a test; run the test in a sandbox — Understudy's practice stage. Store with success
   stats and required scopes.
4. **Evolve** (Lamarck) — mine failures and inefficiencies; run a `$rankFusion` hybrid search over past edits so it never
   retries something that regressed last week; propose bounded edits to rules, guardrails, tool scopes, context policy, and
   model routing, each with a falsifiable prediction; validate against the held-out suite with a no-regression gate; commit a
   new harness version with a diff; record prediction vs outcome so the proposer's prompt carries its own track record by edit
   type (the improver improves — recursive).
5. **Queue asks** — anything needing new authority (a send scope, an autonomous skill, a loosened guardrail) becomes a morning
   ask.
6. **Morning brief** — what changed, metric deltas, what it wants permission for.

## The morning (Understudy)

- The user sees the asks: "Want me to send the brief myself next time? (needs Gmail send scope)". Approve → the skill becomes
  autonomous; the decision is memory (e.g. the harness learns "never ask about read-only scopes; always ask about send").
- The same task runs again: fewer steps, cheaper, faster, no human interventions; the harness diff is visible.

## MongoDB shape

| Collection | Contents | Features |
|---|---|---|
| `episodes` | raw day-time events (tool call + result, observation, error, human correction, demonstration step) | `autoEmbed` on `summary`; TTL after consolidation |
| `memories` | consolidated semantic memories: text, confidence, recency, importance, provenance episode ids, contradiction links | embedded; hybrid-searchable (`$rankFusion`) |
| `skills` | procedure, parameters, test fixture + expected end state, success stats, required scopes, approval status | embedded for retrieval |
| `harnesses` | versioned genome (rules, context policy, guardrails, tool scopes, model routing), parent id, diff, fitness, metrics | lineage queries |
| `edits` | proposed edits with type, rationale, prediction, outcome (accepted / rejected / regressed), evidence | hybrid search "have we tried this?"; aggregation → track record |
| `checkpoints` | per-task execution state: plan, cursor, working set, status (`running` / `paused_for_auth` / `done`) | transactions with `effects` |
| `effects` | effects ledger: effect key (unique), status `pending` / `committed`, result | unique index = idempotency |
| `connections` | account, granted scopes, token state | change stream → resume |
| `asks` | permission requests and the user's decisions | feeds risk tolerance |
| `metrics` | per-day metrics | time-series collection |
| `gym_*` | per-run scratch databases reset from fixtures | dropped after runs |

Also: change streams drive the live UI (SSE) and the resume trigger; aggregation pipelines compute consolidation stats,
fitness, and the proposer's track record; the LangGraph MongoDB checkpointer is optional for the daytime agent.
"Why MongoDB" in one breath: the genome and the memory schema change shape as the system evolves; hybrid search and
provenance lookups happen in one aggregation; change streams give the live feed; `autoEmbed` removed the embedding pipeline.

## Hard metrics (both statements demand them)

- **Day-over-day task metrics:** success, steps, cost, latency, human interventions.
- **Memory health:** store size, duplicate ratio, retrieval precision against a probe set, contradiction count — show memory
  getting *smaller and better* at the same time (the rebuttal to "agents get worse as memory grows").
- **Durability:** a chaos test that injects auth failures and kills at random steps and asserts exactly-once effects and full
  completion; show the ledger.
- **Learning curve across simulated days:** a "day" = a batch of gym tasks, a "night" = one consolidation run; five days fit in
  an afternoon.

## The three-minute demo (four wow moments, one story)

1. **Day one (interrupt, ~40 s):** the agent starts the brief; revoke its token mid-run; it pauses, asks once, you reconnect,
   it resumes and finishes; show the effects ledger with the email sent exactly once.
2. **Night (~50 s):** trigger sleep live and watch the counts: e.g. 240 episodes merged into 31 memories; a "weekly brief"
   skill distilled and its test passed; one harness edit accepted ("verify Drive access before planning; predicted −4 steps")
   and one rejected for regressing a held-out task.
3. **Morning (~45 s):** the ask appears — "Want me to send the brief myself next time?" — approve; the same task runs again
   with fewer steps and lower cost; show the gen-0-vs-today harness diff.
4. **Curve + close (~30 s):** the five-day learning curve (pass rate up, cost down, memory size down, retrieval precision up),
   then the architecture in one breath.

## Framing fixes before anyone says these lines on stage

- Don't claim "first." Position sleep as "consolidation that is validated against hard metrics and also evolves the harness,"
  and cite Letta's sleep-time compute, Self-Harness, and AHE as the shoulders you stand on.
- Token refresh already exists (Nango et al.); the durable-execution novelty is exactly-once side effects and resuming under a
  new harness version. Use the term "durable execution" (Temporal, Restate).

## The spine that must survive any cut

1. Effects ledger + auth-interrupt beat (checkpoint, paused-for-auth, resume via change stream).
2. Sleep with Merge + Distill and before/after metrics on the same task.
3. Metric-gated harness evolution (mining → proposal with prediction → held-out validation → commit + diff).
4. The morning ask.

Biggest risk: the live Google integration. Safe fallback: a local Drive/Gmail mock with a real test account used only for the
interrupt beat; make the "revocation" deterministic by deleting the token document rather than truly revoking.
