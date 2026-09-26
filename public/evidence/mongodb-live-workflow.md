Unverified draft

# Orders Query Rollout and Rollback Checklist

## Baseline Metrics
- Orders query p95 latency: 180 ms
- Timeout rate: 0.6%

## Staging Checks
- Compare explain plans in staging.
- Check query shape, examined documents, and index coverage.

## Proposed Rollout Plan
1. Verify staging environment metrics align with baseline.
2. Ensure no database writes or index creations are performed.
3. Prepare for human review before any changes.

## Rollback Criteria
- If p95 latency exceeds 200 ms.
- If timeout rate exceeds 1%.

## Owner Review
- [ ] Review by: ____________________

Note: These are example metrics, not live measurements.