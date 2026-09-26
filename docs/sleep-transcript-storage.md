# Sleep canonical transcript storage

The checkpoint now carries a bounded working transcript instead of the full run history. Every complete tool exchange is stored separately before it can be omitted from the working context. This removes transcript growth from the single MongoDB checkpoint document.

## Measured evidence, September 26, 2026

`tests/rem-transcript.test.js` drives 300 evolving tool exchanges, interrupts after step 120, creates a new agent instance against the same database, and retrieves the first source at step 181. The run finishes with all 300 contiguous canonical steps, the exact old source recovered, and no repeated model step after restart.

This is a deterministic execution and retention fixture using the in-memory MongoDB-shaped adapter. No live model or Jev provider was called. The full-history baseline is reconstructed from the same canonical records and message serialization; it is not a second live execution. Byte reductions below must not be presented as measured token or cost savings.

| Measurement | Full-history baseline | Bounded working context |
| --- | ---: | ---: |
| Checkpoint bytes at 300 steps versus maximum observed working checkpoint | 1,245,224 | 18,852 |
| Cumulative serialized tool-message bytes replayed to task model | 191,814,470 | 2,832,660 |
| Maximum complete serialized task-model prompt | Not measured | 13,992 |
| Canonical tool-exchange bytes retained | 1,242,822 | 1,242,822 |
| Historical raw-part queries during execution and worker restart | Full transcript replay | 0 |

The working checkpoint is 98.49% smaller than the reconstructed final full-history checkpoint. Task-model tool-message replay falls 98.52% in this fixture. The baseline replay includes each prefix at the next executor call, plus the initial empty history. The selected path includes the planner, all executor calls, the archive notice, and the recovered-source exchange in its complete prompt measurement. The cumulative tool-message measure excludes system and user text on both paths.

All selector overhead is recorded separately: 179 deterministic selector requests, 7,160 fixture-reported input tokens and 716 output tokens. These fixture counts are not tokenizer measurements. One bounded `context.read` recovered the old source. No `rem_transcript_parts.find` history query occurred during the ordinary execution or fresh-worker restart; recovery uses one indexed `findOne`. The final trace audit subsequently read all canonical pages, outside task execution.

| Committed step | Canonical bytes | Checkpoint bytes |
| --- | ---: | ---: |
| 1 | 4,137 | 6,067 |
| 120 | 496,836 | 14,417 |
| 300 | 1,242,822 | 18,852 |

Raw evidence: [rem-transcript-300steps.json](evidence/rem-transcript-300steps.json). Reproduce with `node --test tests/rem-transcript.test.js`. The test prints the measurements and asserts the checkpoint, prompt, source recovery, step sequence, and restart bounds.

Six targeted tests also verify changed-goal reconsideration, full-history deletion guards after omission, oversized Unicode chunk recovery and run isolation, atomic rollback followed by exactly-once effect reconciliation, and restart-safe legacy migration with corruption detection. The full suite on this branch passed 131 tests with one live Atlas smoke test skipped. The build was attempted but the base revision contains an unrelated unescaped `>` in `src/pages/Connections.jsx:27`; the integration owner is correcting it.

## Storage and integrity

- `rem_transcript_events`: one small metadata document per `(runId, step)`, with content digest, part count, byte count, tool, and effect key.
- `rem_transcript_parts`: canonical JSON split into at most 16,000 JavaScript characters per document. Even multibyte Unicode stays far below MongoDB's document limit. Unique indexes cover run, step, and part.
- `rem_transcript_guards`: indexed proofs for successful prior-list calls. File identifiers and filters are hashed, with only the latest matching count and its step retained. Authorization checks use these proofs, so omitting a model-visible list does not remove the evidence behind a guardrail.
- `checkpoints.transcript`: selected working exchanges, limited to 65,536 serialized UTF-8 bytes. `transcriptThrough` is the last included canonical cursor; `transcriptState` tracks version, total steps, and canonical byte count. An oversized new exchange is persisted canonically and left pending outside the checkpoint until selection can handle it. Protected or uncertain evidence that cannot fit pauses for review.

Effect commit, canonical parts, guard proofs, and checkpoint cursor advancement share one database transaction. A stale checkpoint cursor or worker identity fails the commit. A crash after an external effect still uses the existing effect key to reconcile it, and adds the canonical exchange in the same recovery transaction. The fault test deliberately crashes after transcript writes but before cursor advancement, verifies all transcript writes rolled back, then verifies exactly one external send after recovery.

Legacy checkpoints migrate on first drive or resume. Each existing exchange is copied idempotently, and the original checkpoint stays intact until every exchange has been copied. New collections and indexes are created by the standalone `ensureTranscriptIndexes` helper before driving a run. No destructive migration, TTL, or background archive deletion is added.

## Working context and compatibility

Ordinary turns select from the working set plus the new exchange. The selector revision includes the committed history cursor, so new evidence invalidates old probability decisions. A changed goal, plan, harness version, or completion feedback causes canonical history to be reconsidered in bounded pages before the next model call. This can be expensive on a long run and may pause if the revived evidence cannot fit. New evidence alone does not automatically rediscover every omitted dependency; the model can explicitly use `context.list` and `context.read`.

Runtime context retrieval now reads the canonical transcript rather than relying on whether a record happened to pass through the compactor archive. `context.list` returns 20 records per page. `context.read` returns one bounded original JSON part, including its digest and total part count, scoped to the current run. Existing compactor benchmark `read` and `list` methods retain their own archive format.

Small completed runs, at most 262,144 canonical bytes, still return the complete `run.transcript` for existing gym and API consumers. Longer runs return only the working transcript with `transcriptComplete: false`. Use `agent.readTranscript(runId, {afterStep, limit})` to page through full records when an audit needs them. Limits are 16 entries by default and 100 maximum. The returned page is record-bounded, while individual very large records can still be large; model-facing retrieval uses the part API instead. Recent harness versions and searched-memory ids are capped at 32 and 128 respectively, with explicit truncation metadata.

The 65,536-byte bound applies to the transcript field, not to arbitrary caller-supplied task instructions, generated plans, recalled skill definitions, or every possible checkpoint field. Database-wide storage grows with retained source history. This work has not validated billion-token sessions, weeks of operation, live Atlas transaction latency, or general model task quality. Those claims require separate measurements.
