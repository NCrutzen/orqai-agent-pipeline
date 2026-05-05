---
phase: 71-bulk-review-4-axis-redesign-capability-regression-eval-split
plan: 04
subsystem: bulk-review-ui
tags: [ui, components, shadcn, v7-tokens, accessibility, presentational]
requires:
  - "@/components/ui/switch (Plan 71-01 vendored)"
  - "@/components/ui/radio-group (Plan 71-01 vendored)"
  - "@/lib/swarms/brand-color (Plan 71-01)"
  - "OverrideAxis from @/lib/pipeline-events/types (Plan 71-01)"
provides:
  - "RecipientChipStrip — URL-driven recipient filter (?inbox=)"
  - "PredictedRow — 5-col row strip (recipient | from/subj | 4 stages | cost | cap/reg)"
  - "PipelineFlow + StageStep — N-stage data-driven vertical timeline"
  - "Stage1Widget / Stage2Widget / Stage3Widget / Stage4Widget — per-stage override controls"
  - "EvalTypeRadio — capability/regression cards (default regression)"
  - "OverrideConfirmDialog — 3-trigger confirmation modal"
  - "IControllerInfoBanner — post-submit Stage 3/4 banner (D-15)"
  - "stage-2-search.ts — Server Action helper for customer combobox"
affects:
  - "web/app/(dashboard)/automations/[swarm]/review/* — Plan 71-05 wires these into page.tsx / detail-pane.tsx / row-list.tsx"
tech-stack:
  added: []
  patterns:
    - "Pure presentational; client components consume props + emit callbacks"
    - "useDebouncedValue inline (no new dep) for Stage 2 250ms debounce"
    - "CSS pseudo-element via inline <style> for PipelineFlow connecting line"
    - "shadcn Select / Command / Dialog / Switch / RadioGroup / Tooltip / Button / Textarea"
key-files:
  created:
    - "web/app/(dashboard)/automations/[swarm]/review/recipient-chip-strip.tsx"
    - "web/app/(dashboard)/automations/[swarm]/review/components/predicted-row.tsx"
    - "web/app/(dashboard)/automations/[swarm]/review/components/pipeline-flow.tsx"
    - "web/app/(dashboard)/automations/[swarm]/review/components/stage-step.tsx"
    - "web/app/(dashboard)/automations/[swarm]/review/components/stage-1-widget.tsx"
    - "web/app/(dashboard)/automations/[swarm]/review/components/stage-2-widget.tsx"
    - "web/app/(dashboard)/automations/[swarm]/review/components/stage-2-search.ts"
    - "web/app/(dashboard)/automations/[swarm]/review/components/stage-3-widget.tsx"
    - "web/app/(dashboard)/automations/[swarm]/review/components/stage-4-widget.tsx"
    - "web/app/(dashboard)/automations/[swarm]/review/components/eval-type-radio.tsx"
    - "web/app/(dashboard)/automations/[swarm]/review/components/override-confirm-dialog.tsx"
    - "web/app/(dashboard)/automations/[swarm]/review/components/icontroller-info-banner.tsx"
  modified: []
decisions:
  - "Stage-2 customer-search source = option (a) coordinator_runs DISTINCT (per Plan 71-01 T6 spec)"
  - "PipelineFlow connecting line via inline <style> (no CSS modules, matches existing inline-style pattern)"
  - "EvalTypeRadio default value = 'regression' (D-08 safety bias)"
  - "Tag pill (cap/reg) only renders on rows with at least one stage_overridden=true"
metrics:
  tasks_completed: 2
  components_created: 12
  files_created: 12
  duration_minutes: ~10
  completed: 2026-05-05
---

# Phase 71 Plan 71-04: Bulk Review UI Components Summary

**One-liner:** 11 NEW pure-presentational UI components (plus a Server Action helper) for the 4-axis Bulk Review redesign — recipient chip strip, predicted-row strip, N-stage vertical pipeline, per-stage override widgets (S1-S4), eval-type radio, confirmation dialog, and iController info banner — all V7 token-only, accessible, ready for Plan 71-05 to mount into page.tsx / detail-pane.tsx / row-list.tsx.

## What Was Built

### Task 1 — Foundational components (commit `4a9a36e`)

| Component | File | Role |
|---|---|---|
| `RecipientChipStrip` | `recipient-chip-strip.tsx` | URL-driven (`?inbox=`) tablist; "All" chip default; brand-dot per chip |
| `PredictedRow` | `components/predicted-row.tsx` | 5-col grid (recipient | from/subj | 4 stage cells | cost | cap/reg pill); ↻ amber on overridden, em-dash on skipped, tooltip on ↻ |
| `PipelineFlow` | `components/pipeline-flow.tsx` | `<ol>` of `<StageStep>`; connecting 2px line via CSS pseudo-element (inline `<style>`) |
| `StageStep` | `components/stage-step.tsx` | 30×30 node circle + title + axis tag + current value + ok/dirty/skipped control area |
| `EvalTypeRadio` | `components/eval-type-radio.tsx` | Two radio cards (regression default left; capability right); section heading tooltip |
| `OverrideConfirmDialog` | `components/override-confirm-dialog.tsx` | Dialog with 3 trigger-specific bodies (verbatim from UI-SPEC) |
| `IControllerInfoBanner` | `components/icontroller-info-banner.tsx` | Post-submit dismissible banner; verbatim "please update the draft in iController separately" |

### Task 2 — Per-stage override widgets (commit `a101310`)

| Component | File | Source |
|---|---|---|
| `Stage1Widget` | `components/stage-1-widget.tsx` | shadcn Select; synthetic `noise` + `archive` at top of list, separator, then `categories` from `loadSwarmCategories('debtor-email')` |
| `Stage2Widget` | `components/stage-2-widget.tsx` | shadcn Command combobox + Switch. 250ms debounce via inline `useDebouncedValue`; min 2 chars; max 20 results |
| `stage-2-search.ts` | `components/stage-2-search.ts` | `"use server"` Server Action — DISTINCT-style SELECT over `public.coordinator_runs.customer_account_id, customer_name`, in-memory dedupe to 20 hits |
| `Stage3Widget` | `components/stage-3-widget.tsx` | shadcn Select; each item wrapped in Tooltip showing `handler_agent_key` |
| `Stage4Widget` | `components/stage-4-widget.tsx` | 5 buttons (1-5) with `aria-pressed` + sr-only verbose labels (`Terrible`/`Poor`/`Okay`/`Good`/`Perfect`); Textarea `maxLength={1000}` + char-count footer when `>800` |

## Acceptance Verification

- [x] All 12 files exist at the specified paths.
- [x] Each component file starts with `"use client";` (Server Action `stage-2-search.ts` uses `"use server";`).
- [x] No raw hex (`#[0-9a-fA-F]{3,8}`) anywhere in the 11 component files — verified via `grep`.
- [x] `PredictedRow` imports `brandColorToken` from `@/lib/swarms/brand-color`.
- [x] `EvalTypeRadio` default value = `regression` (consumer must pass `value="regression"` initially; component does not own state — pure controlled).
- [x] `OverrideConfirmDialog` body strings include the three UI-SPEC variants (Stage 2 re-run / Stage 3 / multi-axis).
- [x] `IControllerInfoBanner` copy includes literal text "please update the draft in iController separately".
- [x] `RecipientChipStrip` uses `useSearchParams` + `useRouter` + `usePathname` from `next/navigation`.
- [x] `Stage1Widget` includes both `noise` and `archive` synthetic options.
- [x] `Stage2Widget` imports `Switch` from `@/components/ui/switch`.
- [x] `Stage3Widget` renders Tooltip on each intent item.
- [x] `Stage4Widget` Textarea has `maxLength={1000}` literal in source.
- [x] All interactive elements have visible focus rings (outline 2px var(--v7-brand-secondary), offset 2px).

## Deviations from Plan

**1. [Rule 3 — Blocking] Created `stage-2-search.ts` helper as a Server Action (`"use server";`) at the same `components/` co-location.**
- **Found during:** Task 2 implementation.
- **Issue:** The widget needs a customer-search source; UI-SPEC names a non-existent `email_pipeline.customer_index` table, and the Plan 71-01 Task 6 checkpoint resolution is option (a) (coordinator_runs DISTINCT) but the helper file did not exist.
- **Fix:** Created `stage-2-search.ts` Server Action that queries `coordinator_runs` with ilike + in-memory dedupe to 20 hits. Plan said co-locate as `stage-2-search.ts`; that's exactly what shipped.
- **Files added:** `web/app/(dashboard)/automations/[swarm]/review/components/stage-2-search.ts`.
- **Commit:** `a101310`.

**2. [Rule 3 — Blocking] PipelineFlow connecting line via inline `<style>` tag instead of CSS module.**
- **Found during:** Task 1 implementation.
- **Issue:** Plan said "create `pipeline-flow.module.css` if no existing pattern exists OR use styled-jsx if the project uses it." The codebase uses neither CSS modules nor styled-jsx — only inline `style={{...}}` (e.g. `queue-tree.tsx`, `row-strip.tsx`).
- **Fix:** Inline `<style>` block scoped via `.pf-pipeline-flow` class — self-contained, no extra build artifacts. CSS pseudo-element `::before` rule lives next to the JSX it styles, matching the prevailing one-file-per-component idiom.

## Worktree-Parallel Dependency Note

This plan was executed in a parallel worktree from base `f5b5bc6`. The Plan 71-01 Wave-0 deliverables — `web/components/ui/switch.tsx`, `web/components/ui/radio-group.tsx`, `web/lib/swarms/brand-color.ts`, and the `OverrideAxis` type extension in `web/lib/pipeline-events/types.ts` — were NOT yet present at execution time. Per the dependency note in the executor prompt, components were authored against the Plan 71-01 contract:

- Imports use canonical paths (`@/components/ui/switch`, `@/components/ui/radio-group`, `@/lib/swarms/brand-color`, `@/lib/pipeline-events/types` for `OverrideAxis`).
- `tsc --noEmit` was NOT run in this worktree (it would fail on the missing dep imports). Plan 71-05 (Wave 2) merges with Plan 71-01 in main and the type-check runs there.

When Wave 0 (Plan 71-01) and Wave 1 (Plan 71-04) merge into main:
- The shadcn `Switch` and `RadioGroup` files appear and the imports resolve.
- `brandColorToken` resolves; `Entity` type is the literal-union from `entity.generated.ts`.
- `OverrideAxis` is the literal-union exported from `web/lib/pipeline-events/types.ts`.

If Plan 71-01 deviated from the documented contract (e.g. different export names), Plan 71-05 will surface the type errors; the fix is a one-line import rename in the affected widget(s).

## Per-Stage Widget Source Wiring (for Plan 71-05)

| Widget | Source (where Plan 71-05 must call) |
|---|---|
| Stage1Widget | `loadSwarmCategories(admin, 'debtor-email')` — pass result as `categories` prop |
| Stage2Widget | Self-contained — calls `searchCustomers(query)` from `./stage-2-search.ts` directly |
| Stage3Widget | `loadSwarmIntents(admin, 'debtor-email')` — pass result as `intents` prop |
| Stage4Widget | None (hardcoded 1-5 scale) |

## Threat Model Compliance

- **T-71-04-01 (XSS via reason text / operator email tooltip):** mitigated. All text rendered via React text-node interpolation (`{value}` syntax). No `dangerouslySetInnerHTML` in any of the 11 components. PredictedRow tooltip uses Tooltip primitive children.
- **T-71-04-03 (DoS via combobox spam):** mitigated. `useDebouncedValue(query, 250)` + `query.trim().length >= 2` gate + `searchCustomers` server action limits to 20 results.
- **T-71-04-05 (Customer search cross-tenant leak):** Server Action runs against `coordinator_runs` with admin client (service-role). Plan 02 / Plan 05 page-level `project_members` gate is the tenancy boundary — UI helper does not re-validate. Future tightening per Plan 02 RLS.

## Self-Check: PASSED

- File existence check (12/12 files): PASSED — all `OK` lines from grep.
- Hex-literal check (0 hits across 11 component files): PASSED.
- Commits: `4a9a36e` (Task 1, 7 files), `a101310` (Task 2, 5 files) — both present in `git log --oneline`.
