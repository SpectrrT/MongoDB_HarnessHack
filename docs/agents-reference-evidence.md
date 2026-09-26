# SDK comparison evidence

The original single-trial report below is preserved as a historical measurement. The final seven complete paired runs and three infrastructure-failed attempts are consolidated in [reference-summary.json](evidence/reference-summary.json). The homepage uses the two fixed paced runs each for Astra and Opus 5.5, including adverse outcomes. See the [registered protocol](../scripts/agents-reference/README.md) and [current README](../README.md) for totals and limitations.

# OpenAI Agents SDK reference comparison

One live paired run on September 26, 2026 compared a configured **OpenAI Agents SDK reference harness** with Offload context selection and archive recovery. The unchanged synthetic fixture has three tasks and twelve chronological stages. This is not a Codex, Claude Code, frontier-model or full-product benchmark.

| Measured result | SDK full-history reference | Offload selection |
| --- | ---: | ---: |
| Exact JSON acceptance | 11/12 | 12/12 |
| Answer-model input + output tokens | 39,146 | 14,311 |
| Jev input + output tokens | 0 | 20,253 |
| Total model tokens, including all decision/retrieval calls | 39,146 | 34,564 |
| Answer calls | 19 | 23 |
| Additional Jev calls | 0 | 12 |
| Sum of measured arm execution time | 14,800 ms | 23,382 ms |
| Provider-reported answer charges | $0.0041964 | $0.0023175 |
| All-in model charge | $0.0041964 | Unknown: 12 Jev cost receipts absent |

Offload used **11.70% fewer all-in tokens**, made 16 more model calls, and took **57.99% longer** across these stages. The known experiment charges total **$0.0065139 plus unreported Jev charges**. All 54 attempts have retained receipts: 42 answer calls and 12 Jev calls. All returned HTTP 200 and valid token counts; all 42 answer responses identified their serving provider as OpenAI. Dollar savings cannot be calculated from these receipts.

The single SDK failure was output formatting, not a wrong owner or readiness judgment. At `owner-correction`, it returned `{"owner":"Priya Raman","ready_for_release":false,"reason":"The signed security appendix is missing."}`. The unchanged checker requires exactly `{"owner":"Priya Raman","ready":false}`. Offload returned that exact object. Do not describe this result as a demonstrated factual reasoning improvement.

The explicit archive recovery stage passed 1/1: Offload called `context_read` for `archive-bundle` and then returned its exact artifact and sha. All twelve restart selections matched their original selection, with zero additional Jev calls. All required-retention checks passed. No answer path used more than three of its four permitted model calls. This verifies that one explicit pointer can recover an older source, not arbitrary retrieval recall.

## Matched conditions

Both arms used `openai/gpt-4o-mini` through the same OpenRouter Chat Completions endpoint, temperature 0, 350 output tokens per call and a four-model-call limit. Both used the same system prompt, user message schema, two archive tools and tool implementation, independent exact JSON checker, synthetic inputs, and per-stage fresh model state. Calls alternated reference-first and Offload-first by stage. The reference received full accumulated evidence; Offload received context selected under a 3,000-character budget, recent count 1 and probability threshold 0.25. Jev `jev-1.13.0` through Typesafe performed Offload's retention decisions.

The reference actually runs `Agent` and `Runner` from `@openai/agents` 0.18.0, with its `OpenAIChatCompletionsModel` and OpenAI client 7.23.0. Tracing and retries were disabled. The SDK's explicit `strict:false` and `stream:false` defaults were also sent by the Offload loop. Neither arm used SDK persistence, built-in compaction, hosted tools, handoffs, or another product harness. Full history is a deliberate reference configuration, not a claim about the SDK's default context behavior.

Five offline protocol tests passed before the one live run. They verified identical first-call and archive-recovery request objects between the actual SDK and Offload, the four-call bound, no hidden retry on HTTP 429, reported usage preservation on errors, and unknown usage/cost preservation. A twelve-stage dry run exercised the fixture flow with stubbed model answers. Those dry results are mechanics evidence only. No live rerun or score tuning was performed. The live command exited 1 because the exact checker rejected one SDK result; the failure and its charges remain in the report.

This is a small single-run synthetic study. It does not establish statistical significance, overnight performance, billion-token scale or superiority over a full frontier harness. OpenRouter caching was uncontrolled, and raw cached-token receipts are preserved. Ordinary compute and storage costs are not priced. One stage uses the previous selected working set plus new evidence; the other stages still pass accumulated records into selection, so this is not a bounded canonical-history scanning result.

## Reproduction and raw evidence

The frozen runner source commit is `5f70242`. Every implementation hash in the report was checked against that run's files. Dependencies are pinned in a separate benchmark package and do not change production dependencies. See [benchmark instructions](../scripts/agents-reference/README.md) for offline validation and reproduction.

The [raw paired report](evidence/agents-reference-2026-09-26.json) includes all request/response bodies, raw usage and status receipts, answers, independent checks, SDK/runtime configuration, source hashes, call ordering and timing. HTTP headers and credentials are excluded. The fixture and checker were not edited.

Official integration references: [model/provider configuration](https://developers.openai.com/api/docs/guides/agents/models), [SDK quickstart](https://developers.openai.com/api/docs/guides/agents/quickstart), and [agent loop](https://developers.openai.com/api/docs/guides/agents/running-agents).
