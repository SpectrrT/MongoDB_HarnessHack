Unverified draft

# Evidence for Proposed Compound Index and Rollout/Rollback Checklist

## Objective and Constraints

> Draft a proposed compound index and rollout/rollback checklist for this prepared query-regression example.

> The endpoint returns the latest 50 failed orders for one tenant over 30 days, newest first with _id tie breaking.

> The fixture contains 40,000 deterministic orders.

> Pipeline:
> [
>   {"$match":{"tenantId":"northstar-engineering","status":"failed","createdAt":{"$gte":{"$date":"2026-08-27T12:00:00.000Z"},"$lt":{"$date":"2026-09-26T12:00:00.000Z"}}}},
>   {"$sort":{"createdAt":-1,"_id":-1}},
>   {"$limit":50},
>   {"$project":{"_id":1,"tenantId":1,"status":1,"createdAt":1,"service":1,"durationMs":1}}
> ]

> Produce a concrete candidate index key document, explain key order and write/storage tradeoffs, preserve the query and ordered results, and specify explain-plan/result-equivalence checks still needed.

> Work only in isolated draft files. Do not run database commands, create/drop indexes, access a real account or claim measured improvements.

> State that the proposal is unverified.

[source:fef94555a6e0f8c94606af7c]

## Hypotheses (unverified)

- Placing equality fields `tenantId` and `status` first in the index supports efficient filtering.
- Sorting fields `createdAt` and `_id` in descending order in the index matches the query's sort and avoids blocking sorts.
- The compound index `{ tenantId: 1, status: 1, createdAt: -1, _id: -1 }` will enable the query to use an index scan that satisfies both filter and sort.
- The index size and write overhead are acceptable tradeoffs given the query's frequency and importance.

## Attempted Solution

- Proposed the compound index key document as above.
- Explained the rationale for key order and tradeoffs.
- Drafted a rollout checklist including pre-deployment review, index creation, monitoring, validation, fallback, and documentation.
- Drafted a rollback checklist for safe removal if needed.
- Specified explain-plan and result-equivalence checks still needed to verify the proposal.

## Checks still needed

- Run explain plans on the query with the new index to confirm index usage and no blocking sort.
- Compare query results with and without the index to ensure exact equivalence.
- Monitor system performance and resource usage after index creation.
- Validate no negative impact on other queries or operations.

## Not executed

- No actual index creation or database commands were run.
- No performance measurements or real explain plans were obtained.
- No real environment testing or monitoring was performed.

This draft is based solely on the supplied pipeline and constraints from [source:fef94555a6e0f8c94606af7c].