# Sleep: evolving context evidence

The current selector preserves correctness when new evidence changes relevance. It does **not** save total tokens on every workload. Measurements below include decision overhead, answer-model calls, tool schemas, archive requests, and retrieved results. Character reductions are not token reductions.

## Latest combined measurement

The final v9 scorer plus production evidence interpretation policy uses **32,264 total tokens versus 39,196** full
context, **17.69% fewer**, on this development suite. All 12 compacted exact checks pass. Full context passes 11/12; its
failed release answer has the correct owner/readiness plus an extra `reason` field. There are zero observed
compaction-only regressions and one successful source recovery. Expected values and the exact JSON checker were
not changed. The inputs were repeatedly used during optimization, so these are development results.

The intermediate combined v5 policy passed 12/12 on both paths but used 36,238 versus 34,910 tokens, 3.80% more. V9 keeps
explicit retention questions, factors exact repeated strings without changing original content, and shares encoding
metadata once. Its 20,253 scoring tokens and 12,011 answer tokens are both counted. Different model tool choices change
baseline totals between runs despite temperature zero. No statistical or universal improvement is established.

Rejected v6 overflowed 11 of 12 selections in the combined run, using 18,361 scoring tokens and producing only one paired
answer. The complete total is unknown and no saving is claimed. The shorter v7/v8 questions also failed bounded
probes. All paid receipts are preserved. V9 first passed a bounded retention probe before its full run.

Final repeated snapshots: 26,640 versus 9,052 tokens, 66.02% fewer, 20/20 exact answers per path. This is a separate simpler
workload. The current source and artifact identifiers are recorded in the raw reports.

- [Combined v9](evidence/jev-context-evolving-combined-v9.json)
- [Combined v5 overhead](evidence/jev-context-evolving-combined-v5.json)
- [Rejected combined v6](evidence/jev-context-evolving-combined-v6.json)
- [Final repeated v9](evidence/jev-context-repeated-schema-v9.json)
- [Rejected v6 repeated run](evidence/jev-context-repeated-indexed-v6.json)
- [V7 probe](evidence/jev-context-v7-prompt-probe.json), [v8 probe](evidence/jev-context-v8-prompt-probe.json), [v9 probe](evidence/jev-context-v9-prompt-probe.json)

The sections below retain the earlier causal-policy measurements and their original conditions. They are historical,
not the current headline. Personal-history reconstructed trials use independently frozen cases and are reported separately.

## Implementation change

Before this change, decision reuse depended on the goal, caller revision, model, and candidate digest. Newly observed evidence could make an omitted record relevant while all those fields stayed unchanged. The selector now fingerprints the ordered, unique supplied evidence, including protection metadata. New content, reordering, changed goals, changed caller revisions, and changed scoring-policy versions invalidate reuse. Exact idempotent rereads remain reusable when the trusted adapter supplies the same `dedupeKey`.

Each scoring batch receives up to 4,000 characters of recent observations, protected records, and short older facts from the current selection input. The window is labeled partial when incomplete. This lets an older candidate be evaluated against a late reference in a different batch. It is a bounded heuristic, not complete semantic dependency discovery.

Unfinished serialized tool exchanges stay protected. Invalid, conflicting, unavailable, and unscored probabilities retain records. There are at most 16 decision calls per selection, 16 candidates for Jev and 10,000 candidate characters per request, and a 64 KiB wire limit. Excess protected or uncertain context produces `ContextBudgetError`. Source records are archived before omission.

Archive and cache metadata lookups now target only the supplied record IDs, in query batches of at most 128. They no longer scan all metadata for the run. `select`, `read`, and `list` retain their existing adapter contract. Selection returns the original unit objects, including caller metadata, in chronological order.

The second revision removes duplicate candidate records from the shared evidence window and shortens repeated per-question wording. The scorer exposes `policyVersion: retention-v3` so this prompt change also invalidates previously cached scores.

## Live results, September 26, 2026

| Workload | Full-context exact checks | Compacted exact checks | Full-context tokens | Compacted tokens including Jev | Difference |
| --- | ---: | ---: | ---: | ---: | ---: |
| Historical repeated snapshots, prior implementation | 20/20 | 20/20 | 26,640 | 14,878 | 44.15% fewer |
| Historical repeated snapshots, `080eb7b` | 20/20 | 20/20 | 26,640 | 15,543 | 41.66% fewer |
| Evolving tasks, initial causal policy `2ffc0ca` | 11/12 | 11/12 | 43,623 | 69,384 | 59.05% more |
| Evolving tasks, shorter scoring prompt `080eb7b` | 11/12 | 11/12 | 43,606 | 56,664 | 29.95% more |
| Evolving tasks, exact repeat encoding v4 `fcc1f65` | 11/12 | 11/12 | 43,627 | 46,610 | 6.84% more |
| Evolving tasks, shared blocks and rubric v5 `7de228c` | 11/12 | 11/12 | 46,703 | 41,429 | 11.29% fewer |
| Repeated snapshots, shared blocks and rubric v5 `7de228c` | 20/20 | 20/20 | 26,640 | 10,594 | 60.23% fewer |
| Repeated snapshots, shared encoding schema v9 `3ae08e0` | 20/20 | 20/20 | 26,640 | 9,052 | 66.02% fewer |

The evolving suite has three tasks with four chronological stages each: changing routing dependencies, an old release commitment with a corrected owner and reopened security issue, and a goal change followed by archive recovery. Future stages are never supplied early. Expected answers remain in the evaluator and are not sent to either model. Both paths use `openai/gpt-4o-mini` through OpenRouter, the same archive tools, and an independent exact JSON check. Provider call order alternates by stage.

The initial routing stage fails on both paths: each returns `eu-central-1` even though the explicit current assignment is `us-west-2`. This is retained as an answer-model failure. The suite exits with a nonzero status because of that failure. There are zero observed compaction-only answer regressions in either run. That is a result on 12 synthetic stages, not evidence of a general zero-regression guarantee.

An older K88 routing record is omitted at the J17 stage and retained again after the K88 correction. The explicit recovery stage supplies only the previous selected working set plus its new source pointer. The answer model reads `archive-bundle` from MongoDB and returns the exact artifact and hash. This recovery check passes 1/1 in both runs. Other stages supply accumulated canonical records to selection. They do not demonstrate bounded history scanning or arbitrary semantic retrieval in a production session.

The v3 evolving totals consist of 14,799 answer-model tokens and 41,865 Jev tokens. Answer-model traffic alone is 66.06% lower than full context, but total traffic is 29.95% higher. Reporting only the answer-model reduction would hide most of the compaction cost. The answer model makes 21 calls on the full path and 25 on the compacted path, including retrieval continuations. These extra calls are counted.

The shorter scoring prompt reduces Jev traffic from 52,238 to 41,865 tokens, an observed 19.86% reduction on the same stages. All exact-check outcomes remain unchanged. Total compacted-path traffic drops 18.33% between the two runs. This is a small before/after measurement, not a controlled statistical latency or quality study.

Evolving tests use direct TypeSafe `jev-1.13.0` and an isolated `sleep_context_evolving_eval` Atlas database. Direct TypeSafe supplies token counts but no cost for these responses, so combined monetary savings are unknown. Repeated-snapshot tests use OpenRouter `typesafe/jev-1.13` and the existing isolated `sleep_context_eval` database. Provider differences mean the workloads' Jev costs should not be treated as a controlled provider comparison. Each run creates unique record IDs and performs no reset or destructive cleanup.

The repeated workload has four task snapshots, five live answers per snapshot and path. It uses the original simple exact-answer prompt without archive tools, so it is not a controlled comparison with the evolving tool-using workload. The v3 run's 15,543 compacted tokens comprise 13,623 initial decision tokens plus 1,920 answer tokens. All restarted and repeated selections make zero additional decision calls. On the first answer alone, compaction still costs more. The benefit depends on reusing stable evidence across subsequent calls.

## Exact source factoring and shared rubric

V4 encodes exact adjacent repeated text for decision requests and batches up to 16 candidates within the unchanged character and wire limits. V5 interns identical repeated blocks across records and moves the retention rubric from every question into shared request state. Individual records keep their own decisions and identities. Ordered segments preserve exact whitespace, unique corrections and multiplicity. The decoder reconstructs every source character. Original records in retained context and MongoDB stay unchanged. Sparse records remain raw, and complete batch serialization is compared with raw and independently encoded alternatives so encoding cannot increase its representation size.

V5 changes no retention threshold, protected-record rule, current-evidence window, or causal cache invalidation rule. It uses no fixture-specific vocabulary. These synthetic workloads nevertheless contain substantial exact repetition, so their compression benefit should not be generalized to arbitrary real sessions.

On the unchanged evolving benchmark, v5 uses 21,661 Jev tokens (18,627 input plus 3,034 output) and 19,768 main-model tokens (19,029 input plus 739 output). Jev traffic is 26.85% lower than v4's 29,612 tokens. Main-model tool choices varied despite the same model, temperature, inputs and schemas: v5 makes 22 full-path and 27 compacted-path calls, compared with 21 and 26 in v4. The 11.29% saving is the measured paired result for this run, not a claim that all cross-run differences were caused by the encoder. Both paths retain the original initial-region failure. Exact archive recovery passes 1/1, with no restart decision calls or selection errors.

Measured v5 full-path answer latency sums to 23,786 ms. Compacted answer latency plus initial selection latency sums to 46,251 ms. This run saves tokens but does not improve latency. These sums exclude the separate restart verification calls and are descriptive single-run timings; the repeated benchmark ran concurrently.

The refreshed repeated run uses 7,129 Jev tokens plus 3,465 main-model tokens. Every one of 20 exact answers per path passes. Initial, restarted and repeated selection usage is included. Provider-reported combined compacted cost is $0.000890382 versus $0.0025725 for the baseline in this run. Evolving combined monetary cost remains unknown because direct TypeSafe did not report a price. The repeated refresh uses accounting commit `5b2b003`, which preserves completed per-call receipts, includes all scored selections, and returns unknown totals for incomplete accounting.

The original unmeasured test expectation of more than 50% character reduction on a shared-block sample was incorrect. The measured reduction is 47.73% (6,995 to 3,656 characters). The test now checks the actual contract: shared encoding beats independently encoded records, never expands the full batch representation, and reconstructs every record exactly. The focused context, runtime, native adapter and encoding suite passes 29/29 tests, including 200 generated lossless examples; the added receipt-accounting tests pass 3/3.

V6 attempted shorter questions and direct array values. All four repeated-snapshot selections exceeded the context budget because the scores retained too many records. The 6,060 measured decision tokens remain in the rejected-run evidence, with no answer results or savings claim. Two bounded follow-up probes also failed: explicit array references used 1,613 tokens and an imperative record question used 1,631. These results show that smaller wire representations alone do not establish a useful scoring policy. The retention threshold was never changed to force these formats to pass.

V9 restores the exact v5 question and retention rubric, preserves explicit per-record identities, and declares the repeated-text encoding schema once in shared state. A bounded release probe passed at 1,643 tokens. The full repeated refresh then passed 20/20 per path with 6,617 Jev tokens and 2,435 main-model tokens, totaling 9,052 versus 26,640 baseline tokens. All initial, restarted and repeated selections are counted. Combined compacted provider cost was $0.000714378 versus $0.0023805 for that run. All four original archive recovery checks passed and later selections made zero additional decision calls. The focused suite passes 32/32. These synthetic cases were used during development and are not held-out evaluation.

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
- [V4 evolving run, including remaining token overhead](evidence/jev-context-evolving-lossless-v4.json)
- [V5 evolving run with original answer policy](evidence/jev-context-evolving-shared-v5.json)
- [V5 evolving source hashes, including the encoder](evidence/jev-context-evolving-shared-v5-provenance.json)
- [V5 repeated-snapshot refresh with all scoring usage](evidence/jev-context-repeated-shared-v5.json)
- [Rejected v6 repeated-snapshot run with paid usage](evidence/jev-context-repeated-indexed-v6.json)
- [Rejected v7 bounded prompt probe](evidence/jev-context-v7-prompt-probe.json)
- [Rejected v8 bounded prompt probe](evidence/jev-context-v8-prompt-probe.json)
- [Successful v9 bounded prompt probe](evidence/jev-context-v9-prompt-probe.json)
- [V9 repeated-snapshot refresh](evidence/jev-context-repeated-schema-v9.json)

## Integration limits

The cache fingerprint covers evidence passed to `select`. An adapter that supplies only a bounded working set must recover omitted source records when needed, and should include a durable history version in `revision`. The fingerprint alone cannot discover a dependency in a record no longer supplied to the selector. `context.read` supports exact original recovery, but an agent is not guaranteed to choose the right archive record.

The shared evidence window can miss long, indirect, or implicit dependencies. Regex protection supplements explicit pins and cannot identify every constraint. Character limits are not model-token limits. Billing after an interrupted request may be unavailable and must remain labeled unknown. This suite does not test billions of tokens, sustained overnight work, broad model calibration, or a general claim that Sleep always consumes fewer tokens.

A possible further optimization is an admission policy that predicts whether selective scoring will amortize across enough calls, while preserving the same evidence, budget, and completion safeguards. No such predicted benefit is included in the measurements above. Real-session evaluation is still needed before claiming these synthetic gains apply to normal engineering histories.
