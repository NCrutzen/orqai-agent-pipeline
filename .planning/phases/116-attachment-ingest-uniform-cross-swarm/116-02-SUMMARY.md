---
phase: 116-attachment-ingest-uniform-cross-swarm
plan: 02
subsystem: attachment-ingest
tags: [outlook-graph, pdf-extraction, orq-vision, swarm-agnostic]
requires:
  - "web/lib/outlook/client.ts graphFetch credential boundary (existing)"
  - "web/lib/automations/support-tickets/{extract-frames,detect-system}.ts patterns (existing)"
  - "unpdf@1.6.2 (installed this plan)"
provides:
  - "listAttachments + downloadAttachmentValue Graph helpers"
  - "extractAttachment swarm-agnostic PDF/image extraction service"
  - "AttachmentExtractError coded fail-soft error class"
affects:
  - "Plan 04 extraction funnel worker (composes both)"
  - "Plan 06 backfill worker (composes both)"
tech-stack:
  added:
    - "unpdf@1.6.2 — pure-JS serverless pdfjs for PDF text-layer parse"
  patterns:
    - "single graphFetch credential boundary (no second Graph client)"
    - "Orq.ai Router vision via @orq-ai/node SDK (never a direct LLM key)"
    - "coded fail-soft error class → extraction_status mapping"
key-files:
  created:
    - "web/lib/automations/attachments/extract.ts"
    - "web/lib/automations/attachments/__tests__/extract.test.ts"
    - "web/lib/outlook/__tests__/attachments.test.ts"
  modified:
    - "web/lib/outlook/client.ts (+listAttachments, +downloadAttachmentValue, +zod)"
    - "web/package.json + web/package-lock.json (unpdf)"
decisions:
  - "Vision MODEL_ID reuses detect-system.ts's anthropic/claude-sonnet-4-5-20250929 (already list_models-validated live) rather than introducing a new id"
  - "Image/scanned-PDF bytes flow to vision as a base64 data: URL image_url part (no Storage round-trip in the pure transform — the worker owns Storage)"
  - "maxExtractedChars over-cap returns skipped_cap with empty text (fail-loud, no silent truncation)"
metrics:
  duration: ~6m
  completed: 2026-06-05
---

# Phase 116 Plan 02: Graph Attachment Helpers + Extraction Service Summary

Two Graph helpers (`listAttachments`, `downloadAttachmentValue`) routing through the single `graphFetch` credential boundary, plus a pure swarm-agnostic `extractAttachment` service: unpdf text-layer first, Orq.ai Router vision fallback for scanned PDFs/images, fail-soft coded statuses throughout — the building blocks Plans 04 and 06 compose.

## What Was Built

- **`listAttachments(mailbox, messageId)`** — metadata-only `$select` (id,name,contentType,size,isInline,@odata.type), zod-validated `value[]` at the boundary, throws with status on non-OK. Never requests `contentBytes`.
- **`downloadAttachmentValue(mailbox, messageId, attachmentId)`** — raw bytes via Graph `/$value`, returns ArrayBuffer.
- **`extractAttachment(input)`** — pure transform (no Inngest, no swarm literal, no Storage, no DB):
  1. size cap before any parse → `skipped_cap`
  2. PDF → unpdf `getDocumentProxy` + `extractText`; non-empty → `extracted`, empty → vision fallback
  3. image → straight to vision
  4. other contentTypes → `unsupported`
  5. unpdf throw caught → `extraction_failed` (never propagates)
  6. output over `maxExtractedChars` → `skipped_cap`
- **`AttachmentExtractError`** — coded class mirroring `FrameExtractError`.
- **Vision fallback** — Orq.ai Router via `@orq-ai/node` SDK, bytes as base64 `image_url` data URL; no direct LLM key.

## Tasks Completed

| Task | Name | Commit |
|------|------|--------|
| CP | unpdf install (legitimacy-gated, user-approved) | 513973d6 |
| 1 | listAttachments + downloadAttachmentValue Graph helpers | a7dbff19 |
| 2 | swarm-agnostic extract.ts (unpdf + Orq vision fallback) | 45c06a4f |

## Verification

- `npx vitest run lib/outlook/__tests__/attachments.test.ts` → 4/4 green
- `npx vitest run lib/automations/attachments/__tests__/extract.test.ts` → 8/8 green
- `grep` confirms: no swarm literal (`=== 'sales'`/`=== 'debtor'`), no direct LLM key (`OPENAI_API_KEY`/`ANTHROPIC_API_KEY`) in extract.ts
- `tsc --noEmit` → no TS errors in the new/modified files

## Threat Model Coverage

| Threat ID | Mitigation landed |
|-----------|-------------------|
| T-116-04 (DoS oversized) | size cap before parse → skipped_cap; maxExtractedChars cap |
| T-116-05 (corrupt PDF crash) | unpdf in try/catch → extraction_failed, never propagates |
| T-116-06 (reference/item attachment) | @odata.type surfaced in listAttachments; non-PDF/image → unsupported |
| T-116-07 (direct LLM key) | vision via Orq Router only; reused validated MODEL_ID |
| T-116-SC (unpdf install) | belt-and-suspenders human checkpoint cleared (UnJS, empty postinstall, approved) |

## Deviations from Plan

None — plan executed as written. The checkpoint (package legitimacy gate) was cleared by explicit user approval before this continuation agent ran; unpdf verified (v1.6.2, empty postinstall) and installed.

## Notes for Downstream Plans

- `maxVisionPages` cap is carried in `AttachmentCaps` but is currently informational for images (single-image vision call). Multi-page scanned-PDF page rendering/limiting is the worker's concern in Plan 04 if it pre-renders pages; the pure service sends the whole PDF's bytes to vision as one image_url today. If per-page rendering is added later, enforce `maxVisionPages` at that render step.
- `npm audit` reports pre-existing vulnerabilities unrelated to unpdf (pure-JS, no native deps, no postinstall).

## Self-Check: PASSED

- FOUND: web/lib/automations/attachments/extract.ts
- FOUND: web/lib/automations/attachments/__tests__/extract.test.ts
- FOUND: web/lib/outlook/__tests__/attachments.test.ts
- FOUND commit: 513973d6, a7dbff19, 45c06a4f
