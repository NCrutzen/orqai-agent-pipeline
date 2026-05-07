---
phase: 76
plan: 07
subsystem: kanban-human-lane
tags: [stage-4, handler-error, ui, registry-driven]
requires:
  - 76-05 (Server Actions: closeKanbanRow, reclassifyAsNoise)
  - 76-06 (_shell, _lib/kanban-loader, stage-3 components)
provides:
  - Stage 4 tab at /automations/[swarm]/stage-4
  - Operator path to triage handler-errors (Reclassify or Close)
affects:
  - web/app/(dashboard)/automations/[swarm]/stage-3/action-stack.tsx (now parameterized)
tech-stack:
  added: []
  patterns:
    - Stage 3 component reuse via cross-import (../stage-3/*)
    - Action stack parameterization for variant tabs
key-files:
  created:
    - web/app/(dashboard)/automations/[swarm]/stage-4/page.tsx
    - web/app/(dashboard)/automations/[swarm]/stage-4/selection-context.tsx
    - web/app/(dashboard)/automations/[swarm]/stage-4/row-list.tsx
    - web/app/(dashboard)/automations/[swarm]/stage-4/filter-chips.tsx
    - web/app/(dashboard)/automations/[swarm]/stage-4/detail-pane.tsx
    - web/app/(dashboard)/automations/[swarm]/stage-4/error-detail-section.tsx
  modified:
    - web/app/(dashboard)/automations/[swarm]/stage-3/action-stack.tsx
decisions:
  - Stage 4 selection-context is a verbatim copy of stage-3's (independent selections per tab)
  - action-stack parameterized with `actions?: ReadonlyArray<'replay'|'reclassify'|'close'>`; default preserves Stage 3 behavior
  - Stage 4 detail-pane reuses stage-3/reason-pill and stage-3/action-stack via cross-import; only error-detail-section is new visual logic
  - Stage 4 has NO Replay-edit (UI-SPEC §Action stack lock) — handler-errors are either Reclassified to noise or Closed manually
metrics:
  duration: 8m
  completed: 2026-05-07
---

# Phase 76 Plan 07: Stage 4 Tab — Handler Errors Summary

Stage 4 tab now renders at `/automations/[swarm]/stage-4` showing handler-error Kanban rows with a single "Handler errors <count>" filter chip and a detail pane that surfaces `result.error_name` + `result.error_detail` in a red `<pre>` block. Reclassify and Close actions wired through reused Stage 3 server actions; Replay is intentionally absent.

## What Shipped

### Task 1: Parameterize stage-3/action-stack.tsx

Added optional `actions?: ReadonlyArray<'replay'|'reclassify'|'close'>` prop with a `DEFAULT_ACTIONS` of all three. Each button block (replay, reclassify, close) is wrapped in `showReplay`/`showReclassify`/`showClose` checks. Keyboard shortcuts (`⏎`, `N`, `Space`) only fire for visible buttons. Stage 3 callers continue to render unchanged because the default covers them.

Also exported a new `ActionKey` type for downstream typing.

### Task 2: Six stage-4/ files

- **page.tsx** (RSC) — loads Kanban rows + noise categories in parallel; filters to `kanban_reason === 'handler_error'`; computes Stage 3 count for the tab badge; mounts `Stage4Client` inside `SelectionProvider` + `AutomationRealtimeProvider` (channel `${swarmType}-kanban`). Uses `c.category_key !== "unknown"` filter (W3 single-field rule).
- **selection-context.tsx** — verbatim copy of stage-3's selection context for tab independence.
- **row-list.tsx** (Stage4Client) — two-column `[1fr 460px]` grid; left scrollable list with reason pill + topic + intent code; right detail pane. Empty state copy: "No handler errors" / "Stage 4 handlers ran cleanly in the visible window." (UI-SPEC verbatim).
- **filter-chips.tsx** — single chip "Handler errors <count>" rendered always-active for visual consistency with Stage 3.
- **detail-pane.tsx** — subject + meta + ReasonPill + ErrorDetailSection + email body placeholder + ActionStack with `actions={["reclassify","close"]}` and empty intents array. Imports `ReasonPill` and `ActionStack` from `../stage-3/`.
- **error-detail-section.tsx** — `error_name` heading + `error_detail` in red mono `<pre>` block with `--v7-red`/`--v7-red-soft`; muted "No error detail recorded" when both empty. React auto-escapes content (T-76-07-03 mitigation).

### Task 3: Human-verify checkpoint

Auto-approved per active auto-mode policy (`workflow.auto_advance` / `_auto_chain_active`). Log: `Auto-approved: Stage 4 tab handler-error surface`. Compile-time and grep-based gates all green; live UI verification deferred to operator session against the running dev server.

## Verification Evidence

```
$ for f in page selection-context row-list filter-chips detail-pane error-detail-section; do
    test -f "web/app/(dashboard)/automations/[swarm]/stage-4/$f.tsx" && echo OK $f
  done
OK page
OK selection-context
OK row-list
OK filter-chips
OK detail-pane
OK error-detail-section

$ npx tsc --noEmit
(clean — no output)

$ grep -nE "['\"](debtor-email|sales-email)['\"]" 'web/app/(dashboard)/automations/[swarm]/stage-4/'*.tsx
(zero matches — cross-swarm clean)

$ grep -nE 'noise_key\s*\?\?\s*category_key|noise_key\s*\|\|\s*category_key' \
    'web/app/(dashboard)/automations/[swarm]/stage-4/'*.tsx
(zero matches — W3 single-field gate passes)

$ grep -nE 'c\.category_key' 'web/app/(dashboard)/automations/[swarm]/stage-4/page.tsx'
62:    (c) => c.category_key !== "unknown",

$ grep -c "handler_error" 'web/app/(dashboard)/automations/[swarm]/stage-4/page.tsx'
2

$ grep -n "actions=\[" 'web/app/(dashboard)/automations/[swarm]/stage-4/detail-pane.tsx'
130:        actions={["reclassify", "close"]}

$ grep -c "Handler errors" 'web/app/(dashboard)/automations/[swarm]/stage-4/filter-chips.tsx'
2

$ grep -c "No handler errors" 'web/app/(dashboard)/automations/[swarm]/stage-4/row-list.tsx'
1
```

`npx next build` compiled all `[swarm]/stage-4/*` files successfully. Build later failed at the page-data-collection step on an unrelated route (`/api/automations/box-upload` — missing `supabaseUrl` env var in build env). No errors attributable to `[swarm]/stage-4`.

## Deviations from Plan

None — plan executed exactly as written.

## Component Reuse Map

| Component | Source | Stage 4 use |
|-----------|--------|-------------|
| `ReasonPill` | `stage-3/reason-pill.tsx` | imported in `row-list.tsx` and `detail-pane.tsx` |
| `ActionStack` | `stage-3/action-stack.tsx` (parameterized in Task 1) | imported in `detail-pane.tsx`; passed `actions={["reclassify","close"]}` |
| `InlineEditorReclassify` | `stage-3/inline-editor.tsx` (transitively via ActionStack) | rendered when operator clicks Reclassify |
| `closeKanbanRow` Server Action | `_actions/close.ts` (Plan 05) | invoked from ActionStack Close button |
| `reclassifyAsNoise` Server Action | `_actions/reclassify.ts` (Plan 05) | invoked from InlineEditorReclassify |
| `loadKanbanRows` | `_lib/kanban-loader.ts` (Plan 05) | called in `page.tsx` |
| `PageHeader` / `StageTabStrip` | `_shell/` (Plan 06) | rendered by `page.tsx` |

Zero duplication — only the page wrapper, single-chip filter, error-detail section, and Stage-4-flavored detail-pane shell are new.

## Threat Flags

None — Stage 4 surface introduces no new trust boundaries beyond what Plans 05/06 already mitigated. `result.error_detail` rendering is React-escaped text in a `<pre>` block (T-76-07-03 mitigated). Operator IDOR across mailboxes accepted-for-now per T-76-07-04 (Phase 999.2).

## Self-Check: PASSED

Files:
- FOUND: web/app/(dashboard)/automations/[swarm]/stage-4/page.tsx
- FOUND: web/app/(dashboard)/automations/[swarm]/stage-4/selection-context.tsx
- FOUND: web/app/(dashboard)/automations/[swarm]/stage-4/row-list.tsx
- FOUND: web/app/(dashboard)/automations/[swarm]/stage-4/filter-chips.tsx
- FOUND: web/app/(dashboard)/automations/[swarm]/stage-4/detail-pane.tsx
- FOUND: web/app/(dashboard)/automations/[swarm]/stage-4/error-detail-section.tsx
- FOUND: web/app/(dashboard)/automations/[swarm]/stage-3/action-stack.tsx (modified)

Commits:
- FOUND: a9527e9 refactor(76-07): parameterize action-stack
- FOUND: 6f8c87b feat(76-07): Stage 4 tab handler-error surface
