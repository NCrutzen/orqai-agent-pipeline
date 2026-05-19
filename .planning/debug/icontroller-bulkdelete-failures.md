---
slug: icontroller-bulkdelete-failures
status: root_cause_identified
trigger: 54/148 (36%) iController bulkDelete failures with disproven sidebar-Account hypothesis — re-investigate the real failure mode
created: 2026-05-19
updated: 2026-05-19
goal: find_and_fix
parent_session: pipeline-health-2026-05-19
---

# Debug Session: icontroller-bulkdelete-failures

## Symptoms

DATA_START
**iController bulkDelete chronic failure (36% rate, unchanged across multiple health-check ticks):**

- Surface: `debtor-email-cleanup` automation, stage `icontroller_delete`
- Volume: 54 failed / 94 completed (cumulative since 2026-05-07, no improvement)
- Error message (identical across all 54 failures):
  `Delete verification failed: email still present after click sequence (silent XHR failure or modal mis-click suspected) [sidebar: activeAccount="Collections", resetClicked=false]`
- Latest failure: 2026-05-19 04:04:08 UTC, mailbox `debiteuren@smeba.nl`, from `notifications@tradeshift.com`, subject "Factuur 17338858 van ESSENDI NEDERLAND N.V. is van status veranderd"

**Architecture context:**
- Direct-POST refactor at `web/lib/automations/debtor-email-cleanup/browser.ts:413-464` (`selectAndDelete`) already bypassed the original checkbox-race failure mode (Phase A, 49% → ~36%). The current 36% failure mode is **distinct from the checkbox race**.
- Direct POST goes to `/messages/bulkDelete/_token/{csrf}` with `form: { "message[]": message_id }`. Response status is checked (`!res.ok()` throws).
- Verify-pass (Pass 2) navigates `page.goto(listUrl)` to `/messages/index/mailbox/{id}` and re-runs find. If the same email turns up, throws "Delete verification failed".
- iController uses Intercooler.js — bulkDelete may return 2xx with the row not actually deleted (server-side scope rejection, CSRF staleness, permission, …).

**Disproven hypothesis (from parent session `pipeline-health-2026-05-19`):**
- Original Defense-in-depth comment at browser.ts:303-316 claimed: "iController's sidebar Account sub-filter is persisted in session state and gets applied server-side to the `bulkDelete` POST. When the row being deleted belongs to a sibling Account that is not the currently-selected one, iController returns 2xx but silently excludes the row from the delete set."
- Live DOM probe (`probe-sidebar-collections.ts`) at 2026-05-19 10:39 AMS against production iController disproved this. The "Collections" element captured as `activeAccount` is the top-level product module (sibling of Invoicing, Payments, Cash App, Credit, Disputes) — `<a class="nav-item active" href="/">Collections</a>`. There is no Account sub-filter element in the sidebar. The `activeAccount="Collections", resetClicked=false` fingerprint is constant on every production session, not correlated with failure.
- Probe artifacts: `web/lib/automations/debtor-email-cleanup/screenshots/probe-collections/01-baseline-*`

**Candidate hypotheses to test:**
1. **CSRF token staleness** — the `_token/{csrf}` baked into the delete button's href may go stale across the multi-row batch. Each row's `selectAndDelete` extracts the href freshly from the current DOM, but if the DOM was loaded long enough ago, the token may already be rotated server-side.
2. **Verify-pass racing the server commit** — Intercooler responds 2xx as soon as the request is accepted; the server's actual DB delete may take a moment. `page.goto(listUrl)` immediately after the POST may see pre-commit state.
3. **Server-side scope rejection returning 2xx** — iController may reject the message_id (wrong mailbox scope, permission, already-deleted) and return 2xx with `deleted_count=0`. Current code only checks `res.ok()`, not response body content.
4. **message_id mismatch** — the row's `<input name="message[]" value="...">` value may not be what the server expects for bulkDelete (e.g. the row carries a thread_id where bulkDelete needs a message_id).
5. **Same email keeps re-arriving** — verify-pass uses search-by-subject; if a duplicate arrives between Pass 1 delete and Pass 2 search, the delete succeeded but the verify finds a different copy.

**User-known facts:**
- 36% rate has not changed across multiple health-check ticks → not a transient
- All 4 mailboxes affected (per browser.ts:401 comment, "all four mailboxes from 2026-05-08 onward")
- Onset: 2026-05-08 (current symptom cluster); pre-direct-POST was 49%, post-direct-POST is 36%
DATA_END

## Current Focus

- hypothesis: Most likely (3) server-side 2xx-with-zero-deletes — the direct-POST already removed the checkbox race so a residual 36% suggests the server is accepting + responding 2xx but not deleting. Body-content inspection is the cheapest test.
- test: query Supabase for the 54 failed rows to look for patterns (mailbox distribution, sender/subject clustering, time-of-day, retry-count) AND instrument `selectAndDelete` to log the bulkDelete response body on the next live run.
- expecting: failure pattern in Supabase narrows the hypothesis space; response body reveals whether iController is signaling the failure in JSON.
- next_action: Pull 54 failed rows from Supabase `automation_runs` (or wherever `debtor-email-cleanup` results live) and inspect for clustering. In parallel, read `selectAndDelete` end-to-end + the verify-pass to identify the cheapest instrumentation point.

## Evidence

- timestamp: 2026-05-19 10:39 AMS, source: live DOM probe `probe-sidebar-collections.ts`. The disproof of the original hypothesis — see Symptoms block for details. Probe artifacts saved at `web/lib/automations/debtor-email-cleanup/screenshots/probe-collections/`.
- timestamp: 2026-05-19, source: `browser.ts:413-464` (`selectAndDelete`). Direct-POST already implemented; failure mode is post-direct-POST. Response status checked but body content is NOT inspected — Intercooler 2xx-with-zero-deletes would pass through silently.
- timestamp: 2026-05-19, source: `browser.ts:600-650` (verify-pass region). After the POST, code re-navigates to `listUrl` and re-runs `findEmailViaSearch`. No deliberate delay or count-based wait between POST and verify navigation.

## Eliminated

- timestamp: 2026-05-19. **Eliminated:** sidebar Account sub-filter as the cause — TWICE OVER. (a) Live DOM probe shows no such element exists in the sidebar. (b) Per user clarification 2026-05-19: the production code path already uses direct per-mailbox URLs (`/messages/index/mailbox/{id}`, browser.ts:558) which bypass the sidebar entirely. The sidebar is operator UI, not part of the automated flow. `resetSidebarAccountFilter` operates on a UI surface the automation does not traverse. Confirms `resetSidebarAccountFilter` and its Defense-in-depth comment at browser.ts:303-316 are dead code and should be removed in the fix phase regardless of where the real root cause lands.
- timestamp: 2026-05-19. **Eliminated:** checkbox-click race (Phase A failure mode). Direct-POST refactor at browser.ts:413-464 bypassed the Intercooler checkbox-state listener entirely. Failure rate dropped 49% → 36% confirming the race was a real cause but not the only one.

## Resolution

### Root Cause

`findEmailViaSearch` at `web/lib/automations/debtor-email-cleanup/browser.ts:189-245` matches rows by **(subject substring) + (timestamp within ±60s of target)** — **no sender check, no message_id check**. For Pass 2 (verify deletion) this produces false-positive "still present" reports when the mailbox contains a sibling row from a different sender with a substring-matching subject within the 60-second window.

The 60s tolerance was widened from 15s on 2026-04-23 (per browser.ts:241-243) to fix legitimate subject-match misses due to delivery clock drift. That widening eliminated false negatives but opened the false-positive door this bug exploits.

### Evidence supporting (from Supabase analysis of 60 most-recent failures)

- 5 rows with subject "Automatisch antwoord" — generic OOO subject, many distinct senders.
- 1 message_id appears twice (Inngest retry: both attempts found a sibling).
- hollandandbarrett.com sender cluster (6 failures), GemeenteWestland.nl (6 failures), staedion.nl (5) — high-frequency senders with repetitive subjects.
- All 4 production mailboxes affected evenly (30 smeba.nl, 15 smeba-fire.be, 8 berki.nl, 7 fire-control.nl) — not a per-mailbox bug.
- Topic distribution: 24 auto_reply, 6 payment_admittance, 4 ooo_temporary, 26 null (legacy un-topic-stamped) — all sender-repetitive categories.

### Fix

`web/lib/automations/debtor-email-cleanup/browser.ts:189-245` — add sender-address match to `findEmailViaSearch`:

1. In the row evaluator, locate the sender cell (already identified by the excluded-from-subject filter at line 215: `if (/\S@\S/.test(raw) && !/\s/.test(raw)) continue;`). Read it explicitly into `senderText`.
2. Require `senderText.toLowerCase() === email.from.toLowerCase()` (or substring tolerance for truncated cells — same bidirectional logic as the subject match).
3. Apply to both Pass 1 (line 488) and Pass 2 (line 614) — Pass 1 is also at risk of race-picking the wrong sibling at high sender frequency, just less likely to surface.
4. Once stricter match is in, the 60s window can stay (or even widen further) without false positives.

### Cleanup (independent of root-cause fix)

5. Delete `resetSidebarAccountFilter` at browser.ts:318-358 — disproven dead code.
6. Remove or rewrite the Defense-in-depth comment at browser.ts:303-316 — its hypothesis is disproven (live DOM probe + user clarification that per-mailbox URLs already bypass the sidebar).
7. Remove the `sidebar:` suffix from the verify-failure error message at line 616 — it's misleading noise on every failure.

### Verification Plan

- Backfill: query Supabase for the 54 failed `automation_runs` rows. For each, check whether iController STILL contains the original `message_id` (via a direct Outlook check or a /messages/index/mailbox/{id} re-search using only message_id-equivalent lookup). Expectation: most rows were actually deleted on the first attempt; verify-pass false-positived.
- Forward: after the fix ships, monitor `failed/icontroller_delete` count. Expectation: drops from ~1-2/day to near-zero.
- Spot-check: capture the next failure's screenshot pair; if the after-screenshot shows a different sender's email at the matched row position, root cause confirmed.

