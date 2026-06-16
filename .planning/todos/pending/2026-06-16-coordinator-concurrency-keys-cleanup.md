# Stage-3 coordinator: clean up always-undefined concurrency keys

**Created:** 2026-06-16
**Source:** debug session `sales-pipeline-funnel-stall` (handoff-resilience fix PR)

## Problem

`debtor-email-coordinator` (`web/lib/inngest/functions/debtor-email-coordinator.ts` ~:84-87) declares:

```ts
concurrency: [
  { key: "event.data.entity", limit: 4 },
  { key: "event.data.run_id", limit: 1 },
],
```

But the sales Stage-2 producer's `pipeline/coordinator.requested` payload
(`stage-2-customer-resolver.ts` ~:472-488) carries **no `run_id`** and
`entity: null`. So for sales both concurrency keys evaluate to undefined/null →
all sales coordinator events likely collapse into a single bucket
(`run_id` limit 1 → effectively serialized; `entity` null → one limit-4 bucket).

This is **latent throughput limitation**, NOT the funnel-drop cause (that was
retries:0 + uncaught throws, fixed separately). Left untouched in the
resilience PR to keep scope tight.

## Desired fix

- Either thread a real `run_id` into the sales coordinator event payload so the
  `event.data.run_id` concurrency key partitions per-email, or drop the
  `run_id` key entirely if per-email serialization isn't intended.
- Re-evaluate the `event.data.entity` limit-4 bucket for sales (entity is null);
  decide the intended concurrency model for the sales swarm.
- Verify against Inngest's documented behavior for null/undefined concurrency
  key expressions (does it bucket-as-empty-string or skip the key?).

## Notes
- Throughput only — no correctness impact once the resilience fix lands.
