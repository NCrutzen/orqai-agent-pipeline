---
status: partial
phase: 61-restore-lost-bulk-review-ux-60-05-regression-fix-horizontal-
source:
  - 61-01-SUMMARY.md
  - 61-02-SUMMARY.md
  - 61-03-SUMMARY.md
  - 61-VERIFICATION.md
started: 2026-04-29T13:25:54Z
updated: 2026-04-29T13:55:00Z
notes: |
  61-VERIFICATION.md already verified 8/10 acceptance criteria statically
  (code paths + 57/57 vitest pass). Only 4 items truly need human eyes:
  cross-viewport overflow, dark/light contrast, auto-advance timing,
  and DB persistence round-trip. Test against the live URL
  /automations/debtor-email/review (post-56.7-03; 307-redirects from
  the original /automations/debtor-email-review).
---

## Current Test

[testing complete]

## Tests

### 1. Cross-viewport horizontal overflow
expected: |
  Open /automations/debtor-email/review. Resize the browser at
  1024, 1280, 1440, 1920, and 2560 px. At every width:
  - No horizontal scrollbar on the page
  - The 3-column grid (queue tree | row list | detail pane)
    stays inside a max-w-[1600px] centered container
  - Tree column clamps between 220-280 px
  - Row-list column stays between 380-460 px
  - Detail pane fills the rest, no content overflow
result: pass
notes: |
  Verified by user at the live URL with screenshot evidence
  2026-04-29 ~15:38 (wide viewport ~2000+ px) showing centered
  3-col grid with no horizontal scrollbar. Narrow-end widths
  also confirmed correct by user.

### 2. Light-mode + dark-mode contrast on body text and status pill
expected: |
  Toggle dark/light mode. Read the email body in the detail pane
  and the status pill ("Predicted" / "Approved" / "Rejected"):
  - Both readable without straining
  - Muted/secondary text doesn't dissolve into the panel background
  - Status pill text is legible against its tinted bg in both modes
  (Spec target: WCAG AA ≥4.5:1 for body, ≥3:1 for the pill chip.)
result: blocked
blocked_by: missing-ui
reason: |
  No theme toggle is mounted in the app shell.
  `web/components/theme-toggle.tsx` exists but is never imported
  or rendered. Theme is currently driven only by OS
  prefers-color-scheme (or by manually setting data-theme via
  DevTools). Contrast in dark mode looks fine in the screenshot
  used for Test 1; light-mode comparison deferred until the
  toggle is wired (gap below).

### 3. Approve auto-advance timing
expected: |
  With the detail pane open on a row, click Approve (or press E).
  The row clears and the next predicted row auto-selects within
  ~200 ms. Feels snappy, not laggy. If your OS has
  prefers-reduced-motion enabled, advance should be effectively
  instant (0 ms).
result: pass
notes: User confirmed snappy auto-advance against the live UI 2026-04-29.

### 4. Persistence round-trip — override + notes
expected: |
  Pick a predicted row. In the detail pane:
  1. Choose a different category from the override dropdown
     (e.g. predicted=ooo_temporary, override=payment_admittance)
  2. Type a note in the notes textarea
  3. Click Approve
  Then verify the write landed:
  - automation_runs.result.review_override = your override
  - automation_runs.result.review_note      = your note text
  - agent_runs.context.notes                = your note text
  - inngest event classifier/verdict.recorded fired with both
    override_category + notes in the payload
result: pass
notes: |
  Verified via three real verdicts user submitted ~14:07-14:09 today.
  Round-trip data observed in Supabase:

  automation_runs.result:
  - 00d2413d: review_override=invoice_copy_request,
    review_note="It an copy request for an attachment with PO number"
  - 89a64bfe: review_override=payment_admittance,
    review_note="See email body for the payment attitance"
  - b96f78bb: review_override=unknown,
    review_note="It is an dispute with Q&A in it"

  agent_runs (sister rows):
  - a490bc8b: human_verdict=approved,
    corrected_category=invoice_copy_request, human_notes match
  - 2e849001: human_verdict=approved,
    corrected_category=payment_admittance, human_notes match
  - acae26a6: human_verdict=rejected_other,
    corrected_category=unknown, human_notes match

  Audit trail (verdict_set_at + verdict_set_by) populated on all
  three with reviewerEmail nick.crutzen.cb@moyneroberts.com.

  Inngest event chain already verified end-to-end in 56.7-UAT
  Test 4 (same recordVerdict server action, same inngest.send call).

  Doc-vs-code nit: 60-05 SUMMARY + 61-VERIFICATION mention
  `agent_runs.context.notes` but the real column is
  `agent_runs.human_notes` (top-level column, not JSONB). Code
  is correct; the docs ref needs a small correction. Filed as
  a tiny doc fix, not a code issue.

## Summary

total: 4
passed: 3
issues: 0
pending: 0
skipped: 0
blocked: 1

## Gaps

- truth: "Users can switch between light and dark mode in-product via a visible toggle in the app shell"
  status: missing
  reason: "ThemeToggle component exists at web/components/theme-toggle.tsx but is never imported/rendered. Theme is currently driven only by OS prefers-color-scheme."
  severity: minor
  test: 2
  artifacts:
    - web/components/theme-toggle.tsx (exists, unused)
    - web/components/theme-provider.tsx (mounts next-themes provider)
  missing:
    - Import + render <ThemeToggle /> somewhere in the v7 sidebar or topbar
    - Likely candidate: web/components/v7/swarm-sidebar.tsx footer area, or
      a dashboard-layout topbar component
  scope_note: |
    Not in original 10 acceptance criteria for Phase 61. Surfaced during
    UAT because criterion #8 (light-mode contrast) implies the app must
    be switchable in-product to verify. Track as Phase 61 follow-up;
    one task, no plan needed.
