---
slug: icontroller-cleanup-not-found
status: resolved
trigger: "iController noise-cleanup handler returns not_found ~55% of the time (35–81% over 2 weeks) — over half the targeted noise messages are already gone from iController when the cleanup tries to delete them"
created: 2026-06-29
updated: 2026-06-29
---

# iController noise-cleanup: ~55% not_found

## Symptoms
- **Expected:** the Stage-1 iController noise-cleanup finds the flagged noise message in iController and deletes it (`deleted`).
- **Actual:** 35–81% of runs return `result.icontroller = "not_found"` — the message is not present in iController when the cleanup runs. Persistent over the last 2 weeks (not a recent regression), ~55% average.
- **Error messages:** none — `not_found` is a clean "row not located on the page", not an exception. ~0–1 `failed` per day.
- **Timeline:** observed 2026-06-29 in a pipeline health check; the cleanup is **LIVE** for debtor (`swarms.dry_run_config.stage_1_cleanup = false`), blocked for sales.
- **Reproduction:** `automation_runs?automation=eq.debtor-email-cleanup` → `result.icontroller` distribution (deleted / not_found / failed). 7d: 33 deleted, 41 not_found, 1 failed (of 75).

## Data (per-day not_found rate)
06-15 60% · 06-16 66% · 06-17 80% · 06-18 44% · 06-19 45% · 06-22 50% · 06-23 35% · 06-24 75% · 06-25 81% · 06-26 52% · 06-28 0%. Stable-high, varies day to day.

## Relevant code
- Worker: `web/lib/inngest/functions/stage-1-icontroller-noise-cleanup.ts` (event `debtor-email/stage-1.icontroller-cleanup.requested`; per-stage gate `isStageBlocked(swarm,"stage_1_cleanup")`; `process-shard` step; writes `automation_runs.result.icontroller`).
- Dispatcher (cron): `web/lib/inngest/functions/stage-1-icontroller-noise-cleanup-dispatcher.ts` — selects rows, shards, re-dispatches (note: comment says "next cron tick (5 min later) re-dispatches").
- Browser delete: `deleteEmailOnPage` from `@/lib/automations/debtor-email-cleanup/browser` — how a message is located + deleted on the iController page (Browserless). THIS is where "not_found" is decided.
- iController is browser automation (no API), Amsterdam Browserless region.

## Hypotheses to test (not yet eliminated)
1. **Timing race** — cleanup (5-min cron) runs after the message already left the iController view (auto-archived/moved by iController, or deleted by a prior run/manual). Dispatcher re-dispatches rows not yet marked done → duplicate attempts find it gone.
2. **Lookup mismatch** — `deleteEmailOnPage` locates the row by a key (subject / sender / message-id / date?) that doesn't reliably match iController's rendered list → false not_found while the message is actually present.
3. **Wrong mailbox/folder/page** — cleanup searches a different iController mailbox/folder than where the message lives (multi-mailbox debtor; ICONTROLLER_MAILBOXES mapping).
4. **Pagination / lazy render** — message is on a later page / below the fold and the locator only scans the first screen.
5. **Idempotency gap** — rows flip to pending/processing non-atomically → two workers/ticks process the same message; the first deletes, the second reports not_found (a benign-but-noisy duplicate, not a real miss).

## Fork resolution
**CONFIRMED option (b): REAL lookup miss, HIGH severity.** Telemetry showed not_found messages are fresh (median ~6 min old, cannot have auto-archived), 225 message_ids only-ever-not_found (not duplicate/race), and the closest `nearest` candidate was the same unfiltered first-page row across many different sender searches → the sender filter was not applying; the cleanup paginated the unfiltered ~1200-row inbox and never actually searched the target. Hypotheses #1/#5 (benign race) ELIMINATED; #2 (lookup miss) is the root cause, expressed as a chain of async-UI races in iController's sender-filter commit + the subject matcher.

## Fix history

### Fix #1 (autocomplete menu render wait) — NECESSARY BUT INSUFFICIENT
Type the sender with real keystrokes (`pressSequentially`) so the jQuery-UI autocomplete fires, then `waitFor` the suggestion `<li>` menu to be visible before clicking the matching suggestion. Without it the `<li>` list was empty, no suggestion was clicked, the DataTables filter never committed.

**Dry-run verification (coordinator, prod iController, `findAndPreviewEmail` mode=preview, 3 previews):** the sender filter now DOES commit — screenshots show the autocomplete dropdown open with real suggestions AND the row list scoped to the sender; `nearest` telemetry is now sender-scoped, not the old unfiltered inbox. Fix direction CONFIRMED correct. **But all 3 previews still returned `emailFound:false`** — including a decisive test where the target row ("ITX NEDERLAND BV-TRANSFERENCIA- Payment Reference: 28004192") was VISIBLE AT THE TOP of the filtered list yet returned not_found, with `nearest` = OLDER inditex references weeks off. → A SECOND missing wait.

### Fix #2 (post-click DataTables redraw settle) — NECESSARY BUT INSUFFICIENT
Second race, same class as #1 one step later: after the autocomplete `<li>` is clicked, iController's DataTables fires an AJAX to reload the filtered rows. The old code's `waitForXhr` was armed **before** `pressSequentially`, so it was satisfied by the autocomplete **suggestion** XHR (which also hits `/messages`); `await waitForXhr` returned immediately and the row scan ran against the **stale/pre-redraw** DOM (the older default-sorted rows), missing the row about to render at the top.

Changes in `browser.ts`:
- Extracted a shared `commitSenderFilter(page, from)` helper (used by both `findEmailViaSearch` and `verifyMessageGone`, keeping them in sync) returning `"committed" | "no_suggestion" | "no_searchbox"`.
- **Arm the filter-redraw XHR wait AFTER the suggestion XHR has fired (menu visible) and BEFORE the click** — timing-scoped, so the next matching XHR is the filter redraw, not the suggestion.
- After the click + XHR, `await settleDataTables(page)` — waits for the DataTables processing overlay (`#messages-list_processing, .dataTables_processing`) to be hidden, so the scan never reads rows mid-repaint. Also applied to each pagination step.
- **Close the autocomplete dropdown** (`input.blur()`) after the commit so it no longer overlays the rows in preview screenshots (the filter is already committed server-side, so blur can't un-filter).
- Relaxed the suggestion match from `"{email} ("` to `startsWith("{email}")` so senders with no display name (suggestion = bare address) still match.

**Dry-run re-verification (coordinator, round 2, 4 previews):** the sender filter now commits reliably AND the dropdown is closed in the final screenshot (blur works). Fix #2 direction CONFIRMED. **But previews still returned `emailFound:false`.** Decisive isolation test: searched subject "ITX NEDERLAND BV-TRANSFERENCIA- Payment Reference: **56433862**" — the result's own `nearest` telemetry CONTAINED that exact normalized subject, i.e. the scan READ the target row this very run, computed it as a closest-non-match, and still returned not_found. → The failure is no longer filter/timing/pagination; the row was scanned but rejected by the MATCH check.

### Fix #3 (canonical subject normalization + attributable near-miss telemetry) — THE CLINCHER
Re-examination of `findEmailViaSearch`'s `page.evaluate` showed the subject normalization was **already symmetric** — both the row subject and the search subject were run through the same inline `norm` (lowercase + strip `…` + collapse whitespace + trim). So the coordinator's "matcher normalization differs" mechanism was not literally what the code did, which means a row whose normalized subject equals the search subject and is rejected is most likely failing the **±60s timestamp gate** (`dt <= toleranceMs`), not the subject gate. The old telemetry couldn't tell these apart: it logged each candidate's `subj` + `dtSec` but **never the normalized `want`, nor a per-candidate `subjectOk` flag**.

Changes in `browser.ts` (find/preview path only — `selectAndDelete` POST + verify logic untouched):
- Lifted normalization to a single exported `normalizeSubject(s)` (canonical, testable). The search subject is normalized ONCE in Node and passed into the scan as `wantNormalized`; the in-page mirror (`normRow`, kept in lock-step, page is a separate realm and can't import) normalizes each row subject. Subject extraction still prefers the cell `title` (iController's full, untruncated subject) over clipped textContent; bidirectional substring match retained for truncation tolerance.
- **Attributable near-miss telemetry:** the stashed `__debtorDebug` payload now carries `{ want: <normalized search subject>, nearest: [{ subj, ts, dtSec, subjectOk }, …] }`. `subjectOk` per candidate is the load-bearing addition — it states whether each near-miss passed the SUBJECT check, so a `not_found` is now decomposable: `subjectOk:false` everywhere → subject normalization/extraction problem; `subjectOk:true` with a large `dtSec` → the ±60s timestamp gate rejected an otherwise-correct row. Telemetry candidate text widened to 80 chars and nearest list to 6.

This deliberately does NOT widen the ±60s tolerance or loosen the matcher — that would be speculative against the live delete path (the "867-delete footgun" / wrong-row risk). The enriched telemetry made the next dry-run conclusively name the failing gate first.

**Dry-run re-verification (coordinator, round 3) — CONFIRMED FIXED.** Searching 56433862 with a `receivedAt` derived from iController's LOCAL-displayed time and (mis)labelled UTC returned `emailFound:false` with the target candidate `{subjectOk:true, dtSec:7200}` — `subjectOk:true` proved the subject matcher + filter are correct, and `dtSec=7200` (exactly the 2h CEST offset) named the rejecting gate as the ±60s timestamp gate. That was a **test-input error, not a code bug**: the code correctly parses the iController row ts as Europe/Amsterdam → UTC, so a UTC-mislabelled local input is genuinely 2h off and the gate rightly rejected it. Re-running with the correct UTC `receivedAt="2026-06-10T15:52:24Z"` returned `emailFound:TRUE, rowIndex:3`, `rowPreview="PaymentNotification@inditex.com | ITX NEDERLAND BV-TRANSFERENCIA- Payment Reference: 56433862 | debiteuren@smeba.nl | 2026-06-10 17:52:24"` — clean match on a currently-present filtered row. The subject matcher and the ±60s UTC gate are both correct; production passes the email's real UTC `received_at` (timestamptz). The instrumentation from fix #3 is keeper-grade and stays in.

### No-suggestion edge case (secondary)
`xadr@smeba.nl` preview showed the UNFILTERED inbox — that sender had no autocomplete suggestion, so the filter couldn't commit and the old code fell through to scanning + reporting a generic not_found. Now `commitSenderFilter` returns `"no_suggestion"`; `findEmailViaSearch` returns a distinct `SENDER_NOT_IN_LIST` (-2) sentinel and **does NOT scan the unfiltered inbox**. Callers surface a distinct error ("sender … not in iController autocomplete index — filter not committed, inbox NOT scanned") that still contains the substring "Email not found", so the **worker still classifies it `not_found`** (backward-compatible — no new outcome enum, no worker change), while the audit `error_message` now tells the two apart. `verifyMessageGone` falls through to the bare DOM id-check on no_suggestion (best-effort; after a real delete the id is absent regardless).

## Resolution
root_cause: The production root cause was **the sender filter never committing** — iController's jQuery-UI autocomplete suggestion `<li>` was clicked before its populating AJAX fired, so the DataTables sender filter never applied and the cleanup paginated the first 10 pages of the **unfiltered ~1200-row inbox**, never actually searching the target → false `not_found` on ~55% of runs. A second instance of the same async-UI-race class sat one step later (the post-click DataTables redraw XHR-wait was armed too early and consumed by the suggestion XHR, so the scan read stale pre-redraw rows). The subject matcher and the ±60s timestamp gate were **already correct** — the only reason a visible, correctly-filtered row appeared to be rejected during verification was a test-input timezone error (a local-displayed ts mislabelled UTC); the code correctly converts the iController row ts from Europe/Amsterdam → UTC before the ±60s compare.
fix: `web/lib/automations/debtor-email-cleanup/browser.ts` — shared `commitSenderFilter` that (1) types the sender with `pressSequentially` and waits for the autocomplete `<li>` menu before clicking, (2) arms the filter-redraw XHR wait AFTER the suggestion XHR and `settleDataTables()` (processing overlay hidden) before scanning/paginating, and (3) `input.blur()` to dismiss the dropdown overlay. Plus canonical `normalizeSubject` with `wantNormalized` passed into the scan and per-candidate `subjectOk` + normalized `want` in the near-miss telemetry (keeper-grade diagnostics). Distinct `SENDER_NOT_IN_LIST` sentinel for the no-suggestion case (does not scan the unfiltered inbox). Find/preview path only — `selectAndDelete` POST + verify logic unchanged.
verification: CONFIRMED via prod dry-run (`findAndPreviewEmail`, mode=preview, env=production): `emailFound:TRUE, rowIndex:3` on the inditex 56433862 case (a currently-present filtered row) once the input timezone was corrected. `npx tsc --noEmit` clean (0 errors). Post-deploy watch: next-day `not_found` rate should drop near zero; the only residual tail is a message whose Outlook `receivedAt` and iController's recorded ts genuinely differ by >60s (import lag) — do NOT pre-emptively widen the ±60s tolerance; that drift, not the filter, would be the remaining cause.
files_changed: [web/lib/automations/debtor-email-cleanup/browser.ts]
follow_ups:
- NODEBUG / search-box-not-visible early return (`browser.ts` ~line 161): ~15/40 not_found early-returned at the search-box-visibility check — a separate, smaller failure path. Todo: `.planning/todos/pending/2026-06-29-icontroller-cleanup-nodebug-searchbox.md`.
- `SENDER_NOT_IN_LIST` sentinel: monitor the audit `error_message` split (sender genuinely absent vs scanned-and-missed) once the fix is live.
blind_spots: "Fix #2's settle signal (DataTables processing overlay `#messages-list_processing, .dataTables_processing`) was not live-confirmed against iController markup; harmless no-op if the id differs (the timing-scoped redraw XHR wait still carries the fix). Still no unit tests for this browser module. The ±60s timestamp gate converts iController's local Europe/Amsterdam-rendered ts to UTC before comparing against the email's UTC `received_at` — this is CORRECT; do NOT 'fix' it back to a naive local compare."

## Outcome
Fixed; prod dry-run confirmed; shipped via PR `fix/icontroller-cleanup-filter-commit` (not merged — human merges). Awaiting post-deploy watch on the next-day not_found rate.
