# Calibration and archive API regression evidence

All measurements below use the local scripted REM executor, synthetic grading receipts, and local HTTP requests. No paid model calls ran. The archive suite also uses a disposable local MongoDB replica set, not Atlas or user data.

| Reproduced case | Before | After |
| --- | --- | --- |
| 9 valid train scores, 0 valid held-out blind scores, current threshold 0.9 | Committed 0.8, reporting held-out errors as 0 | Keeps 0.9, marks grading incomplete, creates no edit or harness version |
| Non-finite probability | NaN counted as a graded task with 0 errors | Invalid or unavailable probabilities do not count as graded; any missing checked/blind score prevents calibration |
| Explicit `completion: null` | Calibration created a default evaluator | Runs 0 calibration tasks and 0 grading calls |
| Injected completion evaluator | Missing from context, so the night could choose a different default | The exact configured evaluator is reused |
| Archive API continuation at offset 33,560,000 | HTTP validation rejected its own returned continuation | HTTP 200, exact source tail recovered through `nextOffset: null` |

Normal calibration still passes its existing regression: a fully scored separable fixture raises the threshold from 0.5 to 0.7, then keeps 0.7 on the next run. Runtime deterministic acceptance checks still veto completion independently of calibration.

## Accounting evidence

Previously calibration discarded all grading usage and its additional gym-run cost. Each checked/blind grading attempt now retains a receipt, including invalid probabilities, unavailable results, and exceptions. Missing usage stays unknown. Partial reported subtotals remain included even when the receipt is incomplete. Stub execution has explicit zero usage.

The synthetic accounting fixture made **28 grading calls** over **14 gym tasks** and retained **28 receipts**. Its known subtotal is **270 tokens and $0.26**, with **2 unknown token receipts and 2 unknown cost receipts**. These are injected fixture values, not measured provider spend. A malformed score and an unavailable score retained their reported usage; an exception retained an unknown receipt. The threshold and harness version did not change.

The accompanying scripted gym used **86 executor calls**, **128,467 character-estimated tokens**, and **$0.411465 estimated cost** from the existing placeholder tier rates in `rem/models.js`. Gym estimates and grader receipt totals are separate fields. `accounting.allInCost` is `null`: these estimates and incomplete receipts do not establish an all-in billed cost.

Observed test diagnostics:

```json
{"fixture":"held-out-outage","from":0.9,"to":0.9,"trainGrades":9,"heldOutGrades":0,"status":"incomplete-grading"}
{"fixture":"grader-receipts","calls":28,"knownTokenSubtotal":270,"knownCostSubtotal":0.26,"unknownUsageCalls":2,"unknownCostCalls":2,"gym":{"model":"scripted","tasks":14,"modelCalls":86,"tokens":128467,"estimatedCost":0.411465,"costSource":"rem/models.js placeholder tier rates","tokenSource":"character-based estimates"},"allInCost":null}
```

## Validation

**57 checks passed, 1 optional Atlas smoke skipped.** This includes 10 calibration/API checks, 40 existing gym/night/consolidation/rehearsal/archive checks, and 7 completion safety checks. The archive HTTP regression makes actual requests, verifies both returned text pages against the original JSON, and rejects offsets above the shared limit. Individual responses remain capped at 8,000 characters; backend decoding still reconstructs one full source per page.

```sh
node --test tests/rem-calibrate.test.js tests/rem-api.test.js
node --test tests/rem-consolidation.test.js tests/rem-gym.test.js tests/rem-night.test.js tests/rem-rehearse.test.js tests/episode-archive.test.js
node --test tests/completion-safety.test.js
```
