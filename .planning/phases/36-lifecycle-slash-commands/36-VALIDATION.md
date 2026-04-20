---
phase: 36
slug: lifecycle-slash-commands
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-20
---

# Phase 36 — Validation Strategy

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | bash + grep (reuse Phase 34 `orq-agent/scripts/lint-skills.sh`) |
| **Quick run command** | `bash orq-agent/scripts/lint-skills.sh --file orq-agent/commands/<name>.md` |
| **Full suite command** | `bash orq-agent/scripts/lint-skills.sh && bash orq-agent/scripts/check-protected-pipelines.sh` |
| **Estimated runtime** | ~3s |

## Sampling Rate

- After each new command committed: per-file lint (≤1s).
- After each wave: full suite (~3s).
- Before `/gsd:verify-work`: full suite + phrase-presence greps for each LCMD anchor.
- Max feedback latency: 5s.

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | Status |
|---------|------|------|-------------|-----------|-------------------|--------|
| 36-01-01 | 01 | 1 | LCMD-01 (`workspace`) | integration | `test -f orq-agent/commands/workspace.md && bash orq-agent/scripts/lint-skills.sh --file orq-agent/commands/workspace.md` exits 0 | ⬜ |
| 36-02-01 | 02 | 1 | LCMD-02 (`traces`) | integration | `test -f orq-agent/commands/traces.md && bash orq-agent/scripts/lint-skills.sh --file orq-agent/commands/traces.md` exits 0; `grep -q "\-\-deployment" orq-agent/commands/traces.md && grep -q "\-\-status" orq-agent/commands/traces.md && grep -q "\-\-last" orq-agent/commands/traces.md && grep -q "\-\-limit" orq-agent/commands/traces.md` | ⬜ |
| 36-03-01 | 03 | 1 | LCMD-03 (`analytics`) | integration | `test -f orq-agent/commands/analytics.md && bash orq-agent/scripts/lint-skills.sh --file orq-agent/commands/analytics.md` exits 0; `grep -q "\-\-group-by" orq-agent/commands/analytics.md` | ⬜ |
| 36-04-01 | 04 | 1 | LCMD-04 (`models`) | integration | `test -f orq-agent/commands/models.md && bash orq-agent/scripts/lint-skills.sh --file orq-agent/commands/models.md` exits 0; `grep -q "chat" orq-agent/commands/models.md && grep -q "embedding" orq-agent/commands/models.md && grep -q "rerank" orq-agent/commands/models.md` | ⬜ |
| 36-05-01 | 05 | 1 | LCMD-05 + LCMD-07 (`quickstart`) | integration | `test -f orq-agent/commands/quickstart.md && bash orq-agent/scripts/lint-skills.sh --file orq-agent/commands/quickstart.md` exits 0; `grep -cE "^##? Step" orq-agent/commands/quickstart.md` ≥ 12 | ⬜ |
| 36-06-01 | 06 | 1 | LCMD-06 (`automations`) | integration | `test -f orq-agent/commands/automations.md && bash orq-agent/scripts/lint-skills.sh --file orq-agent/commands/automations.md` exits 0; `grep -q "\-\-create" orq-agent/commands/automations.md` | ⬜ |
| 36-07-01 | 07 | 2 | LCMD-01..07 wiring to SKILL.md + help.md | integration | `grep -q "workspace.md" orq-agent/SKILL.md && grep -q "traces.md" orq-agent/SKILL.md && grep -q "analytics.md" orq-agent/SKILL.md && grep -q "models.md" orq-agent/SKILL.md && grep -q "quickstart.md" orq-agent/SKILL.md && grep -q "automations.md" orq-agent/SKILL.md`; `grep -q "orq-agent:workspace" orq-agent/commands/help.md && ...` | ⬜ |
| 36-08-01 | 08 | 3 | full-suite verify | integration | `bash orq-agent/scripts/lint-skills.sh` exits 0; `bash orq-agent/scripts/check-protected-pipelines.sh` exits 0; all LCMD anchors verified | ⬜ |

## Wave 0 Requirements

- [ ] No new infrastructure — reuses Phase 34 lint/pipeline scripts.

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Each command actually invokes the expected MCP tools and returns data | LCMD-01..06 | Requires live Orq.ai workspace with API key; MCP round-trip not file-level testable | Invoke `/orq-agent:workspace`, `/orq-agent:traces`, etc. in an authenticated session. Confirm each returns non-empty tabular output and the "Open in orq.ai" link resolves. |
| `quickstart` sequential flow is logically correct | LCMD-05, LCMD-07 | UX judgement — whether the 12 steps flow naturally | Invoke `/orq-agent:quickstart`; walk through steps 1→12 on a fresh workspace; verify each copy-paste prompt runs. |

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify
- [ ] Sampling continuity
- [ ] No Wave 0 missing
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
