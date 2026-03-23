---
phase: 37
slug: hitl-approval
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-23
---

# Phase 37 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.0 + jsdom |
| **Config file** | `web/vitest.config.ts` |
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
| 37-00-01 | 00 | 1 | ALL | infra | `cd web && npx vitest run --reporter=verbose` | ❌ W0 | ⬜ pending |
| 37-01-01 | 01 | 2 | HITL-01 | unit | `cd web && npx vitest run lib/pipeline/__tests__/approval.test.ts -x` | ❌ W0 | ⬜ pending |
| 37-01-02 | 01 | 2 | HITL-06 | unit | `cd web && npx vitest run lib/pipeline/__tests__/approval-audit.test.ts -x` | ❌ W0 | ⬜ pending |
| 37-02-01 | 02 | 3 | HITL-02 | unit | `cd web && npx vitest run components/approval/__tests__/diff-viewer.test.ts -x` | ❌ W0 | ⬜ pending |
| 37-02-02 | 02 | 3 | HITL-03 | unit | `cd web && npx vitest run lib/pipeline/__tests__/approval-action.test.ts -x` | ❌ W0 | ⬜ pending |
| 37-02-03 | 02 | 3 | HITL-04 | unit | `cd web && npx vitest run lib/inngest/__tests__/pipeline-approval.test.ts -x` | ❌ W0 | ⬜ pending |
| 37-03-01 | 03 | 4 | HITL-05 | unit | `cd web && npx vitest run lib/email/__tests__/approval-notification.test.ts -x` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `web/lib/pipeline/__tests__/approval.test.ts` — stubs for HITL-01 (approval creation logic)
- [ ] `web/components/approval/__tests__/diff-viewer.test.ts` — stubs for HITL-02 (diff viewer rendering)
- [ ] `web/lib/pipeline/__tests__/approval-action.test.ts` — stubs for HITL-03 (server action logic)
- [ ] `web/lib/inngest/__tests__/pipeline-approval.test.ts` — stubs for HITL-04 (pipeline resume logic)
- [ ] `web/lib/email/__tests__/approval-notification.test.ts` — stubs for HITL-05 (email sending)
- [ ] `web/lib/pipeline/__tests__/approval-audit.test.ts` — stubs for HITL-06 (audit trail)
- [ ] Framework install: `cd web && npm install react-diff-viewer-continued resend`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Email arrives in inbox | HITL-05 | Requires real Resend API key and email delivery | Send test approval, check inbox for notification email |
| Diff viewer visual appearance | HITL-02 | Visual rendering (colors, layout, readability) | Navigate to approval page, verify split/unified diff renders correctly |
| Full approval flow UX | HITL-03 | End-to-end user interaction across pages | Start pipeline, wait for approval, review diff, approve, verify pipeline resumes |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
