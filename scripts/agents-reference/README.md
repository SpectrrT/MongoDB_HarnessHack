# Matched OpenAI Agents SDK reference benchmark

This is a configured **OpenAI Agents SDK reference harness**, not Codex or Claude Code. It compares full accumulated evidence in the actual SDK Runner with Offload's selected evidence and archive recovery, using the same gpt-4o-mini model through OpenRouter. It does not evaluate every SDK capability or a frontier model.

The three tasks, twelve chronological stages and exact JSON checker are imported unchanged from `../fixtures/evolving-context.mjs`. Both arms have the same prompts, archive tools, temperature 0, 350 output-token limit per call and four model-call budget. Each stage begins fresh model state in both arms. The reference is deliberately configured with full accumulated evidence; this is not a claim about the SDK's default context policy. One working-set stage tests explicit archive recovery.

Install benchmark-only pinned dependencies here. Production runtime dependencies are unchanged:

```sh
npm ci --prefix scripts/agents-reference
node --test scripts/agents-reference/protocol.test.mjs
node scripts/agents-reference/run.mjs --output /path/to/new-dry-report.json
node --env-file=/path/to/private.env scripts/agents-reference/run.mjs --live --output /path/to/new-live-report.json
```

Alternatively set `AGENTS_REFERENCE_DEPS` to an isolated directory containing the exact pinned package installation. The adapter verifies installed versions. Live mode reads the existing private OpenRouter environment key and optionally the existing Typesafe key file. Headers are never recorded. The live output refuses to overwrite an existing report. Tracing is disabled globally and on the Runner; SDK and transport retries are disabled.

The offline protocol tests compare actual outgoing SDK and Offload requests through archive recovery, enforce four turns, retain 429 usage without retrying, preserve missing usage as unknown, and retain partial Jev error receipts. The full dry run returns fixture answers and is mechanics evidence only. Paid evaluation uses real provider outputs, with no expected answer in the requests.

Every live network attempt has a raw request, response, usage and status receipt, including failures. Selection and restart decision calls belong to Offload's all-in totals. Provider-reported costs are used without estimated conversions; absent cost makes the total unknown. The first arm alternates each stage. Underlying OpenRouter routing and caching are not controlled, and any returned provider identifiers remain in the receipts. Ordinary compute/storage costs are not priced.

Source: [OpenAI SDK model/provider guidance](https://developers.openai.com/api/docs/guides/agents/models), [quickstart](https://developers.openai.com/api/docs/guides/agents/quickstart), and [agent loop](https://developers.openai.com/api/docs/guides/agents/running-agents). Exact installed SDK source was inspected for custom Chat Completions transport, retry and tool serialization behavior.

## September 26 replication plan

Two additional complete GPT-4o-mini trials were fixed before execution, with no outcome-based stopping, fixture changes or score tuning. Report all three trials including the original. The trusted-role policy update only affects typed conversation histories; these synthetic units are untyped.

The separately registered frontier-model profile uses `BENCHMARK_MODEL=anthropic/claude-opus-5.5`, medium reasoning, no temperature override, a 4,096 output-token cap including reasoning and four model calls per stage in both arms. Exactly two paired trials are planned. The same three-task suite, goals, checks, archive tools and selector policy remain unchanged. All selector tokens count. SDK and Offload wire-equivalence tests pass for both profiles before new paid calls. Do not pool models or these different budgets into a model ranking.

The provider catalog at https://openrouter.ai/api/v1/models listed Claude Opus 5.5 and GPT-6 Astra on September 26. Astra is not tested by this Chat Completions runner: OpenAI documents that its function calling requires Responses (https://developers.openai.com/api/docs/guides/reasoning). No Astra result or native Claude Code result is claimed. No further trials will be added based on winning or losing outcomes.

### Astra adapter follow-up

At the user's request, a Responses adapter is now implemented for `BENCHMARK_MODEL=openai/gpt-6-astra`. Both arms use the exact same SDK Responses Runner, archive tools, medium reasoning, 4,096 output-token limit including reasoning, four-call limit, and stateless `store:false`. Only Offload adds selection and archive management. Offline tests verify identical wire requests through tool recovery, reasoning-inclusive usage, no hidden retries, and exhaustion. Exactly two full paired Astra trials are registered before execution. Keep both regardless of outcome. This supersedes the earlier adapter limitation, without relabeling the previous Chat Completions trials.

### Provider rate-limit repair

Both initial Opus runs are retained in full, including 18 HTTP 429 responses with absent usage. They overlapped and exceeded the provider's new-account limit of 20 requests/minute, so all-in token totals are unknown. These are infrastructure failures, not zero-token calls. Before further calls, register two replacement Opus runs, sequentially, with `BENCHMARK_REQUEST_INTERVAL_MS=3500` applied equally to both arms. No automatic retry, score/prompt/policy changes or ranking-based stopping. All four Opus attempts stay in the report. Any scheduling wait is included in end-to-end arm timing; transport receipts separately measure request time. The second Astra run uses the same pacing precaution.
