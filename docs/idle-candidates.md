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

## Live generated solution verification

`node scripts/verify-idle-candidate-live.mjs output-directory` uses a public synthetic counter conversation, the actual Sleep executor and OpenRouter provider, then independently tests the resulting HTML in a browser with all network requests blocked. Existing environment credentials are required; no personal history is read. The test explicitly grants only the two isolated synthetic draft paths. It does not exercise the idle timer or opt-in UI.

The final frozen counter-contract run passed in one call: 1,408 measured tokens and $0.0015076 reported cost. The independent browser observed 0, 1, 2, then Reset to 0, native visible buttons, zero network requests and zero page errors. Artifact hashes and provider usage are retained in `docs/evidence/idle-candidate-live-verification.json`.

An initial run failed because the evidence file omitted the exact required `Unverified draft` label. The executor correctly ended incomplete. Clarifying the formatting produced two successful follow-up runs. Across the three smoke runs there were five provider calls, but usage from the first three was not retained before their temporary database was removed. Aggregate token and dollar totals are therefore unknown, not zero. `idle-candidate-live-accounting.json` preserves the missing-accounting limitation; subsequent tests record provider usage before assertions can fail. No total cost-saving claim is made.

## Conversation stop and continuation

A compound instruction such as “Let's stop here and then evaluate what everyone has been doing.” pauses candidate derivation. The control state is reconstructed from persisted authored user messages, so later status questions, assessment requests and timer generations cannot revive older goals. Explicit continuation reuses the unfinished objective and preserves both the original constraints and the pause/resume source IDs. A new concrete task replaces earlier paused objectives. Cancelled or explicitly completed goals are not reopened by a bare continuation.

“Do not stop” is not interpreted as a pause. Assistant output, background reviews, imported notes, quoted commands and technical descriptions of a stop button cannot change the user's control state. Candidate derivation still grants no permissions; the lifecycle must retain its consent, budget, attempt and ownership checks. This is a deterministic command recognizer, not a general natural-language understanding guarantee.

`tests/idle-intent.test.js` covers the exact checkpoint wording, curly-apostrophe normalization, persistent suppression through assessment, explicit continuation, new work, cancellation and provenance. The candidate and existing lifecycle suites passed 37 tests together after this change. Additional lifecycle restart/rearm regressions are coordinated with the Sleep owner.
