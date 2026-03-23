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
| **Full suite command** | `cd web && npx vitest run --reporter=verbose` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd web && npx vitest run --reporter=verbose`
- **After every plan wave:** Run `cd web && npx vitest run --reporter=verbose`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 39-01-01 | 01 | 1 | CRED-01 | unit | `npx vitest run web/__tests__/lib/credentials/encryption.test.ts` | ❌ W0 | ⬜ pending |
| 39-01-02 | 01 | 1 | CRED-01 | unit | `npx vitest run web/__tests__/api/credentials.test.ts` | ❌ W0 | ⬜ pending |
| 39-01-03 | 01 | 1 | CRED-04 | unit | `npx vitest run web/__tests__/lib/credentials/auth-profiles.test.ts` | ❌ W0 | ⬜ pending |
| 39-02-01 | 02 | 2 | CRED-02 | integration | `npx vitest run web/__tests__/lib/credentials/injection.test.ts` | ❌ W0 | ⬜ pending |
| 39-02-02 | 02 | 2 | CRED-03 | unit | `npx vitest run web/__tests__/lib/credentials/rotation.test.ts` | ❌ W0 | ⬜ pending |
| 39-02-03 | 02 | 2 | INFRA | integration | `npx vitest run web/__tests__/lib/infrastructure/smoke.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `web/__tests__/lib/credentials/encryption.test.ts` — stubs for CRED-01 (AES-256-GCM encrypt/decrypt)
- [ ] `web/__tests__/api/credentials.test.ts` — stubs for CRED-01 (CRUD API routes)
- [ ] `web/__tests__/lib/credentials/auth-profiles.test.ts` — stubs for CRED-04 (auth profile types)
- [ ] `web/__tests__/lib/credentials/injection.test.ts` — stubs for CRED-02 (credential injection into Browserless.io)
- [ ] `web/__tests__/lib/credentials/rotation.test.ts` — stubs for CRED-03 (rotation detection and notification)
- [ ] `web/__tests__/lib/infrastructure/smoke.test.ts` — stubs for infrastructure smoke tests
- [ ] `vitest` install — if no test framework detected in web/package.json

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Credential paste-only UX | CRED-01 | Browser interaction required | Open credential form, verify paste works, typing is disabled for secret field |
| Write-once masking | CRED-01 | Visual verification | Create credential, navigate away and back, verify value is hidden and not retrievable |
| Health dashboard status indicators | INFRA | Requires live external services | Navigate to /settings/health, verify green/red indicators for each integration |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
