# iController cleanup: NODEBUG / search-box-not-visible early return

**Created:** 2026-06-29
**Source:** debug session `icontroller-cleanup-not-found` (resolved) — separate, smaller failure path surfaced while fixing the sender-filter-never-commits root cause.

## What
~15 of 40 sampled `not_found` runs early-returned at the **search-box-visibility check** in `web/lib/automations/debtor-email-cleanup/browser.ts` (~line 161, the `commitSenderFilter` "no_searchbox" / NODEBUG branch) — i.e. the cleanup never reached the sender filter at all because the search input wasn't visible when it looked.

This is distinct from the filter-commit race fixed in PR `fix/icontroller-cleanup-filter-commit` (which addressed runs that DID reach the filter but scanned the unfiltered inbox). After that fix deploys, this NODEBUG path is the next-largest remaining `not_found` contributor.

## Why it matters
A NODEBUG / no_searchbox return is classified `not_found` like any other miss, so it silently inflates the not_found rate and (unlike the genuine "sender absent" case) it means the page wasn't in the expected state — the message may well still be in iController, undeleted.

## Investigate
- Why is the search box not visible when `commitSenderFilter` runs? Candidates: page still loading / wrong tab or mailbox view / a modal or overlay covering it / the iController layout differs per mailbox / a missing wait after navigation (same async-UI-race class as the root cause).
- Add attributable telemetry to the no_searchbox branch (which mailbox, page URL/state, screenshot) so the cause is nameable from the audit row, mirroring the `subjectOk`/`want` enrichment from fix #3.
- Decide whether no_searchbox should retry (re-navigate + settle) before giving up, rather than returning immediately.

## Verify
Re-run the prod dry-run preview path (`findAndPreviewEmail`, mode=preview) on a couple of rows that previously hit the NODEBUG branch; confirm the search box is now found and the filter commits.

## Watch first
Let PR `fix/icontroller-cleanup-filter-commit` deploy and observe the next-day not_found distribution before sizing this — the residual not_found after the filter fix is the real scope of this todo.
