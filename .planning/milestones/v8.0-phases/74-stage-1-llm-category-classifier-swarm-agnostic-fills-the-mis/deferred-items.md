# Phase 74 — Deferred Items

## Pre-existing TypeScript errors (NOT caused by Plan 74-01)

Captured during Task 5 verification (`tsc --noEmit`). Confirmed pre-existing
by stashing Plan 74-01's mailbox edit and re-running — same 4 errors persist.

These are scope of **Plan 74-02** (event-schema extension `swarm_type` +
`entity` on `stage-0/email.received` and `classifier/screen.requested`) per
RESEARCH Open Question 1.

```
app/(dashboard)/automations/[swarm]/review/actions.ts(358,5): TS2741
  swarm_type missing on inngest.send payload (override-categorize path)
app/api/automations/debtor-email/ingest/route.ts(634,7): TS2741
  swarm_type missing on inngest.send payload (debtor ingest emit)
lib/inngest/functions/__tests__/debtor-email-coordinator.test.ts(440,48): TS2345
  null assigned where string expected
lib/inngest/functions/__tests__/debtor-email-orchestrator.test.ts(265,44): TS2345
  null assigned where string expected
```

The first two errors prove Plan 74-02's payload-shape work is needed (the
`stage-0/email.received` event already has `swarm_type` typed required, but
the emit-sites have not been updated). The latter two are unrelated test
fixture drift.

**No action in Plan 74-01.** Recorded for Plan 74-02 / Plan 74-04 to pick up.
## Pre-existing tsc errors observed during Plan 74-02 execution

Confirmed via `git stash`: these errors exist on `main` BEFORE Plan 74-02 changes. Out of scope per executor SCOPE BOUNDARY rule.

- `web/lib/inngest/functions/__tests__/debtor-email-coordinator.test.ts(440,48)` — `Argument of type 'null' is not assignable to parameter of type 'string'`
- `web/lib/inngest/functions/__tests__/debtor-email-orchestrator.test.ts(265,44)` — `Argument of type 'null' is not assignable to parameter of type 'string'`

Plan 74-02 introduced zero new tsc failures.
