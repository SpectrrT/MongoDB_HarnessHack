# Offload: project and measured evidence

Offload combines recoverable context selection, MongoDB checkpoints, source-backed next actions and bounded local drafting. Sleep groups conversations, next actions, overnight tasks, REM and memory in one place.

## Measured comparisons

| Model | Paired runs | SDK tokens | Offload all-in tokens | Exact checks, SDK / Offload |
| --- | ---: | ---: | ---: | --- |
| GPT-6 Astra | 3 | 80,092 | 77,523 | 36/36 / 36/36 |
| Claude Opus 5.5 | 3 | 198,171 | 172,491 | 36/36 / 34/36 |

The homepage shows only two interactive graphs: tokens per verified answer and context characters kept per step. All selector and retrieval tokens count. Trials use the same model, task, tools and limits within each pair. The repeated trials use three synthetic development tasks, not independent unseen workloads or a general intelligence ranking.

Astra passes all 36 checks on both paths. Opus's two Offload misses are invalid JSON outputs containing extra prose despite the JSON-mode request. These losses, earlier selectors, the three prompted-JSON Opus trials and infrastructure failures remain available in the [complete methods report](../public/evidence/benchmark-report.html). No universal quality or cost advantage is claimed.

## Working demonstration

Prepared MongoDB engineer activity is labeled example data. Three weekly query reviews reveal a repeated workflow; today's example meeting and notes populate Computer History. The local interface imports selected notes, derives a follow-up checklist, and hands a selected action to Sleep with a token budget, deadline and approval for the exact proposed files.

One recorded GPT-4o draft used 1,420 tokens and cost $0.0069775. It passed eight declared content checks and two file-delivery checks. Approval saved the same files with zero additional model calls. Source metrics of 180 ms p95 and 0.6% timeouts are supplied example values. Proposed 200 ms and 1% rollback thresholds are model suggestions requiring review. No database index changes, messages or external actions occurred. [Receipt and limits](mongodb-live-workflow-audit.md).

## Boundaries

The 300-step checkpoint test measured a 98.49% reduction in working-checkpoint bytes while preserving canonical source bytes. It did not measure live token savings. The idle counter prototype passed ten offline browser checks after one live model call, with an injected idle clock rather than an overnight-duration study.

Personal-session experiments retain all failures: 43 paid calls, 258,093 tokens and $0.0435863 reported cost. Short histories below the selector threshold made zero Jev calls, so differences there cannot be attributed to compaction. The full-history onboarding selection exhausted its budget before producing an Offload answer. These results do not establish broad reasoning improvements.

The hosted website is a static presentation. Agent execution and the isolated MongoDB demo run through the local service. No background computer capture has been enabled. There is no claim of billion-token sessions, weeks of autonomy or generic exactly-once external actions.
