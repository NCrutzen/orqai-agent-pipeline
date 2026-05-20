# Phase 88: Review-surface cleanup — Context

**Gathered:** 2026-05-20
**Status:** Ready for research → planning
**Source:** Operator UAT on the unified `_shell/` (v8.1 milestone)
**Scope:** Pure frontend. No pipeline, no server actions beyond what Phase 82.6 already wired, no Inngest, no schema changes. Hard-separation rule (Stage 1 ↔ `swarm_noise_categories`, Stage 3 ↔ `swarm_intents`) preserved automatically — none of these touches dispatch logic.

---

## Phase boundary (locked by ROADMAP)

Three operator-confusion items on the unified `web/app/(dashboard)/automations/[swarm]/_shell/`:

- **D-01** — Override + note flow consolidation on Stages 0/2/3
- **D-02** — Stage 1 "Needs review" chip semantics + verdict-based filter
- **D-03** — Stage 4 layout parity with Stage 1/2/3 chip-strip pattern + detail-pane width regression fix

Independent of Phases 83–87. Can ship in its own deploy window.

---

## D-01 — Override + note flow consolidation (Stages 0/2/3)

### Current state (verified in code, 2026-05-20)

- `_shell/detail-pane.tsx` lines 420–486: Stage 0 has a real `Stage0Widget`; Stage 1 has the mature `Stage1Widget` (ported in Phase 82.1 Plan 04); Stage 2 still renders the placeholder div `Stage 2 customer override — wired in Plan 06.`; Stage 3 has `Stage3Widget` but its `onChange` is a stub `() => { /* Plan 06 */ }`; Stage 4 renders a placeholder.
- "Plan 06" of Phase 82.6 never actually wired S2/S3 widgets despite the comments — they are still placeholders on the live shell.
- 82.7 Plan 02 added the per-stage cancel-override link + footer secondary "Cancel override" button (D-03 of 82.7), but only Stage 1 has the override widget to attach it to.

### Decisions

**D-01a (shape):** Wire S2/S3 widgets reusing Stage 1's pattern verbatim. **No shared `StageOverrideWidget` primitive in this phase.** Three near-copies (S0 keeps its existing widget; S2 gets customer-search picker; S3 gets intent picker) — minimal abstraction. Defer the shared-primitive extraction to a later phase if a fourth surface forces parity.

**D-01b (note vs override):** **Fuse them.** Clicking `override stage` exposes the note textarea inline alongside the axis picker. Submit writes both atomically. The standalone `StageFeedbackPanel` note input (visible in the audit expander today) is no longer the primary entry point for notes attached to an override — operators leaving notes without overriding can still use the audit-expander path, but the override flow stops scattering controls.

**D-01c (cancel-override escape hatch):** **Yes, on every overrideable stage** (S0, S2, S3, matching the Stage 1 implementation). Per-stage `cancel override` link + footer secondary `Cancel override` button. Reuses the `resetStageFeedback(n)` / `resetAllStageFeedback()` helpers added by Phase 82.7 Plan 02.

### Notes for researcher / planner

- Researcher: enumerate every place a Stage 2 customer-search picker (label-resolver overrides) already exists in the codebase — there may be an older surface to port from. Stage 3 intent picker exists in `Stage3Widget` already; only the `onChange` wiring is missing.
- Planner: the fused note+override form is the only meaningfully new UI primitive. Likely a small composable that wraps `Stage{N}Widget` + a textarea + the existing submit handler. Don't generalize until it's needed three places.

---

## D-02 — Stage 1 chip semantics + verdict-based filter

### Current state

- `stage-1/noise-category-chip-strip.tsx:107`: the leftmost chip is `{ key: "all", label: "Needs review", count: needsReviewCount }`. `needsReviewCount` sums all rows where `topic !== "skip"` (lines 83–93). The count is **not** verdict-based — it includes auto-handled rows the operator has no reason to look at.
- `_shell/needs-action-chip.tsx`: a separate toggle `?needs_action=1` lives elsewhere in the strip ("Needs action"). Conceptually the same axis as "have I seen this yet" but implemented as a toggle rather than a chip.

### Decisions

**D-02a + D-02b synthesis (one verdict filter, not two):**

- **Keep the chip label "Needs review"** in the leftmost slot but change its semantics: the **count becomes verdict-based** (rows lacking an operator verdict for stage 1).
- **Remove the "Needs action" toggle entirely** — its job is now done by the re-counted "Needs review" chip. One axis, one control.
- The chip still functions as the category-filter reset (clears `?topic` / `?sub`) when clicked — that URL behavior is unchanged. Only its count and its meaning shift.

**D-02c (default selection):** **"Needs review" (verdict-based) is the default chip on Stage 1 landing.** Operators land on rows that need their input. The current "All categories visible" behavior is one click away (the chip click still clears filters — same URL effect — but the count badge now reflects verdict-pending rows). If the verdict-pending set proves too small in practice (e.g. empty after a heavy batch), revisit in a follow-up phase.

**D-02d (data source — DEFERRED to researcher):**

> **Open question for `gsd-phase-researcher`:**
> What is the canonical signal for "row has no operator verdict yet at Stage 1"?
> Candidates: (a) absence of a row in `feedback_reviews` for `(email_id, stage=1)`; (b) `classifier_queue.status='predicted'` AND no operator audit row exists; (c) something else the schema supports.
> Read the live schema + the `classifier_queue_counts` RPC and propose the cheapest accurate count. The planner will lock the answer in PLAN.md.

### Notes for researcher / planner

- The count RPC change (whatever the source is) likely needs a new column or a parallel count surfaced through `QueueCountRow` → `noise-category-chip-strip.tsx`.
- Verify: does removing `?needs_action=1` from the URL contract break any saved-link surface (kanban, deeplinks)? Search for callers.
- Tests: `noise-category-chip-strip.test.tsx` will need its `needsReviewCount` assertion rewritten; the "Needs action toggle" component + its test file get deleted.

---

## D-03 — Stage 4 layout parity + detail-pane width regression

### Current state

- `stage-4/client-shell.tsx`: three `Collapsible` sections — **Handler error** (red, default-open), **Needs review** (amber, collapsed), **Auto-archived** (lime, collapsed). Filed under Phase 82.8 Plan 05. This is the only stage in the unified shell that doesn't use the chip-strip pattern.
- Detail-pane width: no obvious `maxWidth` regression spotted in a quick grep; operator hasn't pinpointed which stage(s) shrunk.

### Decisions

**D-03a (layout shape):** **Replace collapsibles with a chip-strip whose chips group by *outcome state*, NOT per-handler.** Specifically:

- The strip dimension is the outcome bucket (the current section names: Handler error / Needs review / Auto-archived), giving 3–5 chips that map to operator-facing pipeline outcomes — not 1 chip per handler name.
- Reason this is locked, not deferred: Auto-Archived is itself a handler-output bucket. If we keyed chips on handler name, hitting 10 handlers would yield 10+ chips and a chip-strip UX nightmare. The bucket-level chip count is bounded by outcome states, which grows much slower.

**D-03b (chip granularity — DEFERRED to planner with constraint):**

> **Open question for `gsd-planner`:**
> Exact chip set on Stage 4. Locked constraint from D-03a: chips group by outcome state, not handler name. Choose between (a) the existing 3 section names as-is, (b) outcome states refined by inspecting `stage_4` event data + `pipeline_events.stage=4` row distribution, (c) outcome states + a secondary handler filter only when handler-error volume warrants it.
> Phase-researcher inspects volumes; planner picks.

**D-03c (detail-pane width regression):** Operator hasn't pinpointed the regression.

> **Open question for `gsd-phase-researcher`:**
> Reproduce the detail-pane width across Stage 1 / Stage 2 / Stage 3 / Stage 4 in a dev browser. Capture pane widths per stage. Diff against the pre-Phase 82.8 baseline (commit before Plan 05 of 82.8 landed). Report which stage(s) regressed and what CSS/layout change introduced the shrink. Planner adds a fix task scoped to whatever the researcher finds.

### Notes for researcher / planner

- The `Collapsible` + `CollapsibleTrigger` imports in `stage-4/client-shell.tsx` can drop after the chip-strip swap unless retained elsewhere on the surface.
- `RowList` already supports the chip-strip filter URL contract from Stage 1/2/3 — reuse, don't fork.
- `selectedId` semantics on Stage 4 are tricky: today the auto-archived section uses `pipeline_events.id` as the row id while handler-error uses `KanbanRow.id`. The chip-strip swap must preserve the existing `selectedId` cross-section model (a single id spanning chips), not break it into per-chip selection state.

---

## Cross-cutting

- **No new server actions, no new RPC writes.** D-02 may require a count-RPC refactor (read-only). D-03 may require a count refactor for the chip-strip counts. Everything else is React.
- **Touched files (expected):**
  - `_shell/detail-pane.tsx` (S2/S3 widget wire-up, fused note+override, cancel-override extension to S0/S2/S3)
  - `_shell/components/stage-{2,3}-widget.tsx` (new files)
  - `stage-1/noise-category-chip-strip.tsx` (count change)
  - `_shell/needs-action-chip.tsx` (deletion candidate)
  - `stage-4/client-shell.tsx` (collapsibles → chip-strip)
  - `_shell/_lib/audit-types.ts` if the audit-row signal feeds D-02d
- **Test surface:** unit tests live next to each component (`__tests__/`). Chip-strip semantic changes need test updates; the deletion of `needs-action-chip` removes its test file.

---

## Deferred (out of scope for Phase 88)

- Shared `StageOverrideWidget` primitive abstraction (D-01a). Revisit after a fourth override surface appears.
- Standalone "leave note without overriding" UX rework (D-01b). The audit-expander path remains for now.
- Per-handler chip granularity on Stage 4 (D-03b). Constraint is locked; if handler-error volume forces it later, ship as a follow-up.
- Verdict-pending count on stages other than Stage 1 (D-02 scope is Stage 1 only).

---

## Open questions parked for downstream agents

1. **D-02d → researcher:** canonical "no verdict yet" signal at Stage 1.
2. **D-03b → planner:** exact Stage 4 chip set (with locked constraint: outcome-state, not per-handler).
3. **D-03c → researcher:** detail-pane width regression — reproduce, locate, scope the fix.

## Next steps

```
/gsd:plan-phase 88
```

Planner will spawn `gsd-phase-researcher` to resolve the three open questions above, then write PLAN.md across the D-01 / D-02 / D-03 work in 3–4 waves.
