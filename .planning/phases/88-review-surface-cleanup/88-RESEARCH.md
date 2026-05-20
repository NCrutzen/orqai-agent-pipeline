# Phase 88: Review-surface cleanup — Research

**Researched:** 2026-05-20
**Domain:** Next.js (App Router) frontend — unified `_shell/` review surface
**Confidence:** HIGH on Q1, MEDIUM on Q2, MEDIUM-LOW on Q3
**Scope:** Pure frontend. No pipeline dispatch, no Inngest, no schema writes. Hard-separation (`swarm_noise_categories` ↔ Stage 1, `swarm_intents` ↔ Stage 3) preserved by the existing `UnifiedDetailPane` typed-prop split (`categories` vs `intents`) — Phase 88 never touches that.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01a (shape):** Wire S2/S3 widgets reusing Stage 1's pattern verbatim. **No shared `StageOverrideWidget` primitive in this phase.** Three near-copies (S0 keeps its existing widget; S2 gets customer-search picker; S3 gets intent picker) — minimal abstraction.

**D-01b (note vs override):** **Fuse them.** Clicking `override stage` exposes the note textarea inline alongside the axis picker. Submit writes both atomically. Standalone `StageFeedbackPanel` note input remains for "leave note without overriding" via audit-expander path.

**D-01c (cancel-override escape hatch):** **Yes, on every overrideable stage** (S0, S2, S3, matching Stage 1). Per-stage `cancel override` link + footer secondary `Cancel override` button. Reuses `resetStageFeedback(n)` / `resetAllStageFeedback()` from Phase 82.7 Plan 02.

**D-02a + D-02b (one verdict filter, not two):**
- **Keep the chip label "Needs review"** in the leftmost slot; **count becomes verdict-based** (rows lacking an operator verdict for stage 1).
- **Remove the "Needs action" toggle entirely.**
- Chip still clears `?topic` / `?sub` on click — URL behaviour unchanged.

**D-02c (default):** **"Needs review" (verdict-based) is the default chip on Stage 1 landing.**

**D-03a (Stage 4 layout):** **Replace collapsibles with a chip-strip whose chips group by outcome state, NOT per-handler.** Reason: handler-name chips would balloon to 10+ as handlers ship; outcome-state count is bounded.

### Claude's Discretion

- **D-02d (data source for "no verdict yet"):** researcher recommends cheapest accurate signal. → Resolved in Q1 below.
- **D-03b (exact Stage 4 chip set):** planner picks; researcher inspects volumes. → Q2 below.
- **D-03c (detail-pane width regression):** researcher reproduces and locates; planner adds the fix task. → Q3 below.

### Deferred Ideas (OUT OF SCOPE)

- Shared `StageOverrideWidget` primitive abstraction.
- Standalone "leave note without overriding" UX rework.
- Per-handler chip granularity on Stage 4.
- Verdict-pending count on stages other than Stage 1.
</user_constraints>

---

## Summary

Phase 88 lands three pure-frontend cleanups on the unified `_shell/`. Everything needed already exists in code; the work is mostly **wire-up + relabel + layout swap**, not new primitives.

- **D-01:** Both `Stage2Widget` and `Stage3Widget` are already implemented in `stage-1/components/`. Detail-pane currently renders placeholder divs (`detail-pane.tsx:449-485`) and stub `onChange` (line 467). Wire-up follows the Stage 1 pattern verbatim — `_shell/components/stage-1-widget.tsx` is the canonical template. Cancel-override hook helpers (`resetAllStageFeedback`, `onCancelDirty`, `onSubmitDirty`) already exist on `DetailPaneInner` (lines 333-354) and only need to be exercised by the new S2/S3 wrappers. Inline note textarea pattern already exists inside `Stage1Widget` (lines 302-353).
- **D-02:** `email_feedback` is the canonical table — there is **no `feedback_reviews` table**. Q1 recommends adding a new RPC (or extending `classifier_queue_counts`) that LEFT JOINs `automation_runs` against `email_feedback WHERE stage=1`. Delete `_shell/needs-action-chip.tsx` (the `NeedsActionChip` half — `MineOnlyChip` stays) and remove `?needs_action=1` from Stages 0/1/2/3 wrappers.
- **D-03:** Stage 4 collapsibles → chip-strip is a `_shell/chip-strip.tsx` reuse. The "outcome state" bucketing is bounded by what `stage-4/page.tsx` already filters on: `result.kanban_reason === 'handler_error' | 'handler_needs_review'` plus `pipeline_events.decision === 'auto_archived_noise'` — three states today, matching the existing section names. Width regression: see Q3 — confidence LOW that there is a CSS-level regression; the grid template `minmax(640px, 1fr) 540px` is identical across Stages 0/1/2/3/4. The likely "regression" is structural (Stage 4 wraps the pane in a `position: sticky` div with `minHeight: 320`, not a width change).

**Primary recommendation:** Plans should target three independent waves keyed to D-01 / D-02 / D-03. None depends on the others. Q3 fix-task should be deferred to in-browser reproduction with the operator — research alone cannot localise it.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|--------------|----------------|-----------|
| Override + note submission (S0/S2/S3) | Browser/Client (React) | API (existing `/api/automations/debtor-email/override` + `recordVerdict`) | Same path Stage 1 uses; widgets POST and dispatch — server unchanged |
| "Needs review" verdict-based count | API (Postgres RPC) | Browser (chip badge) | Count is a cheap SQL aggregate; client renders. New/modified RPC. |
| Stage 4 chip-strip filter | Browser (URL params + client-side filter) | — | Mirrors Stage 1's `?topic=` contract; no server change |
| Detail-pane width regression | Browser (CSS/grid layout) | — | Pure presentational |

---

## Implementation Map

> Files plans should expect to touch, grouped by D-item.

### D-01 — Override + note flow consolidation (S0/S2/S3)

| File | Why |
|------|-----|
| `web/app/(dashboard)/automations/[swarm]/_shell/detail-pane.tsx` | Replace S2 placeholder (lines 449-460) and S3 stub onChange (line 467) with real widget mounts. Stage 0 widget already wired (line 421); confirm it gets cancel-override link from Phase 82.7 Plan 03 (already in stage-step.tsx). |
| `web/app/(dashboard)/automations/[swarm]/_shell/components/stage-2-widget.tsx` | **NEW** — Stage 1-pattern wrapper: imports `Stage2Widget` from `stage-1/components/stage-2-widget.tsx` (the picker already exists), wraps it with note textarea + EvalTypeRadio + OverrideConfirmDialog + POST handler. Axis = `stage_2_customer`. |
| `web/app/(dashboard)/automations/[swarm]/_shell/components/stage-3-widget.tsx` | **NEW** — Stage 1-pattern wrapper: imports `Stage3Widget` from `stage-1/components/stage-3-widget.tsx`, wraps with note + EvalTypeRadio + OverrideConfirmDialog + POST handler. Axis = `stage_3_intent`. |
| `web/app/(dashboard)/automations/[swarm]/_shell/components/stage-0-widget.tsx` | **REVIEW** — already exists (line 421 of detail-pane). Confirm it follows the fused note+override pattern; if not, refactor to match. |
| `web/app/(dashboard)/automations/[swarm]/stage-1/components/stage-step.tsx` | Already supports `onCancelDirty` (line 30) and `onSubmitDirty`. Verify cancel-override link renders for S0/S2/S3 dirty branches (Phase 82.7 Plan 03 wired this; spot-check). |
| `web/app/(dashboard)/automations/[swarm]/_shell/__tests__/detail-pane.test.tsx` | New assertions: S2/S3 widget mounts (not placeholder), submit fires override POST, cancel link clears dirty. |

**Note on D-01b "fuse them":** The note textarea already lives inside `Stage1Widget` (`_shell/components/stage-1-widget.tsx:302-353`) as part of the `dirty &&` branch. The new S2/S3 widgets must copy this `dirty && <Textarea>...` block verbatim. The "standalone audit-expander note path" is `StageFeedbackPanel` rendered inside the audit expander by `stage-step.tsx` — that path stays untouched for the "note without override" use case.

### D-02 — Stage 1 chip semantics + Needs-action removal

| File | Why |
|------|-----|
| `supabase/migrations/{date}_phase88_stage1_verdict_pending_count.sql` | **NEW** — either (a) add a `verdict_pending_count` column to `classifier_queue_counts` RPC, or (b) create a new `classifier_queue_verdict_pending(p_swarm_type)` RPC. Q1 recommends (b) — see below. |
| `web/app/(dashboard)/automations/[swarm]/stage-1/page.tsx` | Load the new count alongside `classifier_queue_counts`; pass to `NoiseCategoryChipStrip` as new prop (e.g. `verdictPendingCount`). Remove `?needs_action` parsing (line 71-ish), set `needsAction` to false always or delete the param. Default landing = no `?topic`, no `?sub` (already the default — chip behaviour unchanged at URL level). |
| `web/app/(dashboard)/automations/[swarm]/stage-1/noise-category-chip-strip.tsx` | Replace `needsReviewCount` aggregation (lines 83-93) with the new prop. Drop the `for (const c of counts)` loop branch that builds `needsReviewCount`. Chip key/label still `{ key: "all", label: "Needs review" }`. |
| `web/app/(dashboard)/automations/[swarm]/stage-0/page.tsx` | Remove `?needs_action` URL parsing (currently hardcoded to true at line 112). The hardcoded true means Stage 0 always shows needs-action — preserve that filter semantically (it's a separate concern from the Stage 1 chip), but the chip control is going away. Stage 0 still passes `needsActionOnly: true` to `loadFeedbackList` server-side. |
| `web/app/(dashboard)/automations/[swarm]/stage-1/page.tsx`, `stage-2/page.tsx`, `stage-3/page.tsx` | Remove `?needs_action` searchParam handling (Stage 2 page.tsx line 103, etc.). The `StageListChips` mount currently passes `needsAction` boolean. After D-02: drop `NeedsActionChip` from `_shell/needs-action-chip.tsx`, keep `MineOnlyChip`, update `stage-list-chips.tsx` to only render mine-only. |
| `web/app/(dashboard)/automations/[swarm]/_shell/needs-action-chip.tsx` | Delete `NeedsActionChip` export. Keep `MineOnlyChip` and the shared `ToggleChip` helper. Rename file to `mine-only-chip.tsx` (optional; not required). |
| `web/app/(dashboard)/automations/[swarm]/_shell/stage-list-chips.tsx` | Remove `needsAction` prop + `toggleParam("needs_action", …)` wiring. Render only `<MineOnlyChip>`. Drop `?needs_action` from the URL keyspace. |
| `web/app/(dashboard)/automations/[swarm]/_shell/_lib/feedback-list-loader.ts` | **CAUTION:** `needsActionOnly?: boolean` (line 60) is a server-side filter used by Stage 0's hardcoded `needsAction = true`. **Do NOT delete the loader param** — Stage 0 still depends on it. Only the URL/chip is going away. |
| `web/app/(dashboard)/automations/[swarm]/_shell/__tests__/needs-action-chip.test.tsx` | **DELETE** — assertions on the deleted chip. If `MineOnlyChip` tests live in the same file, split them out first. |
| `web/app/(dashboard)/automations/[swarm]/stage-1/__tests__/noise-category-chip-strip.test.tsx` (sits at `stage-1/__tests__/`) | Rewrite `needsReviewCount` assertion to use the new prop-driven count instead of summing `topic !== "skip"`. |

### D-03 — Stage 4 chip-strip + width regression

| File | Why |
|------|-----|
| `web/app/(dashboard)/automations/[swarm]/stage-4/client-shell.tsx` | Replace three `<Collapsible>` blocks (lines 356-426) with a single `<ChipStrip>` from `_shell/chip-strip.tsx` + a single `<RowList>` driven by URL filter. Drop `Collapsible*` imports (lines 47-51). Preserve the `selectedId` cross-section model (lines 165-198) — that logic is unchanged, only the row source changes from "three lists" to "one filtered list". |
| `web/app/(dashboard)/automations/[swarm]/stage-4/page.tsx` | Add URL param parsing for the new chip filter (proposed: `?outcome=handler_error|needs_review|auto_archived|all`). Pass active filter to `client-shell.tsx`. Existing `handlerErrorRows / needsReviewRows / autoArchivedUnified` derivation stays — client-shell picks one based on URL. |
| `web/app/(dashboard)/automations/[swarm]/stage-4/__tests__/page.test.tsx` | Add chip-filter assertions; remove collapsible assertions. |
| **Width regression target file** — likely `stage-4/client-shell.tsx` (the `position: sticky` + `minHeight: 320` wrapper at line 435) or none at all | See Q3 for diagnosis. |

---

## Patterns to Reuse

### Stage 1 mature override pattern (canonical template for S2/S3)

**File:** `web/app/(dashboard)/automations/[swarm]/_shell/components/stage-1-widget.tsx`

Key structural elements to copy verbatim into the new S2/S3 widgets:

| Element | Lines | What it does |
|---------|-------|--------------|
| Local dirty state | 90 | `useState<{ categoryKey: string } \| null>(null)` — gates note textarea visibility |
| Reset on row change | 105-111 | `useEffect` keyed on `row.id` clears dirty/notes/evalType |
| Notes-required logic | 123-130 | `notesRequired = isUnknownBucket \|\| evalType === "regression"` |
| `submitOverride` async POST | 140-236 | POST `/api/automations/debtor-email/override` + `recordVerdict` + `markPendingRemoval` |
| Keyboard event listeners | 271-286 | `bulk-review:override-submit` / `bulk-review:override-discard` window events — required for footer Submit to drive the widget |
| Inline note textarea | 302-353 | The fused note+override UI per D-01b |

**Adaptation for S2:** Swap the `Stage1CategorySelect` (line 293) for `Stage2Widget` from `stage-1/components/stage-2-widget.tsx` (the customer combobox). Axis literal becomes `"stage_2_customer"`. `decision_details` becomes `{ customer_account_id, customer_name }`.

**Adaptation for S3:** Swap for `Stage3Widget` from `stage-1/components/stage-3-widget.tsx` (intent picker — confirm at code-read; `intents` prop is already typed `SwarmIntentRow[]` per hard-separation). Axis literal becomes `"stage_3_intent"`. `decision_details` becomes `{ intent_key }`.

### Cancel-override hooks (Phase 82.7 Plan 02)

**File:** `web/app/(dashboard)/automations/[swarm]/_shell/detail-pane.tsx`

| Hook | Lines | Used by |
|------|-------|---------|
| `resetAllStageFeedback` | 333-335 | Footer secondary "Cancel override" button (line 784) |
| `onCancelDirty(stageN)` | 337-342 | Per-stage cancel-override link — threaded into `PipelineFlow` (line 718) → `StageStep.onCancelDirty` |
| `onSubmitDirty(_stageN)` | 352-354 | Per-stage Submit affordance — dispatches `bulk-review:override-submit` window event |

These already work on Stage 1. The new S2/S3 widgets must `window.addEventListener("bulk-review:override-submit", ...)` (mirroring `stage-1-widget.tsx:278`) for the existing footer/per-stage Submit button to drive them.

### Chip-strip primitive (`_shell/chip-strip.tsx`)

| Element | Lines | Reuse on Stage 4 |
|---------|-------|------------------|
| `ChipStrip` component | 34-55 | Direct mount in `stage-4/client-shell.tsx`. Pass `chips=[{key, label, count}]` from outcome buckets. |
| `ChipStripChip` type with optional `brandToken` | 18-24 | Use brand tokens to preserve existing color cues: `--v7-red` (Handler error), `--v7-amber` (Needs review), `--v7-lime` (Auto-archived). |
| Active-key matching | 35 | URL-driven; match `searchParams.get("outcome")` against chip key. |

### URL-contract pattern (chip writes search params)

**Reference:** `web/app/(dashboard)/automations/[swarm]/stage-1/noise-category-chip-strip.tsx:67-78` (the `navigate` callback). Stage 4 follows the same shape: chip click writes `?outcome=...`, "All" deletes `?outcome`. Use `router.push` (Stage 1) or `router.replace` (Stage 4 — match `stage-list-chips.tsx:48` precedent for filter chips).

---

## Q1 — Canonical "no verdict yet at Stage 1" signal — [VERIFIED: schema read]

**Recommendation: Candidate A, refined.**

The cheapest accurate signal is:

> **Stage 1 row is pending verdict ⇔ it appears in `automation_runs WHERE status='predicted' AND swarm_type=$1` AND no row exists in `email_feedback WHERE stage=1 AND email_id = automation_runs.<email_id>`.**

### Evidence

1. **`feedback_reviews` does not exist.** `grep -rln feedback_reviews supabase/migrations/` returns zero hits. The real table is `public.email_feedback` (migration `20260513c_email_feedback.sql`). The CONTEXT D-02d wording "feedback_reviews" appears to be a placeholder — flag this for the planner.

2. **`email_feedback` schema** (`supabase/migrations/20260513c_email_feedback.sql:26-35`):
   - `(email_id uuid, stage smallint CHECK BETWEEN 0 AND 3, verdict text CHECK IN ('confirm','override','unclear'), operator_id text, created_at)`
   - Index on `(email_id, stage)` — cheap lookup for "any row with stage=1".
   - **Critical:** stage column is constrained to 0..3 — so `stage=1` is the canonical Stage 1 verdict marker.

3. **`classifier_queue_counts` RPC** (`20260428_classifier_queue_counts.sql`) currently aggregates `automation_runs WHERE status='predicted'` GROUP BY `(swarm_type, topic, entity, mailbox_id)`. The Stage 1 chip's current `needsReviewCount` heuristic (`noise-category-chip-strip.tsx:83-93`) sums every non-skip topic — which is what the operator wants replaced.

4. **Why Candidate A (absence in `email_feedback`) beats Candidate B (`status='predicted'` AND no audit row):**
   - The "audit row" in Candidate B is ambiguous (no single audit table for Stage 1 verdicts). `email_feedback` is the *only* persistent place an operator-issued Stage 1 verdict lands (the override path also writes there via `fire-feedback.ts`).
   - Candidate A is one LEFT JOIN; Candidate B requires defining "audit" first.

5. **Why this preserves the existing RPC contract:** `status='predicted'` already filters out auto-handled / overridden / approved rows at the RPC layer (`noise-category-chip-strip.tsx:88-90` notes this). So "predicted ∧ no email_feedback row at stage=1" *is* "operator has not weighed in on a row that's still awaiting review." Auto-handled rows never enter the count.

### Implementation — new RPC (not a column on the existing one)

**Reason for separate RPC:** the existing RPC GROUPs BY `(swarm_type, topic, entity, mailbox_id)` — adding a `verdict_pending_count` column would change every row's semantics (it'd be "rows in this topic-bucket without verdict"). The chip wants a single scalar across all topics. Cheaper to expose a scalar RPC:

```sql
-- supabase/migrations/{date}_phase88_classifier_queue_verdict_pending.sql
create or replace function public.classifier_queue_verdict_pending(p_swarm_type text)
returns bigint
language sql stable as $$
  select count(*)::bigint
  from public.automation_runs ar
  where ar.status = 'predicted'
    and ar.swarm_type = p_swarm_type
    and not exists (
      select 1 from public.email_feedback ef
      where ef.email_id = ar.email_id     -- VERIFY column name on automation_runs
        and ef.stage = 1
    );
$$;
grant execute on function public.classifier_queue_verdict_pending(text) to authenticated, service_role;
```

**Planner verification step:** confirm `automation_runs.email_id` column exists and is `uuid`. If it's a different shape (e.g. nested in `result jsonb`), adjust the join. Page-loader pattern at `web/app/(dashboard)/automations/[swarm]/stage-1/page.tsx` will reveal it.

**Confidence:** HIGH on the *signal* (email_feedback existence is the right key). MEDIUM on the *exact join column* (needs verification of `automation_runs.email_id` shape).

---

## Q2 — Stage 4 chip granularity — [VERIFIED: code read; MEDIUM-LOW on volumes]

**Recommendation: Option (a) — keep the existing 3 section names as chips, with the small refinement of adding an "All" chip that defaults to selected.**

### Chip set

| Chip key | Label | Brand token | Source predicate |
|----------|-------|-------------|------------------|
| `all` | All | (none) | union of the three |
| `handler_error` | Handler error | `--v7-red` | `KanbanRow.result.kanban_reason === 'handler_error'` |
| `needs_review` | Needs review | `--v7-amber` | `KanbanRow.result.kanban_reason === 'handler_needs_review'` |
| `auto_archived` | Auto-archived | `--v7-lime` | `pipeline_events.decision === 'auto_archived_noise'` |

### Evidence

1. **Outcome state set is bounded by what the page loader splits on** (`stage-4/page.tsx:113-135`):
   - `handlerErrorRows = allRows.filter(r => r.result.kanban_reason === 'handler_error')`
   - `needsReviewRows = allRows.filter(r => r.result.kanban_reason === 'handler_needs_review')`
   - `autoArchivedUnified = autoArchivedRows.map(autoArchivedToUnifiedRow)` (sourced from `loadAutoArchivedNoiseRows`)
   
   These are the only three outcome states the page knows how to render. Until the page learns a fourth (e.g. `handler_retried`, `handler_partial`), the chip set cannot grow.

2. **Volumes — unverified.** Anon role cannot read `pipeline_events` via REST (RLS). Researcher could not retrieve current row counts. Planner should ask operator for current 30-day distribution before locking the default chip, but the chip *set* is fixed by code.

3. **Why "All" chip default = selected:** Stage 4 today (Phase 82.8-05) opens with Handler-error expanded and the other two collapsed. The chip-strip swap is the moment to flip the default — operators reportedly want to see total throughput at a glance. If volumes show Handler-error dominates, planner can pick `handler_error` as default instead; this is the D-03b decision the planner owns.

4. **`selectedId` cross-section model is preserved.** From `stage-4/client-shell.tsx:188-198`, `selectedEmailId` resolution already searches all three row sets (KanbanRow id for handler-error/needs-review, `pipeline_events.id` for auto-archived). Chip-strip filter narrows which rows are *visible*; selection logic is unchanged. The `screenshotPathsByRowId` remap (lines 208-233) likewise spans all three — preserve it.

### Hard-separation reminder

Per CONTEXT D-03a and `stage-4/client-shell.tsx:9-15`: Stage 4 detail-pane receives `intents={[]}`. The chip-strip swap MUST NOT introduce any reference to `swarm_intents` — even for the auto-archived bucket, which is rooted in `swarm_noise_categories` per the page-load contract.

**Confidence:** MEDIUM. High on the chip set (code-bound). Low on the default — volumes not verified.

---

## Q3 — Detail-pane width regression — [LOW confidence; could not reproduce in research]

**Finding: I cannot localise a width regression from code alone. The grid template is identical across all five stages. I recommend the planner add a Wave 0 task to reproduce in-browser with the operator and report findings before any fix lands.**

### Evidence gathered

1. **Grid template is identical:**
   - `stage-0/page.tsx:261` — `gridTemplateColumns: "minmax(640px, 1fr) 540px"`
   - `stage-1/client-shell.tsx:226` — same
   - `stage-2/page.tsx:253` — same
   - `stage-3/client-shell.tsx:225` — same
   - `stage-4/client-shell.tsx:342` — same

2. **The 380-460px outlier at `stage-1/page.tsx:1275`** (`grid-cols-[minmax(380px,460px)_1fr]`) is the **Pending Promotion sub-view** (`sp.sub === "pending"`), which is a candidate-rule list with `PendingPromotionDetailPane` — a DIFFERENT pane from `UnifiedDetailPane`. This is intentional, not a regression, and out of scope for D-03c.

3. **Pre-82.8 baseline diff** (`git show 4807f9e6 -- '…/stage-4/client-shell.tsx'`):
   - Phase 82.8 Plan 05 commit `4807f9e6` (2026-05-18) introduced the three-section Collapsible structure.
   - **Before** Plan 05: Stage 4 rendered a single `<RowList>` + `<UnifiedDetailPane>` pair without an outer grid wrapping. The 540px column existed there too.
   - **After** Plan 05 (current): Pane is wrapped in `<div style={{ position: "sticky", top: "var(--space-3)", minHeight: 320 }}>` (line 435), inside the 540px grid column.

4. **Suspect change** — the `position: sticky` wrapper on Stage 4 (line 435) is unique to Stage 4. No other stage wraps the pane in a sticky div with `minHeight`. It does NOT alter width (the grid column is still 540px), but it could cause **vertical compression** of pane contents if the operator's viewport is short — possibly misperceived as "narrowness." Also note `minHeight: 320` does not constrain max-height; sticky + tall content can produce an off-screen scroll surface.

5. **Other suspects considered and rejected:**
   - `row-list.tsx:128-131` — rightEdgeSlot conditional grid columns: only affect row-list internal layout, not pane width.
   - `predicted-row.tsx:160` — `repeat(4, 1fr)`: scoped to a row internal grid.
   - No `max-width` on the pane itself.
   - No `width` prop on `UnifiedDetailPane` (`detail-pane.tsx:120-169` props don't expose width).

### What a planner needs for an in-browser repro

The planner should land a small Wave 0 task: open Stage 1, Stage 2, Stage 3, Stage 4 in dev, screenshot each detail-pane at the same viewport (e.g. 1440×900), measure pane width via DevTools, and confirm whether they differ. Likely outcomes:

- **If all 4 widths are 540px → no width regression.** Operator may be reacting to the Stage 4 sticky-wrapper vertical behaviour, or to the screenshot-strip mount displacing pane content. Resolve with a copy/clarification task, not a CSS fix.
- **If Stage 4 < 540px → look at parent containers above the grid.** The outer page wrapper at `stage-4/page.tsx` may apply different padding/max-width than other stages.
- **If a *non-Stage-4* stage shrunk → diff the most recent commits touching that stage's client-shell.tsx.** No evidence in research suggests this, but the operator might have reported the regression on Stage 1/2/3.

### Proposed fix scope (planner decides after repro)

- **If repro confirms no width regression:** drop D-03c from the plan; document the finding in the wave summary.
- **If repro shows Stage 4 narrowness from the sticky wrapper:** remove `position: sticky` + `minHeight` from `stage-4/client-shell.tsx:435`, mount the pane as a direct grid child like every other stage. One-line revert.
- **If repro shows a different stage:** scope a targeted fix; this is outside what research can predict.

**Confidence:** LOW. I located the only Stage-4-unique CSS but cannot prove it produces a *width* (vs vertical-layout) effect without a browser. Flagging for planner Wave 0.

---

## Test Surface

| Component | Test file | Action |
|-----------|-----------|--------|
| `_shell/detail-pane.tsx` (S2/S3 widget mount) | `_shell/__tests__/detail-pane.test.tsx` | **UPDATE** — add Stage 2/3 widget render assertions; remove placeholder-text assertions |
| New `_shell/components/stage-2-widget.tsx` | `_shell/__tests__/stage-2-widget.test.tsx` | **NEW** — mirror `stage-1-widget.test.tsx` structure |
| New `_shell/components/stage-3-widget.tsx` | `_shell/__tests__/stage-3-widget.test.tsx` | **NEW** — mirror `stage-1-widget.test.tsx` structure |
| `_shell/components/stage-0-widget.tsx` (existing) | `_shell/__tests__/stage-0-widget.test.tsx` if exists; else NEW | Verify cancel-override link + fused-note flow |
| `_shell/needs-action-chip.tsx` | `_shell/__tests__/needs-action-chip.test.tsx` | **DELETE** for the NeedsActionChip portion; KEEP for MineOnlyChip (split file first if mixed) |
| `_shell/stage-list-chips.tsx` | (no existing test) | **NEW** optional — assert only MineOnlyChip renders |
| `stage-1/noise-category-chip-strip.tsx` | `stage-1/__tests__/noise-category-chip-strip.test.tsx` | **UPDATE** — rewrite the `needsReviewCount` assertion to use the new prop |
| New `classifier_queue_verdict_pending` RPC | (no test infrastructure for SQL; covered by integration via stage-1 page-shell test) | Smoke via `stage-1/__tests__/page-shell.test.tsx` if it stubs the count loader |
| `stage-4/client-shell.tsx` | `stage-4/__tests__/page.test.tsx` | **UPDATE** — replace collapsible-trigger assertions with chip-strip assertions; assert URL `?outcome=` updates active chip |
| Width regression (if any) | depends on repro | TBD — likely visual regression / manual UAT, not unit test |

---

## Risks / Unknowns

1. **`?needs_action=1` saved deeplinks.** D-02 removes the URL param. Existing operator bookmarks or shared links containing `?needs_action=1` will silently degrade — the row list will no longer filter. **Mitigation:** the page is the loader entry point; un-recognised params are simply ignored. No 404, no error. Acceptable tradeoff per the CONTEXT D-02b lock. Document in deploy notes.

2. **Stage 0 hardcoded `needsAction = true`** (`stage-0/page.tsx:112`). This is a *server-side filter* on the feedback-list loader, unrelated to the URL chip. **Do not remove this**; only remove the URL-level toggle and the chip UI. The loader-level `needsActionOnly` filter stays.

3. **`feedback_reviews` is not a real table.** CONTEXT D-02d references it; the actual table is `email_feedback`. Planner should silently substitute when locking the Q1 answer in PLAN.md.

4. **`automation_runs.email_id` column shape unverified.** The new RPC depends on it being a top-level `uuid` column. If it's nested in `result jsonb`, the join becomes `(ar.result->>'email_id')::uuid = ef.email_id` — slower but workable. Planner: verify before locking RPC SQL.

5. **Stage 4 chip filter URL contract is new.** `?outcome=...` is not used anywhere today. No risk of collision with existing params (`?topic`, `?sub`, `?mailbox`, `?selected`, `?needs_action`, `?mine_only`, `?predictor`, `?confidence`, `?before` — verified none equal `outcome`).

6. **`Stage3Widget` `onChange` is currently a no-op stub** (`detail-pane.tsx:467`). The widget itself renders; tests covering Stage 3 detail-pane should currently expect a non-interactive picker. After D-01, this expectation flips — heads-up to test author.

7. **`MineOnlyChip` survives D-02.** Don't accidentally delete it alongside `NeedsActionChip` — the file shares the `ToggleChip` helper.

8. **Hard-separation grep gate.** `noise-category-chip-strip.tsx:10-14` documents a unit-test grep gate enforcing no `swarm_intents` import on Stage 1 surfaces. Phase 88's new S2/S3 widgets should add similar grep gates: S2 widget MUST NOT import noise/intent registry types (it's a customer combobox); S3 widget MUST NOT import `SwarmNoiseCategoryRow`.

---

## Locked-decision tensions

| Tension | Detail | Recommendation |
|---------|--------|----------------|
| CONTEXT D-02d names `feedback_reviews`; schema has `email_feedback`. | Wording-level only. Confirmed via migration grep. | Planner: substitute `email_feedback` in PLAN.md without further discussion. |
| CONTEXT lists `_shell/_lib/audit-types.ts` as a possibly-touched file for D-02d. | `audit-types.ts` is the `StageAuditMap` type, used for audit-panel rendering. It is **not** in the path for chip-count computation. No edit needed. | Planner: drop this file from the D-02 touched-list. |
| CONTEXT D-01b says "fuse note + override". `Stage1Widget` already does this inline (`stage-1-widget.tsx:302-353`). | No actual fusion work for Stage 1 — only the new S2/S3 widgets need to copy this pattern. | Planner: scope D-01 work to S2/S3 widget creation; mark S0/S1 as audit-only review. |
| CONTEXT mentions "82.7 Plan 02 added the per-stage cancel-override link + footer secondary 'Cancel override' button". Commit log shows Plan 02 = footer button, Plan 03 = per-stage link. | Minor labelling. Both are in. | Planner: cite both commits if precise sourcing matters. |

---

## Validation Architecture

> Phase 88 is pure frontend; `workflow.nyquist_validation` treated as enabled (no config opt-out).

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest (existing — used across `_shell/__tests__/` and per-stage `__tests__/`) |
| Config file | `web/vitest.config.ts` (existing) |
| Quick run command | `cd web && npx vitest run app/\(dashboard\)/automations/\[swarm\]/_shell` |
| Full suite command | `cd web && npm test` |

### Requirements → Test Map

Phase has no formal REQ-IDs (per orchestrator metadata, `phase_req_ids: null`). Map per D-item:

| D-item | Behaviour | Test type | Automated command | File exists? |
|--------|-----------|-----------|-------------------|-------------|
| D-01 | S2 widget mounts (not placeholder) and submits override | unit + integration | `npx vitest run _shell/__tests__/detail-pane.test.tsx` | UPDATE existing |
| D-01 | S3 widget mounts and submits override | unit + integration | same | UPDATE existing |
| D-01 | Cancel-override link clears dirty on S0/S2/S3 | unit | new `stage-2-widget.test.tsx` / `stage-3-widget.test.tsx` | NEW |
| D-01 | Fused note + override submit writes both atomically | unit | new widget tests | NEW |
| D-02 | "Needs review" chip count = verdict-pending count from new RPC | unit | `npx vitest run stage-1/__tests__/noise-category-chip-strip.test.tsx` | UPDATE |
| D-02 | `NeedsActionChip` deleted, `?needs_action` no longer in URL keyspace | unit | `_shell/__tests__/needs-action-chip.test.tsx` becomes mine-only-only | UPDATE / split |
| D-02 | Stage 1 lands with "Needs review" chip pre-active | unit | `stage-1/__tests__/page-shell.test.tsx` | UPDATE |
| D-02 | New RPC `classifier_queue_verdict_pending` returns correct count | SQL — manual via supabase MCP or smoke via integration test that stubs the loader | UAT in Supabase studio | NEW (manual) |
| D-03 | Stage 4 chip strip replaces collapsibles | unit | `stage-4/__tests__/page.test.tsx` | UPDATE |
| D-03 | `?outcome=` URL filter narrows visible rows | unit | same | UPDATE |
| D-03 | `selectedId` cross-section model still resolves across chip filters | unit | same | UPDATE — port the lines 188-198 logic into a focused test |
| D-03c | Detail-pane width parity across stages | **manual UAT** | in-browser repro at 1440×900 | MANUAL — see Q3 |

### Sampling Rate

- **Per task commit:** quick run on the touched directory (`_shell` for D-01/D-02 chip, `stage-1` for D-02 RPC integration, `stage-4` for D-03).
- **Per wave merge:** `cd web && npm test` (full Vitest).
- **Phase gate:** Full suite green + manual UAT screenshots for D-03c.

### Wave 0 Gaps

- [ ] `_shell/__tests__/stage-2-widget.test.tsx` — covers D-01 S2 path
- [ ] `_shell/__tests__/stage-3-widget.test.tsx` — covers D-01 S3 path
- [ ] (optional) `_shell/__tests__/stage-list-chips.test.tsx` — covers D-02 chip removal
- [ ] In-browser screenshot harness for D-03c (manual; not automatable in scope)

No framework install needed (Vitest already in `web/package.json`).

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `Stage3Widget` (`stage-1/components/stage-3-widget.tsx`) exists with a working intent-picker UI and just needs an `onChange` consumer | D-01 Impl Map | If the widget is incomplete, S3 wire-up grows to "implement the picker too." Mitigation: planner reads the file in Wave 0. |
| A2 | `automation_runs.email_id` is a top-level `uuid` column | Q1 RPC SQL | If nested in `result jsonb`, RPC JOIN needs `(ar.result->>'email_id')::uuid` cast. Mitigation: verify in Wave 0 of D-02. |
| A3 | The width "regression" reported by the operator is the `position: sticky` wrapper on Stage 4 — or no real regression at all | Q3 | If repro shows a different stage shrinking, the fix scope changes entirely. Mitigation: Wave 0 reproduction task. |
| A4 | Removing `?needs_action=1` from the URL contract won't break any non-Phase-88 saved deeplinks or external integrations (e.g. Bulk Review email links) | Risks #1 | Slight degradation of bookmarks; documented tradeoff. |
| A5 | `_shell/needs-action-chip.tsx` test file (`_shell/__tests__/needs-action-chip.test.tsx`) covers both `NeedsActionChip` and `MineOnlyChip` in one file | Test Surface | Planner: open the test file first; split before deleting if both are tested together. |

---

## Sources

### Primary (HIGH confidence)

- `supabase/migrations/20260428_classifier_queue_counts.sql` — current Stage 1 count RPC.
- `supabase/migrations/20260513c_email_feedback.sql` — canonical `email_feedback` table schema (`stage BETWEEN 0 AND 3`, `(email_id, stage)` index).
- `web/lib/automations/debtor-email/feedback/load-feedback-map.ts` — confirms `email_feedback` is the read source for verdicts.
- `web/app/(dashboard)/automations/[swarm]/_shell/detail-pane.tsx:120-227` (props), `262-354` (dirty/cancel state), `407-511` (5-cell stagesData), `547-616` (handlePrimary), `745-811` (footer).
- `web/app/(dashboard)/automations/[swarm]/_shell/components/stage-1-widget.tsx` — canonical override-widget pattern.
- `web/app/(dashboard)/automations/[swarm]/_shell/chip-strip.tsx:18-123` — primitive contract.
- `web/app/(dashboard)/automations/[swarm]/stage-1/noise-category-chip-strip.tsx:83-113` — current needsReviewCount logic.
- `web/app/(dashboard)/automations/[swarm]/stage-4/client-shell.tsx:339-460` — Stage 4 current collapsible layout + grid.
- `web/app/(dashboard)/automations/[swarm]/stage-4/page.tsx:113-135` — outcome state set bounded by these filters.
- `web/app/(dashboard)/automations/[swarm]/stage-1/page.tsx:1262-1295` — Pending Promotion sub-view (clarifies 380-460px outlier).
- Git history: commits `4807f9e6`, `40e2cedb`, `00494f5d`, `b2a71d74` (cancel-override + per-stage submit lineage).

### Secondary (MEDIUM confidence)

- `web/app/(dashboard)/automations/[swarm]/stage-{0,1,2,3,4}/(page.tsx|client-shell.tsx)` — grid template `minmax(640px, 1fr) 540px` consistent across all stages.

### Tertiary (LOW confidence)

- Stage 4 row volumes — anon role RLS blocks; planner should request from operator if D-03b default-chip decision needs it.
- Detail-pane width regression localisation — could not reproduce without a browser; flagged for Wave 0 manual repro.

---

## Metadata

**Confidence breakdown:**
- D-01 implementation map: HIGH — both downstream widgets exist; Stage 1 pattern is documented and tested.
- D-02 signal source (Q1): HIGH on the table choice (`email_feedback`); MEDIUM on the exact JOIN shape.
- D-03 chip set (Q2): MEDIUM — bounded by code, but default chip benefits from volume data we couldn't fetch.
- D-03c width regression (Q3): LOW — no in-browser reproduction; located the only Stage-4-unique CSS but cannot prove causation.

**Research date:** 2026-05-20
**Valid until:** 2026-06-19 (30 days — stable layer of the codebase; revalidate if `_shell/` is touched by another phase between now and then).

## RESEARCH COMPLETE
