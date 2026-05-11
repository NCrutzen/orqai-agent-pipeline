---
phase: 82-unified-stage-shell
plan: 04
subsystem: web/app/(dashboard)/automations/[swarm]
tags: [stage-4, unified-shell, kanban-loader, email_pipeline-join]
requires:
  - 82-01 (UnifiedDetailPane + _shell/ primitives)
  - 82-03 (Stage 2 unified shell — page-boundary mapping pattern)
provides:
  - kanban-loader carries email_pipeline.emails metadata (subject, sender, received_at, mailbox_id)
  - Stage 4 page fully on unified _shell/
  - V5 verification check satisfied
affects:
  - 82-05 (Stage 3 migration — same loader JOIN, same page-boundary mapping pattern)
tech_stack:
  added: []
  patterns:
    - PostgREST cross-schema JOIN via admin.schema("email_pipeline")
    - Page-boundary KanbanRow → unified Row mapping (Pattern 2)
    - Parallel server-side pre-fetch for body + timeline (Stage 1 mirror)
key_files:
  created:
    - web/app/(dashboard)/automations/[swarm]/stage-4/client-shell.tsx
    - web/app/(dashboard)/automations/[swarm]/stage-4/__tests__/page.test.tsx
  modified:
    - web/app/(dashboard)/automations/[swarm]/_lib/kanban-loader.ts
    - web/app/(dashboard)/automations/[swarm]/_lib/__tests__/kanban-loader.test.ts
    - web/app/(dashboard)/automations/[swarm]/stage-4/page.tsx
  deleted:
    - web/app/(dashboard)/automations/[swarm]/stage-4/row-list.tsx
    - web/app/(dashboard)/automations/[swarm]/stage-4/detail-pane.tsx
    - web/app/(dashboard)/automations/[swarm]/stage-4/selection-context.tsx
    - web/app/(dashboard)/automations/[swarm]/stage-4/filter-chips.tsx
    - web/app/(dashboard)/automations/[swarm]/stage-4/error-detail-section.tsx
decisions:
  - email_pipeline.emails JOIN landed in kanban-loader.ts (resolves OQ-1)
  - .schema(name) shim in test admin mocks for cross-schema query
  - Stage4HandlerErrorWidget inlined into client-shell.tsx and surfaced via UnifiedDetailPane's taggingFailuresSection slot (existing shell hook; Plan 06 lifts to real Stage4Widget)
  - error-detail-section.tsx deleted as orphan once its logic was inlined into client-shell.tsx (Rule 3 — deviation logged below)
  - Body + timeline pre-fetch on the server side (parallel Promise.all), mirroring stage-1/page.tsx:696-727 — no conditional defer (V8 mandate)
metrics:
  duration: 8m
  task_count: 2
  file_count: 8
  completed: 2026-05-11
---

# Phase 82 Plan 04: Stage 4 unified-shell migration + email_pipeline JOIN Summary

Stage 4 page (handler-error Kanban surface) folded onto the unified `_shell/` library; kanban-loader extended with the `email_pipeline.emails` JOIN (resolves OQ-1) so unified Row shapes can carry subject/sender/received_at/mailbox_id without per-stage SELECTs.

## What Shipped

### Task 1 — kanban-loader JOIN (commit `ba96e24`)

- `KanbanRow` extended with `email_metadata: { subject, sender_email, sender_name, received_at, mailbox_id } | null`.
- New `EmailMetadata` exported interface.
- `loadKanbanRows` now runs `pipeline_events` lookup and `email_pipeline.emails` lookup **in parallel** via a single `Promise.all`. Cross-schema query via `admin.schema("email_pipeline").from("emails").select("id, subject, sender_email, sender_name, received_at, mailbox_id").in("id", emailIds)`.
- Defensive coalesce: when the upstream email row is gone (deleted), `email_metadata = null` — no crash, no `(no subject)` cascade if the email exists.
- R-3 mitigation preserved: when no `email_ids` are present in any row, the loader skips BOTH joins entirely.
- Test fixture extended with `.schema(name)` shim mirroring Phase 81-04 admin mocks; 4 new tests cover dedup `.in()`, populated metadata, missing email_id, and JOIN-omitted rows.

### Task 2 — Stage 4 unified-shell migration (commit `7082e25`)

- `stage-4/page.tsx` (RSC) rewritten to:
  - Import 5 `_shell/` primitives (`PageHeader`, `StageTabStrip`, `UnifiedDetailPane`, `SelectionProvider`, plus the helpers `RowList`/`MailboxFilter`/`getSwarmMailboxes` consumed inside the client shell).
  - Map `KanbanRow → Row` via `toUnifiedRow` — `mailbox_id` threaded through from `k.email_metadata?.mailbox_id ?? null` so V6 mailbox filter works.
  - Pre-fetch email body (email_pipeline.emails.body_text/body_html) and timeline (pipeline_events) for ALL visible rows in a single parallel `Promise.all` (Pitfall 3 mandatory).
  - Subscribe to `${swarmType}-kanban` channel **only** (not `-review`).
  - **NOT** load `swarm_intents` (Stage 4 has NO Replay path — hard separation preserved).
- New `stage-4/client-shell.tsx` (client): subscribes to `useSelection()`, applies client-side mailbox filter, renders `RowList` + `UnifiedDetailPane` with `activeStage={4}` + handler-error widget slot.
- Inline `Stage4HandlerErrorWidget` (replaces old `error-detail-section.tsx`): renders `error_name` + `error_detail` with verbatim red-pre styling. Mounted via `UnifiedDetailPane.taggingFailuresSection` slot until Plan 06 lifts it to a real Stage4Widget.
- RFC hard-separation comment block at top of file preserved verbatim (lines 8–15).
- 9 RTL tests cover: handler_error filter, sender+subject from `email_metadata`, kanban-channel only, no `loadSwarmIntents` call, 5-cell pipeline section with `stage-cell-4[data-active=true]`, RFC comment preserved, no "Bulk Review" copy, `notFound()` on unknown swarm.

### Deletions

5 files removed (4 listed in the plan plus 1 orphan):
- `row-list.tsx`, `detail-pane.tsx`, `selection-context.tsx`, `filter-chips.tsx` (planned)
- `error-detail-section.tsx` (orphan — only consumer was the deleted `detail-pane.tsx`; logic preserved inline in `client-shell.tsx`)

## Verification

- `cd web && npx vitest run app/(dashboard)/automations/[swarm]/_lib/__tests__/kanban-loader.test.ts` → 12/12 ✓
- `cd web && npx vitest run app/(dashboard)/automations/[swarm]/stage-4/__tests__/page.test.tsx` → 9/9 ✓
- Full automations test run: 22/24 test files pass; 2 pre-existing failures (stage-1/load-page-data + load-page-data.predictor) reproduce on `main` without these changes — out of scope per scope-boundary rule.
- `cd web && npx tsc --noEmit` → no new errors; same 2 pre-existing pre-Plan-04 errors in `stage-1/__tests__/actions.predictor.test.ts` and `lib/classifier/corpus-mapping.ts`.
- All acceptance-criteria greps pass (5+ `_shell/` imports, kanban-only channel, no `loadSwarmIntents`, hard-sep comment present, `k.email_metadata?.mailbox_id` thread, all 4 listed old files gone, `email_pipeline` + `Promise.all` present in loader).

## Deviations from Plan

### Rule 3 — Fixed blocking issue

**1. [Rule 3 — Orphan file] Deleted `error-detail-section.tsx`**
- **Found during:** Task 2.
- **Issue:** After deleting `stage-4/detail-pane.tsx` (the only importer of `error-detail-section.tsx`), the file became dead code.
- **Fix:** Inlined `ErrorDetailSection` into `client-shell.tsx` as `Stage4HandlerErrorWidget` (semantic rename for the unified-shell context) and deleted `error-detail-section.tsx`. Verified no other consumers via `grep`.
- **Files modified:** `stage-4/client-shell.tsx` (inline copy), `stage-4/error-detail-section.tsx` (deleted).
- **Commit:** `7082e25`.

The plan's explicit deletion list named 4 files; this added 1 orphan deletion that the plan implied by removing the only importer.

## Threat Flags

None — no new network endpoints, no auth changes, no new trust boundaries. The `email_pipeline.emails` JOIN was already used by Stage 1 page; this plan factors it into a shared loader.

## Known Stubs

None. The Stage 4 widget surface (handler-error display) was a real component (`error-detail-section.tsx`) in Phase 76; it is preserved verbatim in `client-shell.tsx`. The body-preview now works because of the mandatory pre-fetch.

The `UnifiedDetailPane`'s Stage 4 cell **widget** (the inline-editor inside the active cell) remains a placeholder per Plan 82-01's deferred scope — Plan 82-06 wires the real Stage4Widget (quality + reason text). This Plan still satisfies V5 because the handler-error detail surfaces via the `taggingFailuresSection` slot, which is the canonical inline-widget hook for Stage 1 too.

## Self-Check: PASSED

Files verified to exist:
- `web/app/(dashboard)/automations/[swarm]/stage-4/page.tsx` — FOUND
- `web/app/(dashboard)/automations/[swarm]/stage-4/client-shell.tsx` — FOUND
- `web/app/(dashboard)/automations/[swarm]/stage-4/__tests__/page.test.tsx` — FOUND
- `web/app/(dashboard)/automations/[swarm]/_lib/kanban-loader.ts` — FOUND

Files verified to be deleted:
- `web/app/(dashboard)/automations/[swarm]/stage-4/row-list.tsx` — GONE
- `web/app/(dashboard)/automations/[swarm]/stage-4/detail-pane.tsx` — GONE
- `web/app/(dashboard)/automations/[swarm]/stage-4/selection-context.tsx` — GONE
- `web/app/(dashboard)/automations/[swarm]/stage-4/filter-chips.tsx` — GONE
- `web/app/(dashboard)/automations/[swarm]/stage-4/error-detail-section.tsx` — GONE

Commits verified to exist:
- `ba96e24` — FOUND (Task 1: loader JOIN)
- `7082e25` — FOUND (Task 2: Stage 4 unified-shell migration)
