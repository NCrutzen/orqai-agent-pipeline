---
phase: 116-attachment-ingest-uniform-cross-swarm
plan: 04
subsystem: attachment-extraction-funnel
tags: [inngest, funnel-step, registry-gated, swarm-agnostic, replay-safe, fail-soft]
requires:
  - phase: 116-01
    provides: swarms.attachment_config (extract switch + caps + stage2_dispatch_event) + email_attachments table
  - phase: 116-02
    provides: downloadAttachmentValue Graph helper + extractAttachment pure service
  - phase: 116-03
    provides: 'pending' email_attachments rows seeded at ingest (sales)
provides:
  - extractEmailAttachments — shared per-email download/store/extract/update loop (Plan 06 backfill reuses it)
  - stage-1_5-attachment-extractor — registry-gated extraction funnel step between Stage 1 verdict and Stage 2 request
  - sales 'unknown' swarm_dispatch rewired to the extractor event (registry data, verdict worker untouched)
  - sales-email/attachments.extract.requested event registered in the Inngest schema + serve array
affects:
  - Plan 06 backfill worker (imports extractEmailAttachments — single implementation, no drift)
  - Stage 2 customer-resolver (now receives attachment text via its own load step once extraction has run)
tech-stack:
  added: []
  patterns:
    - registry-keyed funnel step (gating = attachment_config.extract switch; downstream event = attachment_config.stage2_dispatch_event)
    - transparent interposition via registry data only (verdict worker byte-unchanged; one UPDATE repoints swarm_dispatch)
    - shared loop helper owned by one module, reused by live worker + backfill (no copy-paste drift)
    - fail-soft per attachment (Graph 404 -> source_gone; any throw -> extraction_failed; funnel never stalls)
    - replay-safe: deterministic ${email_id}/${attachment_id}.<ext> keys, timestamps inside step.run, no destructured inngest.send, text never serialized into the event
key-files:
  created:
    - web/lib/automations/attachments/extract-worker.ts
    - web/lib/automations/attachments/__tests__/extract-worker.test.ts
    - web/lib/inngest/functions/stage-1_5-attachment-extractor.ts
    - web/lib/inngest/functions/__tests__/stage-1_5-attachment-extractor.test.ts
    - supabase/migrations/20260605c_sales_unknown_dispatch_to_extractor.sql
  modified:
    - web/lib/inngest/events.ts
    - web/app/api/inngest/route.ts
decisions:
  - "Downstream Stage 2 event name is read from attachment_config.stage2_dispatch_event (registry) — a missing key is a fail-loud misconfiguration, NOT a hardcoded sales fallback (would reintroduce the SWARM-02 break / T-116-14)"
  - "The shared helper counts any non-'extracted' status (extraction_failed / unsupported / skipped_cap) as failed; only Graph-404 download errors map to source_gone"
  - "caps are snake_case in the registry jsonb; the worker maps them to the camelCase AttachmentCaps the pure service + helper consume, with global defaults if absent"
  - "Registered the new trigger event in events.ts (Rule 3 blocking fix) — Inngest's typed event-name union must include the trigger or tsc fails; bundled with the worker commit"
requirements-completed: [ATTACH-02]
metrics:
  duration: ~5.5m
  completed: 2026-06-05
---

# Phase 116 Plan 04: Attachment-Extraction Funnel Step Summary

**The extraction funnel step (D-01/D-02) now sits between the Stage 1 verdict and the Stage 2 request — entirely via registry data: one UPDATE repoints the sales `unknown` `swarm_dispatch` to a new extractor event, a new registry-gated worker runs extraction over the captured `pending` attachments (fail-soft per attachment), then ALWAYS re-emits the downstream Stage 2 event whose name it reads from `attachment_config.stage2_dispatch_event` — never a code literal. The shared verdict worker is byte-unchanged. extract=OFF (debtor) is a pure pass-through. The per-email download→store→extract loop is owned by `extract-worker.ts` so Plan 06 backfill reuses the exact same implementation.**

## What Was Built

### Task 1 — `20260605c_sales_unknown_dispatch_to_extractor.sql` (commit `28ecc948`)
- Idempotent `UPDATE public.swarm_noise_categories SET swarm_dispatch = 'sales-email/attachments.extract.requested'` scoped to `swarm_type='sales-email' AND category_key='unknown' AND action='swarm_dispatch'` (was `sales-email/stage-2.customer-resolve.requested`, seeded in 20260604b).
- The verdict worker (untouched) now fires the extractor; the extractor re-emits the registry `stage2_dispatch_event` so Stage 2 still runs — a transparent interposition.
- Debtor untouched (extract=OFF, dispatch unchanged). Header documents the transparency and the no-worker-change rationale.
- **NOT applied to remote** — remote DDL/data writes require user authorization at the orchestrator level (Supabase MCP unavailable). See "Remote Apply" below.

### Task 2 — shared helper + extractor worker (commit `5f83dad1`, TDD)
- **`extract-worker.ts` → `extractEmailAttachments`**: the OWNED per-email loop (Plan 06 reuses it). Per row (capped at `caps.maxAttachmentsPerMail`): `downloadAttachmentValue` → Storage upload at deterministic key `${emailId}/${attachment_id}.<ext>` (`upsert:true`) → `extractAttachment` → row UPDATE (`extracted_text` + `extraction_status` + `storage_key` + `updated_at`). Graph 404 → `source_gone`; any other throw → `extraction_failed`; **never rethrows** (D-03). Returns only `{ extracted, failed, source_gone }` — **never the text** (T-116-11).
- **`stage-1_5-attachment-extractor.ts`**: `inngest.createFunction({ id: "stage-1_5-attachment-extractor", retries: 0 }, { event: "sales-email/attachments.extract.requested" }, ...)`. zod-validates the verdict-worker payload. `load-context` step resolves the email row + its `pending` `email_attachments` rows + `loadSwarm`. Resolves `downstreamEvent = attachment_config.stage2_dispatch_event` — **throws fail-loud naming the swarm if missing** (no code-literal fallback). If `extract===true` AND `emailId` AND pending rows → `step.run("extract-attachments", ...)` calls the shared helper (try/catch so a helper failure still falls through). `emit-stage-2` step **ALWAYS** emits `downstreamEvent` with the same `{ automation_run_id, swarm_type, category_key, message_id, source_mailbox }` shape, via the `(inngest.send as unknown as SendFn)` cast (never destructured).
- **`events.ts`**: registered `sales-email/attachments.extract.requested` in the typed `Events` record (Rule 3 — see Deviations).
- Tests: `extract-worker.test.ts` (A1 happy PDF, A2 per-row fail-soft isolation, A3 Graph-404→source_gone, A4 count cap, + DoS no-text-returned) and `stage-1_5-attachment-extractor.test.ts` (1 OFF pass-through, 2 ON-no-rows, 3 ON-with-rows, 4 helper-throws-still-emits, 5 sentinel-registry-event-name, 6 missing-key fail-loud, + data-shape). **12/12 green.**

### Task 3 — Inngest registration (commit `02b5e31d`)
- Imported `stage1_5AttachmentExtractor` and added it to the `functions: [...]` serve array alongside `classifierVerdictWorker` / `stage2CustomerResolver`. Without this the trigger event is not served (dead-end). `tsc --noEmit` clean.

## Verification

- `npx vitest run lib/automations/attachments/__tests__/extract-worker.test.ts lib/inngest/functions/__tests__/stage-1_5-attachment-extractor.test.ts` → **12/12 green**.
- Regression: `classifier-verdict-worker.test.ts` (8) + `stage-2-customer-resolver.test.ts` + attachments + outlook attachment tests → **56/56 green** across 6 files (verdict worker untouched, confirmed).
- `tsc --noEmit -p .` → no errors in any new/modified file (the events.ts registration cleared the only error).
- Grep gates (code, not comments): no `"sales-email/stage-2` literal in the emit site; no `const send = inngest.send`; no `randomUUID`/`Date.now` as a storage key; no `=== 'sales'`/`=== 'debtor'` branch. The only matches are the prohibition text in header comments.
- Migration grep: `attachments.extract.requested` + `swarm_type = 'sales-email'` present → **OK**.

## Deviations from Plan

**1. [Rule 3 - Blocking] Registered the trigger event in `web/lib/inngest/events.ts`**
- **Found during:** Task 2 (tsc after writing the worker).
- **Issue:** `inngest.createFunction({ event: "sales-email/attachments.extract.requested" }, ...)` failed tsc — Inngest's typed event-name union (the `Events` record consumed by `EventSchemas().fromRecord<Events>()`) did not include the new trigger, so the trigger literal was typed `undefined`.
- **Fix:** Added the `sales-email/attachments.extract.requested` entry to `events.ts` with the same payload shape as the Stage 2 events it precedes, documented as the funnel interposition.
- **Files modified:** `web/lib/inngest/events.ts`
- **Verification:** `tsc --noEmit` clean; worker tests still 12/12.
- **Committed in:** `5f83dad1` (Task 2 commit, bundled with the worker it enables).

**Total deviations:** 1 auto-fixed (1 blocking schema registration). No scope creep — the event payload is identical to the Stage 2 event it wraps.

## Threat Model Coverage

| Threat ID | Mitigation landed |
|-----------|-------------------|
| T-116-11 (DoS — text serialized into events) | Helper returns only `{ extracted, failed, source_gone }`; text written to the table; the emitted event carries only ids (test "never returns extracted text"). |
| T-116-12 (replay-unsafe keys) | Deterministic `${email_id}/${attachment_id}.<ext>` keys; `updated_at` generated inside the step.run-wrapped helper; `inngest.send` never destructured. |
| T-116-13 (one bad attachment stalls the funnel) | Per-attachment try/catch → status; loop continues; Stage 2 ALWAYS re-emitted even if the helper throws (tests A2/A3 + worker test 4). |
| T-116-14 (swarm literal / SWARM-02 break) | Gating = registry `extract` switch; downstream event = registry `stage2_dispatch_event`; missing key fails loud (no sales fallback). Test 5 proves a sentinel registry value is what gets emitted; test 6 proves the fail-loud. |

## Remote Apply (REQUIRED — orchestrator/user action)

Migration `20260605c_sales_unknown_dispatch_to_extractor.sql` is **committed but NOT applied to remote** (per wave instructions — Supabase MCP unavailable, remote DDL/data writes need user authorization). Until applied:
- The new worker code is live (registered), but sales `unknown` rows still dispatch to the **old** Stage 2 event directly — the extractor is bypassed.
- After apply, sales `unknown` rows route Stage 1 → extractor → Stage 2 (with attachment text). Debtor is unaffected.

**Apply steps (orchestrator):** apply `20260605c` to remote `mvqjhlxfvtqqubqgdvhz`, then verify `SELECT swarm_dispatch FROM public.swarm_noise_categories WHERE swarm_type='sales-email' AND category_key='unknown'` returns `sales-email/attachments.extract.requested`.

## Notes for Downstream Plans

- **Plan 06 backfill** imports `extractEmailAttachments` from `extract-worker.ts` — do NOT re-implement the loop. The helper takes `{ admin, emailId, mailbox, messageId, caps, rows }` and is fail-soft; wrap each call in the backfill's own `step.run` for replay isolation.
- **Stage 2 attachment-text concat** (the resolver reading the `extracted` rows as body-source) is a separate concern (Plan 04b / the Stage 2 resolver modification in PATTERNS) — this plan only produces the extracted rows; it does not modify `stage-2-customer-resolver.ts` or the engine (STAGE2-01 holds — engine untouched).
- `maxVisionPages` is carried through caps but remains informational for single-image vision (Plan 02 note); per-page PDF rendering is a future concern.

## Self-Check: PASSED

- FOUND: web/lib/automations/attachments/extract-worker.ts
- FOUND: web/lib/inngest/functions/stage-1_5-attachment-extractor.ts
- FOUND: supabase/migrations/20260605c_sales_unknown_dispatch_to_extractor.sql
- FOUND commit: 28ecc948 (Task 1)
- FOUND commit: 5f83dad1 (Task 2)
- FOUND commit: 02b5e31d (Task 3)

---
*Phase: 116-attachment-ingest-uniform-cross-swarm*
*Completed: 2026-06-05*
