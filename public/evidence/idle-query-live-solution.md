Unverified draft

# Proposed Compound Index for Query-Regression Example

## Query Context
The query pipeline is:

```json
[
  {"$match":{
    "tenantId":"northstar-engineering",
    "status":"failed",
    "createdAt":{
      "$gte":{"$date":"2026-08-27T12:00:00.000Z"},
      "$lt":{"$date":"2026-09-26T12:00:00.000Z"}
    }
  }},
  {"$sort":{"createdAt":-1,"_id":-1}},
  {"$limit":50},
  {"$project":{
    "_id":1,
    "tenantId":1,
    "status":1,
    "createdAt":1,
    "service":1,
    "durationMs":1
  }}
]
```

The endpoint returns the latest 50 failed orders for one tenant over 30 days, sorted newest first by `createdAt` descending, with `_id` descending as a tie-breaker.

## Proposed Compound Index Key Document

```json
{
  "tenantId": 1,
  "status": 1,
  "createdAt": -1,
  "_id": -1
}
```

### Explanation of Key Order

- `tenantId` and `status` are equality filters in the `$match` stage, so placing them first supports efficient index filtering.
- `createdAt` is a range filter (`$gte` and `$lt`) and also the primary sort key in descending order, so it follows the equality keys and is indexed descending to match the sort.
- `_id` is the secondary sort key descending, used for tie-breaking, so it is last in the index with descending order.

This key order supports the query's filter and sort predicates, enabling the query engine to efficiently filter and return documents in the requested order without an in-memory sort.

## Tradeoffs and Considerations

- **Storage Size:** Adding `tenantId` and `status` as prefix keys increases index size but is necessary for efficient filtering.
- **Write Overhead:** The index will be updated on every insert/update/delete affecting these fields, which may add write cost.
- **Sort Efficiency:** Matching the sort order in the index (`createdAt: -1`, `_id: -1`) avoids blocking sorts and improves query latency.
- **Range Query:** The range on `createdAt` is supported by the index after equality keys, which is optimal.

## Rollout Checklist

1. **Pre-Deployment:**
   - Review index proposal with team.
   - Confirm no existing index covers this pattern.
   - Prepare monitoring for query performance and system metrics.

2. **Deployment:**
   - Create the compound index:
     ```
     db.orders.createIndex({ tenantId: 1, status: 1, createdAt: -1, _id: -1 })
     ```
   - Monitor index build progress and system load.

3. **Post-Deployment Validation:**
   - Run explain plans for the query to verify index usage.
   - Compare query results with and without the index to ensure equivalence.
   - Monitor query latency and resource consumption.

4. **Fallback Plan:**
   - If performance degrades or errors occur, drop the new index:
     ```
     db.orders.dropIndex({ tenantId: 1, status: 1, createdAt: -1, _id: -1 })
     ```
   - Revert to previous query plans.

5. **Documentation:**
   - Document the index purpose, key order rationale, and rollout steps.

## Rollback Checklist

- Identify if the new index causes regressions or issues.
- Drop the compound index.
- Confirm query performance and correctness revert to prior state.
- Notify stakeholders of rollback.

## Explain-Plan and Result-Equivalence Checks Still Needed

- Verify that the query explain plan uses the new compound index for the `$match` and `$sort` stages without blocking sorts.
- Confirm that the query results with the new index match exactly the results without the index (same documents, order, and fields).
- Check that the index does not negatively impact other queries or system performance.

---

**Note:** This proposal is unverified and based solely on the supplied query pipeline and constraints. Actual performance and correctness must be validated in a controlled environment before production rollout.