---
phase: 82
plan: 01
subsystem: web/app/(dashboard)/automations/[swarm]/_shell
tags: [unified-shell, presentation-primitives, hard-separation, wave-1]
status: complete
dependency_graph:
  requires:
    - "Phase 81 — stage-keyed shell foundation (_shell/page-header, _shell/stage-tab-strip)"
    - "Phase 76-06 — registry-driven _lib/kanban-loader.ts"
    - "Phase 71-04 — Stage 1 PipelineFlow + Stage[1-4]Widget components (consumed via import)"
  provides:
    - "_shell/row-list.tsx (RowList — canonical condensed row strip)"
    - "_shell/detail-pane.tsx (UnifiedDetailPane — 5-axis pre-expanded skeleton)"
    - "_shell/chip-strip.tsx (ChipStrip — pure presentation tab strip)"
    - "_shell/mailbox-filter.tsx (MailboxFilter — multi-select URL state)"
    - "_shell/selection-context.tsx (SelectionProvider — verbatim from stage-3)"
    - "_shell/keyboard-shortcuts.tsx (KeyboardShortcuts + Cheatsheet — verbatim from stage-1 + stage0Focus + enabledShortcuts)"
    - "_shell/_lib/types.ts (Row, EmptyState, ActiveStage)"
    - "_shell/_lib/get-swarm-mailboxes.ts (getSwarmMailboxes + MAILBOX_LABELS)"
    - "_shell/components/stage-0-widget.tsx (Stage0Widget — injection_suspected 2-state toggle)"
  affects:
    - "Plans 02-06: per-stage page.tsx will consume these primitives"
tech_stack:
  added: []
  patterns:
    - "Hard-separation at prop boundary (categories vs intents) verified by vi.mock prop-spy"
    - "Module-level bodyCache pattern (Map<id, CachedBody>) — primeBodyCache helper"
    - "userEvent.setup() for Radix DropdownMenu pointer-event simulation in JSDOM"
    - "Static-source-grep gate via readFileSync + regex (hard-separation enforcement)"
key_files:
  created:
    - "web/app/(dashboard)/automations/[swarm]/_shell/_lib/types.ts"
    - "web/app/(dashboard)/automations/[swarm]/_shell/_lib/get-swarm-mailboxes.ts"
    - "web/app/(dashboard)/automations/[swarm]/_shell/selection-context.tsx"
    - "web/app/(dashboard)/automations/[swarm]/_shell/keyboard-shortcuts.tsx"
    - "web/app/(dashboard)/automations/[swarm]/_shell/row-list.tsx"
    - "web/app/(dashboard)/automations/[swarm]/_shell/chip-strip.tsx"
    - "web/app/(dashboard)/automations/[swarm]/_shell/mailbox-filter.tsx"
    - "web/app/(dashboard)/automations/[swarm]/_shell/detail-pane.tsx"
    - "web/app/(dashboard)/automations/[swarm]/_shell/components/stage-0-widget.tsx"
    - "web/app/(dashboard)/automations/[swarm]/_shell/__tests__/keyboard-shortcuts.test.tsx"
    - "web/app/(dashboard)/automations/[swarm]/_shell/__tests__/row-list.test.tsx"
    - "web/app/(dashboard)/automations/[swarm]/_shell/__tests__/chip-strip.test.tsx"
    - "web/app/(dashboard)/automations/[swarm]/_shell/__tests__/get-swarm-mailboxes.test.ts"
    - "web/app/(dashboard)/automations/[swarm]/_shell/__tests__/mailbox-filter.test.tsx"
    - "web/app/(dashboard)/automations/[swarm]/_shell/__tests__/detail-pane.test.tsx"
  modified: []
decisions:
  - "Stage 2 / Stage 4 widgets render placeholder text in Wave 1 — their real signatures (CustomerSelection async search, Stage4Quality + reason) are wired in Plan 06 when migrating Stage 1's detail-pane"
  - "PipelineTimelineEvent declared locally in _shell/detail-pane.tsx (structural alias) to keep _shell/ decoupled from stage-1/page.tsx until Plan 06 lifts it to _lib/"
  - "Cheatsheet table extended with the new '0' row (Override Stage 0 safety)"
  - "DropdownMenu chosen over Popover for mailbox-filter — Popover primitive absent from web/components/ui/"
  - "Test scaffolding adds Element.prototype.scrollIntoView + hasPointerCapture polyfills for JSDOM Radix interaction"
metrics:
  duration: "~12m"
  tasks: 3
  files_created: 15
  commits: 3
  tests_added: 40
completed: 2026-05-11
---

# Phase 82 Plan 01: Wave 1 — Extract `_shell/` Component Library Summary

Extracted the full `_shell/` shared component library — 6 presentation primitives + 1 helper + 1 widget + 5 RTL test files — with hard-separation enforcement at the prop boundary. No stage `page.tsx` modified; Waves 2-6 are now pure swap-and-wire.

## One-liner

`_shell/` primitives — RowList, UnifiedDetailPane (5-cell), ChipStrip, MailboxFilter, SelectionProvider, KeyboardShortcuts — extracted with full RTL coverage, hard-separation enforced via vi.mock prop-spy tests + static-source-grep gates.

## Deliverables

| Artifact | LOC | Role | Hard-sep status |
|---|---|---|---|
| `_lib/types.ts` | 30 | Canonical `Row`, `EmptyState`, `ActiveStage` | Stage-agnostic |
| `_lib/get-swarm-mailboxes.ts` | 70 | Per-swarm mailbox label helper | No registry imports |
| `selection-context.tsx` | 115 | Verbatim from stage-3 | No registry imports |
| `keyboard-shortcuts.tsx` | 250 | Verbatim from stage-1 + stage0Focus + enabledShortcuts | No registry imports |
| `row-list.tsx` | 180 | Outlook-style condensed strip + inline StageBadge | V9 bug fix structural |
| `chip-strip.tsx` | 125 | Pure presentation tab strip | Static-grep gate locked |
| `mailbox-filter.tsx` | 120 | DropdownMenu multi-select + URL state | No registry imports |
| `detail-pane.tsx` | 380 | UnifiedDetailPane 5-axis + scrollIntoView | `categories` ⊥ `intents` props |
| `components/stage-0-widget.tsx` | 85 | injection_suspected 2-state toggle | Stage 0 only |

## Tests (40 total, 7 files)

- `keyboard-shortcuts.test.tsx` — 9 cases: ↑↓/j/k nav, isTypingTarget guard (INPUT + contenteditable), ⌘⏎ vs bare ⏎ ordering, stage0Focus dispatch, enabledShortcuts restriction, Row type compile.
- `row-list.test.tsx` — 6 cases: column rendering, null-fallbacks, V9 regression (badge ⊥ subject slots), empty state, selection styling, pendingRemovalIds filter.
- `chip-strip.test.tsx` — 3 cases: tab rendering + aria-selected, onChange callback, static-source-grep hard-separation gate.
- `get-swarm-mailboxes.test.ts` — 6 cases: debtor-email 6 entries, row-id union, unknown-swarm fallback, null-id handling, MAILBOX_LABELS export.
- `mailbox-filter.test.tsx` — 6 cases: trigger label states, single & multi-select URL writes (repeated params), Clear.
- `detail-pane.test.tsx` — 5 cases: empty state copy, 5-cell skeleton + activeStage marker, hard-separation prop-shape check (categories ⊥ intents via vi.mock prop-spy), body collapsibility, Stage0Widget mount.
- `keyboard-shortcuts.test.tsx` — included above.

Plus Phase 81 carry-overs (page-header, stage-tab-strip).

## Verification Status

- ✓ All 5 RTL test files green (`cd web && npx vitest run --no-coverage app/\(dashboard\)/automations/\[swarm\]/_shell/__tests__`)
- ✓ Hard-separation grep gate (NEGATIVE) on all `_shell/` primitives passes — zero `loadSwarm*Categories|loadSwarmIntents|SwarmNoiseCategoryRow|SwarmIntentRow` matches in row-list, chip-strip, mailbox-filter, selection-context, keyboard-shortcuts.
- ✓ `_shell/detail-pane.tsx` API exposes `categories` AND `intents` as separate props (verified by vi.mock prop-spy: Stage 1 widget mock receives no `intents`; Stage 3 widget mock receives no `categories`).
- ✓ TypeScript clean for `_shell/` paths (`tsc --noEmit | grep _shell` produces no output).
- ✓ Zero per-stage `page.tsx` modified (verified by commit scope).
- ✓ V9 bug fix structural: `! grep -E "r\.topic|r\.result\.intent" _shell/row-list.tsx` (Row type doesn't carry these fields).
- ✓ 5-cell loop: `grep "[0, 1, 2, 3, 4] as const" _shell/detail-pane.tsx` returns matches at 3 sites (StageData build loop + hidden test markers).
- ✓ scrollIntoView present (JSDOM-guarded).
- ✓ bodyCache module-level Map preserved.

## Deviations from Plan

### Rule 3 — Auto-fix blocking issues

**1. JSDOM `scrollIntoView` not implemented**
- Found during: Task 3 detail-pane tests
- Issue: All detail-pane tests crashed on `TypeError: activeCellRef.current?.scrollIntoView is not a function` because JSDOM doesn't ship a `scrollIntoView` impl on `Element.prototype`.
- Fix: Added a `typeof el.scrollIntoView === "function"` guard inside the `useEffect` and a JSDOM polyfill in `mailbox-filter.test.tsx`. Behavior in real browsers is unchanged.
- Files modified: `_shell/detail-pane.tsx`, `_shell/__tests__/mailbox-filter.test.tsx`
- Commit: `f2de682`

**2. Radix DropdownMenu pointer-event semantics in JSDOM**
- Found during: Task 3 mailbox-filter tests
- Issue: `fireEvent.click` on the Radix trigger left the menu in `data-state="closed"`. Radix DropdownMenu uses pointer-event sequences that fireEvent doesn't emit.
- Fix: Switched mailbox-filter tests to `userEvent.setup()` + added `hasPointerCapture` polyfill. Implementation unchanged.
- Files modified: `_shell/__tests__/mailbox-filter.test.tsx`
- Commit: `f2de682`

**3. `PipelineTimelineEvent` not in central types module**
- Found during: TypeScript check after Task 3
- Issue: Plan PATTERNS guidance suggested importing `PipelineTimelineEvent` from `@/lib/pipeline-events/types` but the type currently lives in `stage-1/page.tsx`.
- Fix: Declared a structural alias locally in `_shell/detail-pane.tsx`. Plan 06 will lift the central type to `_shell/_lib/`. Decoupling `_shell/` from `stage-1/page.tsx` preserved.
- Files modified: `_shell/detail-pane.tsx`
- Commit: `f2de682`

### Rule 2 — Auto-add missing critical functionality

**4. Stage 0 cheatsheet binding**
- Issue: New `stage0Focus` action exists but cheatsheet table only listed 1..4.
- Fix: Added `{ keys: ["0"], description: "Override Stage 0 (safety)" }` to the SHORTCUTS array so operators discover the binding.
- Files modified: `_shell/keyboard-shortcuts.tsx`
- Commit: `bc6a78d`

### Scope-limited adaptations (not deviations)

**5. Stage 2 + Stage 4 placeholder widgets in Wave 1**
- Plan PATTERNS guidance suggested calling `Stage2Widget` and `Stage4Widget` from the unified pane directly. Their real signatures (CustomerSelection async-search state, Stage4Quality + reason text) are non-trivial and tied to stage-1-specific page state. Wave 1 contract is the 5-cell skeleton; Plan 06 wires the real widgets when migrating Stage 1.
- Rationale: Hard-separation at the Stage 1 / Stage 3 prop boundary (the highest-cost violation surface per the RFC) is unaffected by this scope split.

## Decisions Made

- See `decisions:` block in frontmatter above (5 entries).

## Known Stubs

| Stub | File | Reason |
|---|---|---|
| Stage 2 widget = placeholder text | `_shell/detail-pane.tsx:230` | Plan 06 wires `Stage2Widget` (CustomerSelection async search). Wave 1 verifies the 5-cell skeleton — actual Stage 2 override flow not in scope. |
| Stage 4 widget = placeholder text | `_shell/detail-pane.tsx:255` | Plan 06 wires `Stage4Widget` (Stage4Quality + reason text). Wave 1 scope same as above. |
| Stage 1/3 widget `onChange` = no-op | `_shell/detail-pane.tsx:217,243` | Plan 06 wires real `setDirty` + override-confirm flow. Wave 1 verifies hard-separation prop contract only. |
| Action footer events dispatch only | `_shell/detail-pane.tsx:330+` | Plan 06 wires real `recordVerdict` server-action handlers. Wave 1 verifies the event channel works. |

All stubs are intentional Wave 1 boundary cuts. Plans 02-06 resolve them per the migration sequence in RESEARCH §Migration Sequencing.

## Self-Check: PASSED

- File existence: 15/15 created files exist on disk.
- Commits: bc6a78d, ae71e15, f2de682 all present in `git log`.
- Tests: 40/40 pass on `npx vitest run app/(dashboard)/automations/[swarm]/_shell/__tests__/`.
- TypeScript: zero errors in `_shell/` paths.
- Hard-separation grep gates: all NEGATIVE assertions pass on the 5 specified primitive files + `_lib/`.
- Wave 1 scope discipline: zero `page.tsx` modified.
