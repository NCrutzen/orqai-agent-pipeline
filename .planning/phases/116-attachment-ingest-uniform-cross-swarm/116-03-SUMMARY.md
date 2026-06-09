---
phase: 116-attachment-ingest-uniform-cross-swarm
plan: 03
subsystem: attachment-ingest
tags: [outlook-graph, registry-gated, swarm-agnostic, ingest, idempotent-upsert]
requires:
  - phase: 116-01
    provides: email_pipeline.email_attachments table + swarms.attachment_config switches (capture/extract) seeded sales=both-on debtor=capture-only
  - phase: 116-02
    provides: listAttachments Graph helper (metadata-only $select, @odata.type surfaced, zod-validated)
provides:
  - captureAttachmentMetadata — shared registry-gated swarm-agnostic metadata capture helper
  - both ingest routes (sales + debtor) wired to capture attachment metadata after emailId resolves
  - AttachmentConfig type on SwarmRow (typed attachment_config jsonb)
affects:
  - Plan 04 extraction funnel worker (reads the 'pending' email_attachments rows this seeds)
  - Plan 05 Bulk Review detail-pane (reads email_attachments metadata)
tech-stack:
  added: []
  patterns:
    - registry-gated swarm-agnostic capture (loadSwarm switch read, no swarm literal — SWARM-02)
    - per-route swarm_type literal as legitimate route constant vs shared-worker branch
    - fail-soft hot-path helper (try/catch → captured:0, ingest never fails)
    - idempotent upsert onConflict email_id,attachment_id (mirrors conversation_context)
key-files:
  created:
    - web/lib/automations/attachments/capture.ts
    - web/lib/automations/attachments/__tests__/capture.test.ts
  modified:
    - web/lib/swarms/types.ts (AttachmentConfig type on SwarmRow)
    - web/app/api/automations/sales-email/ingest/route.ts (capture hook)
    - web/app/api/automations/debtor-email/ingest/route.ts (capture hook + hasAttachments thread-through)
key-decisions:
  - "Helper reads attachment_config.capture/.extract off the loaded swarm row only — zero swarm literals in shared code (SWARM-02 / T-116-08)"
  - "Per-route swarm_type literal ('sales-email'/'debtor-email') passed to the helper is the legitimate route constant (the route file IS swarm-specific), not a branch"
  - "extraction_status seeded 'pending' (extract ON) vs 'not_requested' (extract OFF) directly from the registry extract switch"
  - "Fail-soft: any Graph/DB error → { captured: 0 } so ingest (the hot path) never fails because of attachments (D-03 / T-116-10)"
  - "Debtor capture is the D-13 proof — single identical helper call, capture turns on purely via the Plan-01 registry row"
  - "Added typed AttachmentConfig to SwarmRow (was untyped) so attachment_config?.capture reads are type-safe"
patterns-established:
  - "Registry-gated swarm-agnostic worker: switch from loadSwarm(admin, swarmType).attachment_config, swarmType flows only into key + row column"
  - "Metadata-only capture at ingest: no binary download, no extraction (D-05) — extraction deferred to Plan 04 worker"
requirements-completed: [ATTACH-01]
duration: ~9min
completed: 2026-06-05
---

# Phase 116 Plan 03: Registry-Gated Attachment Metadata Capture Summary

**Single swarm-agnostic `captureAttachmentMetadata` helper wired into both ingest routes — reads the `attachment_config.capture` registry switch, lists Graph attachments, and upserts one `email_pipeline.email_attachments` metadata row per real (non-inline, fileAttachment) attachment; debtor capture turns on purely via the registry row (D-13), no debtor-specific code.**

## Performance

- **Duration:** ~9 min
- **Started:** 2026-06-05T09:12Z
- **Completed:** 2026-06-05T09:17Z
- **Tasks:** 2
- **Files modified:** 5 (2 created, 3 modified)

## Accomplishments

- Shared `captureAttachmentMetadata` helper: registry-gated, swarm-agnostic, idempotent, fail-soft — one row per real attachment, metadata only.
- Inline attachments and non-`fileAttachment` `@odata.type` (reference/itemAttachment) filtered out at capture.
- `extraction_status` seeded `pending` (sales, extract ON) vs `not_requested` (debtor, extract OFF) directly from the registry `extract` switch.
- Both ingest routes call the helper after `emailId` is resolved, before the stage-0 emit — metadata exists by the time Stage 1 runs.
- Debtor route's only attachment change is the single identical call + threading `hasAttachments` through `msg` — the D-13 registry-opt-in proof.
- Closes SC-1 / ATTACH-01.

## Task Commits

1. **Task 1: Build shared registry-gated captureAttachmentMetadata helper (TDD)** - `38a80434` (feat) — RED test written first (8 cases: 6 behaviors + 2 fail-soft), then GREEN implementation; includes `AttachmentConfig` type addition to `SwarmRow`.
2. **Task 2: Wire captureAttachmentMetadata into sales + debtor ingest routes** - `aae56acb` (feat)

_Task 1 was TDD: the test file was written and run (failed: module missing) before `capture.ts` was created (passed)._

## Files Created/Modified

- `web/lib/automations/attachments/capture.ts` - Shared registry-gated metadata capture helper (loadSwarm switch read, listAttachments, filter, idempotent upsert, fail-soft).
- `web/lib/automations/attachments/__tests__/capture.test.ts` - 8 tests pinning the 6 plan behaviors + 2 fail-soft paths.
- `web/lib/swarms/types.ts` - Added `AttachmentConfig` interface + `attachment_config?` field on `SwarmRow`.
- `web/app/api/automations/sales-email/ingest/route.ts` - Capture hook after emailId, passes `meta.hasAttachments`.
- `web/app/api/automations/debtor-email/ingest/route.ts` - Capture hook after resolvedEmailId; threads `hasAttachments` through `msg`.

## Decisions Made

- **Typed `AttachmentConfig` added to `SwarmRow`** — `attachment_config` was previously untyped on the registry row; added a typed interface (capture/extract/stage2_dispatch_event/caps) so `swarmRow?.attachment_config?.capture` reads are type-safe and tsc-clean. This is the only addition beyond the plan's literal `files_modified` list, and it is a correctness requirement for the typed switch read (no `any`).
- Everything else followed the plan as written.

## Deviations from Plan

**1. [Rule 2 - Missing Critical] Added typed `AttachmentConfig` to `SwarmRow`**
- **Found during:** Task 1 (helper implementation)
- **Issue:** `swarmRow.attachment_config` was not declared on the `SwarmRow` type — reading `.capture`/`.extract` would be a `tsc` error or force an `any` cast.
- **Fix:** Added an `AttachmentConfig` interface (mirrors the Plan-01 jsonb shape) and an optional `attachment_config?` field on `SwarmRow` (optional, matching the `dry_run_config?`/`resolution_config?` precedent for pre-migration assignability).
- **Files modified:** `web/lib/swarms/types.ts`
- **Verification:** `tsc --noEmit` clean for the helper + types; capture tests green.
- **Committed in:** `38a80434` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 missing-critical type). **Impact on plan:** Type addition necessary for a type-safe registry switch read; no scope creep — the helper logic and route wiring are exactly as specified.

## Threat Model Coverage

| Threat ID | Mitigation landed |
|-----------|-------------------|
| T-116-08 (swarm literal in shared helper) | Switches read from the loaded swarm row; grep confirms no code-level `=== 'sales'`/`=== 'debtor'` (only the prohibition is named in a comment). Per-route literal is the route constant only. |
| T-116-09 (inline-image flood) | Inline filter drops `isInline === true`; non-fileAttachment `@odata.type` dropped; metadata-only (no download). max_attachments cap available in registry for Plan 04. |
| T-116-10 (capture failure breaks ingest) | Helper fail-soft (try/catch → `{ captured: 0 }`); both routes call it after the email row is committed; ingest never fails because of attachments (D-03). |

## Issues Encountered

None.

## Verification

- `npx vitest run lib/automations/attachments/__tests__/capture.test.ts` → 8/8 green (6 behaviors + 2 fail-soft).
- `npx vitest run lib/automations/attachments lib/outlook/__tests__/attachments.test.ts` → 20/20 green.
- Both routes grep-positive for `captureAttachmentMetadata`.
- Debtor ingest route test → 7/7 green (no regression).
- Full suite → **2491 passed**, 40 skipped, 95 todo (was 2483 in Wave 1; +8 capture tests).
- `tsc --noEmit` clean for changed files.
- No code-level swarm literal in `capture.ts` (grep).

## User Setup Required

None - no external service configuration required. (Remote DB already carries the Plan-01 `attachment_config` seeds + `email_attachments` table from the cleared 116-01 checkpoint.)

## Next Phase Readiness

- ATTACH-01 / SC-1 met: ingest now seeds `email_attachments` metadata rows (sales: `pending`; debtor: `not_requested`).
- Plan 04 (extraction funnel worker) can consume the `pending` rows.
- Plan 05 (Bulk Review detail pane) can read the metadata via the authenticated SELECT policy.
- No blockers.

## Self-Check: PASSED

- FOUND: web/lib/automations/attachments/capture.ts
- FOUND: web/lib/automations/attachments/__tests__/capture.test.ts
- FOUND commit: 38a80434 (Task 1)
- FOUND commit: aae56acb (Task 2)

---
*Phase: 116-attachment-ingest-uniform-cross-swarm*
*Completed: 2026-06-05*
