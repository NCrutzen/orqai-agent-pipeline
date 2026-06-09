---
phase: 116-attachment-ingest-uniform-cross-swarm
verified: 2026-06-05T10:45:00Z
status: human_needed
score: 4/4
overrides_applied: 0
human_verification:
  - test: "Trigger a bounded dry-run of the corpus backfill, followed by a bounded live run, followed by the full backfill over the 1,273-mail corpus"
    expected: "dry-run returns non-zero mails_scanned / attachments_found; live run creates email_attachments rows and is idempotent on re-run; a Stage-1-survivor PDF email shows extraction_status='extracted' with non-empty extracted_text; a non-survivor shows metadata only; the full run completes without hitting the fail-loud cap"
    why_human: "Corpus-scale Graph read operation; requires a live Inngest trigger and inspection of the remote Supabase DB; the SC-4 live-run was explicitly deferred to the operator checkpoint (user-approved 2026-06-05, tracked in .planning/todos/pending/2026-06-05-apply-20260605c-after-deploy.md)"
  - test: "Apply migration 20260605c to remote after code deploy, then send one live sales unknown mail through the pipeline"
    expected: "swarm_noise_categories.swarm_dispatch for sales-email/unknown shows 'sales-email/attachments.extract.requested'; the mail routes Stage 1 -> stage-1_5-attachment-extractor -> Stage 2 with attachment text visible in the Stage 2 resolver's body_text; no dead-end"
    why_human: "Requires code to be deployed to Vercel first (the worker only exists on this branch); applying 20260605c before deploy causes a stall (same class as the 2026-06-04 archive incident); the runtime routing of the funnel interposition cannot be verified from code alone"
  - test: "Apply migration 20260605d to remote and confirm the Bulk Review /review surface still shows attachment metadata"
    expected: "20260605d (WR-05 RLS tightening — drops authenticated FOR SELECT on base table, adds security_invoker view) is applied without breaking the Bulk Review display; the Stage 2 Read column still renders filename/type/size/status per attachment for backfilled emails"
    why_human: "20260605d is committed but not applied to remote (noted in migration header); the hydrator reads via service_role so the product should be unaffected, but this must be confirmed on the live surface after apply"
---

# Phase 116: Attachment Ingest — Uniform Cross-Swarm Verification Report

**Phase Goal:** Attachments become a first-class, swarm-agnostic data source in the pipeline: ingest captures attachment metadata per email, content extraction (PDF text first) available on demand, extracted data exposed as a uniform source any swarm consumes via registry config — Stage 2 resolution, Stage 3 intent signals, future Stage 4 handlers. No per-swarm branches in shared workers (SWARM-02); engine files byte-identical to v8.2 donor (STAGE2-01) — attachment text enters Stage 2 adapter-side only.

**Verified:** 2026-06-05T10:45:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Ingest writes attachment metadata for new mail in every onboarded swarm; capture is swarm-agnostic, registry-configured | VERIFIED | `captureAttachmentMetadata` exported from `capture.ts`, called in both ingest routes after `emailId` resolves; `swarmRow.attachment_config.capture` is the ONLY gate — no swarm literal in shared code; 8 capture tests green |
| 2 | Attachment content extraction (PDF text minimum) callable as a uniform source — zero swarm-specific branches in shared workers (SWARM-02) | VERIFIED | `extract.ts` + `extract-worker.ts` + `stage-1_5-attachment-extractor.ts` all pass swarm-literal grep; gating is the registry `extract` switch only; `attachment_config.stage2_dispatch_event` read from registry, never a code literal; 46/46 unit tests pass |
| 3 | Stage 2 can consume attachment-derived identifiers as an adapter-side source with the no-engine-diff guard still green (STAGE2-01) | VERIFIED | `stage-2-customer-resolver.ts` concatenates extracted rows into `body_text` in-place; `scripts/no-engine-diff-check.sh` exits 0 (engine/config/steps byte-identical to v8.2 donor; dynamic.ts only the sales registration line) |
| 4 | Backfill over the existing corpus executed OR explicitly deferred with rationale; has_attachments=false blind spot closed | VERIFIED | `attachments-backfill.ts` worker built, registered, 6/6 tests pass; live run explicitly deferred with user approval 2026-06-05; tracked in `.planning/todos/pending/2026-06-05-apply-20260605c-after-deploy.md`; SC-4 text explicitly allows "executed OR explicitly deferred-with-rationale" |

**Score:** 4/4 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/20260605_email_attachments.sql` | Generic email_attachments table + private Storage bucket + RLS | VERIFIED | File exists; `CREATE TABLE IF NOT EXISTS email_pipeline.email_attachments`; `ENABLE ROW LEVEL SECURITY`; service_all + auth_select policies; no anon policy; `public=false` bucket; UNIQUE on `(email_id, attachment_id)` |
| `supabase/migrations/20260605b_swarms_attachment_switches.sql` | D-04 registry switches + stage2_dispatch_event + D-13 | VERIFIED | `ADD COLUMN IF NOT EXISTS attachment_config jsonb`; sales capture=true/extract=true; debtor capture=true/extract=false; both carry `stage2_dispatch_event`; global caps seeded |
| `supabase/migrations/20260605c_sales_unknown_dispatch_to_extractor.sql` | Registry rewire: sales unknown swarm_dispatch → extractor event | VERIFIED (code) | File exists; `attachments.extract.requested` present; scoped to `swarm_type='sales-email' AND category_key='unknown'`; NOT yet applied to remote (accepted deferral — go-live after code deploy) |
| `supabase/migrations/20260605d_email_attachments_review_wr02_wr05.sql` | WR-02 + WR-05 RLS tightening | VERIFIED (code) | File exists; drops over-broad authenticated SELECT; adds metadata-only security_invoker view; NOT yet applied to remote (accepted deferral) |
| `web/lib/outlook/client.ts` | `listAttachments` + `downloadAttachmentValue` Graph helpers | VERIFIED | Both exported functions present; route through `graphFetch`; zod-validated; `$select` no `contentBytes`; `/$value` endpoint; 4/4 unit tests pass |
| `web/lib/automations/attachments/extract.ts` | Swarm-agnostic PDF/image extraction service | VERIFIED | `extractAttachment` exported; imports `renderPageAsImage` from unpdf (CR-01 fix); `maxVisionPages` enforced (CR-02 fix); `AttachmentExtractError` class; `orqRouterChat` shared util (WR-04 fix); fail-soft via try/catch; no swarm literal; 8/8 tests pass |
| `web/lib/automations/attachments/capture.ts` | Registry-gated metadata capture helper | VERIFIED | `captureAttachmentMetadata` exported; reads `swarmRow.attachment_config.capture/.extract`; onConflict upsert; inline/non-fileAttachment filter; fail-soft; 8/8 tests pass |
| `web/lib/automations/attachments/extract-worker.ts` | Shared per-email download/store/extract/update loop | VERIFIED | `extractEmailAttachments` exported; deterministic storage key `${emailId}/${attachment_id}.ext`; no randomUUID/Date.now as key; per-attachment fail-soft; returns `{ extracted, failed, skipped }` (WR-07 fix); never returns text; 5/5 tests pass |
| `web/lib/inngest/functions/stage-1_5-attachment-extractor.ts` | Post-Stage-1 extraction funnel step | VERIFIED | Triggers on `sales-email/attachments.extract.requested`; resolves `downstreamEvent` from registry; throws fail-loud if missing; ALWAYS emits downstream event; `(inngest.send as unknown as SendFn)` cast; authoritative on pending rows (WR-03 fix); 7/7 tests pass |
| `web/lib/inngest/functions/attachments-backfill.ts` | Gated corpus metadata backfill | VERIFIED | Triggers on `sales-email/attachments.backfill.run`; imports `extractEmailAttachments` (no reimplementation); fail-loud cap; bounded batches; WR-06 limit fix; 6/6 tests pass |
| `web/app/api/inngest/route.ts` | Both workers registered in Inngest serve array | VERIFIED | `stage1_5AttachmentExtractor` and `attachmentsBackfill` imported and added to `functions: [...]` array |
| `web/lib/inngest/functions/stage-2-customer-resolver.ts` | Adapter-side attachment-text concatenation into body_text | VERIFIED | `email_attachments` SELECT inside `load-email` step; `UNTRUSTED DATA` fence applied (WR-01 fix); `combinedBody` mutation; engine/config untouched |
| `web/lib/bulk-review/types.ts` | `BulkReviewRow.attachments` slot | VERIFIED | `BulkReviewAttachment` type + optional `attachments?` slot on `BulkReviewRow` |
| `web/lib/bulk-review/hydrate.ts` | Per-row attachment-metadata loader | VERIFIED | `SELECT … FROM email_pipeline.email_attachments WHERE email_id = anchorEmailId`; query error is non-fatal; `attachments` slot populated on returned row |
| `web/app/(dashboard)/automations/[swarm]/_shell/components/attachment-list.tsx` | Attachment metadata + status display | VERIFIED | `AttachmentList` exported; all statuses mapped to badge tokens; empty state; no download/preview control; `needs_vision` removed (WR-02 fix); 5/5 RTL tests pass |
| `web/app/(dashboard)/automations/[swarm]/_shell/components/stage-2-read.tsx` | AttachmentList wired in Stage 2 Read column | VERIFIED | `import { AttachmentList }` present; `row.attachments ?? []` passed; renders in the Stage 2 Read column (production-visible path in /review) |
| `web/lib/automations/orq-router.ts` | Shared Orq Router SDK invocation util | VERIFIED | File exists; `orqRouterChat` exported; used by `extract.ts` (WR-04 fix) |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `swarms.attachment_config.capture` | `captureAttachmentMetadata` | `loadSwarm` registry read | WIRED | `swarmRow?.attachment_config?.capture === true` gates the helper; no swarm literal |
| `captureAttachmentMetadata` | `email_pipeline.email_attachments` | upsert after `emailId` resolves | WIRED | Both ingest routes call the helper after emailId; onConflict `email_id,attachment_id` |
| `swarm_noise_categories.swarm_dispatch` (sales unknown) | `stage-1_5-attachment-extractor` | `sales-email/attachments.extract.requested` | WIRED (code) / PENDING (runtime) | Migration 20260605c committed; deferred apply until code deploy |
| `stage-1_5-attachment-extractor` | `stage-2-customer-resolver` | `attachment_config.stage2_dispatch_event` re-emit | WIRED | `downstreamEvent` read from registry; ALWAYS emitted; no code literal at emit site |
| `attachments-backfill` | `extract-worker.ts` | `extractEmailAttachments` import | WIRED | Import present at line 46; no duplicated loop |
| `hydrateBulkReviewRow` | `BulkReviewRow.attachments` | SELECT on `anchorEmailId` | WIRED | `email_attachments` SELECT in hydrate.ts; slot on BulkReviewRow |
| `Stage2Read` | `BulkReviewRow.attachments` | `AttachmentList` component | WIRED | `import { AttachmentList }` in stage-2-read.tsx; `row.attachments ?? []` passed |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|--------------------|--------|
| `stage-2-customer-resolver.ts` | `attachmentRows` | `email_pipeline.email_attachments` SELECT in `load-email` step | Yes — DB SELECT filtered by `email_id` | FLOWING |
| `hydrate.ts` | `row.attachments` | `email_pipeline.email_attachments` SELECT on `anchorEmailId` | Yes — DB SELECT, non-fatal on error | FLOWING |
| `stage-2-read.tsx` | `attachments` | `row.attachments ?? []` from hydrated BulkReviewRow | Yes — hydrator always projects an array | FLOWING |
| `stage-1_5-attachment-extractor.ts` | `downstreamEvent` | `swarmRow.attachment_config.stage2_dispatch_event` (registry) | Yes — throws fail-loud if missing (not a hardcoded fallback) | FLOWING |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| STAGE2-01 guard green | `scripts/no-engine-diff-check.sh` | exit 0; IDENTICAL for all 5 guarded files; SCOPED-OK for dynamic.ts | PASS |
| All attachment unit tests pass | `vitest run lib/automations/attachments/__tests__/ lib/outlook/__tests__/attachments.test.ts lib/inngest/functions/__tests__/stage-1_5-attachment-extractor.test.ts lib/inngest/functions/__tests__/attachments-backfill.test.ts` | 46/46 green across 6 files | PASS |
| Stage 2 body-fold + hydrate tests | `vitest run stage-2-customer-resolver.test.ts hydrate.test.ts` | 65/65 green across 2 files | PASS |
| AttachmentList RTL tests | `vitest run … attachment-list.test.tsx` (full suite path) | 5/5 green | PASS |
| TypeScript compilation | `tsc --noEmit -p .` (web/) | exit 0 — no errors | PASS |
| Codegen drift | `npm run codegen && git diff --exit-code` | All 3 generators already up-to-date; no diff | PASS |

---

### Probe Execution

No phase-specific probes defined. `scripts/no-engine-diff-check.sh` serves as the STAGE2-01 probe — PASS (exit 0).

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| ATTACH-05 | Plan 01 | Generic email_attachments table + private bucket + RLS + attachment_config registry switches; codegen-drift-free | SATISFIED | Both migrations exist and were applied to remote (Plan 01 checkpoint cleared); `npm run codegen` drift-free; note: REQUIREMENTS.md tracking checkbox `[ ]` not updated to `[x]` — tracking gap only, not an implementation gap |
| ATTACH-01 | Plan 03 | Ingest writes swarm-agnostic metadata via registry-gated helper | SATISFIED | `captureAttachmentMetadata` in both ingest routes; REQUIREMENTS.md marked `[x]` |
| ATTACH-02 | Plan 04 | Extraction is a registry-keyed funnel step; zero SWARM-02 breaks | SATISFIED | `stage-1_5-attachment-extractor.ts` + all required grep gates pass; REQUIREMENTS.md marked `[x]` |
| ATTACH-03 | Plan 05 | Stage 2 adapter-side attachment text; STAGE2-01 green | SATISFIED | `no-engine-diff-check.sh` exits 0; `body_text` concat confirmed; REQUIREMENTS.md marked `[x]` |
| ATTACH-06 | Plan 05 | Bulk Review detail pane shows metadata + status (D-08) | SATISFIED | `AttachmentList` in `stage-2-read.tsx` (production /review path); hydrator loads from DB; 5/5 RTL tests; REQUIREMENTS.md marked `[x]` |
| ATTACH-04 | Plan 06 | Backfill worker; live run executed or explicitly deferred | SATISFIED | Worker built + registered + 6/6 tests; live run deferred with user approval; tracked in todos; SC-4 "deferred-with-rationale" path; REQUIREMENTS.md marked `[x]` |

**Note on ATTACH-05:** REQUIREMENTS.md shows `[ ] ATTACH-05` (pending checkbox) and tracking table row `ATTACH-05 | Phase 116 | Pending`. The implementation is fully present in the codebase (migrations applied to remote per Plan 01 checkpoint). This is a REQUIREMENTS.md tracking omission — the Plan 01 SUMMARY does not carry a `requirements-completed: [ATTACH-05]` field, so the tracking update was skipped. Not a code gap.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `supabase/migrations/20260605d_…sql` | 3 | `NOT YET APPLIED TO REMOTE` header comment | INFO | Accepted known deferral — tracked in todos |
| `supabase/migrations/20260605c_…sql` | (whole file) | Committed but not applied to remote | INFO | Accepted known deferral — go-live sequencing decision; tracked in todos |

No `TBD`, `FIXME`, or `XXX` markers found in phase-modified files. No stub patterns. Review Critical (CR-01, CR-02) and Warning (WR-01 through WR-07) findings all confirmed fixed via their respective commits (`8ce5fe10`, `a72e04d6`, `2acc75f1`, `0be983ca`, `f7a99a9c`, `f2d39540`, `0ce7881e`). Info findings (IN-01 through IN-06) were explicitly declared out of scope for the fix pass.

---

### Human Verification Required

#### 1. Corpus Backfill Live Run (SC-4 Operator Checkpoint)

**Test:** Trigger the backfill worker in bounded dry-run mode (`{ dry_run: true, limit: 50 }`), then bounded live mode (`{ limit: 50 }`), then full mode (no limit).
**Expected:** Dry-run shows non-zero `mails_scanned` and `attachments_found` (confirming the has_attachments=false blind spot is real and now detectable). Live run creates `email_pipeline.email_attachments` rows; re-running the same bounded limit produces no duplicates (idempotent upsert). A Stage-1-survivor PDF email shows `extraction_status='extracted'` with non-empty `extracted_text`; a non-survivor shows metadata only. Full run completes without a fail-loud cap throw; summary matches corpus expectations.
**Why human:** Corpus-scale Graph read operation over the live 1,273-mail verkoop@ corpus; requires a live Inngest trigger, Supabase DB inspection, and runtime observation. SC-4 explicitly permits "executed OR explicitly deferred-with-rationale" — the deferral was user-approved but the run itself is still required post-deploy.

#### 2. Apply Migration 20260605c and Verify Funnel Routing

**Test:** After the branch is merged and deployed to Vercel (confirming `stage-1_5-attachment-extractor` is registered in the live Inngest handler), apply migration `20260605c` to remote. Then send or wait for one live sales email classified as `unknown` to arrive.
**Expected:** `SELECT swarm_dispatch FROM public.swarm_noise_categories WHERE swarm_type='sales-email' AND category_key='unknown'` returns `sales-email/attachments.extract.requested`. The email routes Stage 1 verdict → stage-1_5 extractor → Stage 2 customer resolver, with any extracted attachment text present in the Stage 2 body_text. No stall/dead-end.
**Why human:** Cannot apply 20260605c before code deploy (worker must be live first — go-live sequencing); runtime funnel routing cannot be verified from code alone; requires live Inngest observation.

#### 3. Apply Migration 20260605d and Verify Bulk Review Unaffected

**Test:** Apply migration `20260605d` to remote. Navigate to `/review` for a sales email that has attachments (or wait for a backfilled email to appear). Verify the Stage 2 Read column still shows the AttachmentList with filename/type/size/status.
**Expected:** The Bulk Review display is unaffected (hydrator reads via `service_role` on metadata columns only — no `extracted_text`, no `storage_key`); the new `email_attachments_meta` security_invoker view exists; the over-broad authenticated SELECT on the base table is gone.
**Why human:** Requires applying the migration and visual inspection of the live /review surface; the hydrator's service_role path is unaffected by the RLS change but confirmation on the live surface closes the loop.

---

### Gaps Summary

No code gaps found. All four roadmap success criteria are verifiably implemented in the codebase. The three human verification items are runtime/deployment verification steps, not missing code. The REQUIREMENTS.md `ATTACH-05` checkbox is a tracking omission only.

The two accepted deferrals (20260605c not yet applied to remote; live backfill run deferred to operator) are explicitly tracked in `.planning/todos/pending/2026-06-05-apply-20260605c-after-deploy.md` and are consistent with the phase goal statement ("backfill executed OR explicitly deferred with rationale").

---

_Verified: 2026-06-05T10:45:00Z_
_Verifier: Claude (gsd-verifier)_
