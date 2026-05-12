---
slug: icontroller-delete-verify-post-fix
status: resolved
trigger: |
  iController cleanup: 6 NEW "Delete verification failed: email still present after click sequence"
  failures over the past ~21h, latest 08:15 UTC today on debiteuren@smeba.nl.

  This is suspicious because commit a76d0a2 (2026-05-11) was supposed to resolve this exact
  failure mode via per-mailbox URL scoping (/messages/index/mailbox/{id} on both passes of
  deleteEmailOnPage). Either the fix didn't fully land, didn't cover all code paths, or there's
  a new/residual root cause distinct from the cross-mailbox sidebar-filter bug.

  Period stats: +22 completed, +6 failed = 79% success — fix partially worked but not fully.
  Deferred queue drained (14 → 0), so workers are firing.
created: 2026-05-12
updated: 2026-05-12
---

## Symptoms

- **Expected:** After commit `a76d0a2`, `Delete verification failed` errors should drop to ~0 because both passes now navigate to per-mailbox URLs. iController cleanup-worker should drain queued rows with >95% success.
- **Actual:** 6 new `Delete verification failed: email still present after click sequence` failures over ~21h. Latest 2026-05-12 08:15 UTC on debiteuren@smeba.nl. 79% success rate (22 completed / 6 failed).
- **Error:** `Delete verification failed: email still present after click sequence` — same string as pre-fix.
- **Timeline:** Fix shipped 2026-05-11 (commit a76d0a2). Failures continue post-fix.
- **Reproduction:** iController cleanup cron picks up `automation='debtor-email-cleanup'` rows; some succeed, some hit this verification failure.

## Current Focus

- hypothesis: |
    Two distinct root causes contribute to the residual failures:
    (R1) Mailbox forwarding (debiteuren@smeba-fire.be → debiteuren@smeba.nl) ingests the SAME
         Outlook message via two pipeline paths. classifier-verdict-worker queues TWO cleanup
         automation_runs for ONE physical iController row. First worker deletes it; second
         worker can't find it → "Delete verification failed".
    (R2) iController persists a sidebar Account sub-filter server-side per session. Even with
         per-mailbox URL scoping (Phase a76d0a2), the `bulkDelete` POST silently excludes rows
         belonging to sibling Accounts not selected in the sidebar. Pass 1 (find) and Pass 2
         (verify) can return different row populations depending on which Account is sticky.
- test: confirmed via read of classifier-verdict-worker.ts (queue path lacks dedup by message_id)
        and browser.ts deleteEmailOnPage (per-mailbox URL applied but no sidebar reset).
- expecting: dedup at queue insert + sidebar-reset before each search = ~0 Delete-verification failures.
- next_action: ship both fixes; monitor 24h failure rate.
- reasoning_checkpoint: null
- tdd_checkpoint: null

## Evidence

- timestamp: 2026-05-12T11:37Z (user-reported) — Period: +22 completed, +6 failed icontroller_delete cleanup runs over ~21h. 79% success rate.
- timestamp: 2026-05-12T08:15Z — Latest failure on debiteuren@smeba.nl. Error: `Delete verification failed: email still present after click sequence`.
- Prior resolution: commit a76d0a2 (2026-05-11) introduced per-mailbox URL `/messages/index/mailbox/{id}` and removed `ICONTROLLER_COMPANY` hardcode. Verification plan was "DELETE_VERIFY_FAILED rate should drop to ~0 within 30 min."
- Operator memory: debiteuren@smeba-fire.be is forwarded to debiteuren@smeba.nl (Outlook rule) — explains duplicate cleanup-queue entries for one physical iController message.
- Deferred items from prior resolution that may now be relevant:
  - Tightening ±60s timestamp tolerance for vendor-batch identical-subject emails.
  - Backporting per-mailbox URL to `icontroller-catchup.ts` and `/api/automations/debtor-email-cleanup` webhook route.

## Eliminated

- (a76d0a2 deployment confirmed on main; per-mailbox URL IS in use on both passes.)

## Specialist Hint

- specialist_hint: typescript (Inngest worker + Playwright TS code on Browserless)

## Resolution

### Fix 1 — Dedup cleanup queue inserts by message_id

**File:** `web/lib/inngest/functions/classifier-verdict-worker.ts`

Before INSERT into `automation_runs`, query for an existing row with the same `automation` + `result->>message_id`. If one exists, skip the insert. Prevents mailbox-forwarding (debiteuren@smeba-fire.be → debiteuren@smeba.nl) from producing two cleanup attempts for one physical iController message — the second attempt always fails verification because the first has already deleted the row.

### Fix 2 — Defense-in-depth sidebar Account filter reset

**File:** `web/lib/automations/debtor-email-cleanup/browser.ts`

Added `resetSidebarAccountFilter(page)` helper (tolerant DOM probe: matches `.active / .selected / aria-current` for active account label; clicks first anchor matching "Alle/All/Reset" text or `/account[/0]` href). Wired into `deleteEmailOnPage` AFTER `waitForSelector("#messages-list")` on BOTH Pass 1 (find) and Pass 2 (verify). The Pass 2 return value is concatenated into the "Delete verification failed" error message as `[sidebar: activeAccount=..., resetClicked=...]` so future regressions are diagnosable from the error string alone. Safe no-op on DOM mismatch.

### Verification

- `npx tsc --noEmit` clean (only pre-existing unrelated `actions.predictor.test.ts` error).
- Behavioural: monitor `automation_runs` for `automation='debtor-email-cleanup'` over next 24h. Expect Delete-verification failure rate to drop to ~0; remaining failures should carry the new `[sidebar: ...]` hint for diagnosis.
