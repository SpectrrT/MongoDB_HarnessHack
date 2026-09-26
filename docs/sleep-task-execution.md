# Sleep assigned tasks: execution and evidence

Sleep now assigns local drafting tasks to a durable worker. The former overnight queue stored a brief with `runner: unconfigured` and could not produce an artifact. The new queue stores a deadline, token budget, independent output checks, and explicit file-write permission. A worker makes one bounded generation call, persists the proposal, pauses for approval when needed, writes into a new isolated task folder through the existing local-tool adapter, runs the checks, and either completes or attempts a bounded repair.

The default provider is OpenRouter, using the existing connected account key or the configured worker key. The provider receives no tools. This is a real local file workflow, not autonomous browser research or arbitrary shell execution. It never sends messages, publishes, records, or selects user folders. The UI remains under Sleep.

## Measured baseline and improvements

Three short synthetic tasks ask for a Markdown release handoff, a Markdown meeting preparation note, and a JSON project state record. All acceptance checks are fixed before generation. They check required exact phrases, minimum file size, and JSON syntax. The meeting draft deliberately requires approval. These checks establish the declared criteria, not overall semantic quality.

| Run | Verified tasks | Model calls | Reported total tokens | Provider cost | Wall time | Approval pauses |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Old queue-only implementation | 0/3 | 0 | 0 | $0 | Not executable | 0 |
| First live execution run | 2/3 | 7 | 1,721 | $0.001352 | 9.390 s | 3 |
| Refined execution prompt | 3/3 | 3 | 815 | $0.000608 | 3.791 s | 1 |

Both live runs used `openai/gpt-4.1-mini` through OpenRouter against temporary local MongoDB, with the same three tasks and criteria. The first run repeatedly changed capitalization or split required phrases with Markdown. We clarified the exact phrase contract and retained the failed draft alongside failed checks for subsequent repair. The second run produced three verified real files using four fewer calls and 906 fewer reported tokens. One persisted draft resumed after approval without regenerating it. Raw evidence includes each artifact's contents, SHA-256, individual checks, costs, provider usage, and task events:

- `docs/evidence/sleep-execution-live-initial.json`
- `docs/evidence/sleep-execution-live.json`

These are small sequential runs, not statistically reliable quality, latency, or token-saving benchmarks. The old queue's zero usage reflects its inability to execute. This evidence does not establish general context-compaction savings or long-horizon scale. Local MongoDB exercises the actual driver and atomic update path; this particular test did not use Atlas. No missing usage occurred in either live run.

## Recovery and boundaries

- Claims are persisted with a unique lease token. Every checkpoint commit and renewal checks that token and an unexpired lease. Stale workers cannot commit.
- Each lease writes immutable staged files in a separate folder. A stopped process can leave an orphan draft, but cannot overwrite the artifact selected by another claim. The database atomically selects the verified artifacts. This does not claim exactly-once arbitrary external effects.
- The task reserves a conservative UTF-8-byte input estimate plus a capped output allowance before each model call. Reported input and output usage settle that reservation. Unknown usage after crashes, timeouts, or cancellation consumes the entire reservation. This can overcount. Provider-reported overages end the task before any artifact is accepted. Reservations are a harness safeguard, not a universal tokenizer or billing guarantee.
- The default call timeout is 60 seconds and the default maximum is three generations. Deadline, budget exhaustion, and failed acceptance checks produce explicit incomplete outcomes. Cancellation and pauses fence the active worker; shutdown parks the task for a manual resume. Only generation marked retry-safe can retry a provider failure.
- The shared continuation policy persists the best failed-check count and consecutive attempts without improvement. Two unchanged repairs pause the task even when more attempts are available. The scripted eight-attempt regression case pauses after three calls with five attempts unspent, then succeeds on call four after an explicit user resume. The default three-attempt cap still stops as incomplete. The pause is a measured control behavior, not a live model-saving benchmark.
- Approval is bound to the exact persisted proposal. Repaired proposals require new approval unless the user already granted creation of the named file in the isolated task folder.
- Read and control routes require workspace ownership. Downloads verify the recorded content hash before returning the file. Artifacts live on the worker filesystem, so worker and server must share the configured `SLEEP_TASK_ROOT`; remote artifact replication is not implemented.

## Reproduce

From the project root after installing dependencies:

```sh
node --test tests/sleep-execution.test.js
node scripts/sleep-execution-demo.mjs
node --env-file=.env scripts/sleep-execution-demo.mjs --live
```

The default demo uses labeled scripted fixtures and no credentials. The `--live` demo requires `OPENROUTER_API_KEY`; it creates only synthetic local files under `work/sleep-execution-live`. Both write raw evidence under `docs/evidence`. `SLEEP_BENCH_MODEL` overrides the live demo model. The live run costs money.

To run assigned UI tasks, set `MONGODB_URI` and provide `OPENROUTER_API_KEY` in the existing ignored `.env`, or connect OpenRouter in the current workspace. Set `OFFLOAD_MODEL` for the worker model. Either start a separate worker or explicitly enable it with the local server:

```sh
node --env-file=.env server/sleep/execution-worker.js
SLEEP_EXECUTION_ENABLED=true npm start
```

Use one of those commands. `OFFLOAD_DATA_DIR` selects account storage; `SLEEP_TASK_ROOT` selects the shared isolated artifact root. Leave auto-start disabled to save and inspect tasks without executing them. Existing legacy briefs are not silently started: the UI asks the user to add output checks and assign them.

The initial execution milestone passed 28 focused Sleep and shared continuation-policy checks. Later assigned and idle execution validation passed 45 checks, including the output protocol repair below. Final combined unit/API and browser results are recorded in the integration evidence. The assignment, exact-file approval, verified-status, and download browser fixtures are rendering checks and do not substitute for the live provider evidence.

## Personal replay exposed an output protocol failure

The first reconstructed research replay made 18 paid calls across three paired trials, reporting 105,645 tokens and zero artifacts on either path. Its terminal schema errors were not retained, so their original exact cause is unavailable. A separate diagnostic reproduced a `files[].content` object where the production contract requires a string, using another 5,868 tokens. Both receipts remain under `docs/evidence/personal-research-*`; they are failed experiments, not efficiency wins.

The executor now explicitly requests string content, including JSON-encoded file text when the artifact itself is JSON. Invalid output records actionable schema paths and the next bounded repair sees that error. Validation still rejects objects and the attempt limit remains three. A successful validation clears stale protocol feedback. Two regression scenarios verify feedback-driven repair and persistent invalid-output stopping. Subsequent replay results are documented separately with the unchanged criteria and all retry charges.
