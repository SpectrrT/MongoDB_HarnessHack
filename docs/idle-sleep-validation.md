# Idle Sleep validation

Sleep now turns an opted-in, unfinished conversation into one bounded local solution attempt after 30 idle minutes. It writes isolated candidate files, executes the fixed offline counter contract when explicitly allowed, retains check failures for repair, and pauses when the user returns. It does not gain project-edit, shell, account, or deployment authority.

The previous saved-queue path had no configured executor and produced no checked artifact. The current synthetic idle case produced two artifacts and a browser-verified counter. This is a capability comparison, not evidence that doing more work costs fewer tokens.

## Measured live case

The September 26 run used `openai/gpt-4.1-mini` through OpenRouter. The real idle lifecycle, MongoDB task store, provider adapter, file writer, and isolated Chrome verifier were exercised. Only the idle clock was advanced artificially.

| Measurement | Result |
| --- | --- |
| Model calls before consent | 0 |
| Model calls before the idle threshold | 0 |
| Paid model calls | 1 |
| Measured tokens | 1,346 |
| Reported cost | $0.0014084 |
| End-to-end wall time | 8.227 seconds |
| Browser verification time | 1.141 seconds |
| Checked artifacts | 2 |
| Extra model calls after restart | 0 |
| Unknown usage reservations | 0 |

The browser observed stable values `0`, `1`, `2`, then `0` after Reset. All ten checks passed, including native visible buttons, single-document restrictions, no external resource attempts, and browser process-group cleanup. The complete task, checks, artifact contents, and provider usage are in [idle-sleep-live.json](evidence/idle-sleep-live.json). [The call journal](evidence/idle-sleep-live-calls.jsonl) records each invocation before and after the provider response, including failures if they occur. This run had no failed paid calls.

One synthetic counter does not establish general task completion, long-horizon quality, or token savings. The scheduler test simulates the 30-minute idle transition. Scripted evidence uses fixture token counts and must not be counted as provider measurements.

## Regression evidence

- 45 focused lifecycle and worker checks passed. They include real Chrome failure-to-repair behavior within the default 10,000-token allowance, deadline and budget exhaustion, unknown-usage accounting, scoped consent, provider-key loss, and ownership fencing.
- 28 model, candidate, and conversational-control checks passed.
- Two browser UI cases passed, one desktop and one mobile. They cover conservative usage receipts, usable foreground chat, activity pause, and disabling Sleep after the chat provider disconnects.
- Production frontend build and whitespace checks passed.

The broken-counter regression requires two scripted generation calls. The first browser run sees `0` where `1` is required; that measured failure reaches the second generation prompt. The repaired counter then passes `0`, `1`, `2`, `0`. Its 400 tokens are explicit fixture values, not paid usage.

A compound stop also persists when the foreground provider rejects the message. Restarting and submitting a stale client snapshot with a progress question does not replay the earlier goal as new authorization. Explicit continuation resumes the same task and preserves its original goal and provenance. Disabling Sleep ignores invalid old context and does not require a working provider.

## Run locally

```sh
node --test tests/idle-execution.test.js tests/idle-reviews.test.js tests/sleep-execution.test.js
node --test tests/model.test.js tests/idle-intent.test.js tests/idle-candidates.test.js
npm run build
PW_START_SERVER=1 npx playwright test tests/e2e/idle-sleep.spec.js
node scripts/idle-sleep-smoke.mjs
node --env-file=.env scripts/idle-sleep-smoke.mjs --live
```

The live command requires an existing OpenRouter key and spends real tokens. The script uses a new synthetic workspace and temporary local MongoDB, grants only isolated draft paths and the fixed offline counter check, saves every provider attempt, and exports task accounting before removing the database. Existing evidence is preserved under distinct filenames on subsequent runs. It neither reads personal history nor edits an existing user project.
