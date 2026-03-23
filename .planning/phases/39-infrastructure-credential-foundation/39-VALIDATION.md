---
phase: 39
slug: infrastructure-credential-foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-23
---

# Phase 39 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `web/vitest.config.ts` or "none — Wave 0 installs" |
| **Quick run command** | `cd web && npx vitest run --reporter=verbose` |
| **Full suite command** | `cd web && npx vitest run` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd web && npx vitest run --reporter=verbose`
- **After every plan wave:** Run `cd web && npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 39-01-01 | 01 | 1 | CRED-01 | unit | `npx vitest run src/lib/crypto` | W0 | pending |
| 39-01-02 | 01 | 1 | CRED-01 | unit | `npx vitest run src/lib/credentials` | W0 | pending |
| 39-02-01 | 02 | 1 | CRED-02 | integration | `npx vitest run src/lib/browserless` | W0 | pending |
| 39-03-01 | 03 | 2 | CRED-03 | unit | `npx vitest run src/lib/rotation` | W0 | pending |
| 39-04-01 | 04 | 2 | CRED-04 | unit | `npx vitest run src/lib/auth-profiles` | W0 | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

- [ ] Vitest installed and configured (if not already)
- [ ] `web/src/__tests__/` — test directory structure
- [ ] Shared fixtures for Supabase mocking

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Paste-only credential input | CRED-01 | Browser interaction | Verify typing is disabled, only paste works |
| Credential values hidden after save | CRED-01 | Visual check | Save a credential, reload page, confirm value shows as masked |
| Health dashboard shows green/red | CRED-04 | Visual + connectivity | Navigate to /settings/health, verify status indicators |

---

## Validation Sign-Off

- [ ] All tasks have automated verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
