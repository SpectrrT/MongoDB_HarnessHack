# Trusted conversation context policy

The selector can distinguish historical assistant narrative from user instructions when a trusted adapter supplies both `conversationHistory: {schemaVersion: 1, instructionsComplete: true}` and `conversation: {schemaVersion: 1, role}` on every unit. All supplied user, system and developer units must be explicitly pinned before assistant protection can relax. Role metadata is never inferred from JSON text. Missing, malformed, partial or unpinned coverage falls back conservatively. Typed instruction roles are mandatory even when coverage is incomplete.

Historical assistant planning words such as "must", "required", or "do not need another layout" become eligible for relevance scoring. Actual failure/error vocabulary, permission denials and negated side-effect restrictions remain protected. Explicit caller pins, effects, tool protocols, unfinished exchanges, recent records and oversized records remain protected. The conservative lexical guard is not a semantic guarantee; adapters still need explicit pins for committed effects and known restrictions. Jev uncertainty retains the record, and omitted originals remain exactly recoverable from the archive.

This is an opt-in selector contract and a benchmark adapter change. The native chat adapter and ordinary opaque tool records retain their existing policy. The causal cache identity includes conversation metadata, coverage and the new selector policy revision. The Jev scorer remains frozen at v9.

The full personal onboarding packet contains 145 authored records, 39 user and 106 assistant, with 67,208 serialized UTF-16 code units. Offline preflight, with no paid requests and the same 16,000-character budget, measured:

| Policy | Protected records | Protected characters | Floor fits |
| --- | ---: | ---: | --- |
| Original opaque policy | 57 | 31,287 | No |
| Rejected broad assistant-negation draft | 55 | 33,788 | No |
| Trusted role policy with explicit action guards | 41 | 12,583 | Yes |

The final protected set includes all 39 user records (8,109 characters), one assistant action restriction (1,804), and one recent assistant report (2,670). The conservative full-prompt reservation is 80,839 against the same 100,000 budget and the verified `openai/gpt-4.1-mini` context window. This is an admission check, not measured model-token savings or proof that the scored selection will fit. No packet, evaluator, recency setting, score threshold or context budget was changed.

Raw evidence: `docs/evidence/personal-onboarding-full-preflight.json`, `docs/evidence/personal-onboarding-full-typed-preflight.json` (rejected draft), and `docs/evidence/personal-onboarding-full-typed-v2-preflight.json`.

One subsequently authorized full-history development pair used the frozen packet and evaluator, `openai/gpt-4.1-mini` in both arms, the public schema/history prompt, and this opt-in policy. The full-context artifact passed only 9/12 structural/lexical checks and used 20,811 tokens ($0.0092592 reported cost, 7,340 ms arm elapsed time). The selected arm made seven Jev requests using 33,285 tokens ($0.0013167, 2,588 ms), retained 144/145 records and 67,081 characters, then stopped because the selection exceeded 16,000 characters. It generated no artifact. All 104 eligible records were scored; 103 were retained at the unchanged 0.25 threshold. This was a selection failure, with no completed paired token-savings comparison. The strict full-pass regression metric is zero because the baseline itself failed; artifact availability regressed from one to zero.

Both arms' eight paid calls total 54,096 measured tokens and $0.0105759. Every call receipt, including the failed selected arm's charges, is retained in `docs/evidence/personal-onboarding-full-typed-development-v1.json`. No repeat, threshold adjustment, evaluator feedback or task-specific scoring rule followed this result. This development variant does not establish a gain on real personal histories.
