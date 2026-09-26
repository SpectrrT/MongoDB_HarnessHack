# Sleep: judge-facing project description

Problem Statement Two, **Long Horizon Engineering**, asks for a harness that sustains coherent memory over long sessions, keeps working toward goals, and learns from hard metrics. Offload implements reversible context selection, bounded MongoDB checkpoints, restart recovery, constrained local execution and evidence-based completion. The product section is named **Sleep**.

Jev is actually integrated. It estimates a retention probability for each candidate record. The harness protects instructions and effects, archives exact source records before omission, preserves tool exchanges and makes omitted evidence recoverable. The probabilities are model estimates, not calibrated guarantees. Identical read results can be deduplicated without another model call; unchanged decisions survive restart. New evidence invalidates stale scores.

| Measured workload | Comparison | Current result and boundary |
| --- | --- | --- |
| Three evolving synthetic tasks, twelve stages, GPT-4o-mini | 39,196 full-context tokens versus 32,264 including Jev and recovery | **17.69% fewer**; 11/12 versus 12/12 exact JSON checks. Baseline failure was an extra field, not an incorrect owner or readiness. Development cases used during optimization. |
| Four stable synthetic snapshots, five answers per path | 26,640 versus 9,052 total tokens | **66.02% fewer**, 20/20 checks on both paths. Reuse amortizes selection; first use costs more. |
| Three live GPT-4.1-mini local drafts | Initial 2/3 artifacts, 7 calls, 1,721 tokens; refined 3/3, 3 calls, 815 tokens | $0.000608 on the refined run. Checks cover exact phrases, minimum size and JSON, not broad semantic quality. |
| 300-step deterministic session | Maximum reconstructed checkpoint 1,245,224 bytes versus 18,852 | **98.49% smaller**, with all 1,242,822 source bytes retained. Bytes, not live tokens. |
| One live idle counter prototype | One call, 1,346 tokens, $0.0014084 | Actual offline Chrome passes all 10 declared checks, including Increment and Reset. Restart makes zero extra calls. Injected idle clock, not an overnight-duration study. |

The evolving total includes 12,011 answer-model tokens and 20,253 scoring tokens. Direct TypeSafe prices are unavailable, so its combined monetary saving is unknown. The repeated-context run reports $0.000714378 versus $0.0023805. Earlier evolving configurations consumed **59.05%, 29.95%, 6.84% and 3.80% more tokens**; those receipts remain public. Shorter prompts that failed selection were rejected. We did not remove their charges or change the exact answer checker to obtain a positive result.

Real personal-session replays provide a harder counterexample. In the first three paired research trials, both paths failed to generate artifacts after 18 total calls and 105,645 tokens. An output-format fix produces valid files in one call. On the subsequent frozen small-history cases, however, neither path fully passes any of the three research or three onboarding trials. Research achieves 63/93 versus 64/93 criteria; onboarding 19/36 versus 18/36. These inputs fit below the selector threshold, make zero Jev calls and produce identical request hashes between paths. Their small token differences are ordinary generation variation, **not compaction savings**. Private source histories and artifact contents stay private; public receipts retain hashes, usage and outcomes.

A subsequent development pilot jointly changes the generic task contract and model to production Sleep's GPT-4.1-mini. Research improves to 29/31 on both paths; onboarding to 10/12 versus 9/12. Neither fully passes. Those pairs also make zero Jev calls. All personal experiments through this milestone total **35 calls, 203,997 tokens and $0.0330104**, including the failures. This is not a causal claim about either intervention alone or a context-compaction gain.

The full 145-message onboarding history contains 67,208 serialized characters, of which 31,287 are protected under the original policy. That cannot fit the default 16,000-character budget. The harness now rejects an impossible protected-context budget before paying for Jev, while retaining source archives. This is an observed boundary and a concrete waste-prevention fix, not a successful full-history compaction result.

Durability checks use actual local MongoDB transactions and independent processes. Three stale-worker races are fenced. An actual SIGKILL after a simulated send and before ledger commit recovers with exactly one fixture-provider send and receipt. This does not establish generic exactly-once behavior for external Gmail or Drive. Legacy TTL records are archived at startup when they still exist, and source pagination works beyond 32 MiB. Already deleted records cannot be reconstructed.

Source-backed suggestions preserve provenance from explicitly selected history. They can propose a supported task, run four durable checkpoints, produce a checked artifact and record feedback for a versioned policy. Import alone does not start work. Five Atlas reads beside 10,000 unrelated rows improved from a 1,474 ms median to 436 ms while examining three source documents. This small retrieval measurement does not establish long-term suggestion usefulness.

Native OpenRouter selection passes one scripted-provider task with real file tools. Prompt characters fall from 116,021 to 49,891, while calls rise from 8 to 9 and 15 scripted selection calls are counted. This is integration evidence, not a paid-token benchmark. Native turns remain bounded to 40 tool steps; REM supplies separate durable transcript storage.

The homepage displays conditions and receipts immediately after the complete hero. Read [evolving evidence](context-evolving-evidence.md), [personal replay evidence](personal-session-evidence.md), [assigned execution](sleep-task-execution.md), [idle validation](idle-sleep-validation.md), and [transcript recovery](sleep-transcript-storage.md).

This implementation does not yet demonstrate billion-token sessions, weeks of autonomous operation, universally correct semantic completion, or universal savings. Slower execution alone is not a token optimization.

## Minimal comparison presentation

The homepage now uses two flat graphs: total model tokens (including selection and recovery) and exact checks passed. The underlying measurements are unchanged: changing-task development replay 39,196 versus 32,264 tokens and 11/12 versus 12/12 checks; repeated-snapshot replay 26,640 versus 9,052 tokens and 20/20 on both paths. Both use GPT-4o-mini. The sole changing-task baseline failure was an extra JSON field, not an incorrect owner or readiness fact. Repeated snapshots favor reuse and are not independent task trials. No new performance experiment was run for this presentation change.

`public/evidence/benchmark-report.html` retains detailed methods, failed personal replays, and raw-receipt links outside the presentation flow. Regenerate it with `node scripts/build-benchmark-report.mjs` after updating `src/data/benchmark-evidence.json`. New verified comparisons can populate `presentationComparisons`, `presentationDescription`, and `presentationMethod`; do not reuse old method text for a different experiment.
