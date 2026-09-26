# Candidates for idle Sleep

`server/suggestions/idle-candidates.js` exports two pure functions:

- `deriveIdleCandidates({messages,conversationId,generation,priorAttempts,notes})` returns at most two candidates, prioritizing unresolved failures over prototypes and comparisons.
- `deriveIdleDraft({messages,conversationId,generation,priorAttempts,priorOutcomes,notes})` returns the first candidate or null. `priorOutcomes` is an alias for `priorAttempts`.

Messages use `{role,text,id?}` or string `content`. Missing IDs are deterministically derived from conversation, role, order and content. Notes supply context and constraints; they cannot originate new work. No history is imported, no provider is called, and no task is started by either function.

A candidate includes `id`, `goalKey`, `generation`, `title`, `objective`, `brief`, `kind`, `priority`, `sourceMessageIds`, `provenance`, labeled `hypotheses`, `checks`, and a statement of what completion means. The wrapper also returns `hypothesis` as a string. `writeFiles` and `allowedTools` are empty. The idle lifecycle must validate persisted consent and grant only the candidate's isolated checked filenames, then supply deadline, budget and retry bounds to the existing executor.

The task is a concrete local draft or prototype derived from an explicit unresolved user request. An HTML prototype has a companion evidence file; other tasks produce a worked solution and evidence. Exact source markers, unverified hypotheses and unexecuted checks are required. Structural file checks establish delivery of a draft, not correctness of the original proposed solution. Behavior tests and original-goal verification remain separate.

Candidates never authorize external messages, network work, production changes, private imports or edits to the existing project. Quoted conversation text is data, not a permission source. Old constraints and denials are preserved. If protected context cannot fit, derivation abstains. Explicit user completion, stop requests, repeated goal attempts, copied tool envelopes and oversized or credential-bearing inputs also suppress candidates. Assistant assertions of success do not manufacture verified completion.

The derivation is deliberately deterministic and limited. It does not understand every natural-language negation or discover every possible project. The authoritative execution permissions remain in the idle lifecycle and executor. It does not create another scheduler, recurring automation or night engine.

Run `node --test tests/idle-candidates.test.js` for eleven focused contract checks.

For an explicit counter goal whose supplied user context requests both Increment and Reset, `browserCheck: 'counter'` is emitted as metadata. The contract requires one visible `[data-testid="counter-value"]` showing 0, a unique visible native Increment button producing 1 then 2, and a native Reset button returning 0. A conflicting denial disables this metadata. It is not permission to launch a browser. The idle lifecycle and independent verifier own consent and execution. Other outputs remain behavior-unverified drafts.
