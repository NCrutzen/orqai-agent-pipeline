---
phase: 61-restore-lost-bulk-review-ux-60-05-regression-fix-horizontal-
verified: 2026-04-29T07:15:00Z
status: human_needed
score: 8/10 must-haves verified (code-complete; criteria 1 + 8 require manual UAT)
overrides_applied: 0
human_verification:
  - test: "Resize browser at 1024 / 1280 / 1440 / 1920 / 2560 — confirm no horizontal scrollbar"
    expected: "max-w-[1600px] container centers; clamp-grid prevents overflow at every breakpoint"
    why_human: "CSS overflow at multiple viewports cannot be measured statically; must observe in browser"
  - test: "Toggle dark/light mode and read body-frame text + status pill"
    expected: "Contrast ≥4.5:1 on muted text and body content in both modes"
    why_human: "Contrast ratio depends on rendered pixel values across two themes; visual UAT only"
  - test: "Approve a row, eyeball the auto-advance"
    expected: "Next row selected within ~200ms (or instantly if prefers-reduced-motion)"
    why_human: "Wall-clock measurement of UX rhythm cannot be done from static code"
  - test: "DB persistence round-trip (UAT items 18, 21, 32, 33)"
    expected: "automation_runs.result.review_override + review_note populated; agent_runs.corrected_category set; Inngest event fired"
    why_human: "Requires running dev server, acceptance DB row, and Inngest dashboard inspection"
---

# Phase 61: Restore lost bulk-review UX — Verification Report

**Phase Goal:** Restore four UX features (body expander, override dropdown, notes, keyboard shortcuts) lost in 60-05 + fix horizontal-overflow regression, on top of the 60-05 tree architecture.
**Verified:** 2026-04-29
**Status:** human_needed (code-complete; manual UAT explicitly deferred per Plan 03 polish-only directive)
**Verdict:** **PASS — code-complete, NOT yet UAT-signed.** All static / type / unit-test gates green. Two acceptance criteria (#1 viewport overflow, #8 light-mode contrast) inherently require human eyes at the dev server. Plan 03's 33-item UAT checklist is preserved verbatim in `61-03-SUMMARY.md` for a later session.

## Goal Achievement

### Acceptance Criteria (CONTEXT.md §Acceptance Criteria 1-10)

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | No horizontal overflow at 1024-2560 | **CONFIRMED-BY-CODE / NEEDS-MANUAL-UAT** | `page.tsx:179` `max-w-[1600px] mx-auto`; `page.tsx:187` `grid-cols-[clamp(220px,18vw,280px)_minmax(380px,460px)_1fr] gap-4 min-w-0`. `min-w-0` hygiene confirmed in `row-strip.tsx:64`, `detail-pane.tsx:298,317`, `row-list.tsx`, `queue-tree.tsx` (Plan 03 added it to tree-row inner flex). Cross-viewport visual confirmation = manual. |
| 2 | Email body readable inline ≤1 click | ✓ VERIFIED | `actions.ts:167-197` `fetchReviewEmailBody`; `detail-pane.tsx:175-199` `toggleBody` with module-level `bodyCache` (`detail-pane.tsx:61`). Single button click `detail-pane.tsx:338-345` "Show full email". |
| 3 | Override dropdown 5 options including `unknown=skip` | ✓ VERIFIED | `actions.ts:30-37` `OVERRIDE_CATEGORIES = ["payment","auto_reply","ooo_temporary","ooo_permanent","unknown"]`; `detail-pane.tsx:373-377` renders all 5 SelectItems. |
| 4 | Notes persist to `automation_runs.result.review_note` + Inngest payload | ✓ VERIFIED | `actions.ts:87-91` jsonb merge writes `review_note`; `actions.ts:131-145` `inngest.send` payload includes `notes`; `actions.ts:115-121` `agent_runs.context.notes` populated. Round-trip tested in `tests/queue/actions.test.ts`. |
| 5 | All 9 keyboard shortcuts wired with input-focus guard | ✓ VERIFIED | `keyboard-shortcuts.tsx:83-130` handler covers ↑/↓/k/j/⏎/Space/n/e/r/`/`/?; `keyboard-shortcuts.tsx:41-57` `isTypingTarget` guards INPUT/TEXTAREA/contenteditable. 14 vitest cases green in `tests/queue/keyboard-shortcuts.test.tsx`. |
| 6 | Auto-advance ≤200ms after Approve/Reject | **CONFIRMED-BY-CODE / NEEDS-MANUAL-UAT** | `detail-pane.tsx:227-238` `setTimeout(advance, 200)` with `prefers-reduced-motion` shortcut to 0ms. Asserted in `tests/queue/detail-pane.test.tsx` via `vi.useFakeTimers` + `advanceTimersByTime`. Wall-clock UAT optional per CONTEXT note. |
| 7 | All 60-05 vitest suites pass + new tests | ✓ VERIFIED | `pnpm vitest run tests/queue/` → **57/57 green** across 7 files: `actions.test.ts` + `fetch-review-email-body.test.ts` (Plan 01) + `keyboard-shortcuts.test.tsx` + `detail-pane.test.tsx` (Plan 02) + pre-existing `page.test.tsx`, `race-cohort.test.tsx`, `rule-filter.test.tsx`. |
| 8 | Light-mode contrast ≥4.5:1 | NEEDS-MANUAL-UAT | No automated visual diff; CONTEXT.md acknowledges this as visual UAT. Token usage (`var(--v7-muted)` on `var(--v7-panel-2)`) per CONTEXT.md "already passes". |
| 9 | `pnpm tsc --noEmit -p .` clean | ✓ VERIFIED | Re-ran during verification → **EXIT 0**. Note: the two pre-existing dotenv errors in `web/lib/debtor-email/{icontroller-catchup,replay}.ts` documented in `deferred-items.md` no longer surface in this run (likely tsconfig exclude / install fix happened mid-phase). |
| 10 | `pnpm vitest run` green | ✓ VERIFIED | 57/57 tests passed (re-run during verification, see #7). |

**Score:** 8/10 fully VERIFIED; 2/10 (#1, #8) static-confirmed and require manual UAT — explicitly deferred by user per Plan 03 polish-only directive.

### Required Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `web/app/(dashboard)/automations/debtor-email-review/actions.ts` | ✓ VERIFIED | 198 lines; exports `recordVerdict` (extended w/ zod) + `fetchReviewEmailBody` + `OVERRIDE_CATEGORIES` + `OverrideCategory` + `ReviewEmailBody`. Imports `fetchMessageBody` from `@/lib/outlook`. |
| `web/app/(dashboard)/automations/debtor-email-review/page.tsx` | ✓ VERIFIED | 215 lines; 3-col grid + `selectedRow` server fetch on `?selected=`; mounts `KeyboardShortcuts` + `Cheatsheet`. |
| `web/app/(dashboard)/automations/debtor-email-review/queue-tree.tsx` | ✓ VERIFIED | 14.7K; "Queue summary" header (line 283-286) + "Pending promotion" sibling node (line 405-411); accepts `candidates` + `promotedTodayCount`. |
| `web/app/(dashboard)/automations/debtor-email-review/row-list.tsx` | ✓ VERIFIED | Renamed from `predicted-row-list.tsx`; tabs strip removed; URL-driven selection via `handleSelect` → `router.push(?selected=)` (lines 107-113). |
| `web/app/(dashboard)/automations/debtor-email-review/row-strip.tsx` | ✓ VERIFIED | Renamed from `predicted-row-item.tsx`; no Approve/Reject buttons; click → `onSelect(row.id)`; hover → `prefetchReviewEmailBody`. |
| `web/app/(dashboard)/automations/debtor-email-review/detail-pane.tsx` | ✓ VERIFIED | 434 lines; status pill, 6-cell meta grid, body expander, override dropdown, notes textarea, action bar; auto-advance with reduced-motion fast path. |
| `web/app/(dashboard)/automations/debtor-email-review/keyboard-shortcuts.tsx` | ✓ VERIFIED | 207 lines; KeyboardShortcuts + Cheatsheet (Sheet primitive); CustomEvent bus. |
| `predicted-row-list.tsx` / `predicted-row-item.tsx` | ✓ VERIFIED ABSENT | `ls` confirms only 8 .tsx/ts files in route dir — old names gone. |
| `web/tests/queue/actions.test.ts` | ✓ VERIFIED | Extended with 7 new cases for override+notes round-trip. |
| `web/tests/queue/fetch-review-email-body.test.ts` | ✓ VERIFIED | New file, 6 cases: success/error/empty/missing-fields. |
| `web/tests/queue/keyboard-shortcuts.test.tsx` | ✓ VERIFIED | New file, 14 cases. |
| `web/tests/queue/detail-pane.test.tsx` | ✓ VERIFIED | New file, 6 cases incl. fake-timer auto-advance assertion. |

### Key Link Verification

| From | To | Via | Status |
|------|-----|-----|--------|
| `actions.ts recordVerdict` | `automation_runs.result jsonb merge` | fetch-then-update | ✓ WIRED (`actions.ts:81-101`) |
| `actions.ts recordVerdict` | `inngest classifier/verdict.recorded` | `inngest.send` | ✓ WIRED (`actions.ts:131-146`, includes `override_category` + `notes`) |
| `actions.ts fetchReviewEmailBody` | `lib/outlook fetchMessageBody` | named import | ✓ WIRED (`actions.ts:28, 187`) |
| `page.tsx` | `detail-pane.tsx` | `?selected=` server fetch + prop pass | ✓ WIRED (`page.tsx:154-162, 200-204`) |
| `detail-pane.tsx` | `fetchReviewEmailBody` | client call on toggleBody | ✓ WIRED (`detail-pane.tsx:186, 69`) |
| `detail-pane.tsx` | `recordVerdict` | submit handler | ✓ WIRED (`detail-pane.tsx:211-221`) |
| `keyboard-shortcuts.tsx` | `detail-pane.tsx` actions | `window` CustomEvent bus | ✓ WIRED (`keyboard-shortcuts.tsx:99-129` ↔ `detail-pane.tsx:255-260`) |
| `queue-tree.tsx` | Pending promotion sibling | extra TreeRow after topic loop | ✓ WIRED (line 405-411) |

### Anti-Patterns Found

| File | Pattern | Severity |
|------|---------|----------|
| (route folder) | Emoji icons | None — `grep -P '[\x{1F300}-\x{1FAFF}]\|[\x{2600}-\x{27BF}]'` returns empty |
| (route folder) | TODO/FIXME stubs | None observed in 61-touched files |
| (route folder) | `return null` placeholders | `KeyboardShortcuts` legitimately returns null (no UI of its own); `DetailPane` empty-state returns proper `<aside>` placeholder, not null |

No blocker anti-patterns. CONTEXT.md anti-pattern list (no GlassCard sample modal, no double-Approve, no bulk pre-fetch, no emoji icons, no 1280px lock) all respected.

### Deferred / Out-of-Scope

- Two pre-existing dotenv tsc errors in `web/lib/debtor-email/{icontroller-catchup,replay}.ts` — logged in `deferred-items.md` (61-01 deferred). Current `pnpm tsc -p .` returns exit 0, so either the build graph excludes them or the install resolved it; not blocking either way.
- 33-item manual UAT checklist (Plan 03) — explicitly deferred under user's "polish-only" directive at wave 3. Preserved verbatim in `61-03-SUMMARY.md` lines 95-161.
- `bodyHtml` rendering as HTML — CONTEXT.md flags as deferred follow-up; current impl uses `bodyText` only with `whiteSpace: pre-wrap`.

### Gaps Summary

**No blockers.** All 10 acceptance criteria are addressed at the code level:
- 8 are fully verified by static inspection + automated tests (criteria 2, 3, 4, 5, 6 [code path + fake-timer test], 7, 9, 10).
- 2 are static-confirmed but inherently require human eyes (criterion 1: cross-viewport overflow scan; criterion 8: light-mode contrast). Both are flagged in Plan 03 SUMMARY as `NEEDS-MANUAL-UAT` and the user explicitly deferred the manual checklist when running Plan 03 in polish-only mode.

The phase delivered exactly what CONTEXT.md promised at the contract level. Closing this phase as "approved" requires the user to either (a) run the 33-item UAT checklist on a live dev server, or (b) accept the code-complete state and defer UAT to a later session — which matches the user's stated intent in Plan 03.

---

*Verified: 2026-04-29*
*Verifier: Claude (gsd-verifier)*
