# Real MongoDB query investigation demo

This local reproduction runs a real `mongod` through the existing `mongodb-memory-server` dependency. It does not use the app database, network database credentials, or the scripted REM engine. The default sandbox is a new loopback-only database for each invocation, removed when the runner stops. MongoDB 8.2.6 is pinned; the helper uses its cached binary or downloads that binary on first use.

## Investigate

Run both commands from the conversation’s working directory and explicitly pass `--output ./artifacts/query-demo`. Keep that directory as your current directory; use the prepared script’s absolute path. Do not write reports to a hidden folder or change into the prepared demo folder.

1. Read [the example incident](../fixtures/query-demo/issue.md), [the actual aggregation](../fixtures/query-demo/pipeline.json), and the generator/index setup in [the runner](../scripts/query-demo.mjs).
2. Run the real baseline:

   ```sh
   node ~/.offload/demos/query-regression/scripts/query-demo.mjs --baseline --output ./artifacts/query-demo
   ```

3. Inspect `baseline-explain.json` in the reported artifact directory. Compare the winning stages, index, returned documents, keys examined, and documents examined. Choose a candidate index from the equality predicates, range bounds, sort requirements and plan evidence.
4. Run `node ~/.offload/demos/query-regression/scripts/query-demo.mjs --candidate-index '<JSON key pattern>' --output ./artifacts/query-demo`, replacing the placeholder with the index you chose. Only a bounded ascending/descending key pattern over fixture fields is accepted. No candidate index is built into the script.
5. Compare the measured baseline and candidate in that invocation. Both use the same process, dataset and query. The runner asserts equality of all projected rows in order and lets MongoDB choose the plan without hints. Report whether it improved the observed scan work; do not assume the candidate wins.

Each run generates the same 40,000 synthetic documents and prints their checksum. A candidate run first measures the existing indexes, builds the supplied index, then measures again. JSON output includes five client latency samples per plan, their median, server execution statistics, index-build time, the exact query and indexes, and result checksums. `artifacts/query-demo/<run>/` in the caller’s working directory holds the full explain plans, query results and report. Use the explicit `--output ./artifacts/query-demo` argument on both runs so the chat can expose the raw reports as downloads. `ephemeralMongoStopped: true` is printed only after shutdown completes. A failure exits nonzero and reports the error rather than substituting simulated results.

## Interpreting the result

This is a fresh synthetic fixture, not production p95 or a cold-cache benchmark. Seeding warms caches, each plan is queried five times, and building an index also affects cache state. The two plans run sequentially with no concurrent writes or network contention. Scan counts and the winning plan provide the strongest demonstration evidence; small timing differences need repeated, controlled testing. Production rollout would need representative traffic, index storage/write-cost review, and a separate deployment decision.

The incident history is prepared context. Every number in the result must come from the current tool run. Keep failed candidates and their evidence visible; do not replace observations with canned success claims.

## Prepared copy for managed chat workspaces

Run `node scripts/prepare-query-demo.mjs` from the installation once. It copies this runbook, the incident, aggregation and runner into `~/.offload/demos/query-regression`, with a link to the installation’s existing dependencies. The exported `prepareQueryDemo()` function supports application startup. The prepared copy is marked as owned demo content; preparation refuses an unrelated directory or dependency link.

From any working directory, read this runbook in that prepared folder and run `node ~/.offload/demos/query-regression/scripts/query-demo.mjs --baseline --output ./artifacts/query-demo`. For the comparison, use the same absolute script path with `--candidate-index`, your chosen JSON, and `--output ./artifacts/query-demo`. The runner resolves fixtures relative to itself and writes reports into the caller’s artifact folder.

## Deliver the files

Verify the generated files by reading their contents and checking the report’s results. A managed chat folder may not be a Git repository. Do not run `git status` or initialize Git just to finish this investigation.

Link each actual raw file individually in the final response: `report.json`, `baseline-explain.json`, `candidate-explain.json`, `baseline-results.json`, and `candidate-results.json`, plus your investigation notes. Use full absolute paths to the files inside the conversation’s `artifacts/query-demo/<run>/` folder. A manifest or prose summary alone does not deliver the underlying evidence. Only link files the run actually produced; a baseline-only run has no candidate files.
