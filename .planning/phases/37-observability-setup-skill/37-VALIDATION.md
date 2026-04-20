---
phase: 37
slug: observability-setup-skill
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-20
---

# Phase 37 — Validation Strategy

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | bash + grep (reuse Phase 34 scripts) |
| **Quick run command** | `bash orq-agent/scripts/lint-skills.sh --file orq-agent/commands/observability.md` |
| **Full suite** | `bash orq-agent/scripts/lint-skills.sh && bash orq-agent/scripts/check-protected-pipelines.sh` |
| **Estimated runtime** | ~3s |

## Sampling Rate

- After each task: per-file lint.
- After each plan: full suite.
- Before verify-work: full suite + phrase anchors for all 7 OBSV criteria.
- Max feedback latency: 5s.

## Per-Task Verification Map

| Task | Plan | Wave | Req | Automated Command | Status |
|------|------|------|-----|-------------------|--------|
| 37-01-01 | 01 | 1 | OBSV-01..06 | `test -f orq-agent/commands/observability.md && bash orq-agent/scripts/lint-skills.sh --file orq-agent/commands/observability.md`; `grep -q "AI Router" && grep -q "OTEL" && grep -q "span_type" && grep -q "session_id" && grep -q "customer_id"` | ⬜ |
| 37-01-02 | 01 | 1 | OBSV-07 (identity documented in observability.md) | `grep -q "identity" orq-agent/commands/observability.md && grep -q "per-tenant" orq-agent/commands/observability.md` | ⬜ |
| 37-02-01 | 02 | 1 | OBSV-03 (per-framework resources) | `test -d orq-agent/commands/observability/resources && ls orq-agent/commands/observability/resources | wc -l` ≥ 4 | ⬜ |
| 37-03-01 | 03 | 2 | OBSV-07 live wire on traces.md | `! grep -q "TODO(OBSV-07)" orq-agent/commands/traces.md && grep -q "identity" orq-agent/commands/traces.md` (TODO gone, identity kept) | ⬜ |
| 37-04-01 | 04 | 2 | Wire into SKILL.md + help.md | `grep -q "observability.md" orq-agent/SKILL.md && grep -q "orq-agent:observability" orq-agent/commands/help.md` | ⬜ |
| 37-05-01 | 05 | 3 | full-suite verify | Full lint + protected pipeline + all 7 OBSV anchors | ⬜ |

## Wave 0 Requirements

- [ ] No new infrastructure — reuses Phase 34 lint/pipeline scripts.
- [ ] New per-skill resources directory `orq-agent/commands/observability/resources/` — created in Plan 02.

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Emitted integration code actually produces traces | OBSV-03, OBSV-04 | Requires running user's app + live Orq.ai workspace | Paste emitted snippet into sample app; invoke LLM; confirm trace appears in `/orq-agent:traces`. |
| `--identity` filter returns expected traces | OBSV-07 | Live MCP call with tagged traces needed | Set `identity: acme-corp` on two traces; `/orq-agent:traces --identity acme-corp` returns only those. |
| PII scan catches common patterns | OBSV-04 | Test requires real-looking data | Feed canned text containing emails/phones/SSNs/cards; confirm scan flags each. |

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify
- [ ] Sampling continuity
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
