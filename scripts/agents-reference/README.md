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
