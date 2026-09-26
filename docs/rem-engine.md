# REM engine

"Agents that sleep, and wake up with a better harness." REM is the engine behind Offload: by **day** it
runs long-horizon **tasks** through connected accounts with durable, exactly-once execution; by **night** it
consolidates (Replay, Merge, Distill, Evolve); in the **morning** it asks once for new authority and is
measurably better. Vocabulary follows `CONTEXT.md` of the planning pack (episode, memory, skill, harness,
genome, edit, prediction, checkpoint, effect, ask, day/night/morning).

Tonight it runs without MongoDB, a model provider or embeddings: an in-memory database with the MongoDB
Node driver's call shapes, a deterministic `ScriptedModel`, and a local hashing embedder. Tomorrow's switch
to Atlas, OpenRouter and Voyage is configuration plus one dependency (see "Switching tomorrow").

```sh
npm run rem:demo   # the 3-minute story in the terminal (~0.3 s); rewrites docs/DEMO-NUMBERS.md
npm test           # existing tests + tests/rem-*.test.js (~0.5 s)
```

## Map

```
                 ┌───────────────────────── rem/index.js  createRem({ db, model, embedder }) ─────────────────┐
 DAY             │ agent.js      harness loop: genome → prompt, guardrails, ledgered effects, checkpoints     │
 (durable)       │ ledger.js     effect keys, claim-before-execute, reconcile, chaos injection                │
                 │ world.js      fixture Drive/Gmail/Calendar + tools on a per-run scratch copy               │
                 │ scripted.js   ScriptedModel (model.js: interface, OpenRouter adapter; models.js: tiers)    │
 NIGHT           │ night.js      Replay → Merge → Distill → (evolve.js) Evolve → asks → morning brief         │
 (offline,       │ evolve.js     weakness mining, past-edit search, validation, no-regression gate, commit   │
  gated)         │ proposer.js   catalog proposer, predictions, track record pipeline, LLM prompt builder     │
                 │ gym.js        8 train + 4 held-out tasks, frozen fixtures, checkers (tasks.js), fitness     │
 MORNING         │ asks.js       asks, decisions, risk tolerance      cycle.js  simulated days + metrics       │
 DATA            │ db/memory.js  driver-shaped store   db/schema.js  collections + indexes   db/mongo.js Atlas│
                 │ embed.js      local embedding / Voyage   search.js  hybrid search (RRF, $rankFusion)        │
                 └──────────────────────────────────────────────────────────────────────────────────────────────┘
 server/rem.js  /api/rem/* routes + SSE over change streams      scripts/rem-demo.mjs  terminal narrative
```

## Day: durable execution

- A **task** starts a **checkpoint** (`checkpoints`, unique `runId`): plan, cursor, transcript (working set),
  harness version, usage. The planner role writes the plan; the executor role makes one tool call per step.
- The **harness** builds the prompt from the **genome**: rule text, guardrail descriptions, tools allowed by
  **tool scopes**, and the **context policy** (top-k **memories** and matching **skills** via hybrid search,
  step budget). **Model routing** picks the tier per role, including "small only when a practiced skill applies".
- **Guardrails** are declarative predicates checked before every call (`recipients`, `prior-list` with a
  maximum count). A blocked call returns an error to the model; it never reaches the world.
- Every **effect** (`gmail.send`, `gmail.draft`, `drive.delete`) gets an **effect key** =
  `sha256(runId + ":" + step + ":" + sha256(canonical JSON of {tool, args}))`, inserted as `pending` under a
  unique index **before** it runs. On a duplicate key: `committed` → return the recorded result;
  `pending` → reconcile against the world (the key travels as the `X-Effect-Key` header or trash marker)
  and commit without re-executing. The ledger commit and the checkpoint update share one transaction.
- On a 401 the run parks as **paused-for-auth** and upserts one **ask** per run and provider
  ("Reconnect Google Drive", unique `dedupeKey`). A change stream on `connections` resumes it when the token
  is valid again. A resume first reconciles pending effects, then, if the **harness version** changed,
  re-plans the remaining steps under the new genome while committed effects stay committed
  (**resume-under-new-version**).
- Each step logs **episodes** (tool call, observations per fact read, errors, corrections, the human
  **demonstration**), embedded for search.
- Tested under seeded chaos: crashes before the effect, after the effect before the commit, and between the
  ledger commit and the checkpoint (inside the transaction), plus random auth expiries. 40 seeds × 4 tasks:
  every effect executes exactly once and every task finishes (`tests/rem-durable.test.js`).

## Night: consolidation

1. **Replay** re-reads unconsolidated episodes in order and computes per-task metrics.
2. **Merge** extracts facts (deterministic extractor tonight; the consolidator role tomorrow), clusters them
   by cosine on the fact identity, folds each cluster into one **memory** with provenance episode ids,
   confidence and recency, resolves contradictions by recency and confidence while keeping contradiction
   links, retires resolved blockers, maintains an "open blockers as of" digest, deletes noise (low-importance
   episodes referenced by no memory) and sets `expireAt` on consolidated episodes so the TTL index forgets
   them (**forgetting**).
3. **Distill** mines repeated tool-call sequences across runs and demonstrations (longest common
   subsequence), parameterizes them (`{{week}}`, `{{prevWeek}}`, `{{team}}`), attaches learned preferences
   as constraints, and practices the **skill** in a sandbox copy of the workspace. Passing → `practiced`.
4. **Evolve** runs the gym on the current genome, mines train-set trajectories into named failure patterns
   (tags from the checkers; evidence by vector search), searches past edits ("have we tried this?"), and asks
   the **proposer** for up to 3 bounded **edits**, each with a **prediction** `{flips, passDelta, stepsDelta,
   costDelta}`. **Validation** applies edits one at a time on train + held-out; the **no-regression gate**
   rejects anything that breaks a previously passing task and accepts only net-positive fitness. Accepted
   edits become a new immutable harness version (parent, diff, fitness, edit ids = **lineage**). Outcome vs
   prediction feeds the **track record** (an aggregation over `edits` by edit type) that calibrates the next
   night's predictions.
5. **Asks** are queued for new authority: a skill that sends, drafts or deletes, and any proposed edit
   that grants a tool scope or loosens or removes a guardrail (those never pass through the gate alone;
   approving one commits it as a new harness version). Decisions are stored: after one read-only approval,
   read-only skills are auto-approved; sends always ask (**risk tolerance**).
6. The **morning brief** records merge counts, skills, patterns, edits with predictions and outcomes, the
   diff, gym deltas and asks (`briefs`).

## Gym

Frozen fixtures (deep-frozen), a scratch database and a scratch world per run; the proposer only receives
`proposerView()`: train trajectories, no held-out ids, instructions or content.

| Task | Split | Kind | Trap that makes an edit discoverable |
| --- | --- | --- | --- |
| T1 | train | weekly brief W33 | customer name in the notes; redundant reads of last week |
| T2 | train | promised follow-ups | none (no-regression anchor) |
| T3 | train | standup | customer name |
| T4 | train | unresolved blockers | blocker with no owner (bare agent guesses) |
| T5 | train | release handoff | external address on the release thread |
| T6 | train | product review prep | none (anchor) |
| T7 | train | clean up old drafts | loose bulk delete removes real docs |
| T8 | train | project recap | Drive token expires mid-run; redundant reads |
| H1 | held-out | weekly brief, unseen week | new customer name |
| H2 | held-out | product review brief (three sources) | external guest; complex, the small tier fails it |
| H3 | held-out | unresolved blockers, unseen week | two unowned blockers |
| H4 | held-out | weekly brief with expiries | Drive and Gmail tokens expire mid-run |

Fitness is lexicographic: no collateral damage > success rate > human interventions > cost > steps, always
reported with the individual metrics. (Interventions sit above cost so "verify account access before
planning", which adds a cheap check to every task but removes every reconnect, can be accepted.)

## MongoDB mapping

| Collection | Holds | MongoDB feature |
| --- | --- | --- |
| `episodes` | raw events: tool calls, observations, errors, corrections, demonstrations, train trajectories | TTL index on `expireAt`; Atlas Vector Search `autoEmbed` on `summary` (voyage-4); Atlas Search on `summary` |
| `memories` | consolidated facts with confidence, recency, provenance, contradiction links, active/retired | vector (`autoEmbed` on `text`) + text index → `$rankFusion` hybrid search |
| `skills` | procedure, parameters, constraints, test + result, required scopes, status | unique `name`; vector + text on `description` |
| `harnesses` | immutable genome versions with parent, diff, fitness, edit ids | unique `version`; lineage queries |
| `edits` | type, prediction, outcome, error, signature | hybrid search "have we tried this?"; aggregation pipeline = track record |
| `checkpoints` | per-run state | unique `runId`; transaction with `effects` |
| `effects` | effects ledger | unique `effectKey` = idempotency (code 11000 on retry) |
| `connections` | token state, granted scopes | unique `provider`; change stream → resume |
| `asks` | permission requests and decisions | unique `dedupeKey` (asks once); aggregation → risk profile |
| `metrics` | per-day metrics | time-series collection (`timeField: ts`, `metaField: meta`) |
| `briefs` | morning briefs | — |

`rem/db/schema.js` holds the index specs and the Atlas Search / Vector Search definitions;
`ensureIndexes(db)` creates collections (metrics as time series), indexes and search indexes.
Change streams also feed `GET /api/rem/stream` (Server-Sent Events).

## Scripted tonight vs real

| Piece | Tonight | Tomorrow |
| --- | --- | --- |
| Database | `createMemoryDb()`: driver-shaped collections, filters, updates, unique indexes, TTL sweep, change streams, session transactions (undo log; reads can see uncommitted writes) | `createMongoDb({ uri })` on the Atlas Sandbox |
| Model | `ScriptedModel`: follows the rules, guardrail descriptions, memories and skills in its prompt text; the small tier fails three-source tasks without a skill; tokens = chars/4 | `createOpenRouterModel()` (tool calling, usage from OpenRouter) |
| Embeddings | 256-dim token + bigram feature hashing, cosine | Atlas `autoEmbed` (voyage-4), or `createVoyageEmbedder()` |
| Hybrid search | app-side BM25-lite + cosine fused by RRF (k = 60) | `$rankFusion` over the vector + Atlas Search indexes |
| Consolidator | deterministic fact extractor (`facts.js`) | same shape from `routing.consolidator` |
| Proposer | catalog proposer with mechanism estimates + track-record calibration | `createLlmProposer()` with `buildProposerPrompt()` (falls back to the catalog) |
| Accounts | fixture Google workspace (`fixtures.js`), deterministic revoke | same tools; real OAuth only for the interrupt beat |
| Prices | placeholders in `rem/models.js` | verify against OpenRouter `/api/v1/models` |

## Switching tomorrow

1. `npm install mongodb` (the only new dependency) and set `MONGODB_URI` to the Atlas Sandbox string
   (optionally `REM_DB_NAME`, default `rem`). `server/rem.js` then builds REM on `createMongoDb()`; for
   scripts use `createRem({ db: await createMongoDb({ uri }) })`. `POST /api/rem/reset` drops the database.
2. Run once: `ensureIndexes(db)` (the facade does it) creates the collections, the time-series `metrics`,
   all indexes and the search indexes. Wait for `listSearchIndexes()` to report READY. Check the cluster
   version: `$rankFusion` needs 8.1+.
3. Hybrid search: set `REM_ATLAS_SEARCH=1` to route `searchCollection()` through `rankFusionPipeline()`.
   Verify the `$vectorSearch` query shape for `autoEmbed` (the pipeline passes `query: { text }`) against the
   preview docs. If the preview misbehaves, leave it off: app-side RRF keeps working over stored vectors,
   and `REM_EMBEDDINGS=voyage` + `VOYAGE_API_KEY` swaps in real Voyage embeddings.
4. Models: `REM_MODEL=openrouter` + `OPENROUTER_API_KEY`. Verify tier ids and $/1M prices in
   `rem/models.js`. Tool names are sent as `drive__list` and mapped back. Expect about 50 gym runs per night
   (12 tasks × baseline + up to 3 candidates); keep the ScriptedModel for tests and rehearsals.
5. Proposer: `createRem({ proposer: createLlmProposer({ model, modelId: modelFor("large") }) })`.
6. Nothing else changes: transactions use client sessions, TTL deletion moves to Atlas's monitor
   (`sweepExpired` is a no-op there), and change streams drive both resume-on-reconnect and SSE.
7. The fixture world lives in process memory; after a server restart on Atlas, reset so the ledger and the
   world agree (or persist the fixture world as collections).

## API (`server/rem.js`)

One shared demo instance for every visitor (unlike Offload's per-visitor `/api/state`). Mutations run one at
a time. Bodies are validated with zod.

| Route | Does |
| --- | --- |
| `GET /api/rem/state` | harness + lineage, edits, metrics, open asks, memory stats, skills, runs, effects ledger, latest brief, connections, track record |
| `POST /api/rem/run {taskId, week?}` | run a task (REM kinds or Offload suggestion ids such as `weekly-update`) |
| `POST /api/rem/connection {provider, state}` | `expired` or `valid`; valid resumes paused runs via the change stream |
| `POST /api/rem/sleep` | one night; returns the morning brief |
| `POST /api/rem/asks/:id {decision, answer?}` | approve or deny an ask |
| `POST /api/rem/simulate {days}` | simulated days with metrics |
| `POST /api/rem/reset` | fresh instance |
| `GET /api/rem/stream` | Server-Sent Events from `db.watch()` |

## Known limits

- The memory database implements the subset REM uses (see `rem/db/query.js`); `$vectorSearch`,
  `$search` and `$rankFusion` throw there by design.
- The ScriptedModel's competence is scripted per task kind; real model behavior will differ, which is
  what the gym and the no-regression gate are for.
- A simulated day compresses one week of notes; TTL retention is two simulated days.

## One Sleep (Sep 26): what was folded into REM, and what runs on Atlas

REM is the single Sleep engine. Sleep v2's recall and lessons ideas and the Sleep Lab's recall scenario
and adversarial attacks now live here; `server/sleep/` has since been removed from the repo.

- **Atlas, verified on the event sandbox (8.0.32).** Search runs in Atlas by default (`REM_ATLAS_SEARCH=0`
  turns it off): `$rankFusion` over the autoEmbed vector index and the Atlas Search index for hybrid recall,
  `$vectorSearch` or `$search` alone for vector or lexical recall. All 8 autoEmbed indexes reached READY
  (text 60 to 92 s, vector 72 to 116 s on empty collections); new documents are searchable about 4 s after
  insert, so Evolve and the night wait for autoEmbed to catch up (`settleSearch`). `REM_VECTOR_MODE=explicit`
  builds `<collection>_vec` indexes over stored embeddings for clusters without autoEmbed.
- **Recall policy in the genome.** `contextPolicy.recall` = mode, k, minScore, kinds, recency half-life,
  budget, with hard bounds (`normalizeRecall`; out-of-bounds edits throw). Gen 0 favors recent memory
  (7-day half-life). `memory.search` and memory injection both obey it.
- **Lessons block.** Each run's prompt carries the recalled memories (capped at `budgetChars`, lowest
  ranked dropped first) and a `Lesson sources:` section: the episodes behind each memory and the edit and
  night behind each rule. The checkpoint records `injected` (memory ids, dropped ids, searched ids, rule
  ids, recall policy, block size).
- **Recall trap (ported from the Sleep Lab's SEC-7 case).** `release-readiness` tasks T9 (train) and H5
  (held-out): an old blocker is still open but only memory holds it. Gen 0's decay drops it under the floor;
  weakness mining tags `stale-recall`; the catalog offers `recallNoDecay`, `recallHalfLife30` and
  `recallLowFloor`. Measured: the first two pass both tasks; the floor edit passes T9 and fails H5, so the
  held-out split rejects it. Over five simulated days Evolve accepts `recallNoDecay` on night 3.
- **Adversarial challenge.** After validation accepts an edit, every task it flipped is re-run under six
  truth-preserving attacks (reorder, distract, duplicate, unknown-state, memory-noise, contradiction,
  `rem/attacks.js`); any failure rejects the edit. The recall edit held 12/12.
- **Probabilistic termination.** Before a day run finishes, P(goal satisfied | evidence) comes from Jev
  (`typesafe/jev-1.13` through OpenRouter's decisions endpoint, `REM_COMPLETION=jev`) or a labeled stub.
  Evidence = task, plan, last steps, final answer and the end-state checks. Below the genome's
  `completionThreshold` (0.5; Evolve may tune 0.5 to 0.95) the run gets one more turn, then finishes with the
  record. Measured Jev on release evidence: 0.60 passing, 0.05 failing, 0.41 without checks; one live
  blockers run with passing checks scored 0.42 (a false negative to watch).
- **Morning brief.** `verified` (cost and tokens per verified success: gym before and after, and the day's
  gate-cleared runs) and `timeline` (each night phase with wall time).
- **Workers share Atlas safely.** Runs carry a `driver` and a 30 s `leaseUntil`; a paused run can be resumed
  by any worker, a running one only by its driver or after the lease lapses. Without it, two server processes
  on the same database both resumed one run after a reconnect event (duplicate steps; the ledger still kept
  the send exactly once).
- **Demo on Atlas.** `node --env-file=.env scripts/rem-demo.mjs --atlas` runs the five-day story in database
  `REM_DEMO_DB` (default `rem_demo`, never the server's `rem`) and writes `docs/DEMO-NUMBERS-ATLAS.md`.
