# Phase 110: Visibility Foundation — Bulk Review + swarm-row enrichment + ingest verify - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-03
**Phase:** 110-Visibility Foundation — Bulk Review + swarm-row enrichment + ingest verify
**Areas discussed:** Bulk Review un-gating, Swarm-row config timing, Generalization scope, Ingest verify & sugarcrm, Dry-run scope

---

## Bulk Review — row sourcing (REVIEW-01)

| Option | Description | Selected |
|--------|-------------|----------|
| Generalize hydrator | Source sales rows from `email_pipeline.emails` + `automation_runs`; no new label table; reusable seam | ✓ |
| Sales label store | New table mirroring `debtor.email_labels` + per-swarm ingest write | |
| Minimal read-only now | Thin read-only surface from `automation_runs`, defer hydration | |

**User's choice:** Generalize hydrator.
**Notes:** "as we have info-routing up and running as a swarm as well." The generalization must serve debtor + sales + info-routing uniformly — explicitly motivated by 3 swarms, not bespoke sales work.

---

## Swarm-row config timing (SWARM-01)

| Option | Description | Selected |
|--------|-------------|----------|
| Full config now, inert by guard | All columns to target values; rely on downstream null/empty guards | |
| Structural-only now, keys NULL | Only `canonical_context_shape` + `entity_brand`; resolver/agent keys NULL until 113/114 | |
| Full config + explicit dry-run flag | All columns populated now, gated behind an explicit dry-run flag | ✓ |

**User's choice:** Full config + explicit dry-run flag.
**Notes:** Columns visible/auditable but provably inert until flipped. Led to the dry-run scope question below.

---

## Generalization scope (SWARM-02)

| Option | Description | Selected |
|--------|-------------|----------|
| Generalize now (prove the seam) | Coordinator reads `swarm_type` from payload; codegen emits per-swarm files; repoint hydrate.ts | ✓ |
| Scope the gate, defer coordinator | Grep-gate targets literal sales branches only; leave coordinator debtor-specific until 113 | |
| Generalize codegen only | Codegen + hydrate.ts now; defer coordinator refactor to 113 | |

**User's choice:** Generalize now — prove the seam.
**Notes:** Flagged as highest-risk item (touches live debtor path twice). Planner must require heavy debtor regression coverage.

---

## Ingest verify — health granularity (VERIFY-01)

| Option | Description | Selected |
|--------|-------------|----------|
| Per-swarm is enough now | sales-email = 1 mailbox, existing per-swarm snapshot suffices | |
| Add per-mailbox dimension | Extend `pipeline_health_snapshots` with mailbox granularity now | ✓ |

**User's choice:** Add per-mailbox dimension.

## Ingest verify — sugarcrm rows (VERIFY-01)

| Option | Description | Selected |
|--------|-------------|----------|
| Mark dispositioned, keep | Tag legacy sugarcrm rows, retain for audit | |
| Report count only | Surface count, leave untouched | |
| Delete legacy rows | Hard-delete | |

**User's choice:** "We shouldn't have any sugar rows as Sugar was never connected."
**Notes:** Reframes the disposition clause as a zero-assertion: assert `source='sugarcrm'` count == 0; any non-zero is an anomaly. No disposition machinery.

---

## Dry-run scope (cross-cutting)

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal swarm-level flag now | Single `swarms.dry_run` flag; defer per-stage model | |
| Adopt full per-stage gating | Per-stage + per-handler registry flags, replacing the narrow debtor boolean (the v9.0 todo) | ✓ |
| Defer flag, rely on inert guards | No new flag; rely on natural inert guards | |

**User's choice:** Adopt full per-stage gating.
**Notes:** Folds the `granular-dry-run-gating-per-stage-and-handler` todo (was target v9.0). Replaces `debtor.labeling_settings.dry_run`; debtor's effective behavior must be preserved exactly (no silent flip of the live cleanup path).

---

## Claude's Discretion

- Exact `canonical_context_shape` contents for sales (derive from RFC + debtor shape).
- Physical location/layout of sales `*.generated.ts` files.
- Migration naming/splitting and registry column shape for per-stage dry-run flags.

## Deferred Ideas

- Reviewed-not-folded todos: `create-draft-idempotency-and-cleanup` (debtor handler), `debtor-review-pipeline-provenance-and-scoping` (debtor-specific), `override-note-flow-unclear` (feedback UX).
- Multi-mailbox health UX/alerting tuning (sales is single-mailbox today).
