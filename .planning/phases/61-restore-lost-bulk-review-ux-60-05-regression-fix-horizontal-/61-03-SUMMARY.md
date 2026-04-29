---
phase: 61-restore-lost-bulk-review-ux-60-05-regression-fix-horizontal-
plan: 03
subsystem: debtor-email-review
tags: [polish, kbd, min-w-0, reduced-motion, deferred-uat]
requires: [61-01, 61-02]
provides:
  - kbd-hint-elements
  - reduced-motion-auto-advance
  - tree-row-min-w-0-hygiene
affects:
  - web/app/(dashboard)/automations/debtor-email-review/detail-pane.tsx
  - web/app/(dashboard)/automations/debtor-email-review/queue-tree.tsx
tech-stack:
  added: []
  patterns:
    - prefers-reduced-motion-fast-path
    - flex-min-w-0-shrink-0-pairing
key-files:
  created: []
  modified:
    - web/app/(dashboard)/automations/debtor-email-review/detail-pane.tsx
    - web/app/(dashboard)/automations/debtor-email-review/queue-tree.tsx
decisions:
  - "Auto-advance honours prefers-reduced-motion by skipping the 200ms setTimeout entirely instead of shortening it. Keeps the perceptual rhythm for default users (200ms feels deliberate) while removing the wait for users who opted out of motion."
  - "Polish-only mode: applied every static edit the plan called for, deferred the 33-item manual UAT checklist (user not at dev server). Checklist copied verbatim into this SUMMARY for a later session."
  - "Used <kbd> instead of <span> for action-bar shortcut hints — semantic markup, screen readers announce as 'key', matches the Cheatsheet styling pattern."
metrics:
  duration: ~25 min
  tasks: 1 (polish only; UAT deferred)
  files: 2
  tests_added: 0
  completed: 2026-04-29
---

# Phase 61 Plan 03: Visual polish + UAT (polish-only mode)

Applied the static polish edits Plan 03 calls for. The 33-item manual UAT
checklist is deferred — the user is not currently at the dev server. The
checklist is preserved verbatim at the bottom of this document so it can be
worked through in a later session.

## Polish edits applied

**`web/app/(dashboard)/automations/debtor-email-review/detail-pane.tsx`**
- Action-bar `<span>` shortcut hints (⏎/Space/n) replaced with `<kbd>`
  elements styled per the plan:
  `className="ml-2 px-1.5 py-0.5 rounded-[4px] bg-black/30 text-[11px] font-mono opacity-70"`.
  Semantic markup; screen readers now announce these as keys.
- Auto-advance honours `prefers-reduced-motion`: when the media query
  matches, the URL push fires synchronously; otherwise the existing 200ms
  `setTimeout` is kept. `window.matchMedia` accessed defensively
  (`typeof window !== "undefined"`) so SSR import paths stay clean.

**`web/app/(dashboard)/automations/debtor-email-review/queue-tree.tsx`**
- Tree-row inner flex containers got `min-w-0` so `truncate` can actually
  trim long topic/entity labels at the narrow column width
  (`clamp(220px,18vw,280px)`).
- Expand-chevron button + count-badge wrapper pinned with `shrink-0` so
  they cannot squeeze the label out of the available width.

## Polish edits NOT needed (already correct on disk)

| Plan item                          | Status                                                                                                |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Icon audit (no emoji icons)        | Confirmed — `grep -P '[\x{1F300}-\x{1FAFF}]\|[\x{2600}-\x{27BF}]' …/*.tsx` returns empty (exit 1).    |
| Lucide icons sized 16px            | Confirmed — `MailOpen, Check, X, SkipForward` all `size={16}`.                                        |
| `min-w-0` on flex/grid children    | All `truncate`/`flex-1` parents in `detail-pane.tsx`, `row-strip.tsx`, `row-list.tsx` already have it. Tree row was the only gap → fixed above. |
| Cheatsheet `<kbd>` styling         | Already uses styled `<kbd>` per row in `keyboard-shortcuts.tsx`. No edit needed.                      |
| Cheatsheet two-column layout       | Already a `<table>` with key column + description column.                                              |
| Tab order on row strip             | `RowStrip` is a native `<button>` with `aria-pressed` — natively tabbable, Enter/Space activates. No `tabIndex={0}` / `role="button"` shim needed. |
| Body-cache verification            | `bodyCache: Map` + `inFlight: Map` in `detail-pane.tsx`; first open lazy-fetches, second open reads from the Map. Code-confirmed; runtime confirmation deferred to UAT step #16. |

## Static verification results (against acceptance criteria)

| # | Criterion                                                                            | Status                                                              |
| - | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| 1 | All Lucide icons render at 16px; no emoji icons remain in the route                  | **CONFIRMED-BY-CODE** (grep returns empty; all `size={16}`)         |
| 2 | No horizontal scrollbar at 1024-2560 in light or dark mode                           | **CONFIRMED-BY-CODE** for the layout primitives (max-w-[1600px], grid-cols-[clamp(220px,18vw,280px)_minmax(380px,460px)_1fr], min-w-0 on every flex/grid child including tree rows after this plan). Visual confirmation at each width = **NEEDS-MANUAL-UAT**. |
| 3 | Auto-advance ≤220ms after Approve/Reject/Skip                                        | **CONFIRMED-BY-CODE** (`setTimeout(advance, 200)`; reduced-motion shortcuts to 0ms). Wall-clock measurement = **NEEDS-MANUAL-UAT**. |
| 4 | Body lazy-fetch issues exactly one fetch per row id; second open hits cache          | **CONFIRMED-BY-CODE** (`bodyCache.has(row.id)` short-circuit in `toggleBody`). DevTools network-tab confirmation = **NEEDS-MANUAL-UAT**. |
| 5 | All 9 keyboard shortcuts work end-to-end against a real predicted row                | **CONFIRMED-BY-TESTS** (14 keyboard-shortcuts vitest cases green). End-to-end against acceptance row = **NEEDS-MANUAL-UAT**. |
| 6 | Light + dark mode both render cleanly                                                | **NEEDS-MANUAL-UAT** (no automated visual diff)                     |
| 7 | Persistence round-trip: review_override + review_note + agent_runs.corrected_category | **CONFIRMED-BY-TESTS** (Plan 01 + Plan 02 vitest covers the contract). DB inspection on a real row = **NEEDS-MANUAL-UAT**. |

## Gate results after polish

- `pnpm tsc --noEmit -p .` — clean except the two pre-existing `dotenv`
  errors in `web/lib/debtor-email/{icontroller-catchup,replay}.ts`
  (deferred since 61-01).
- `pnpm vitest run tests/queue/` — **57/57 green** (4 pre-existing 60-05
  + 13 from 61-01 + 14 keyboard-shortcuts + 6 detail-pane).

## Deferred UAT checklist (run in a later session)

Start the dev server (`cd web && pnpm dev`), open
http://localhost:3000/automations/debtor-email-review with at least one row
in `automation_runs WHERE status='predicted' AND swarm_type='debtor-email'`
(any acceptance-environment row). Then tick each box:

### A. Layout sanity (no horizontal overflow)

- [ ] 1. At 1024×768 — confirm no horizontal scrollbar appears
- [ ] 2. At 1280×800 — same
- [ ] 3. At 1440×900 — same
- [ ] 4. At 1920×1080 — same
- [ ] 5. At 2560×1440 (or zoomed-out equivalent) — same; container caps at 1600px and centers
- [ ] 6. Toggle dark/light mode (existing V7 toggle in sidebar) — confirm both render cleanly

### B. Tree column

- [ ] 7. "Queue summary" header shows total count + "X promoted today" pill
- [ ] 8. "Pending promotion" appears as a sibling top-level node below topic roots (not as a tab in the row pane)
- [ ] 9. Clicking Pending promotion shows the candidate-rules pane in column 2
- [ ] 10. Tree column width visually narrower than before (was 320px, now ~220-280px)

### C. Row list (column 2)

- [ ] 11. Each row shows two lines: subject + meta. No Approve/Reject buttons
- [ ] 12. Clicking a row updates the URL with `?selected=<id>` and highlights the row with a 3px brand-primary left bar
- [ ] 13. Race-cohort banner still appears when `?rule=` matches a today-promoted rule

### D. Detail pane (column 3)

- [ ] 14. Empty state shows when no row selected
- [ ] 15. With a row selected: status pill, wrapped subject, 6-cell meta grid, body button, override dropdown, notes textarea, 3-button action bar all visible
- [ ] 16. Click "Show full email" — body loads within 1-2s, second open is instant (no spinner = cache hit)
- [ ] 17. Override dropdown shows exactly 5 options: Payment, Auto-reply, OOO (temporary), OOO (permanent), Unknown (skip)
- [ ] 18. Type in notes — Approve persists notes; verify in DB:
      ```sql
      SELECT result->'review_note' FROM automation_runs WHERE id = '<id>';
      ```
- [ ] 19. Approve advances to next row in ≤220ms (eyeball it)
- [ ] 20. Reject same. Skip (n key) same.
- [ ] 21. Skip → DB row has status='feedback' AND result.review_override='unknown' AND no Outlook side-effects (verify by checking that automation_runs.completed_at set but no Outlook category applied — easiest check: in iController acceptance the email is NOT removed from inbox)

### E. Keyboard shortcuts — with a row selected

- [ ] 22. ↓ moves selection down; ↑ moves up
- [ ] 23. j and k mirror ↓ and ↑
- [ ] 24. ⏎ approves
- [ ] 25. Space rejects (and does not scroll the page)
- [ ] 26. n skips
- [ ] 27. e toggles body
- [ ] 28. r focuses override dropdown (visible focus ring on the trigger)
- [ ] 29. / focuses notes textarea (and does not navigate the URL)
- [ ] 30. ? opens the cheatsheet sheet
- [ ] 31. With focus inside the notes textarea, press ⏎/Space/n/e — none of the actions fire (input-focus guard works)

### F. Persistence regression check

- [ ] 32. Approve a row with override_category='auto_reply' (different from predicted) and a 50-char note. Verify in DB:
      ```sql
      SELECT decision_path, result->'review_override', result->'review_note', corrected_category
      FROM automation_runs ar JOIN agent_runs agr ON agr.automation_run_id = ar.id
      WHERE ar.id = '<id>';
      ```
      - `automation_runs.result.review_override = 'auto_reply'`
      - `automation_runs.result.review_note = '<the note>'`
      - `agent_runs.corrected_category = 'auto_reply'`
- [ ] 33. The classifier-verdict-worker Inngest function picked up the event and ran the auto_reply branch (check Inngest dashboard for `classifier/verdict.recorded`).

## Deviations from plan

### Auto-fixed issues

None. All polish items the plan called for either applied cleanly or were
already correct on disk.

### Process notes

- **UAT deferred under explicit polish-only directive.** The user is not at
  the dev server. The 33-item manual UAT block (which is the entirety of
  Plan 03 Task 2) is preserved verbatim above for a later session.
- **`pnpm install` ran on entry.** The worktree did not have `node_modules`
  populated. No version pins changed.

## Deferred issues

Two pre-existing `dotenv` tsc errors in
`web/lib/debtor-email/{icontroller-catchup,replay}.ts` remain open (logged
in 61-01's deferred-items.md). Out of scope for Plan 03.

## Self-Check: PASSED

Files verified:
- FOUND: `web/app/(dashboard)/automations/debtor-email-review/detail-pane.tsx`
- FOUND: `web/app/(dashboard)/automations/debtor-email-review/queue-tree.tsx`
- FOUND: `.planning/phases/61-restore-lost-bulk-review-ux-60-05-regression-fix-horizontal-/61-03-SUMMARY.md`

Commits verified:
- FOUND: `ac7b2b1` — chore(61-03): kbd hint elements + reduced-motion auto-advance
- FOUND: `d298367` — chore(61-03): min-w-0 hygiene on queue-tree row inner flex
