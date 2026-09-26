# Personal-session artifact replay

These reconstructed offline tasks use Ryan's explicitly authorized local Codex and Claude histories. A cutoff is frozen before the user's later return and before future solutions. Both paths receive the same current task, source records, model, parameters, tools, local-file permissions and attempt limit. The independent evaluator is hashed before calls, runs after the pair, and never supplies private expected answers or repair feedback to either model.

Both paths use the production Sleep executor to generate and persist real local artifacts. Historical context attachment is a **benchmark-only adapter**; production Sleep does not yet expose this context-selection and archive-retrieval integration. The labels are full-context Sleep and Sleep with selection, not without Sleep versus with Sleep.

## Output protocol failure and repair

The original research run made nine calls on each path and produced zero artifacts in three paired trials. Full context reported 52,827 tokens; selection reported 52,818, totaling **105,645 paid tokens**. The original run did not preserve terminal schema errors. A separate 5,868-token diagnostic reproduced a file-content object where the production schema requires a string; it does not establish the exact cause of every original failure.

The executor now explicitly requires JSON-encoded string content and persists actionable validation feedback for the next bounded attempt. Invalid output still fails strict validation, and the three-attempt cap remains. All later frozen v2 artifacts were generated in one call each. This fixes file generation, not the independent task quality failures below.

## Frozen v2 small-history results

| Packet, three trials per path | Full-context Sleep | Sleep with selection |
| --- | ---: | ---: |
| Research artifacts generated | 3/3 | 3/3 |
| Research fully passing artifacts | 0/3 | 0/3 |
| Research independent criteria | 63/93 | 64/93 |
| Research total tokens | 17,457 | 17,451 |
| Onboarding artifacts generated | 3/3 | 3/3 |
| Onboarding fully passing artifacts | 0/3 | 0/3 |
| Onboarding independent criteria | 19/36 | 18/36 |
| Onboarding total tokens | 16,496 | 16,523 |

Both use `openai/gpt-4o-mini`. All twelve artifacts match their recorded hashes. Their **67,927 total tokens** are additional to the initial failed run and diagnostic. Every paired request hash is identical: both histories are under the 16,000-character threshold, so there are zero Jev calls and no context reduction. Token and correctness differences are repeated generation variation. They cannot establish compaction savings or a compaction-caused regression.

Research uses 82 authored user records plus one earlier assistant record and ten synthetic candidates. The frozen 31 checks cover output shape and three boolean decisions per candidate. Reasons are not scored. Independent read-only review found unsupported claims in reasons, including saying a supplied numeric follower count was missing. Onboarding uses 39 authored requests and four selected actual earlier assistant reports. Its twelve structural and lexical checks are proxies for a text configuration, not a runnable UI. Generated artifacts placed some pages in both active and parked lists and kept a disabled experience screen active. No checker was changed after those observations.

The source sessions span approximately 48.6 hours and 51 hours. Those spans and observed return gaps are provenance, not continuous agent work or replay speedups. Cumulative historical token counters, including cached input, are not a valid baseline for these smaller reconstructed tasks.

Raw sanitized receipts:

- [Initial failed research batch](evidence/personal-research-sleep-replay.json)
- [Output-shape diagnostic](evidence/personal-research-output-diagnosis.json)
- [Research pilot](evidence/personal-research-sleep-v2-pilot.json) and [trials 2 and 3](evidence/personal-research-sleep-v2-trials-2-3.json)
- [Onboarding pilot](evidence/personal-onboarding-sleep-v2-pilot.json) and [trials 2 and 3](evidence/personal-onboarding-sleep-v2-trials-2-3.json)

## Joint prompt and model development pilot

A generic public-schema and evidence-reconciliation instruction was added, and the model changed to production Sleep's `openai/gpt-4.1-mini`. Both changes are applied to both paths. One additional pair per packet improves research to **29/31 on both paths**, and onboarding to **10/12 versus 9/12**. Neither task is fully complete. Research uses 6,318 versus 6,420 tokens; onboarding 5,998 versus 5,821. These histories still trigger zero Jev calls and identical request hashes.

The intervention is jointly changed and follows inspection of earlier failures, so this is development evidence. It cannot isolate prompt benefit from model benefit, establish statistical reliability, or show compaction savings. Research fixes the prior missing-follower contradictions but still misapplies an exact numeric boundary; an additional dedicated-account decision differs from the target-app interpretation. Onboarding removes the active-versus-parked contradiction but retains stale routing. The unchanged evaluators still fail these artifacts.

[Research pilot](evidence/personal-research-development-v3.json) and [onboarding pilot](evidence/personal-onboarding-development-v3.json).

The complete ledger through this milestone includes **43 paid calls, 258,093 tokens and $0.0435863 provider-reported cost**. The 199,923 ms latency is a sum of individual provider calls, not elapsed wall time. It retains every failed batch, diagnostic and later trial; all usage is known. [Experiment ledger](evidence/personal-replay-experiment-ledger.json).

## Full chronological history admission

The separately frozen onboarding variant contains all eligible pre-cutoff text: 39 user and 106 assistant messages. No relevance filtering, truncation, future records or synthetic filler is added. Its task, schema and v2 evaluator are unchanged. Serialized history is 67,208 JavaScript UTF-16 code units. Under the original policy, 57 protected records occupy 31,287 characters: 8,109 user instructions, 20,508 detected constraints or open loops and 2,670 recent context. This exceeds the unchanged 16,000-character selection budget before scoring.

No answer or Jev calls were made for this preflight. The production compactor now archives the source and detects an impossible protected floor before paying for selection. A regression verifies zero scorer calls and exact recovery. This preserves the admission failure as evidence. It does not demonstrate a successful full-history run. [Frozen preflight receipt](evidence/personal-onboarding-full-preflight.json).

Public receipts contain hashes, counters and criteria outcomes. Raw private messages, complete provider requests, source manifests and generated artifacts remain outside Git. Reproduction requires the original locally authorized frozen packets and private evaluator files; they are intentionally not bundled in the public project.

The full trusted-role onboarding replay also failed: the reference passed 9/12 checks with 20,811 tokens; Offload spent 33,285 selection tokens and retained 67,081 of 67,208 characters, above its unchanged 16,000-character budget. It produced no answer. See [the preserved failure](evidence/personal-onboarding-full-typed-development-v1.json).
