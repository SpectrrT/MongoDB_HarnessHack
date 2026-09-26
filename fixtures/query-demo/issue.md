# PERF-142: checkout-api recent orders slow down as retention grows

This is a prepared, fictional engineering incident for a live tool demonstration. All names, history, workload and records are synthetic. Measurements must come from a new run of the benchmark.

The checkout-api recent-orders endpoint for Northstar Engineering requests the latest 50 failed orders for one tenant during a 30-day window. Newest records appear first; `_id` breaks timestamp ties. Support reports that this view feels slower after retention increased from 7 to 90 days. No production latency samples are provided, so this report is a hypothesis, not a measured production regression.

Example change history:

- The original tenant detail page introduced a single-field tenant index.
- A global recent-orders page added a descending creation-time index.
- Failed-order filtering and stable newest-first pagination were added later.
- Retention grew to 90 days without an index review.

The reproduction has 40,000 orders. One busy tenant owns 20% of the rows; statuses and timestamps are deterministic, with repeated timestamps. The exact endpoint aggregation is in `pipeline.json`; the generator and existing index definitions are in `scripts/query-demo.mjs`.

Investigate the baseline execution plan and actual scans. Choose one candidate index from that evidence, explain its key order, then pass it to the runner. Verify the optimizer actually selects it and that the full ordered results match. Consider write/index-storage costs and whether a separate workload still needs each existing index. Do not change the aggregation, remove filters, increase the limit, force a hint, or claim that synthetic timing proves a production service-level objective.

Successful demo: measured before/after plan evidence, a checked result-equivalence assertion, and a concise engineering recommendation with the fixture limitations clearly stated. An ineffective index is also a valid result to report and revise.
