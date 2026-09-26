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

The first Astra run likewise hit the 20 requests/minute new-account limit, with seven preserved HTTP 429 responses. It is excluded only from numerical savings summaries because usage is unknown, and remains in all-results reporting. Its two fixed paced replacements use the same 3,500 ms interval, prompts, checks, medium effort, limits and selector. This is an infrastructure repair, not model or task tuning. No further result-dependent runs are planned.

### User-requested selector optimization and additional replications

The user requested a fix for Astra's measured token regression and more trials for the homepage graphs. The registered development plan and every selector candidate outcome are in `docs/evidence/selector-v10-plan.md`. Rejected versions v10, v11 and v12 received no answer-model trials. v13 and v14 passed selector checks; v14 reduced twelve-stage selector usage from 20,253 to 15,361 tokens. Exactly three paired Astra runs and three paired Opus runs are now registered for v14, with all previous model results preserved separately. The answer prompts, tasks, checks, tools and budgets are unchanged. Version-specific results are never silently pooled.

### Opus output-format repair plan

During the first v14 Opus trial, the same format failure recurred: correct JSON followed by prose, rejected by the unchanged exact checker. The transport now offers opt-in `BENCHMARK_JSON_MODE=1` for Opus only, passing `response_format: {type: "json_object"}` identically to both arms. Default requests remain byte-equivalent, so ongoing v14 trials are unaffected. The provider catalog lists response_format support. No answer value or schema is derived from the expected answer.

After the three unchanged v14 Opus trials finish, run one paired reproduction of the failing reopened stage with JSON mode. If the provider accepts the mode and both arms pass, run exactly three complete JSON-mode paired trials. Keep all original v14 results, the probe, and all new trials as separate versioned evidence. No retries or changed checkers. JSON mode fixes the output contract, not reasoning correctness.

### Completed JSON-mode trials

All three registered full Opus JSON-mode trials completed. Reference passes 36/36 and Offload 34/36, with 198,171 versus 172,491 all-in tokens. Two Offload outputs still contain extra prose after correct JSON. The isolated format probe passed but did not predict reliable full-suite formatting. The report retains this failed repair outcome, all three original v14 Opus trials, all earlier selector results and infrastructure failures. Tokens per verified answer are 7.84% lower for Offload in this JSON-mode group; correctness is also lower. No additional result-dependent trials were run.
