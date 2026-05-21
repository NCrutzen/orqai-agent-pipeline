---
phase: 61-restore-lost-bulk-review-ux-60-05-regression-fix-horizontal-
plan: 02
subsystem: debtor-email-review
tags: [layout, detail-pane, keyboard-shortcuts, urldriven, tdd]
requires: [61-01]
provides:
  - 3col-layout
  - detail-pane
  - keyboard-shortcuts
  - cheatsheet
  - prefetch-body-cache
  - pending-as-tree-sibling
affects:
  - web/app/(dashboard)/automations/debtor-email-review/page.tsx
  - web/app/(dashboard)/automations/debtor-email-review/queue-tree.tsx
  - web/app/(dashboard)/automations/debtor-email-review/row-list.tsx
  - web/app/(dashboard)/automations/debtor-email-review/row-strip.tsx
  - web/app/(dashboard)/automations/debtor-email-review/detail-pane.tsx
  - web/app/(dashboard)/automations/debtor-email-review/keyboard-shortcuts.tsx
tech-stack:
  added: []
  patterns:
    - url-driven-selection
    - module-level-body-cache
    - customevent-keyboard-bus
    - input-focus-guard
    - tdd-red-green
key-files:
  created:
    - web/app/(dashboard)/automations/debtor-email-review/detail-pane.tsx
    - web/app/(dashboard)/automations/debtor-email-review/keyboard-shortcuts.tsx
    - web/tests/queue/keyboard-shortcuts.test.tsx
    - web/tests/queue/detail-pane.test.tsx
  modified:
    - web/app/(dashboard)/automations/debtor-email-review/page.tsx
    - web/app/(dashboard)/automations/debtor-email-review/queue-tree.tsx
    - web/app/(dashboard)/automations/debtor-email-review/row-list.tsx
    - web/app/(dashboard)/automations/debtor-email-review/row-strip.tsx
  renamed:
    - web/app/(dashboard)/automations/debtor-email-review/predicted-row-list.tsx -> row-list.tsx
    - web/app/(dashboard)/automations/debtor-email-review/predicted-row-item.tsx -> row-strip.tsx
decisions:
  - "Selection state lives entirely in the URL via ?selected=<row-id>. row-list's onSelect prop pushes the URL; KeyboardShortcuts mirrors the same router.push so navigation parity is enforced at the URL layer (no shared React context)."
  - "Action keys dispatch CustomEvents on window (`bulk-review:approve|reject|skip|toggle-body|focus-override|focus-notes|toggle-cheatsheet`). DetailPane subscribes in a useEffect and routes to its existing submit/toggle/focus handlers. This decouples the keyboard module from the detail pane's lifecycle and keeps both files testable in isolation."
  - "Body cache is module-level (`Map<id, {bodyText, bodyHtml}>`), so prefetchReviewEmailBody (called on row-strip hover) survives DetailPane remounts. The first toggleBody on an unprimed row makes a single fetch; subsequent opens render from the Map without flicker."
  - "Skip submits `override_category='unknown'` (server-action routes to decision='reject', the prior labelOnly semantic). The button reads as 'Skip' to the reviewer; the routing is server-side so we don't have to teach the UI two decision codes."
  - "Pending promotion lives as a sibling top-level node under the queue tree (not a tab strip). pushUrl in queue-tree no longer preserves `tab`; the Pending TreeRow sets `?tab=pending` explicitly, clearing topic/entity/mailbox. Tab strip removed from row-list."
  - "Always fetch the candidates list in loadPageData (regardless of `?tab=pending`) so the tree can render the Pending sibling badge. classifier_rules is small; the cost is negligible."
  - "Input-focus guard checks the live `document.activeElement` (preferred over `e.target`) and falls back to the `contenteditable` attribute when jsdom does not populate `isContentEditable`. This is needed for the test that asserts no-op on a contenteditable div."
metrics:
  duration: ~70 min
  tasks: 5
  files: 8
  tests_added: 20  # 14 keyboard-shortcuts + 6 detail-pane
  completed: 2026-04-29
---

# Phase 61 Plan 02: Restore lost bulk-review UX (3-col layout + detail pane + shortcuts)

Restored the four UX features lost in the 60-05 rewrite without reverting
the queue-tree architecture. The bulk-review screen now ships:

- 3-column grid `[clamp(220px,18vw,280px) minmax(380px,460px) 1fr]` inside
  a `max-w-[1600px]` container, with `min-w-0` on every flex/grid child so
  truncate works at viewports 1024-2560.
- Click-driven row selection via `?selected=<row-id>` server fetch (single
  query, separate from the list query so the page's row-list scope stays
  intact).
- A right-column DetailPane with status pill, wrapped subject, 6-cell meta
  grid, lazy body expander, override-category dropdown (5 options), notes
  textarea, and an Approve/Reject/Skip action bar that auto-advances within
  200ms.
- Page-scoped global keyboard shortcuts (↑↓jk/⏎/Space/n/e/r///?) with an
  input-focus guard, plus a Cheatsheet sheet on `?`.
- A Pending-promotion sibling node in the queue tree (replaces the row-pane
  tab strip) and a Queue summary header with total + "X promoted today" pill.

## What changed

### `page.tsx`
- Container `max-w-[1280px]` -> `max-w-[1600px]`; padding `px-8 pt-16` -> `px-6 pt-12`.
- Grid `[320px_1fr]` -> `grid-cols-[clamp(220px,18vw,280px)_minmax(380px,460px)_1fr]` with `min-w-0`.
- Extended `PageSearchParams` with `selected?: string`.
- `loadPageData` now fetches the selected row via `.single()` on
  automation_runs by id (when `?selected=` is set) and returns
  `selectedRow: PredictedRow | null`.
- Candidates fetched unconditionally so the tree can show the Pending
  sibling badge count.
- Mounts `<KeyboardShortcuts rowIds={…} selectedId={…} />` and
  `<Cheatsheet />` once at page level so the canonical row id list flows
  from the server-rendered list.

### `queue-tree.tsx`
- New optional props `candidates` and `promotedTodayCount`.
- Slim `<nav>` (`min-w-0 w-full`); column width comes from the grid.
- Queue summary header above QUEUE BY TOPIC (total count + brand-soft
  "X promoted today" pill, hidden when 0).
- Pending promotion TreeRow rendered as a top-level sibling after the
  topic tree, separated by a top-border. `onActivate` does a plain
  `router.push("/automations/debtor-email-review?tab=pending")` to clear
  topic/entity/mailbox.
- `pushUrl` no longer preserves `tab` (mutually exclusive with topic
  selections).

### `row-list.tsx` (renamed from predicted-row-list.tsx)
- `<Tabs>` strip removed entirely.
- `RowList` accepts the same data plus owns the URL-driven selection: the
  `handleSelect` callback rebuilds URLSearchParams off the live
  searchParams and calls `router.push(?selected=<rowId>)`.
- Pending-promotion panel kept inline (small helper) and gated on
  `selection.tab === "pending"`.
- `min-w-0` hygiene on every container.

### `row-strip.tsx` (renamed from predicted-row-item.tsx)
- Display-only `<button>` element with `aria-pressed`.
- Two-line layout: subject (14px semibold truncate) + sender·rule·time
  (12px muted truncate, tabular-nums on time).
- 3px brand-primary left bar + brand-primary-soft background when
  selected; subtle hover bg otherwise.
- No Approve/Reject buttons. No status pill. No `recordVerdict` calls.
- `onMouseEnter` calls `prefetchReviewEmailBody(row.id)` to prime the
  module-level body cache (D-PREFETCH-NEXT).

### `detail-pane.tsx` (NEW, ~390 lines)
- Module-level `bodyCache: Map<string, {bodyText, bodyHtml}>` plus an
  `inFlight: Map<string, Promise<…>>` so concurrent prefetches dedupe.
- `prefetchReviewEmailBody(id)` exported helper called from row-strip on
  hover. Cache hits and in-flight requests no-op.
- DetailPane component:
  - Empty state when `row=null` ("Select a row from the list to review it").
  - Status pill, wrapped 20px Cabinet subject.
  - 6-cell `<dl>` meta grid: From / Sent / Mailbox / Topic·Entity / Rule fired / Predicted action.
  - Body expander: `MailOpen` icon + "Show full email" / "Hide email"
    toggle. First open lazy-fetches; second open hits the cache; renders
    in a `bg-black/20 max-h-[40vh] overflow-auto pre-wrap` frame.
  - shadcn `<Select>` with the 5 override categories. `ref` exposed via
    `overrideTriggerRef` for the focus-override CustomEvent.
  - shadcn `<Textarea rows={3} maxLength={2000}>`. `ref` exposed for
    focus-notes.
  - Action bar with Lucide `Check / X / SkipForward` icons + keyboard
    hints. Approve = brand-primary fill, Reject = outline-red, Skip = ghost.
  - `submit("approve" | "reject" | "skip")` calls `recordVerdict`. Skip
    sends `override_category="unknown"` (server-side label-only semantic).
  - Auto-advance: `setTimeout(200)` after the recorded verdict ->
    `router.push(window.location.pathname?selected=<next-row-id>)`. Falls
    back to the previous row if at the end of the visible list.
  - useEffect subscribes to all six `bulk-review:*` CustomEvents and
    routes them to `submit / toggleBody / overrideTriggerRef.focus /
    notesRef.focus`. Cleanup removes every listener.
  - Per-row state reset (override / notes / body) keyed on `row?.id`.

### `keyboard-shortcuts.tsx` (NEW, ~195 lines)
- `KeyboardShortcuts({rowIds, selectedId})`: single window keydown
  listener with cleanup.
  - `ArrowDown / j` -> navigate +1, `ArrowUp / k` -> navigate -1, with
    index clamping and `selectedId === target` no-op guard. Uses
    `router.push(pathname?selected=<id>)`.
  - `Enter` -> dispatch `bulk-review:approve` (preventDefault).
  - `Space` -> dispatch `bulk-review:reject` (preventDefault).
  - `n` -> dispatch `bulk-review:skip`.
  - `e` -> dispatch `bulk-review:toggle-body`.
  - `r` -> dispatch `bulk-review:focus-override`.
  - `/` -> dispatch `bulk-review:focus-notes` (preventDefault).
  - `?` -> dispatch `bulk-review:toggle-cheatsheet`.
- Input-focus guard: checks `document.activeElement` (live), falls
  through to the `contenteditable` attribute as a jsdom workaround.
- `Cheatsheet`: shadcn `Sheet` whose open state toggles on the
  `bulk-review:toggle-cheatsheet` CustomEvent. Renders a 9-row table
  with `<kbd>` elements styled with V7 tokens.
- Exports `KEYBOARD_EVENTS` map for the test suite + DetailPane
  consumers.

### Tests
- `web/tests/queue/keyboard-shortcuts.test.tsx` — 14 cases:
  navigation (4) + action CustomEvents (7) + input-focus guard (3).
- `web/tests/queue/detail-pane.test.tsx` — 6 cases:
  empty state + meta render + Approve/Reject/Skip submit + auto-advance
  with `vi.useFakeTimers` + `bulk-review:approve` CustomEvent wiring.
- All `next/navigation` is mocked; `recordVerdict` and
  `fetchReviewEmailBody` are stubbed at the module boundary; `sonner.toast`
  is stubbed.

## Verification

- `pnpm exec tsc --noEmit -p .` — clean except for the two pre-existing
  `dotenv` errors in `web/lib/debtor-email/{icontroller-catchup,replay}.ts`
  that 61-01 already deferred.
- `pnpm vitest run tests/queue/` — **57/57 green** (4 pre-existing 60-05
  + 13 from 61-01 + 14 keyboard-shortcuts + 6 detail-pane).
- File inventory: exactly 8 files in
  `web/app/(dashboard)/automations/debtor-email-review/` (actions,
  detail-pane, keyboard-shortcuts, page, queue-tree, race-cohort-banner,
  row-list, row-strip). No `predicted-row-*.tsx`.
- Plan markers verified:
  - `grep -q "max-w-\[1600px\]" page.tsx` ✓
  - `grep -q "grid-cols-\[clamp" page.tsx` ✓
  - `grep -q "Pending promotion" queue-tree.tsx` ✓ (2 occurrences)
  - `grep -q "Queue summary" queue-tree.tsx` ✓ (2 occurrences)

## Deviations from plan

### Auto-fixed issues

**1. [Rule 3 - Blocker] jsdom does not populate `isContentEditable` after `setAttribute`**
- **Found during:** Task 3 GREEN
- **Issue:** The "no-op when activeElement has [contenteditable='true']"
  test failed because jsdom does not flip `HTMLElement.isContentEditable`
  when the attribute is set programmatically — the property remained
  `false`, the guard let the keydown through, and `pushMock` was called.
- **Fix:** Added a fallback that reads the `contenteditable` attribute
  directly when the live property is false:
  `const ce = candidate.getAttribute("contenteditable"); if (ce === "" || ce === "true" || ce === "plaintext-only") return true;`
  Real browsers return `true` from `isContentEditable` for the same
  markup, so this is a strict superset of the previous behaviour.
- **Files modified:** `web/app/(dashboard)/automations/debtor-email-review/keyboard-shortcuts.tsx`
- **Commit:** `90ababa`

### Process notes

- **Cheatsheet shipped in Task 3's commit.** Task 5 in the plan called
  for adding the Cheatsheet sub-component to keyboard-shortcuts.tsx. I
  bundled it into Task 3's GREEN commit since it lives in the same file
  and all the imports (Sheet, useState) were already loaded. Task 5
  reduced to running the final tsc + vitest gate, which passed without
  any additional code edits. No tests were modified — the existing
  page.test.tsx uses `readFileSync` + dynamic `loadPageData` imports and
  did not reference the renamed component names.
- **`pnpm install` ran on Task 1.** The worktree did not have
  `node_modules` populated. Standard install, no version pins changed.
  `pnpm-lock.yaml` was already committed as untracked at worktree start
  (carried over from the parent branch); after install it stayed
  identical and was committed with Task 1 to keep the worktree
  reproducible.

## TDD gate compliance

- Task 3 RED: 10/14 tests failed against the Task 1 stub.
  Commit: `8792586` — `test(61-02): RED gate for KeyboardShortcuts`.
- Task 3 GREEN: 14/14 tests pass with the implementation.
  Commit: `90ababa` — `feat(61-02): GREEN — implement KeyboardShortcuts`.
- Task 4 RED: 6/6 tests failed against the Task 1 stub (which renders null).
  Commit: `d361959` — `test(61-02): RED gate for DetailPane`.
- Task 4 GREEN: 6/6 tests pass with the implementation.
  Commit: `33007fa` — `feat(61-02): GREEN — DetailPane`.
- Commit chain: `feat(61-02)` x2 (layout + tree) -> `test(61-02)` ->
  `feat(61-02) GREEN` (keyboard) -> `test(61-02)` ->
  `feat(61-02) GREEN` (detail-pane).

## Deferred issues

The two `dotenv` tsc errors in `web/lib/debtor-email/{icontroller-catchup,replay}.ts`
are still open. Out of scope for Plan 02 (logged in 61-01's deferred-items.md).

## Self-Check: PASSED

Files verified:
- FOUND: `web/app/(dashboard)/automations/debtor-email-review/page.tsx`
- FOUND: `web/app/(dashboard)/automations/debtor-email-review/queue-tree.tsx`
- FOUND: `web/app/(dashboard)/automations/debtor-email-review/row-list.tsx`
- FOUND: `web/app/(dashboard)/automations/debtor-email-review/row-strip.tsx`
- FOUND: `web/app/(dashboard)/automations/debtor-email-review/detail-pane.tsx`
- FOUND: `web/app/(dashboard)/automations/debtor-email-review/keyboard-shortcuts.tsx`
- FOUND: `web/tests/queue/keyboard-shortcuts.test.tsx`
- FOUND: `web/tests/queue/detail-pane.test.tsx`
- MISSING (intentional): `web/app/(dashboard)/automations/debtor-email-review/predicted-row-list.tsx`
- MISSING (intentional): `web/app/(dashboard)/automations/debtor-email-review/predicted-row-item.tsx`

Commits verified:
- FOUND: `9594337` — feat(61-02): 3-col layout shell + row rename + ?selected loader
- FOUND: `97ee618` — feat(61-02): queue tree gets summary header + Pending sibling node
- FOUND: `8792586` — test(61-02): RED gate for KeyboardShortcuts component
- FOUND: `90ababa` — feat(61-02): GREEN — implement KeyboardShortcuts + Cheatsheet
- FOUND: `d361959` — test(61-02): RED gate for DetailPane
- FOUND: `33007fa` — feat(61-02): GREEN — DetailPane (meta + body + override + notes + actions)
