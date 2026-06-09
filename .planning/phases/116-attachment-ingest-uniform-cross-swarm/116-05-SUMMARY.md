---
phase: 116-attachment-ingest-uniform-cross-swarm
plan: 05
subsystem: attachment-consumption-and-visibility
tags: [stage-2, body-source, bulk-review, detail-pane, swarm-agnostic, stage2-01, d-08]
requires:
  - phase: 116-01
    provides: email_pipeline.email_attachments table + authenticated FOR SELECT policy
  - phase: 116-04
    provides: extractEmailAttachments writes `extracted` rows the Stage 2 worker now reads
provides:
  - Stage 2 worker folds extracted attachment text into body_text (STAGE2-01-safe, engine pristine)
  - BulkReviewRow.attachments slot + hydrateBulkReviewRow loader (email_attachments → row)
  - AttachmentList presentation component (metadata + extraction-status badge, no preview/download)
  - AttachmentList rendered in the Stage 2 Read column on /review (genuine end-to-end, visible in production)
affects:
  - Stage 3 (V11.0) — attachment-derived text now flows into Stage 2 body; Stage 3 LLM injection posture noted (T-116-16)
  - legacy stage-N UnifiedDetailPane surfaces (detail-pane attachmentsByEmailId prop, Stage 2 audit slot)
tech-stack:
  added: []
  patterns:
    - adapter-side body-source fold (attachment text is just more body_text; engine never sees a new field — D-11)
    - in-place body_text mutation in the load-email step so every resolveEntity/resolveDebtor call site picks it up (minimal diff, STAGE2-01-safe)
    - row-hydrator-owned enrichment load (email_attachments keyed on anchorEmailId, non-fatal on miss/error)
    - presentation component reuses existing --v7-state-* token triad (no new visual language, no new color tokens)
    - shared structural type aliased across hydrator + UI (AttachmentRow = BulkReviewAttachment) to prevent drift
key-files:
  created:
    - web/app/(dashboard)/automations/[swarm]/_shell/components/attachment-list.tsx
    - web/app/(dashboard)/automations/[swarm]/_shell/__tests__/attachment-list.test.tsx
  modified:
    - web/lib/inngest/functions/stage-2-customer-resolver.ts
    - web/lib/inngest/functions/__tests__/stage-2-customer-resolver.test.ts
    - web/lib/bulk-review/types.ts
    - web/lib/bulk-review/hydrate.ts
    - web/lib/bulk-review/__tests__/hydrate.test.ts
    - web/app/(dashboard)/automations/[swarm]/_shell/detail-pane.tsx
    - web/app/(dashboard)/automations/[swarm]/_shell/components/stage-2-read.tsx
decisions:
  - "Attachment text is concatenated into body_text via in-place mutation of the load-email step's returned row — NOT by editing the 4 resolveEntity call sites or adding an attachments field (STAGE2-01 / Pitfall 2). Engine/config/steps byte-identical to donor."
  - "Task 1's behaviors are tested in the stage-2 WORKER test, not resolve-customer.test.ts — the adapter's resolveEntity reads only args.body_text and never sees the concat; the worker is where the fold happens. The plan's verify command pointed at the adapter test; the worker test is the correct surface and is where the 4 behaviors now live."
  - "The post-rebuild /review surface renders InlineExpandRow (via row-strip-list), NOT UnifiedDetailPane. So the genuine production-visible wiring is <AttachmentList> inside Stage2Read (the Stage 2 Read column), reading row.attachments. The detail-pane.tsx attachmentsByEmailId → Stage 2 audit wiring is retained for the legacy stage-N UnifiedDetailPane surfaces (parity)."
  - "BulkReviewRow.attachments is optional (`?`) ONLY to keep the ~15 pre-existing BulkReviewRow test fixtures assignable without churn; the hydrator always projects an array and all consumers use `row.attachments ?? []`."
  - "AttachmentRow re-exported as an alias of the canonical BulkReviewAttachment (lib/bulk-review/types.ts) so the hydrator → row → UI path cannot drift; UI importing from lib/ is allowed (the out-of-band guard only forbids lib/bulk-review importing from the UI tree)."
requirements-completed: [ATTACH-03, ATTACH-06]
metrics:
  duration: ~12m
  completed: 2026-06-05
---

# Phase 116 Plan 05: Attachment Consumption + Operator Visibility Summary

**Extracted attachment text is now usable downstream and visible to the operator. Stage 2 (ATTACH-03/SC-3): the Stage 2 worker additionally loads this email's `extracted` `email_attachments` rows and folds their text into the `body_text` it passes to the resolver — the engine NEVER sees a new field (attachment text is just more body text, D-11), so the no-engine-diff guard stays green by construction. Bulk Review (ATTACH-06/D-08): a swarm-agnostic `AttachmentList` renders per-attachment filename/type/size + an extraction-status badge in the Stage 2 Read column on `/review`, loaded by the same `hydrateBulkReviewRow` row hydrator (`email_attachments` → `BulkReviewRow.attachments`) the post-rebuild surface already uses — end-to-end visible in production, no preview/download.**

## What Was Built

### Task 1 — Stage 2 attachment-text fold (commit `eab5e0a2`, TDD)
- `stage-2-customer-resolver.ts` `load-email` step: after the email row is loaded, additionally `SELECT attachment_id, extraction_status, extracted_text FROM email_pipeline.email_attachments WHERE email_id = <id>`, build `attachmentText` from rows with `extraction_status === 'extracted' && extracted_text` joined with `\n\n`, and mutate `data.body_text` in place to `${body}\n\n--- ATTACHMENTS ---\n${attachmentText}` when non-empty. Because the mutation is on the returned row, EVERY downstream `resolveEntity`/`resolveDebtor` call site (lines 237/249/391/572 pass `emailRow.body_text`) picks up the combined value with no per-site edit.
- Engine signature unchanged; NO `attachments` field on `ResolveArgs`/engine/config (STAGE2-01 / Pitfall 2). Swarm-agnostic: debtor has no `extracted` rows today so `combinedBody === body` (zero behaviour change).
- 4 behaviors tested in the stage-2 worker test (observed via the `resolveDebtor` spy's `body_text`): extracted concat / none-extracted unchanged / no-rows unchanged / multiple joined with blank line. Fixed the worker test's shared-EMAIL_ROW mock to return a fresh copy (the in-place body mutation was leaking across runs).

### Task 2 — AttachmentList component (commit `a9de5d80`, TDD)
- `attachment-list.tsx`: `AttachmentList({ attachments })` renders one row per attachment — filename (fallback "unnamed"), content_type (fallback "unknown type"), human-readable size (B/KB/MB; null → "—"), and an extraction-status badge. All 8 statuses map onto the existing `--v7-state-*` token triad: `extracted`→success(match), `needs_vision`/`pending`→progress(llm-rescue), `extraction_failed`/`skipped_cap`/`source_gone`→warning(warn), `unsupported`/`not_requested`→muted(idle). Empty list → "No attachments" empty state. NO `<a download>`, NO `<img>` preview (D-08). Inline `var(--v7-*)` tokens only; mirrors `stage-2-read.tsx` conventions.
- Exports `AttachmentRow` (aliased to `BulkReviewAttachment`) so hydrator + detail-pane share one shape.
- 5 RTL tests green (metadata render / null fallbacks / all-statuses-distinct / empty state / no-preview-download).

### Task 3 — end-to-end wire (commit `76af14ac`)
- `types.ts`: `BulkReviewAttachment` + `BulkReviewRow.attachments?` slot.
- `hydrate.ts`: step (3b) `SELECT attachment_id, filename, content_type, size_bytes, extraction_status FROM email_pipeline.email_attachments WHERE email_id = anchorEmailId` (authenticated FOR SELECT policy, Plan 01) → `row.attachments`; query error is non-fatal (warn + `[]`). 3 hydrate tests (populated / empty / error-tolerant).
- `stage-2-read.tsx`: renders `<AttachmentList attachments={row.attachments ?? []}>` in the Stage 2 Read column — the REAL post-rebuild `/review` path (`row-strip-list` → `InlineExpandRow` Stage 2 read slot → `Stage2Read`). Renders even when Stage 2 has not run (attachments are an email property, not a Stage 2 output).
- `detail-pane.tsx`: `attachmentsByEmailId?` prop + `<AttachmentList>` appended INSIDE the Stage 2 audit expander (`merged[2]`), mirroring the Phase 82.8-07 Stage 1 screenshot-strip channel — for the legacy stage-N `UnifiedDetailPane` surfaces.

## Verification

- `npx vitest run stage-2-customer-resolver.test.ts` → **27/27 green** (4 new attachment-fold cases).
- `./scripts/no-engine-diff-check.sh` → **exit 0** (engine/config/steps byte-identical to donor; dynamic.ts only the sales registration line). `git diff` of engine.ts/config.ts EMPTY.
- `npx vitest run hydrate.test.ts` → **38/38 green** (3 new attachment cases).
- `attachment-list.test.tsx` → **5/5 green** (escaped-bracket vitest path resolves).
- `tsc --noEmit -p .` → **0 errors**.
- Regression: `lib/bulk-review` + `_shell` → **588/588 green** across 53 files.
- Grep gates: `email_attachments` in hydrate.ts (2); `AttachmentList` in detail-pane.tsx (5) AND stage-2-read.tsx (4); `attachmentsByEmailId` in detail-pane.tsx (7); `/review/page.tsx` imports `detail-pane` → **0** (invariant preserved). No `attachments` field on `resolve-customer.ts`; no `=== 'sales'/'debtor'` literal in the worker.

## Deviations from Plan

### Auto-fixed / corrected

**1. [Rule 1 — Plan data-path correction] Genuine /review wiring is Stage2Read, not inline-expand-row → UnifiedDetailPane**
- **Found during:** Task 3 (reading inline-expand-row.tsx + tracing the /review render path).
- **Issue:** The plan's `<interfaces>` block asserted "the /review page → … → inline-expand-row.tsx → UnifiedDetailPane" and instructed threading `attachmentsByEmailId` through inline-expand-row into UnifiedDetailPane. In the actual code, `InlineExpandRow` does NOT render `UnifiedDetailPane` — it renders its own inline 2-col body via per-stage render props (`stage2Content`), and the post-rebuild `/review` surface (`_shell/client-shell.tsx` → `row-strip-list` → `InlineExpandRow`) never mounts `UnifiedDetailPane` at all (that component is used only by the legacy stage-N pages).
- **Fix:** Rendered `<AttachmentList attachments={row.attachments ?? []}>` inside `Stage2Read` (the Stage 2 Read column content already consumed by `row-strip-list`), which IS the production-visible /review path and exactly where per-stage-content.md places attachments ("alongside Email body · identifiers highlighted"). Kept the `detail-pane.tsx attachmentsByEmailId` → Stage 2 audit wiring for the legacy `UnifiedDetailPane` surfaces (satisfies the plan's must_have "AttachmentList in detail-pane.tsx" + the grep gate). Did NOT add `attachmentsByEmailId` to inline-expand-row.tsx because it renders no `UnifiedDetailPane` there — that would be dead code.
- **Files modified:** `web/app/(dashboard)/automations/[swarm]/_shell/components/stage-2-read.tsx` (added), `web/app/(dashboard)/automations/[swarm]/_shell/detail-pane.tsx` (kept).
- **Net effect:** feature is visible end-to-end in production (the must_have), with no deferred wire — achieved via the actually-rendered component rather than the plan's (incorrect) component chain.
- **Commit:** `76af14ac`.

**2. [Rule 3 — Blocking] BulkReviewRow.attachments made optional (`?`)**
- **Found during:** Task 3 (tsc after adding the slot).
- **Issue:** A required `attachments` field broke ~15 pre-existing `BulkReviewRow` test fixtures that construct row literals (17 tsc errors).
- **Fix:** Typed the slot `attachments?:` (the plan itself suggested optional). The hydrator always projects an array; all consumers use `row.attachments ?? []`. No fixture churn.
- **Files modified:** `web/lib/bulk-review/types.ts`.
- **Commit:** `76af14ac`.

**3. [Clarification — not a deviation] Task 1 tested in the worker test, not resolve-customer.test.ts**
- The plan's verify command named `resolve-customer.test.ts`, but the adapter's `resolveEntity` reads only `args.body_text` and never performs the concat — the fold happens in the Stage 2 worker. The 4 behaviors are therefore asserted in `stage-2-customer-resolver.test.ts` (the plan's `<action>` explicitly permitted "or the stage-2 worker test"). This is the correct surface.

## Threat Model Coverage

| Threat ID | Disposition | Mitigation landed |
|-----------|-------------|-------------------|
| T-116-15 (adding an attachments field → STAGE2-01 break) | mitigate | Concat into `body_text` only via in-place row mutation; engine/config/steps/dynamic untouched; `no-engine-diff-check.sh` run in Task 1 verify → exit 0. |
| T-116-16 (prompt-injection text in an attachment fed downstream) | accept (Stage 2) / note (Stage 3) | Stage 2 is deterministic identifier mining (low risk). **NOTE for Phase 113 / V11.0:** attachment-derived text now reaches Stage 2 `body_text` and (via the Stage 2→3 hand-off `body_text`) the Stage 3 LLM — it needs the SAME injection posture as ordinary body text. |
| T-116-17 (attachment metadata exposed to unauthorized UI) | mitigate | Hydrator reads via the authenticated FOR SELECT policy (Plan 01); no anon; metadata + status ONLY — no `storage_key`/`extracted_text` projected to the row, no document bytes, no download/preview control. |

## Notes for Downstream

- **Stage 3 injection posture (T-116-16):** the Stage 2→3 coordinator hand-off forwards `body_text` (which now includes attachment text). When the sales Stage 3 LLM agent lands (Phase 113), treat attachment-derived body text with the same injection guard as ordinary body.
- **Legacy stage-N surfaces:** `detail-pane.tsx` accepts `attachmentsByEmailId` and renders attachments in the Stage 2 audit slot, but the stage-N pages do not yet pass the map (optional prop → empty state). Wiring those pages is a future opt-in, not required for ATTACH-06 (the /review surface is the operator console — `project_outlook_as_review_surface`).

## Self-Check: PASSED

- FOUND: web/app/(dashboard)/automations/[swarm]/_shell/components/attachment-list.tsx
- FOUND: web/lib/inngest/functions/stage-2-customer-resolver.ts (attachment fold)
- FOUND: web/lib/bulk-review/hydrate.ts (email_attachments load)
- FOUND commit: eab5e0a2 (Task 1)
- FOUND commit: a9de5d80 (Task 2)
- FOUND commit: 76af14ac (Task 3)

---
*Phase: 116-attachment-ingest-uniform-cross-swarm*
*Completed: 2026-06-05*
