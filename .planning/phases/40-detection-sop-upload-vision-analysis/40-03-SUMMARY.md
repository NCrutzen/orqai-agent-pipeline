---
phase: 40-detection-sop-upload-vision-analysis
plan: 03
subsystem: pipeline, ui
tags: [inngest, orq-ai, vision, supabase-storage, react-markdown, signed-urls, browser-automation]

# Dependency graph
requires:
  - phase: 40-detection-sop-upload-vision-analysis plan 01
    provides: Systems registry DB schema, types, events, automation stages
  - phase: 40-detection-sop-upload-vision-analysis plan 02
    provides: Terminal panel, terminal entry card, EntryInteraction dispatcher
provides:
  - Automation detector that cross-references systems registry with blueprint/specs
  - Vision adapter for Orq.ai multimodal screenshot analysis
  - Pipeline automation branch with SOP upload wait and annotation confirm wait
  - SOP upload/paste UI with markdown preview and confirmation
  - Screenshot upload with client-side resize and signed URL upload
  - Server actions for signed URL generation and SOP submission
affects: [40-04-annotation-review, pipeline-execution]

# Tech tracking
tech-stack:
  added: []
  patterns: [multimodal-vision-content-blocks, signed-url-direct-upload, client-side-image-resize]

key-files:
  created:
    - web/lib/pipeline/automation-detector.ts
    - web/lib/pipeline/vision-adapter.ts
    - web/components/terminal/terminal-sop-preview.tsx
    - web/components/terminal/terminal-screenshot-upload.tsx
  modified:
    - web/lib/inngest/functions/pipeline.ts
    - web/lib/systems/actions.ts
    - web/components/terminal/terminal-input.tsx

key-decisions:
  - "Supabase select with any cast for Supabase join query typing on system_project_links"
  - "Vision adapter returns empty result with warnings on parse failure rather than throwing"
  - "SOPUploadInteraction manages full flow state (input -> preview -> screenshots) within single component"

patterns-established:
  - "Signed URL upload pattern: server action generates URL, client uploads directly to Supabase Storage"
  - "Multimodal vision pattern: image_url content blocks with base64 data URIs and detail: high"
  - "Client-side image resize to 1568px max via Canvas API before upload"

requirements-completed: [DETECT-01, DETECT-04, DETECT-05, VISION-01, VISION-02]

# Metrics
duration: 6min
completed: 2026-03-23
---

# Phase 40 Plan 03: Detection, Vision & SOP Upload Summary

**Automation detection pipeline with Orq.ai vision analysis, SOP markdown preview, and screenshot upload via signed URLs**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-23T13:43:40Z
- **Completed:** 2026-03-23T13:49:55Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Pipeline auto-detects browser-automation systems from project-linked systems registry after spec-generator stage
- Vision adapter sends SOP text + screenshot image_url content blocks to Orq.ai for structured analysis
- SOP upload/paste with markdown preview (react-markdown + remark-gfm) and "Looks good" confirmation
- Screenshot upload with client-side resize (1568px max) and direct-to-Supabase-Storage via signed URLs
- Pipeline enters automation sub-pipeline only when browser-automation systems are detected

## Task Commits

Each task was committed atomically:

1. **Task 1: Automation detector, vision adapter, and pipeline branch** - `2eb8a9c` (feat)
2. **Task 2: SOP upload/paste UI, screenshot upload with signed URLs, terminal input wiring** - `24bdcbd` (feat)

## Files Created/Modified
- `web/lib/pipeline/automation-detector.ts` - Detects browser-automation systems from project-linked registry
- `web/lib/pipeline/vision-adapter.ts` - Orq.ai vision API wrapper with multimodal content blocks
- `web/lib/inngest/functions/pipeline.ts` - Automation branch: detect -> SOP wait -> vision analysis -> annotation wait
- `web/lib/systems/actions.ts` - Added createUploadUrl and submitSOPUpload server actions
- `web/components/terminal/terminal-sop-preview.tsx` - Markdown preview with "Looks good" confirmation
- `web/components/terminal/terminal-screenshot-upload.tsx` - Dropzone with resize and signed URL upload
- `web/components/terminal/terminal-input.tsx` - Wired upload type dispatching for SOP and screenshots

## Decisions Made
- Used `any` cast for Supabase join query results on system_project_links to handle nested select typing
- Vision adapter gracefully returns empty result with warnings on JSON parse failure rather than throwing
- SOPUploadInteraction manages entire flow state (input -> preview -> confirm -> screenshots) as a single component with phase transitions

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript type error in automation detector filter**
- **Found during:** Task 1 (automation-detector.ts)
- **Issue:** Supabase join query returns `unknown[]` from `.select()`, causing filter callback type mismatch
- **Fix:** Cast `links` to `any[]` before `.map()` and `.filter()` operations
- **Files modified:** web/lib/pipeline/automation-detector.ts
- **Verification:** TypeScript compilation succeeds
- **Committed in:** 2eb8a9c (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Type casting necessary for Supabase join query typing. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Automation detection and vision analysis pipeline fully wired
- SOP upload and screenshot upload UI functional in terminal panel
- Plan 04 (annotation review overlay) can build on the analysis results stored in automation_tasks table
- Pipeline waitForEvent calls ready for annotation.confirmed events from Plan 04 UI

## Self-Check: PASSED

- [x] automation-detector.ts exists
- [x] vision-adapter.ts exists
- [x] terminal-sop-preview.tsx exists
- [x] terminal-screenshot-upload.tsx exists
- [x] Commit 2eb8a9c exists (Task 1)
- [x] Commit 24bdcbd exists (Task 2)
- [x] TypeScript compilation succeeds (excluding pre-existing credential API route errors)

---
*Phase: 40-detection-sop-upload-vision-analysis*
*Completed: 2026-03-23*
