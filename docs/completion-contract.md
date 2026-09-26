# Completion contract

When a completion evaluator is configured, `done` requires a finite probability between zero and one at or above the current harness threshold, and explicit, well-formed acceptance evidence with no failed deterministic checks. Missing evidence cannot establish success. Deterministic failures veto the estimate even if the model returns 0.99.

The agent makes one additional bounded repair attempt after a rejected final answer, subject to its step budget. If that attempt still fails, its status is `incomplete`, its proposed final answer is preserved, and `completion` records the reasons and attempts. A generic resume does not reset the repair allowance. Step-budget exhaustion in the tool loop remains `failed`.

The API reviews terminal incomplete runs so their failed outcomes and corrections reach Sleep. The REM view distinguishes verified completion from incomplete work. The gym's independent deterministic checkers continue to evaluate candidates without requiring a probability provider.

This fixes false success reporting. It does not by itself implement an unlimited repair loop, a generic goal scheduler, calibrated probabilities, or verified external actions. An explicitly configured Jev gate fails closed on missing credentials, provider errors, timeouts and invalid probability output. Offline stub evaluation is only used when selected by configuration, and it also requires evidence. The source and unavailable reason remain visible in each completion record.

Verification: `tests/completion-safety.test.js`, `tests/rem-consolidation.test.js`, `tests/rem-api.test.js`, and the desktop/mobile REM flow.


# Authority changes

Approving a scope grant or weakened guardrail triggers validation against the current harness. The candidate must preserve passing train and held-out tasks, introduce no new collateral damage, and not worsen composite fitness. Newly passing tasks also undergo adversarial checks. Unknown tools and edits that no longer change the harness are rejected.

Human permission and validation outcome are stored separately. A rejected candidate does not change the harness. Provider errors and a changed baseline leave the ask open for a retry. The approval record, evaluated harness version and edit outcome commit in one MongoDB transaction. Duplicate approvals create only one version. The UI shows validation failures rather than silently treating permission as promotion.

Verification includes a disposable MongoDB replica set exercising concurrent approvals and rollback after an injected commit failure. These checks use fixture models and task suites; they establish gate behavior, not universal safety of unseen tools.


# Local REM access

The shared REM demo API requires loopback transport and a local Host header. Browser requests must have a matching Origin. Mutating requests, including run, simulate, reset, sleep, connection changes and approvals, require `X-Offload-Client: local`. The UI supplies this header; same-origin event streams remain usable. Production mode disables the shared API.

These restrictions protect a local demonstration against remote access and cross-origin mutation. They are not multi-user identity or authorization. Do not expose the API through a public proxy without implementing authenticated workspace isolation.
