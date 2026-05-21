# Phase 66: Pipeline consolidation (retire triage path) — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in `66-CONTEXT.md` — this log preserves the alternatives considered.

**Date:** 2026-05-04
**Phase:** 66-pipeline-consolidation-retire-triage-path
**Mode:** `--auto` — Claude selected the recommended option for every gray area; user can revise before plan-phase.
**Areas discussed:** Rename strategy, Event taxonomy, Code deletion scope, Verification approach, Cutover sequencing

---

## Rename strategy (CONS-02)

| Option | Description | Selected |
|--------|-------------|----------|
| Big-bang rename in one PR | File + Inngest id + directory + audit strings flip in one diff. Old id stops accepting events the moment the deploy lands. | ✓ |
| Parallel-name period with deprecation marker | Keep `debtor-email-triage` registered alongside `debtor-email-coordinator` for one release; mark old with `// @deprecated`. | |
| Re-export shim | Rename file but leave `debtor-email-triage.ts` as a one-line re-export of the renamed module. | |

**Auto-selected:** Big-bang rename.
**Rationale:** Phase 65 already verified the canonical coordinator live (CORD-01..04 complete 2026-05-04). Every caller is in-repo and visible to grep. Deprecation markers are insurance against external consumers — there are none. Reduces follow-up cleanup work.

---

## Coordinator trigger event (D-03)

| Option | Description | Selected |
|--------|-------------|----------|
| Defer to research, default-assume parallel-path bug | Plan a wiring change (label-resolver emits `debtor-email/coordinator.requested`) unless research disproves the parallel-path reading. | ✓ |
| Assume already-correct, no wiring change | Trust that Phase 65 already wired Stage 2 → Stage 3 properly; Phase 66 is rename + verify only. | |
| Hard-code the wiring change without research | Skip the trace and just refactor the trigger event now. | |

**Auto-selected:** Defer to research with default-assume parallel-path.
**Rationale:** The current triage trigger `{ event: "debtor/email.received" }` (line 57) is suspicious — that's an inbound event, not a Stage-2-output event. If verdict-worker also subscribes to `debtor/email.received`, two Stage-1+ pipelines fire per email, which is exactly what CONS-01 forbids. Research must trace this end-to-end before plan-phase commits to a wiring change.

---

## Event taxonomy (CONS-03)

| Option | Description | Selected |
|--------|-------------|----------|
| Lock convention as `debtor-email/<intent>.requested`, no renames | Convention is already consistent across the codebase; Phase 66 just enforces it as the only invocation path. | ✓ |
| Rename events to a more uniform schema | E.g. `debtor-email.handler.<intent>.v1`. Adds versioning but breaks in-flight events. | |
| Add a per-handler input-schema validation step | Out of scope (Phase 69 CANO-*). | |

**Auto-selected:** Lock current convention, no event renames.
**Rationale:** Replay-unsafe to rename events while in-flight events exist on the same name. Convention is already consistent — enforcing it ≠ changing it.

---

## Code deletion scope

| Option | Description | Selected |
|--------|-------------|----------|
| Conservative: enumerate `triage/` exports, move what's imported, delete the rest | Default. Files with live importers move to `coordinator/`; orphaned files delete outright; no shims. | ✓ |
| Aggressive: delete the whole `triage/` directory and rebuild what's needed in `coordinator/` | Larger diff, more review surface, easier to drop a needed helper. | |
| Leave `triage/` files in place, just rename the Inngest function | Leaves "triage" as a name in the codebase, fails the spirit of CONS-02. | |

**Auto-selected:** Conservative move-or-delete with no shims.
**Rationale:** Matches CLAUDE.md guidance ("Avoid backwards-compatibility hacks like renaming unused _vars, re-exporting types, adding // removed comments. If you are certain that something is unused, you can delete it completely."). Git history is the audit trail.

---

## Verification approach

| Option | Description | Selected |
|--------|-------------|----------|
| Static audit + live smoke regression | grep proves zero `debtor-email-triage` literals; live smoke confirms exactly one coordinator run per email across the 4 Phase-65 regression paths. | ✓ |
| Add a runtime `pipeline_events` insert to assert single-execution | Out of scope — Phase 70 (TELE-*). | |
| Static audit only | No runtime confirmation; risks Inngest registration glitches going unnoticed. | |

**Auto-selected:** Static audit + live smoke.
**Rationale:** Reuses Phase 65's regression scaffolding (`65-regression-report.md`). Avoids scope creep into telemetry that already has a phase.

---

## Cutover sequencing

| Option | Description | Selected |
|--------|-------------|----------|
| Single PR, single deploy, no flag | Phase 65 verified the canonical flow live; the rename is mechanical. Vercel rollback is the safety net. | ✓ |
| Feature-flag the new coordinator | Adds branching to a code path about to be deleted. | |
| Two-phase deploy (rename file, ship; rename Inngest id, ship) | Doubles the deploys; doesn't reduce risk because Inngest only treats the changed id as live. | |

**Auto-selected:** Single PR, single deploy, no flag.

---

## Claude's Discretion

- Codemod tooling choice for the rename (codemod CLI, sed, manual): planner picks.
- Test file rename ordering: planner picks; both must land in the same PR.
- Whether to backfill historical `automation_runs.updated_by` strings: default no.

## Deferred Ideas

- Pipeline-events telemetry table → Phase 70 (TELE-*).
- `swarm_intents` registry generalisation → Phase 68 (SWRM-*).
- iController auto-tagging side effect → Phase 67 (TAG-*).
- Canonical handler input shape across swarms → Phase 69 (CANO-*).
- Bulk Review override UI / numeric thresholds / learning loop → Phase 71 (LERN-*).

---

*Generated by `/gsd-discuss-phase 66 --auto`. Each "Selected" mark reflects the recommended option Claude chose; user can revise `66-CONTEXT.md` directly before `/gsd-plan-phase`.*
