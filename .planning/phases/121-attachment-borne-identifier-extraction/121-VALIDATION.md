---
phase: 121
slug: attachment-borne-identifier-extraction
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-17
---

# Phase 121 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Scope: the BUILD residual only — plans 121-02 (#24 xlsx/csv extraction + many-customer guard) and 121-03 (acceptance). 121-01 (discovery) is already verified and is not re-validated here.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (web/) |
| **Config file** | web/vitest.config.ts (verify at planning) |
| **Quick run command** | `cd web && npm ci && npx vitest run <touched test file>` |
| **Full suite command** | `cd web && npm ci && npx vitest run` |
| **Estimated runtime** | ~TBD (planner to confirm) |

> Note: `node_modules` is absent in this workspace — Wave 0 / executor MUST run `npm ci` (not `npm install`) in `web/` to honor lockfile pins (exceljs@^4.4.0 already present) before any test run.

---

## Sampling Rate

- **After every task commit:** Run the quick command on the touched test file
- **After every plan wave:** Run the full suite command
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** TBD seconds

---

## Per-Task Verification Map

> Filled by the planner. Source: RESEARCH.md "## Validation Architecture" — xlsx/csv extraction unit tests, fold tests, corroboration-demotion (358-root) unit test, mocked-NXT harness; ATID-02 `dry-run:equality` no-engine-diff gate.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 121-02-xx | 02 | — | ATID-01/02 | T-untrusted-xlsx | xlsx parsed string-only, capped, UNTRUSTED-fenced; engine byte-identical | unit | (planner) | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `npm ci` in `web/` (node_modules absent) — installs exceljs + vitest from lockfile
- [ ] Extraction unit test stub for `.xlsx` / `.csv` branch in `extract.ts`
- [ ] 358-root corroboration-demotion unit test stub (many-customer guard, verify-first)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live debtor fixture re-run vs the frozen 100 | ATID-04 | Blocked on Phase 123 (debtor → resolve_candidates; no DEBTOR_FETCH_WEBHOOK_SECRET in workspace) | Defer to Phase 123; re-run 120-04 correctness-gate harness against live corpus |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency target set
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
