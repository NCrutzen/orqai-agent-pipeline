# Phase 112: Outlook Cleanup + Backfill - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-03
**Phase:** 112-outlook-cleanup-backfill-gated-production-writes
**Areas discussed:** Go-live flip & rollout safety, Archive mechanism, Backfill auto-vs-approval split, Backfill scope + idempotency

---

## Go-live flip & rollout safety

| Option | Description | Selected |
|--------|-------------|----------|
| Canary then operator-gated full flip | Flip for a capped canary, human checkpoint, then operator approves full flip | ✓ |
| Hard operator checkpoint, then full live | Single checkpoint then flip outright, no canary | |
| Shadow window first, then flip | K-day shadow log, review, then flip | |

| Option | Description | Selected |
|--------|-------------|----------|
| Migration, applied at the checkpoint | stage_1_archive=false flip as audited migration, MCP-applied at go-live | ✓ |
| Operator action, documented runbook | Operator flips outside phase code | |

**User's choice:** Canary → operator-gated full flip; flip delivered as migration applied at the checkpoint.

---

## Archive mechanism: inline vs cleanup worker

| Option | Description | Selected |
|--------|-------------|----------|
| Use the existing inline path (just flip the flag) | Reuse the WR-01-gated verdict-worker archive; no new worker for live mail | ✓ |
| Add a distinct side-effect cleanup worker | Mirror debtor's iController side-effect pattern | |

| Option | Description | Selected |
|--------|-------------|----------|
| Outlook archive only — no second system | verkoop mailbox is the only system touched | ✓ |
| Outlook archive + a sales-specific cleanup | Second system/action added | |

**User's choice:** Reuse inline path (flag-flip only); Outlook archive only. Reconciles CLEANUP-01 wording — only new worker is the backfill.

---

## Backfill auto-vs-approval split

| Option | Description | Selected |
|--------|-------------|----------|
| Inherited AP keys + the 3 flipped safe keys | Auto = everything at categorize_archive; else → Bulk Review | ✓ |
| Only promoted llm:*:high + AP keys | Stricter; flipped safe keys wait for organic promotion | |
| Only the 8 inherited AP keys | All core categories → approval in backfill | |

| Option | Description | Selected |
|--------|-------------|----------|
| Excluded from auto; route matches to approval | loopback surfaced in Bulk Review | |
| Excluded from auto AND from the backfill entirely | loopback skipped completely | ✓ |

**User's choice:** Auto = 7 non-loopback AP keys + 3 flipped safe keys; everything else → Bulk Review; loopback skipped entirely.

---

## Backfill scope + idempotency

| Option | Description | Selected |
|--------|-------------|----------|
| Live verkoop@smeba.nl Outlook only | Only the live-ingested mailbox set | |
| Live verkoop + any Outlook-present historic | Also historic rows with a real Outlook message (internet_message_id join) | ✓ |

| Option | Description | Selected |
|--------|-------------|----------|
| pipeline_events one-per-stage-email + Graph already-archived | Ledger + Graph no-op, double protection | ✓ |
| Per-email archived marker column | Dedicated marker, needs migration | |
| Graph already-archived state only | No ledger | |

**User's choice:** Live verkoop + Outlook-present historic (internet_message_id join); idempotency = pipeline_events ledger + Graph already-archived no-op.

---

## Claude's Discretion
- Canary size N; batch size + Graph throttle/rate-limit handling + resumability; Bulk Review approval action shape; optional backfill dry-run report mode before the live canary.

## Deferred Ideas
- Rollback/undo of a bad backfill batch (rely on canary + idempotency + approval-for-ambiguous instead).
- Archiving pure SugarCRM records with no live Outlook message (Phase 115).
