---
phase: 132
slug: forward-side-effect-bulk-review-v9-7-p2
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-17
---

# Phase 132 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (web/) |
| **Config file** | web/vitest.config.ts |
| **Quick run command** | `cd web && npx vitest run <changed-file>` |
| **Full suite command** | `cd web && npm test` |
| **Estimated runtime** | ~TBD seconds |

---

## Sampling Rate

- **After every task commit:** Run quick run command on the changed file
- **After every plan wave:** Run full suite command
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** TBD seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| (filled by planner — see RESEARCH.md ## Validation Architecture) | | | | | | | | | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] **BLOCKING live smoke (A1):** confirm Outlook connection `56014785` has Graph **send** scope via `createForward → PATCH replyTo → send` against an info@ test mailbox before any per-bucket release migration.
- [ ] Unit-test stubs for the forward worker, dedup-honoring idempotency, no-forward of `algemeen`/`unrouted`, category stamp builder, and per-bucket gate helper.

*Planner refines from RESEARCH.md ## Validation Architecture.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Graph send-scope / live forward + reply-to | FWD (D-01) | Requires live Outlook tenant + test mailbox | Wave-0 smoke: createForward→PATCH replyTo→send against info@ test box; confirm delivery + reply-to = original sender |
| Category appears on source mail | FWD (D-05) | Requires live Outlook mailbox inspection | Inspect source mail categories after forward; expect `AI: routed → <bucket>` |

*Planner refines.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < TBDs
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
