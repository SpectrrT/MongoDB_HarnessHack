# Completion contract

When a completion evaluator is configured, `done` requires a finite probability between zero and one at or above the current harness threshold, and no failed deterministic acceptance checks. Deterministic failures veto the estimate even if the model returns 0.99.

The agent makes one additional bounded repair attempt after a rejected final answer, subject to its step budget. If that attempt still fails, its status is `incomplete`, its proposed final answer is preserved, and `completion` records the reasons and attempts. A generic resume does not reset the repair allowance. Step-budget exhaustion in the tool loop remains `failed`.

The API reviews terminal incomplete runs so their failed outcomes and corrections reach Sleep. The REM view distinguishes verified completion from incomplete work. The gym's independent deterministic checkers continue to evaluate candidates without requiring a probability provider.

This fixes false success reporting. It does not by itself implement an unlimited repair loop, a generic goal scheduler, calibrated probabilities, or verified external actions. Jev availability and fallback source remain visible in each completion record.

Verification: `tests/completion-safety.test.js`, `tests/rem-consolidation.test.js`, `tests/rem-api.test.js`, and the desktop/mobile REM flow.
