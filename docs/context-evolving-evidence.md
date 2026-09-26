# Sleep: evolving context evidence

The current selector preserves correctness when new evidence changes relevance. It does **not** save total tokens on every workload. Measurements below include decision overhead, answer-model calls, tool schemas, archive requests, and retrieved results. Character reductions are not token reductions.

## Implementation change

Before this change, decision reuse depended on the goal, caller revision, model, and candidate digest. Newly observed evidence could make an omitted record relevant while all those fields stayed unchanged. The selector now fingerprints the ordered, unique supplied evidence, including protection metadata. New content, reordering, changed goals, changed caller revisions, and changed scoring-policy versions invalidate reuse. Exact idempotent rereads remain reusable when the trusted adapter supplies the same `dedupeKey`.

Each scoring batch receives up to 4,000 characters of recent observations, protected records, and short older facts from the current selection input. The window is labeled partial when incomplete. This lets an older candidate be evaluated against a late reference in a different batch. It is a bounded heuristic, not complete semantic dependency discovery.

Unfinished serialized tool exchanges stay protected. Invalid, conflicting, unavailable, and unscored probabilities retain records. There are at most 16 decision calls per selection, eight candidates and 10,000 candidate characters per request, and a 64 KiB wire limit. Excess protected or uncertain context produces `ContextBudgetError`. Source records are archived before omission.

Archive and cache metadata lookups now target only the supplied record IDs, in query batches of at most 128. They no longer scan all metadata for the run. `select`, `read`, and `list` retain their existing adapter contract. Selection returns the original unit objects, including caller metadata, in chronological order.

The second revision removes duplicate candidate records from the shared evidence window and shortens repeated per-question wording. The scorer exposes `policyVersion: retention-v3` so this prompt change also invalidates previously cached scores.

## Live results, September 26, 2026

| Workload | Full-context exact checks | Compacted exact checks | Full-context tokens | Compacted tokens including Jev | Difference |
| --- | ---: | ---: | ---: | ---: | ---: |
| Historical repeated snapshots, prior implementation | 20/20 | 20/20 | 26,640 | 14,878 | 44.15% fewer |
| Current repeated snapshots, `080eb7b` | 20/20 | 20/20 | 26,640 | 15,543 | 41.66% fewer |
| Evolving tasks, initial causal policy `2ffc0ca` | 11/12 | 11/12 | 43,623 | 69,384 | 59.05% more |
| Evolving tasks, shorter scoring prompt `080eb7b` | 11/12 | 11/12 | 43,606 | 56,664 | 29.95% more |

The evolving suite has three tasks with four chronological stages each: changing routing dependencies, an old release commitment with a corrected owner and reopened security issue, and a goal change followed by archive recovery. Future stages are never supplied early. Expected answers remain in the evaluator and are not sent to either model. Both paths use `openai/gpt-4o-mini` through OpenRouter, the same archive tools, and an independent exact JSON check. Provider call order alternates by stage.

The initial routing stage fails on both paths: each returns `eu-central-1` even though the explicit current assignment is `us-west-2`. This is retained as an answer-model failure. The suite exits with a nonzero status because of that failure. There are zero observed compaction-only answer regressions in either run. That is a result on 12 synthetic stages, not evidence of a general zero-regression guarantee.

An older K88 routing record is omitted at the J17 stage and retained again after the K88 correction. The explicit recovery stage supplies only the previous selected working set plus its new source pointer. The answer model reads `archive-bundle` from MongoDB and returns the exact artifact and hash. This recovery check passes 1/1 in both runs. Other stages supply accumulated canonical records to selection. They do not demonstrate bounded history scanning or arbitrary semantic retrieval in a production session.

Current evolving totals consist of 14,799 answer-model tokens and 41,865 Jev tokens. Answer-model traffic alone is 66.06% lower than full context, but total traffic is 29.95% higher. Reporting only the answer-model reduction would hide most of the compaction cost. The answer model makes 21 calls on the full path and 25 on the compacted path, including retrieval continuations. These extra calls are counted.

The shorter scoring prompt reduces Jev traffic from 52,238 to 41,865 tokens, an observed 19.86% reduction on the same stages. All exact-check outcomes remain unchanged. Total compacted-path traffic drops 18.33% between the two runs. This is a small before/after measurement, not a controlled statistical latency or quality study.

Evolving tests use direct TypeSafe `jev-1.13.0` and an isolated `sleep_context_evolving_eval` Atlas database. Direct TypeSafe supplies token counts but no cost for these responses, so combined monetary savings are unknown. Repeated-snapshot tests use OpenRouter `typesafe/jev-1.13` and the existing isolated `sleep_context_eval` database. Provider differences mean the workloads' Jev costs should not be treated as a controlled provider comparison. Each run creates unique record IDs and performs no reset or destructive cleanup.

The current repeated workload has four task snapshots, five live answers per snapshot and path. It uses the original simple exact-answer prompt without archive tools, so it is not a controlled comparison with the evolving tool-using workload. Its 15,543 compacted tokens comprise 13,623 initial decision tokens plus 1,920 answer tokens. All restarted and repeated selections make zero additional decision calls. On the first answer alone, compaction still costs more. The benefit depends on reusing stable evidence across subsequent calls.

## Reproduction and evidence

Supply credentials through an existing private environment. Do not copy credentials into evidence files.

```sh
node --test tests/context-compaction.test.js tests/context-runtime.test.js tests/evolving-context.test.js
node scripts/benchmark-context-evolving.mjs --output docs/evidence/jev-context-evolving-fixture.json
node scripts/benchmark-context-evolving.mjs --live --atlas --output docs/evidence/jev-context-evolving-live.json
node scripts/benchmark-context.mjs --live --atlas --answer-model openai/gpt-4o-mini --repeats 5 --output docs/evidence/jev-context-repeated-causal-v3.json
```

The first command passes all 18 focused tests. Tests cover causal invalidation, durable exact-reread reuse, prompt-version invalidation, bounded queries and scoring, current-evidence propagation, archive recovery, protected overflow, malformed accounting, and unfinished tool exchanges. Before the scoring-prompt revision, the full suite produced 132 passes, one skipped Atlas test, and one unrelated failure at `tests/rem-api.test.js:39` where an ask endpoint returns 404 instead of 200. Integrating work is validating newer reliability fixes separately.

Raw evidence:

- [Initial evolving run, including adverse token result](evidence/jev-context-evolving-causal-v2-initial.json)
- [Current evolving run and implementation hashes](evidence/jev-context-evolving-live.json)
- [Current repeated-snapshot run](evidence/jev-context-repeated-causal-v3.json)
- [Fixture-only mechanics run](evidence/jev-context-evolving-fixture.json)
- [Historical repeated-snapshot run](evidence/jev-context-repeated.json)

## Integration limits

The cache fingerprint covers evidence passed to `select`. An adapter that supplies only a bounded working set must recover omitted source records when needed, and should include a durable history version in `revision`. The fingerprint alone cannot discover a dependency in a record no longer supplied to the selector. `context.read` supports exact original recovery, but an agent is not guaranteed to choose the right archive record.

The shared evidence window can miss long, indirect, or implicit dependencies. Regex protection supplements explicit pins and cannot identify every constraint. Character limits are not model-token limits. Billing after an interrupted request may be unavailable and must remain labeled unknown. This suite does not test billions of tokens, sustained overnight work, broad model calibration, or a general claim that Sleep always consumes fewer tokens.

The practical next optimization is an admission policy that predicts whether selective scoring will amortize across enough calls, while preserving the same evidence, budget, and completion safeguards. No such predicted benefit is included in the measurements above.
