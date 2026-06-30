# Requirements: V9.8 Run-Mode & Gating Redesign — Governance Rail

**Milestone:** V9.8 — Run-Mode & Gating Redesign (Governance Rail)
**Defined:** 2026-06-25
**Core Value:** Acting on real systems is safe and auditable — every swarm/mailbox sits on an explicit shadow→dry→live rail, derived from granular per-stage + per-handler state, never a drifting mode enum.
**Source of truth:** `.planning/briefs/run-mode-gating-redesign.md` (decisions locked 2026-06-18).

Scope: replace the coarse, scattered dry-run flags with a 3-layer governance model (L1 per-mailbox lifecycle · L2 per-stage enablement · L3 per-handler tri-state), normalize all 4 swarms, surface the model in the review UI + a control UI, and add per-handler dry-capture. Phase band **135+** (after V9.7's 130–134). This is the trust-ramp prerequisite for V10.5 Order Entry.

---

## v1 Requirements

### Gating Model (P1)

The storage/derivation core. The mailbox "mode" is *derived* from these layers — no parallel `mode` enum.

- [ ] **MODEL-01**: Each pipeline stage (0–4) has an independent enabled/disabled state per swarm.
- [x] **MODEL-02**: Each handler has an independent `off | dry | live` state per swarm.
- [x] **MODEL-03**: The per-mailbox lifecycle state (Shadow → Dry-run → Live) is *derived* from the per-stage + per-handler flags, with no separately-stored mode enum that can drift.
- [x] **MODEL-04**: A handler can never be `live` while its trigger-stage is not live — the invariant is enforced (rejected at write time and/or surfaced as a violation).
- [x] **MODEL-05**: A mailbox newly added to a swarm defaults to **Shadow** (data collected, visible only in the internal Bulk Review surface, not yet to operator/end-user).

### Migration & Normalization (P1)

- [ ] **MIGRATE-01**: The new storage shape supersedes `swarms.dry_run_config`, the two per-mailbox `dry_run` booleans (`debtor.labeling_settings.dry_run`, `public.info_routing_mailbox_settings.dry_run`), and `debtor.email_labels.status` as the source of gating truth.
- [x] **MIGRATE-02**: Pipeline workers continue to gate correctly across the cutover — no behavior change at migration time; the existing gate reads the new shape.
- [x] **MIGRATE-03**: All 4 swarms (sales, debtor, info-routing, support-tickets) are normalized to their intended per-stage + per-handler state under the new model — including debtor iController noise-delete governed explicitly via the per-handler tri-state, not an implicit always-live flag.

### Review Surface (P1)

- [ ] **REVIEW-01**: The Bulk Review row renderer shows each row's mode (Shadow / Dry / Live), derived from the layers (the "Auto-applied" badge is replaced/extended to add Shadow).
- [ ] **REVIEW-02**: Each row carries the dry-run provenance captured **at emit time** (survives later flips), so the operator can tell a row was dry when its decision actually happened.
- [ ] **REVIEW-03**: The mode-filter strip derives mode from the layers and includes a **Shadow** filter option.

### Documentation (P1)

- [ ] **DOC-01**: A canonical run-mode/gating matrix doc lands in `docs/agentic-pipeline/` — the 3-layer model, derive rules, the trigger-stage invariant, and the current per-swarm state (today this mapping lives only in `dry-run-gate/index.ts` comments).

### Per-Handler Dry-Capture (P2)

`dry` = simulate the side-effect + capture evidence, instead of acting.

- [ ] **CAPTURE-01**: The iController delete handler in `dry` does not delete and captures screenshots evidencing which email it would have actioned, for operator verification.
- [ ] **CAPTURE-02**: The reply-agent handler in `dry` writes its response to a **draft** instead of sending.
- [ ] **CAPTURE-03**: Captured dry-run evidence is surfaced to the operator from the relevant review/audit surface.

### Control / Visibility UI (P3)

- [ ] **CONTROL-01**: The operator can view, per email address, the exact per-stage enablement and per-handler `off|dry|live` state.
- [ ] **CONTROL-02**: The operator can change per-stage enablement and per-handler `off|dry|live` for a mailbox from the UI, with the trigger-stage invariant enforced in the surface.

## Future Requirements (deferred)

- **Full per-mailbox config** — per-stage/per-handler *config* stays per-swarm this milestone; only the lifecycle is per-mailbox. Full per-mailbox override config deferred (brief decision).
- **Per-gate promotion criteria** — each gate having its own auto-promote threshold (cleanup n=20, labeling n=50, handler n=100) folds into the V10.0 learning loop, not here.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Backfill historical rows with origin dry-run state | `decision_details` didn't carry it before this milestone — provenance is forward-only |
| Kill-switch for always-live stages (0, 1-classifier, 2, 3-classifier) | Runaway-classifier pause is a different mechanism (feature flag), not the gating model |
| Auto-promotion / auto-flip logic | V10.0 learning-loop territory; V9.8 ships the rail, not the promoter |
| verkoop@→order@ routing act | Deferred out of V9.7 to *after* this rail; a sales-routing iteration, not part of the rail itself |

## Traceability

Every v1 requirement maps to exactly one phase. Roadmap created 2026-06-25 (phases 135–138, coarse granularity; P1 split into 135 spine + 136 surface).

| Requirement | Phase | Status |
|-------------|-------|--------|
| MODEL-01 | Phase 135 | Pending |
| MODEL-02 | Phase 135 | Complete |
| MODEL-03 | Phase 135 | Complete |
| MODEL-04 | Phase 135 | Complete |
| MODEL-05 | Phase 135 | Complete |
| MIGRATE-01 | Phase 135 | Pending |
| MIGRATE-02 | Phase 135 | Complete |
| MIGRATE-03 | Phase 135 | Complete |
| REVIEW-01 | Phase 136 | Pending |
| REVIEW-02 | Phase 136 | Pending |
| REVIEW-03 | Phase 136 | Pending |
| DOC-01 | Phase 136 | Pending |
| CAPTURE-01 | Phase 137 | Pending |
| CAPTURE-02 | Phase 137 | Pending |
| CAPTURE-03 | Phase 137 | Pending |
| CONTROL-01 | Phase 138 | Pending |
| CONTROL-02 | Phase 138 | Pending |

**Coverage:**

- v1 requirements: 17 total
- Mapped to phases: 17 ✓
- Unmapped: 0

**Per-phase coverage:**

- Phase 135 (P1a — model + storage + migration + 4-swarm normalization): MODEL-01..05, MIGRATE-01..03 (8)
- Phase 136 (P1b — review renderers + matrix doc): REVIEW-01..03, DOC-01 (4)
- Phase 137 (P2 — per-handler dry-capture): CAPTURE-01..03 (3)
- Phase 138 (P3 — per-email control UI): CONTROL-01..02 (2)

---
*Requirements defined: 2026-06-25*
*Last updated: 2026-06-25 after roadmap creation (phases 135–138 mapped; 17/17 covered)*
