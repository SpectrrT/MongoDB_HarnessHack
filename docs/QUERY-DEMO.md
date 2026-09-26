# Real MongoDB query investigation demo

This local reproduction runs a real `mongod` through the existing `mongodb-memory-server` dependency. It does not use the app database, network database credentials, or the scripted REM engine. The default sandbox is a new loopback-only database for each invocation, removed when the runner stops. MongoDB 8.2.6 is pinned; the helper uses its cached binary or downloads that binary on first use.

## Investigate

1. Read [the example incident](../fixtures/query-demo/issue.md), [the actual aggregation](../fixtures/query-demo/pipeline.json), and the generator/index setup in [the runner](../scripts/query-demo.mjs).
2. Run the real baseline:

   ```sh
   node scripts/query-demo.mjs --baseline
   ```

3. Inspect `baseline-explain.json` in the reported artifact directory. Compare the winning stages, index, returned documents, keys examined, and documents examined. Choose a candidate index from the equality predicates, range bounds, sort requirements and plan evidence.
4. Run `node scripts/query-demo.mjs --candidate-index '<JSON key pattern>'`, replacing the placeholder with the index you chose. Only a bounded ascending/descending key pattern over fixture fields is accepted. No candidate index is built into the script.
5. Compare the measured baseline and candidate in that invocation. Both use the same process, dataset and query. The runner asserts equality of all projected rows in order and lets MongoDB choose the plan without hints. Report whether it improved the observed scan work; do not assume the candidate wins.

Each run generates the same 40,000 synthetic documents and prints their checksum. A candidate run first measures the existing indexes, builds the supplied index, then measures again. JSON output includes five client latency samples per plan, their median, server execution statistics, index-build time, the exact query and indexes, and result checksums. `artifacts/query-demo/<run>/` in the caller’s working directory holds the full explain plans, query results and report. Pass `--output <directory>` to choose a different artifact root; repository verification uses `--output .data/query-demo` because `.data/` is already ignored by Git. `ephemeralMongoStopped: true` is printed only after shutdown completes. A failure exits nonzero and reports the error rather than substituting simulated results.

## Interpreting the result

This is a fresh synthetic fixture, not production p95 or a cold-cache benchmark. Seeding warms caches, each plan is queried five times, and building an index also affects cache state. The two plans run sequentially with no concurrent writes or network contention. Scan counts and the winning plan provide the strongest demonstration evidence; small timing differences need repeated, controlled testing. Production rollout would need representative traffic, index storage/write-cost review, and a separate deployment decision.

The incident history is prepared context. Every number in the result must come from the current tool run. Keep failed candidates and their evidence visible; do not replace observations with canned success claims.

## Prepared copy for managed chat workspaces

Run `node scripts/prepare-query-demo.mjs` from the installation once. It copies this runbook, the incident, aggregation and runner into `~/.offload/demos/query-regression`, with a link to the installation’s existing dependencies. The exported `prepareQueryDemo()` function supports application startup. The prepared copy is marked as owned demo content; preparation refuses an unrelated directory or dependency link.

From any working directory, read this runbook in that prepared folder and run `node ~/.offload/demos/query-regression/scripts/query-demo.mjs --baseline`. For the comparison, use the same absolute script path with `--candidate-index` and your chosen JSON. The runner resolves fixtures relative to itself and writes reports into the caller’s artifact folder.
