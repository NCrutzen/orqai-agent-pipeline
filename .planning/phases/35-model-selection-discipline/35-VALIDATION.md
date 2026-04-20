---
phase: 35
slug: model-selection-discipline
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-20
---

# Phase 35 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | bash + grep (extend Phase 34's `orq-agent/scripts/lint-skills.sh` with a `snapshot-pinned-models` rule) |
| **Config file** | `orq-agent/scripts/lint-skills.sh` (existing, extended) |
| **Quick run command** | `bash orq-agent/scripts/lint-skills.sh --rule snapshot-pinned-models` |
| **Full suite command** | `bash orq-agent/scripts/lint-skills.sh && bash orq-agent/scripts/check-protected-pipelines.sh` |
| **Estimated runtime** | ~3 seconds |

Grep-based conformance checks for the researcher/spec-generator policy updates (MSEL-01, MSEL-03):

| Property | Value |
|----------|-------|
| **Command** | `grep -c "capable-first" orq-agent/agents/researcher.md` and `grep -c "after quality baseline run" orq-agent/agents/researcher.md` and `grep -c "cascade-candidate" orq-agent/agents/researcher.md` |
| **Mechanism** | Phrase-presence check — the policy clauses must appear verbatim in the researcher subagent file so the LLM applies them at runtime |

---

## Sampling Rate

- **After every task commit:** Run `bash orq-agent/scripts/lint-skills.sh --file <modified-skill>` for every skill touched in the commit; plus `bash orq-agent/scripts/check-protected-pipelines.sh`.
- **After every plan wave:** Run full `bash orq-agent/scripts/lint-skills.sh` (34 existing files + the new `snapshot-pinned-models` rule) + protected-pipeline check.
- **Before `/gsd:verify-work`:** Full suite must exit 0 AND the phrase-presence checks above must find ≥1 match each.
- **Max feedback latency:** 5 seconds.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 35-01-01 | 01 | 1 | MSEL-02 lint rule | unit | `bash orq-agent/scripts/lint-skills.sh --rule snapshot-pinned-models` exits 0 | ✅ (extend) | ⬜ pending |
| 35-01-02 | 01 | 1 | MSEL-02 (negative case fixture) | unit | `bash orq-agent/scripts/lint-skills.sh --rule snapshot-pinned-models` on a fixture with `-latest` suffix exits 1 | ❌ W0 | ⬜ pending |
| 35-02-01 | 02 | 2 | MSEL-01 (capable-first in researcher) | integration | `grep -q "capable-first" orq-agent/agents/researcher.md && grep -q "after quality baseline run" orq-agent/agents/researcher.md` exits 0 | ✅ | ⬜ pending |
| 35-02-02 | 02 | 2 | MSEL-03 (cascade proposal in researcher) | integration | `grep -q "cascade-candidate" orq-agent/agents/researcher.md && grep -q "quality-equivalence experiment" orq-agent/agents/researcher.md` exits 0 | ✅ | ⬜ pending |
| 35-02-03 | 02 | 2 | SKST-06/SKST-05 still satisfied after edits | integration | `bash orq-agent/scripts/lint-skills.sh --file orq-agent/agents/researcher.md` exits 0 | ✅ | ⬜ pending |
| 35-03-01 | 03 | 2 | MSEL-02 (spec-generator emits pinned snapshots) | integration | `grep -q "snapshot-pinned" orq-agent/agents/spec-generator.md && grep -q "regex reject" orq-agent/agents/spec-generator.md` exits 0 | ✅ | ⬜ pending |
| 35-03-02 | 03 | 2 | SKST contract still satisfied | integration | `bash orq-agent/scripts/lint-skills.sh --file orq-agent/agents/spec-generator.md` exits 0 | ✅ | ⬜ pending |
| 35-04-01 | 04 | 2 | Capable Tier table documented in model catalog | integration | `grep -q "## Capable Tier" orq-agent/references/orqai-model-catalog.md` exits 0 | ✅ | ⬜ pending |
| 35-05-01 | 05 | 3 | All MSEL requirements + protected pipelines + full lint | integration | Full suite + 3 protected hashes unchanged + phrase-presence | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/fixtures/35-bad-pin.md` — minimal skill file containing `model: openai/gpt-4o-latest` to prove the new `snapshot-pinned-models` rule returns exit 1 on it
- [ ] Extend `orq-agent/scripts/lint-skills.sh` with `snapshot-pinned-models` rule — regex `model:\s*[^[:space:]]+(-latest|:latest|-beta)\s*$` (with documented exceptions for embedding/speech model aliases)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Researcher actually produces the capable-first recommendation when run end-to-end on a canned use case | MSEL-01 success criterion #1 | LLM-output verification; grep confirms the policy text but cannot confirm the LLM applied it. Manual smoke: invoke `/orq-agent:research "Slack FAQ bot"` and check the primary recommendation is a capable-tier model with the budget downgrade labelled `after quality baseline run`. | Pre-change capture: run `/orq-agent:research "Slack FAQ bot"` with current researcher; save output. Post-change: run again; confirm primary rec is capable-tier + alternatives carry the "after quality baseline run" tag. |
| Three protected entry points produce functionally equivalent output with the new policy | Success criterion #4 | Semantic equivalence on LLM output is not byte-level. Manual: invoke `/orq-agent "CRM deal-stage coaching agent"` before and after; confirm agent spec structure unchanged, only model IDs differ where policy applies. | Capture pre-change JSON output. Apply phase changes. Re-capture. `diff` structure; confirm only `model:` fields differ and differences are pin-snapshots of the previously-floating aliases. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
