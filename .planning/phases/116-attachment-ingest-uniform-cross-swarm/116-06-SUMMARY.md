---
phase: 116-attachment-ingest-uniform-cross-swarm
plan: 06
subsystem: attachment-corpus-backfill
tags: [inngest, backfill, batch, registry-gated, swarm-agnostic, replay-safe, fail-soft, gated-production-write]
requires:
  - phase: 116-01
    provides: email_pipeline.email_attachments table + swarms.attachment_config (extract switch + caps)
  - phase: 116-02
    provides: listAttachments Graph helper
  - phase: 116-03
    provides: capture metadata mapping/filter precedent (reused inline)
  - phase: 116-04
    provides: extractEmailAttachments shared download/store/extract/update loop (imported, NOT reimplemented)
provides:
  - attachments-backfill worker — gated corpus metadata backfill + survivor-slice extraction (SC-4 / ATTACH-04)
  - sales-email/attachments.backfill.run manual-trigger event (registered in events.ts + serve array)
affects:
  - Phase 113 retro batch-resolve + intent discovery (reads exactly this backfilled attachment slice — why 116 runs before 113)
tech-stack:
  added: []
  patterns:
    - manual-trigger batch worker (CLAUDE.md cron-disable pattern — no cron schedule)
    - fail-loud hard cap + bounded batches + inter-batch step.sleep (select-candidates.ts + Phase 112 Graph rate-limit discipline)
    - Stage-1-survivor slice reuses Phase 112 buildAutoKeySet + classifyDisposition over the persisted retro verdict (disposition !== 'auto' = survivor — D-12)
    - shared extraction loop imported from Plan 04 (single implementation, no drift — backfill re-selects the just-upserted pending rows and feeds the helper the same shape the live extractor loads)
    - SWARM-02: sales-scoped by trigger event (per-trigger constant), zero swarm-literal branch
    - dry_run preview writes nothing, returns would-counts (Phase 112 gated write-discipline)
key-files:
  created:
    - web/lib/inngest/functions/attachments-backfill.ts
    - web/lib/inngest/functions/__tests__/attachments-backfill.test.ts
  modified:
    - web/lib/inngest/events.ts
    - web/app/api/inngest/route.ts
decisions:
  - "Stage-1-survivor definition is REUSED, not reinvented: a mail is a survivor iff classifyDisposition(persisted retro verdict, autoKeySet) !== 'auto' (Phase 112 disposition). High-confidence registry-derived noise (action=categorize_archive, minus loopback) is the only non-survivor class; everything else (manual_review, low/medium conf, no verdict) survives to Stage 2 and gets extraction."
  - "Backfill re-selects the just-upserted 'pending' rows for each email and passes those (with real DB ids) to extractEmailAttachments — identical to the live extractor's pending-row load — because the shared helper updates rows by their real DB id. This keeps the helper a single implementation with no backfill-specific branch."
  - "Registered the trigger event in events.ts (Rule 3 blocking — same as Plan 04): Inngest's typed event-name union must include the trigger or tsc fails; bundled with the worker commit."
  - "Live run over the 1,273-mail corpus is DEFERRED to the operator checkpoint (Task 3). SC-4 explicitly allows executed OR deferred-with-rationale; the corpus-scale Graph operation follows Phase 112 gated write-discipline and the prior-wave instruction not to trigger production backfill from the executor."
requirements-completed: [ATTACH-04]
metrics:
  duration: ~5m
  completed: 2026-06-05
---

# Phase 116 Plan 06: Gated Corpus Attachment Backfill Summary

**A manually-triggerable Inngest worker (`sales-email/attachments.backfill.run`) iterates the already-ingested verkoop@ corpus by `source_id`, writes attachment metadata rows for ALL mails — closing the `has_attachments=false`-on-all-rows blind spot (SC-4/ATTACH-04) — and runs content extraction ONLY for the Stage-1-survivor slice (D-12), composing the Plan 04 `extractEmailAttachments` helper rather than reimplementing the download→store→extract loop. Fail-loud 40k hard cap, bounded batches with an inter-batch delay, Graph-404→`source_gone` fail-soft, and idempotent `(email_id, attachment_id)` upserts. The actual run over the live corpus is gated behind the human checkpoint (Phase 112 write-discipline) and deferred to the operator.**

## What Was Built

### Task 1 — backfill worker + tests (commit `1f57a68c`, TDD)

- **`attachments-backfill.ts`** — `inngest.createFunction({ id: "attachments-backfill", retries: 1, concurrency: { limit: 1 } }, { event: "sales-email/attachments.backfill.run" }, ...)`. Manual trigger only (no cron). Accepts `{ dry_run?, limit?, batch_size?, cap?, since?, until?, mailbox? }`.
  - **`select-corpus` step:** SELECT `id, source_id, mailbox` from `email_pipeline.emails` (`source='outlook'`, `mailbox=verkoop@smeba.nl`, received-at window). Reads up to `cap+1`; a corpus length `>= readCap` THROWS naming the corpus + cap (no silent truncation — select-candidates.ts WR-05 pattern / T-116-18). `event.data.limit` bounds dry-runs.
  - **`load-setup` step:** `loadSwarm` (extract switch + caps) + `loadSwarmNoiseCategories` → `buildAutoKeySet` (the Stage-1-survivor auto-set, registry-derived — D-12).
  - **Bounded batches** (`backfill-batch-N` steps, default 40 mails/batch) with an inter-batch `step.sleep` delay (Phase 112 Graph rate-limit discipline, T-116-18). Per mail: `listAttachments(mailbox, source_id)` → Graph 404 → `source_gone`, continue (T-116-19); filter inline + non-`fileAttachment` (capture.ts filter); count in dry-run, else idempotent upsert `onConflict email_id,attachment_id` (T-116-20).
  - **Survivor extraction:** `resolveVerdicts` (persisted retro verdict) → `classifyDisposition`; survivor iff `!== 'auto'`. For survivors with `extract` ON, re-select the just-upserted `pending` rows and call the SHARED `extractEmailAttachments` helper (no reimplementation). Non-survivors: metadata only (D-12 / T-116-21).
  - **SWARM-02:** no `=== 'sales'` / `=== 'debtor'` branch; sales-scoped by the trigger event constant only. Adopting backfill for another swarm = a new trigger event + registry row, documented in the header.
  - Returns `{ mails_scanned, attachments_found, metadata_rows_written, extracted, failed, source_gone, dry_run }`.
- **`events.ts`** — registered `sales-email/attachments.backfill.run` in the typed `Events` record (Rule 3 — see Deviations).
- Tests: `attachments-backfill.test.ts` — 6 behaviors: (1) dry-run counts only, writes nothing; (2) live idempotent upsert on `(email_id, attachment_id)`; (3) Graph 404 → `source_gone`, run continues; (4) hard cap → fail-loud throw; (5) extraction runs ONLY for survivors via the SHARED helper (asserts `extractEmailAttachments` is the call site, invoked for the survivor email only); (6) bounded batches + inter-batch `step.sleep`. **6/6 green.**

### Task 2 — Inngest registration (commit `1e19104b`)

- Imported `attachmentsBackfill` and added it to the `functions: [...]` serve array (alongside `stage1_5AttachmentExtractor`). Without this the trigger event has no handler. `tsc --noEmit` clean.

### Task 3 — checkpoint (human-verify, blocking) — DEFERRED to operator

The live run over the 1,273-mail corpus is a real-world read-only Graph operation that follows Phase 112 gated discipline (bounded dry-run → bounded live run → full run). Per the prior-wave instruction the executor does NOT trigger the production backfill itself; this is returned as a checkpoint for the operator. SC-4 allows the run to be executed OR explicitly deferred-with-rationale — deferred here.

## Verification

- `npx vitest run lib/inngest/functions/__tests__/attachments-backfill.test.ts` → **6/6 green**.
- Regression: `+ extract-worker.test.ts + stage-1_5-attachment-extractor.test.ts` → **18/18 green** across 3 files (the shared helper is still consumed identically by the live extractor; backfill reuses it).
- `tsc --noEmit -p .` → no errors in any new/modified file (the events.ts registration cleared the trigger-name union error).
- Grep gates (code, not comments): import `extractEmailAttachments` from `extract-worker` present; NO duplicated download→store→extract loop in the backfill file; no `=== 'sales'` / `=== 'debtor'` branch.

## Deviations from Plan

**1. [Rule 3 - Blocking] Registered the trigger event in `web/lib/inngest/events.ts`**
- **Found during:** Task 1 (tsc after writing the worker).
- **Issue:** `inngest.createFunction({ event: "sales-email/attachments.backfill.run" }, ...)` failed tsc — Inngest's typed event-name union did not include the new trigger, so the trigger literal was typed `undefined` (identical to the Plan 04 deviation).
- **Fix:** Added the `sales-email/attachments.backfill.run` entry to `events.ts` with the documented `{ dry_run, limit, batch_size, cap, since, until, mailbox }` payload.
- **Files modified:** `web/lib/inngest/events.ts`
- **Verification:** `tsc --noEmit` clean; worker tests 6/6.
- **Committed in:** `1f57a68c` (Task 1 commit, bundled with the worker it enables).

**Total deviations:** 1 auto-fixed (1 blocking schema registration). No scope creep.

## Threat Model Coverage

| Threat ID | Mitigation landed |
|-----------|-------------------|
| T-116-18 (DoS — unbounded corpus iteration / Graph rate limits) | Fail-loud `cap+1` truncation sentinel (throws naming corpus + cap, test 4) + bounded batches + inter-batch `step.sleep` (test 6). |
| T-116-19 (a single deleted/moved mail crashing the whole run) | `listAttachments` 404 → `source_gone`, loop continues (test 3); extraction failures fail-soft inside the shared helper. |
| T-116-20 (non-idempotent backfill writing duplicate rows on re-run) | Upsert `onConflict email_id,attachment_id` (test 2); checkpoint re-run idempotency verified by the operator. |
| T-116-21 (downloading binaries for noise mail) | Extraction gated to the Stage-1-survivor slice only (`classifyDisposition !== 'auto'`); non-survivors get metadata only (test 5). |

## Checkpoint — Live Backfill Run (operator action required)

**Status: DEFERRED to operator** (SC-4: executed OR deferred-with-rationale). Rationale: the run is a corpus-scale Graph operation; prior-wave instructions + Phase 112 write-discipline reserve production backfill triggering for the operator, not the executor. The worker, registration, and unit tests are complete and green.

**Operator runbook (gated, Phase 112 discipline):**
1. Bounded DRY-RUN: `inngest.send({ name: "sales-email/attachments.backfill.run", data: { dry_run: true, limit: 50 } })`. Inspect `{ mails_scanned, attachments_found, metadata_rows_written: 0 }` — confirm some sales mails carry attachments (blind spot is real + now detectable).
2. Bounded LIVE: `{ limit: 50 }`; confirm `email_pipeline.email_attachments` gains rows; re-run the same `{ limit: 50 }` → NO duplicates (idempotent upsert).
3. Confirm a survivor mail with a PDF got `extraction_status='extracted'` + non-empty `extracted_text`, while a non-survivor got metadata only (`not_requested`).
4. FULL backfill (no `limit`); confirm completion without an unexpected fail-loud cap, summary matches corpus expectations.
5. Spot-check the Bulk Review Stage 2 Read column (Plan 05 AttachmentList) shows metadata + status for a backfilled email.

**Prereq note (carried from Plan 04):** migration `20260605c_sales_unknown_dispatch_to_extractor.sql` is committed but deliberately NOT applied to remote until the code deploys (operator decision — go-live after deploy). The backfill worker itself does not depend on that migration (it reads the corpus + registry directly), but the LIVE funnel routing for new mail does.

## Self-Check: PASSED

- FOUND: web/lib/inngest/functions/attachments-backfill.ts
- FOUND: web/lib/inngest/functions/__tests__/attachments-backfill.test.ts
- FOUND commit: 1f57a68c (Task 1)
- FOUND commit: 1e19104b (Task 2)

---
*Phase: 116-attachment-ingest-uniform-cross-swarm*
*Completed: 2026-06-05 (worker + tests + registration; live run deferred to operator checkpoint)*
