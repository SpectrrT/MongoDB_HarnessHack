# Selector transport experiment, registered September 26, 2026

Problem: the two paced Astra trials consumed 61,790 Offload tokens versus 53,388 reference tokens. Selection alone consumed 40,506 tokens. The reference and Offload each passed 24/24 exact checks.

Candidate v10 changes transport representation only: ordered record arrays, lossless dictionary/repeat tuples, numeric question keys and one shared question mapping. The retention policy, protected records, uncertainty handling, threshold, budget, original archive text and cache invalidation remain unchanged. Policy version changes invalidate earlier decisions.

Before answer trials, run one selector development probe over all twelve existing stages plus three general probes for reference resolution, source prompt injection and repeated text with a correction. Preserve the complete receipt even on failure. All required records and restart checks must pass before treating this candidate as ready for paired trials.

Then run exactly three paired Astra trials and three paired Opus 5.5 trials, sequentially, with 3,500 ms answer-request spacing. Use unchanged goals, expected answers, tool schemas, answer prompts, context budget, reasoning effort, per-call token limits and four-call ceiling. Count all selector, answer and retrieval tokens. Retain every outcome and infrastructure failure; do not stop on a favorable result. This is development validation on known synthetic tasks, not an independent general reasoning evaluation. Show per-run results and aggregate all trials of each version separately. Earlier v9 results remain published.

If the selector preflight fails, stop this candidate's answer trials, preserve the failure and register the next candidate before testing it.

## v10 rejection and v11 repair, before further calls

v10 received HTTP 400: the service requires either criteria or instructions per question, even though its OpenAPI marks both optional. Twelve rejected requests are retained in selector-v10-probe.json; usage was absent, so no zero-cost claim is made. No answer-model trials ran with v10.

v11 adds the minimal per-question instruction "Retain?" and retains the explicit shared mapping from each numeric question to its record. The same preflight and fixed three-per-model answer-trial plan now apply to v11. No task, threshold or expected answer changed.

## v11 rejection and v12 repair, before further calls

v11 used fewer selector tokens but failed the context budget: generic per-question "Retain?" instructions did not reliably associate decisions with their candidate records. All fifteen requests and conservative retention failures remain in selector-v11-probe.json. No answer trials ran with v11.

v12 keeps the compact lossless wire but makes each question explicitly identify records[i] and retentionPolicy. The same complete preflight and three paired trials per model apply. No quality check is weakened.

## v12 rejection and v13 alternative, before further calls

v12 still over-retained enough irrelevant records to exceed the unchanged budget. All fifteen calls remain in selector-v12-probe.json; no answer trials ran. The compact numeric-array transport is rejected, not shipped.

v13 returns to the original proven record format and question language. It groups candidates only when the same exact repeated block dominates at least 75% of each record. One OR question checks whether any member needs retention; every member's unique text remains in the request, and a relevant or uncertain group retains all members. Source text, order and archives are unchanged. Independent records and different repeated blocks remain separate. This reduces duplicate questions rather than dropping information.

Preflight adds two mixed-group checks: a relevant fact in the last member of an otherwise irrelevant repeated group, and an embedded instruction to drop a relevant first member. Both relevant members must score above the unchanged threshold. Existing stage requirements, restart checks and the fixed three paired trials per model remain unchanged.

## v13 result and v14 final transport adjustment, before further calls

v13 passed all twelve stage retention/restart checks and all five general probes. The full receipt includes 19,129 selector tokens, of which 2,954 were additional probes. The twelve-stage selector subtotal is 16,175 tokens versus 20,253 previously, near the threshold needed to erase Astra's overhead.

v14 removes only the redundant segments object wrapper inside each explicitly numbered record. Segment order, exact repeated text, dictionary names, numbered records, grouping and retention questions remain unchanged. It uses an explicit shared description of the segment array. Run the same preflight, then the previously fixed three paired trials per model if it passes. Both earlier and current results remain visible.

During the first paired run, a separate empty-record unit probe found that grouping could read .length from undefined. The guard now treats empty records as ungrouped. The frozen benchmark contains no empty records, so this does not change any request or decision for these trials. Receipts retain the actual file hashes for each run. The regression test covers the previously failing input.
