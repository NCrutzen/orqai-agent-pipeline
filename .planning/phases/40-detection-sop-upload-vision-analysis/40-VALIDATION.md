---
phase: 40
slug: detection-sop-upload-vision-analysis
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-23
---

# Phase 40 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest ^4.1.0 |
| **Config file** | web/vitest.config.ts (or Wave 0 installs) |
| **Quick run command** | `cd web && npx vitest run --reporter=verbose` |
| **Full suite command** | `cd web && npx vitest run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd web && npx vitest run --reporter=verbose`
- **After every plan wave:** Run `cd web && npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 40-01-01 | 01 | 1 | DETECT-01 | unit | `npx vitest run web/lib/pipeline/__tests__/automation-detector.test.ts -t "detects"` | ❌ W0 | ⬜ pending |
| 40-01-02 | 01 | 1 | DETECT-05 | unit | `npx vitest run web/lib/pipeline/__tests__/automation-detector.test.ts -t "skips"` | ❌ W0 | ⬜ pending |
| 40-02-01 | 02 | 2 | DETECT-02 | integration | Manual -- UI interaction test | Manual | ⬜ pending |
| 40-02-02 | 02 | 2 | DETECT-03 | unit | `npx vitest run web/lib/systems/__tests__/upload.test.ts` | ❌ W0 | ⬜ pending |
| 40-02-03 | 02 | 2 | DETECT-04 | unit | `npx vitest run web/lib/pipeline/__tests__/vision-adapter.test.ts -t "completeness"` | ❌ W0 | ⬜ pending |
| 40-03-01 | 03 | 3 | VISION-01 | unit | `npx vitest run web/lib/pipeline/__tests__/vision-adapter.test.ts -t "image_url"` | ❌ W0 | ⬜ pending |
| 40-03-02 | 03 | 3 | VISION-02 | unit | `npx vitest run web/lib/pipeline/__tests__/vision-adapter.test.ts -t "maps"` | ❌ W0 | ⬜ pending |
| 40-03-03 | 03 | 3 | VISION-03 | unit | `npx vitest run web/components/annotation/__tests__/annotation-highlight.test.tsx` | ❌ W0 | ⬜ pending |
| 40-03-04 | 03 | 3 | VISION-04 | integration | Manual -- UI interaction test | Manual | ⬜ pending |
| 40-03-05 | 03 | 3 | VISION-05 | unit | `npx vitest run web/lib/pipeline/__tests__/vision-adapter.test.ts -t "corrections"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `web/lib/pipeline/__tests__/automation-detector.test.ts` — stubs for DETECT-01, DETECT-05
- [ ] `web/lib/pipeline/__tests__/vision-adapter.test.ts` — stubs for DETECT-04, VISION-01, VISION-02, VISION-05
- [ ] `web/components/annotation/__tests__/annotation-highlight.test.tsx` — stubs for VISION-03
- [ ] `web/lib/systems/__tests__/upload.test.ts` — stubs for DETECT-03

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| SOP markdown upload/paste accepted in terminal panel | DETECT-02 | UI interaction with file upload and text paste | 1. Open run detail page 2. Trigger automation sub-pipeline 3. Upload .md file and verify preview renders 4. Alternatively paste markdown and verify preview |
| User can confirm and edit individual steps | VISION-04 | Interactive UI with confirm/edit buttons per step | 1. Complete vision analysis 2. Click confirm checkmark on a step 3. Click edit on a step 4. Modify action description 5. Verify changes persist |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
