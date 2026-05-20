---
slug: icontroller-cleanup-undefined-fill
status: resolved
resolved: 2026-05-11
resolution_commit: a76d0a2
trigger: |
  iController cleanup: 4 failed (no new since baseline), latest at 12:30 UTC.
  Error: locator.fill: value: expected string, got undefined.
  Browserless / Playwright form-fill — undefined value passed to .fill() (likely missing field on
  the iController-side payload — invoice nr or company). Not draining; queue is growing (4 → 6 pending).
  iController queue depth growing (4 → 6 pending) without throughput change — cleanup-worker may be
  stalled or only firing on the 5-min cron and the failed rows are blocking the shard.
created: 2026-05-07
updated: 2026-05-11
---

## Symptoms

- **Expected:** iController cleanup-worker drains queued rows via Browserless/Playwright form-fills; queue depth stays flat or decreases.
- **Actual:** 4 rows failed (no new failures since baseline; latest 12:30 UTC). Playwright throws `locator.fill: value: expected string, got undefined`. Queue depth grew 4 → 6 pending without throughput change.
- **Error:** `locator.fill: value: expected string, got undefined` — undefined passed to `.fill()` on a form field (search input on iController /messages).
- **Timeline:** Failures clustered post 2026-05-06 16:24 UTC (commit `1ac79d5`); latest at 2026-05-07 12:30 UTC.
- **Reproduction:** Cleanup-worker cron fires every 5 min, picks up rows where `automation='debtor-email-cleanup' AND result->>icontroller='pending'`. All such rows fail because their payload is missing `from`/`subject`/`received_at`.

## New Symptoms (2026-05-11)

- **Today's distribution:** 21 failed / 30 completed (50/50 in latest tick: +4 failed, +4 completed). The earlier 100% failure rate is gone — completions exist now, so BUG A/B fixes may have partially landed.
- **New failure label:** "Delete verification failed" — DISTINCT from the prior `.fill(undefined)` error. This is a post-delete DOM check that compares state after the delete action.
- **Cross-mailbox spread:** 3rd mailbox now affected (administratie@fire-control.nl latest 13:50 UTC), after smeba-fire.be and smeba.nl. Same iController instance, different mailbox folders → DOM-shape hypothesis: per-mailbox folder layout differs.
- **Open questions for this investigation:**
  1. Were BUG A (verdict-worker payload) and BUG B (dispatcher filter) fixes actually applied? Check git log since 2026-05-07; check `classifier-verdict-worker.ts:139-153` and dispatcher filter.
  2. What is the "Delete verification failed" code path? Likely a verify-after-delete DOM assertion, distinct from `.fill()`.
  3. Cross-mailbox DOM-mismatch: does the post-delete verification probe a selector that varies per mailbox folder?

## Current Focus

- hypothesis: BUG A/B partially fixed (completions now flow). A new failure mode "Delete verification failed" affects all 3 production mailboxes equally — cross-mailbox DOM-mismatch in the verify-after-delete probe.
- test: (a) `git log --since=2026-05-07 -- web/lib/inngest/functions/classifier-verdict-worker.ts web/lib/inngest/functions/debtor-email-dispatcher*.ts web/lib/automations/debtor-email-cleanup/browser.ts`; (b) grep codebase for "Delete verification failed" string to locate the throw site; (c) inspect a recent failed automation_runs row for the new failure mode (result.screenshots, error message, mailbox).
- expecting: New throw site in `debtor-email-cleanup/browser.ts` (or sibling) post-delete; per-mailbox DOM divergence in the verification selector.
- next_action: Locate "Delete verification failed" throw site → inspect a failed row's screenshots + error payload → compare DOM probe across the 3 mailboxes.
- reasoning_checkpoint: null
- tdd_checkpoint: null

## Evidence

- timestamp: 2026-05-07T13:00Z — Supabase query `automation_runs WHERE automation='debtor-email-cleanup' AND completed_at>=2026-05-06`: `(classifier-verdict-worker, failed)=44`, `(zapier:ingest, completed)=21`, `(zapier:ingest, failed)=1`. **100% verdict-worker failure rate.**
- timestamp: 2026-05-07T13:00Z — Failed row `90ad6d3f-76b9-4659-88af-8bac1ef1ea93` (latest, 12:30 UTC): `result` jsonb keys = `{stage, message_id, icontroller, screenshots, processed_by, source_mailbox, source_automation_run_id}`. **No `from`, `subject`, `received_at`, `company`, `entity`.**
- timestamp: 2026-05-07T13:00Z — Successful row `62a741fc-...` (zapier:ingest path, completed 09:30 UTC): result has `from`, `subject`, `received_at`, `entity`, `company` populated. `triggered_by="zapier:ingest"`.
- timestamp: 2026-05-07T13:00Z — Five recent `automation='debtor-email-review'` rows (status=pending, stage=icontroller_delete, icontroller=pending) have FULL payloads but are NOT being picked up by dispatcher. Newest 13:11 UTC. **This is the queue growth.**
- File: `web/lib/inngest/functions/classifier-verdict-worker.ts:139-153` — INSERT body merges only `dispatch.result_template` (`{stage, icontroller}`) with `{source_automation_run_id, message_id, source_mailbox}`. Does NOT pass through email identifiers.
- File: `web/lib/inngest/functions/debtor-email-icontroller-cleanup-worker.ts:102-107` — passes `r.from`, `r.subject`, `r.received_at` to `deleteEmailOnPage` → `findEmailViaSearch` → `input.fill(email.from)` (browser.ts:91) which throws on undefined.
- File: `web/lib/automations/debtor-email-cleanup/browser.ts:91` — exact `.fill()` site: `await input.fill(email.from);` (no guard; Playwright requires string).
- Git: commit `1ac79d5` (2026-05-06 16:24 UTC) flipped dispatcher filter from `automation='debtor-email-review'` to `automation='debtor-email-cleanup'`. Commit fixed registry-path picking but exposed bug A (missing fields) and orphaned legacy `debtor-email-review` rows (bug B).
- Registry `swarms.side_effects` for `debtor-email`: `result_template = {stage:"icontroller_delete", icontroller:"pending"}` only — no slot for email identifiers.
- timestamp: 2026-05-11 — User-reported: today 21 failed / 30 completed; latest tick +4/+4; latest failure 13:50 UTC on administratie@fire-control.nl. Third mailbox affected after smeba-fire.be and smeba.nl. New failure label "Delete verification failed" — distinct from prior `.fill(undefined)`.

## Eliminated

- Failed rows blocking the shard via head-of-line: ruled out. Worker writes `status='failed'` + `result.icontroller='failed'`; dispatcher `.eq("result->>icontroller","pending")` excludes them. Failed rows are NOT re-picked.
- Concurrency / Browserless thundering herd: ruled out. Workers report `processed_by=w0` only on failed rows (those finished before scaling); the staggered start logic is in place and not the cause here.
- 5-min cron stalled: ruled out. Cron is firing (we see `processed_by` timestamps spread across the day); it's just that every dispatched verdict-worker row crashes early in `findEmailViaSearch`.

## Resolution

- root_cause: |
    Two independent bugs in the iController cleanup pipeline, both introduced or exposed by commit
    `1ac79d5` (2026-05-06 "fix(74): … cleanup dispatcher filter"):

    BUG A — Missing payload fields in the registry-driven side-effect insert.
    `web/lib/inngest/functions/classifier-verdict-worker.ts:139-153` inserts `automation_runs`
    with `result = { ...dispatch.result_template, source_automation_run_id, message_id,
    source_mailbox }`. The `result_template` in `swarms.side_effects` carries only `{stage,
    icontroller}`. The cleanup-worker (debtor-email-icontroller-cleanup-worker.ts:102-107) then
    reads `r.from`, `r.subject`, `r.received_at` and passes them to
    `deleteEmailOnPage` → `findEmailViaSearch`, where Playwright executes
    `await input.fill(email.from)` (browser.ts:91). Because `from` is undefined, Playwright
    throws `locator.fill: value: expected string, got undefined`. Result: 100% of
    `classifier-verdict-worker`-origin rows fail (44/44 in last 24h).

    BUG B — Legacy `automation='debtor-email-review'` rows are orphaned by the dispatcher.
    The Zapier ingest path (`web/app/api/automations/debtor-email/ingest/route.ts:566`) still
    inserts cleanup queue rows with `automation: "debtor-email-review"` and FULL payload
    (from/subject/received_at/entity/company). Commit `1ac79d5` flipped the dispatcher filter
    to `automation='debtor-email-cleanup'` exclusively, so these legacy rows are never picked
    up. They accumulate as `status=pending`. This is the observed queue depth growth (5+ such
    rows seen today, newest 13:11 UTC, none drained).

- fix: |
    Two-part fix (status unknown as of 2026-05-11 — verify whether applied):

    PART 1 (BUG A — verdict-worker payload):
    In `classifier-verdict-worker.ts:139-153`, the verdict-worker already has access to the
    triggering email's identifiers (it just dispatched stage1 categorize/archive on the same
    `message_id` and `source_mailbox`). It must look up `from`, `subject`, `received_at` (and
    the iController `company` per swarm registry / labeling_settings) and merge them into the
    `result` jsonb at insert time. Concretely:
      - Fetch the source email row (email_pipeline.emails by `source_id=message_id` AND
        `source_mailbox`) earlier in the worker if not already loaded.
      - Add `from: msg.from`, `subject: msg.subject`, `received_at: msg.received_at` to the
        INSERT result. Optional: also add `entity` and `company` for symmetry with legacy
        rows so kanban/UI rendering remains consistent.
    Defense-in-depth: in `debtor-email-cleanup/browser.ts:91`, guard the `.fill` call so a
    bad payload fails fast with a typed error message instead of Playwright's generic one
    (e.g., throw `Error("findEmailViaSearch: missing email.from")` BEFORE calling fill).
    This prevents future schema drift from manifesting as the same opaque error.

    PART 2 (BUG B — legacy producer):
    Two options:
      (a) Migrate the Zapier ingest path to write `automation: "debtor-email-cleanup"` directly,
          matching the registry-driven path. Single source of truth post-Phase 75.
      (b) Broaden the dispatcher filter to accept BOTH automation values during a transition:
          `.in("automation", ["debtor-email-cleanup", "debtor-email-review"])`. Add a TODO to
          retire `debtor-email-review` once Phase 75 fully replaces the legacy path.
    Recommended: (b) for the immediate hotfix (drains the 5+ stuck rows on next cron tick),
    then (a) as the proper Phase 75 cleanup.

    Backfill: re-queue the 44 failed rows after PART 1 ships. They can be flipped via:
      UPDATE automation_runs SET status='pending', result = result || '{"icontroller":"pending"}'
      WHERE id IN (...failed ids...);
    But this only works AFTER the producer is fixed AND the rows have been backfilled with
    from/subject/received_at (re-derive from email_pipeline.emails by message_id).

- verification: null
- files_changed: null

## Specialist Hint

- specialist_hint: typescript (Inngest worker + Playwright TS code; no language-specific quirks beyond standard TS Supabase merge patterns).

## Final Resolution (2026-05-11, commit a76d0a2)

### Three sequential root causes across the life of this session

1. **BUG A (2026-05-07) — `.fill(undefined)`**: verdict-worker dropped `from`/`subject`/`received_at` from the result payload (`result_template` only carried `{stage, icontroller}`). Resolved by the Phase 76 hotfix (typed guards in `findEmailViaSearch` + producer schema update).
2. **BUG B (2026-05-07) — orphaned legacy rows**: dispatcher filter flip in commit `1ac79d5` stopped picking up legacy `automation='debtor-email-review'` rows. Resolved in the same Phase 76 rollout.
3. **BUG C (2026-05-11) — cross-mailbox DELETE_VERIFY_FAILED**: cleanup-worker navigated to bare `/messages`, inheriting session-sticky sidebar Account filter. Once multi-mailbox throughput came online (smeba.nl, smeba-fire.be, fire-control), Pass 1 and Pass 2 of `deleteEmailOnPage` saw different row populations. Compounded by the worker hardcoding `company: "smebabrandbeveiliging"` for every screenshot label, which obscured the bug. **Resolved in commit `a76d0a2`** — per-mailbox URL (`/messages/index/mailbox/{id}`) on both passes, resolved from `r.source_mailbox` via `ICONTROLLER_MAILBOXES`.

### Fix (commit `a76d0a2`)

- `web/lib/automations/debtor-email-cleanup/browser.ts`: `EmailIdentifiers.mailboxId?: number`; `deleteEmailOnPage` builds `listUrl = mailboxId ? "/messages/index/mailbox/{id}" : "/messages"` and uses it on Pass 1 (find) and Pass 2 (verify).
- `web/lib/inngest/functions/debtor-email-icontroller-cleanup-worker.ts`: removed `ICONTROLLER_COMPANY` hardcode; resolves `r.source_mailbox` → `ICONTROLLER_MAILBOXES[...]` with fail-fast on missing/unknown; passes actual `sourceMailbox` as screenshot label.

### Verification plan
- Watch `automation_runs` cron ticks: `DELETE_VERIFY_FAILED` rate should drop to ~0 within 30 min.
- New failure screenshots tagged per actual mailbox (e.g. `delete-debiteuren-smeba-fire.be-*`) instead of `delete-smebabrandbeveiliging-*`.
- Rows missing `source_mailbox` now fail fast with a clear error instead of timing out in the verify probe.

### Files changed
- `web/lib/automations/debtor-email-cleanup/browser.ts`
- `web/lib/inngest/functions/debtor-email-icontroller-cleanup-worker.ts`

### Deferred (not yet needed, revisit only if symptoms persist)
- Tightening the ±60s timestamp tolerance in `findEmailViaSearch` to ±1–2s for vendor-batch (N identical-subject emails). Per-mailbox scoping likely removes enough ambiguity to make this unnecessary.
- Backporting the per-mailbox URL to `icontroller-catchup.ts` and the `/api/automations/debtor-email-cleanup` webhook route. Both are ad-hoc paths and not currently failing.

### Learning
- iController's `/messages` view is session-stateful via the sidebar Account filter. Any code path that navigates there from a fresh page state must either (a) supply `/messages/index/mailbox/{id}` explicitly, or (b) actively reset the sidebar before relying on row visibility. Bare `/messages` only works when there's a single mailbox in scope — which stopped being true at Phase 74 rollout.
- A hardcoded "default value" used for a cosmetic field (screenshot label) actively prevented diagnosis for 4 days. Cosmetic fields that carry per-row identity should be passed through from the row, not constants.
