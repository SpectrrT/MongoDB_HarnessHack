# Orders query review

Sample data. Previously prepared example, not a live model result.

## Context

The supplied notes record p95 latency of 180 ms and a timeout rate of 0.6%. The example engineer reviews Atlas, the orders service repository, issue notes, and meeting notes each week. This is illustrative history, not captured activity.

## Proposed workflow

1. **Before the meeting:** gather the query shape, existing indexes, representative parameters, and issue notes. Mark missing inputs.
2. **Compare evidence:** ask the owner for current and candidate explain plans from staging. Compare documents examined, keys examined, returned rows, sort stages, and execution time on equivalent inputs.
3. **Draft the index rollout:** document the candidate, expected benefit, index size, write impact, deployment window, and approval needed. A single explain plan cannot establish a new p95 or timeout rate.
4. **After the meeting:** turn confirmed decisions into owner and deadline checklists. Draft the issue update for review. Leave unknown owners and dates unassigned.
5. **Next week:** prepare the next review from the previous decisions. Confirm timing before scheduling recurring work.

## Rollback plan

Record the previous configuration, the approved rollback procedure, the responsible operator, and agreed latency or timeout thresholds. Check recovery against the same monitoring window.

## Checks and approval

Unverified draft. No database writes or index creation are authorized. No explain plans were run, no production index changed, no issue updated, and no messages sent. Review the plan and grant authority separately before any real changes. Document checks verify these contents, not database performance.
