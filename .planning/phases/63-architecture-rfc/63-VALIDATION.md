---
phase: 63
slug: architecture-rfc
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-30
---

# Phase 63 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> This is a docs-only phase — validation = paper correctness via smoke-greps + manual review, NOT test runs.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | None — markdown grep + manual review (no vitest/jest). |
| **Config file** | None |
| **Quick run command** | `for f in docs/agentic-pipeline/*.md; do test -f "$f" && echo "OK $f" \|\| echo "MISS $f"; done` |
| **Full suite command** | `bash scripts/check-rfc-coverage.sh` (optional helper if planner emits it) — otherwise the per-task smoke greps below run in sequence |
| **Estimated runtime** | < 5 seconds total |

---

## Sampling Rate

- **After every task commit:** Run the smoke-grep listed for that task in the per-task verification map below.
- **After every plan wave:** Run all smoke-greps for all completed waves so far.
- **Before `/gsd-verify-work`:** All smoke-greps green AND manual read of every new RFC file confirms no speculative brand names, no stack-violation suggestions (per CLAUDE.md constraints), ASCII diagrams render cleanly.
- **Max feedback latency:** < 5 seconds (greps are instant).

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 63-NN-NN | TBD | TBD | RFC-01 | — | RFC index file exists, names all 5 stages | smoke | `test -f docs/agentic-pipeline/README.md && grep -cE "Stage [0-4]" docs/agentic-pipeline/README.md` (expect ≥ 5) | ❌ W0 | ⬜ pending |
| 63-NN-NN | TBD | TBD | RFC-01 | — | Existing debtor-email doc carries SUPERSEDED banner | smoke | `grep -i "SUPERSEDED for cross-swarm shape" docs/debtor-email-pipeline-architecture.md` | ❌ W0 | ⬜ pending |
| 63-NN-NN | TBD | TBD | RFC-01 | — | CLAUDE.md points at the RFC as canonical | smoke | `grep "docs/agentic-pipeline/README.md" CLAUDE.md` | ❌ W0 | ⬜ pending |
| 63-NN-NN | TBD | TBD | RFC-02 | — | Context-shape contract = TS interface + prose table | smoke + manual | `test -f docs/agentic-pipeline/context-shape-contract.md && grep -cE "interface\|customer_id\|customer_name\|language\|entity_brand\|recent_documents\|context_version" docs/agentic-pipeline/context-shape-contract.md` (expect ≥ 7) | ❌ W0 | ⬜ pending |
| 63-NN-NN | TBD | TBD | RFC-02 | — | Contract states `context_version: 1` from day 1 | smoke | `grep -E "context_version.*1" docs/agentic-pipeline/context-shape-contract.md` | ❌ W0 | ⬜ pending |
| 63-NN-NN | TBD | TBD | RFC-03 | — | 4-axis override model file lists all 4 axes with learning signals | smoke + manual | `test -f docs/agentic-pipeline/override-model.md && grep -cE "Axis [1-4]" docs/agentic-pipeline/override-model.md` (expect ≥ 4) | ❌ W0 | ⬜ pending |
| 63-NN-NN | TBD | TBD | RFC-04 | — | Graduated-automation hooks file exists, cites Wilson-CI precedent without pinning numbers | smoke + manual | `test -f docs/agentic-pipeline/graduated-automation.md && grep -E "Wilson\|Phase 56" docs/agentic-pipeline/graduated-automation.md && ! grep -E "N=[0-9]+\|CI-lo=[0-9]" docs/agentic-pipeline/graduated-automation.md` | ❌ W0 | ⬜ pending |
| 63-NN-NN | TBD | TBD | D-09 | — | No speculative `smeba-uk` / `smeba-ie` strings anywhere | smoke | `! grep -rEi "smeba-uk\|smeba-ie" docs/ .planning/PROJECT.md CLAUDE.md` (must exit non-zero) | partial — must stay absent | ⬜ pending |
| 63-NN-NN | TBD | TBD | D-09 | — | RFC tenancy section names today's 6 verified brands | smoke | `grep -E "smeba.*smeba-fire.*firecontrol.*sicli-noord.*sicli-sud.*berki" docs/agentic-pipeline/README.md` (or all 6 individually present) | ❌ W0 | ⬜ pending |
| 63-NN-NN | TBD | TBD | RFC-01 | — | All 5 per-stage files exist | smoke | `for s in 0-safety 1-regex 2-entity 3-coordinator 4-handler; do test -f docs/agentic-pipeline/stage-${s}.md \|\| exit 1; done` | ❌ W0 | ⬜ pending |
| 63-NN-NN | TBD | TBD | RFC-01 | — | Stack consistency — no Netlify/Railway/Firebase/Puppeteer leakage | smoke | `! grep -rEi "netlify\|railway\|firebase\|neon\|puppeteer" docs/agentic-pipeline/` (must exit non-zero) | ❌ W0 | ⬜ pending |
| 63-NN-NN | TBD | TBD | RFC-01 | — | Doc-link integrity — every relative `(./...md)` link in new RFC files resolves | manual + grep | extract `[...]\(\./.*\.md\)` from each new RFC file, verify each path exists | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

> **Planner note:** Replace `Task ID` placeholders (63-NN-NN) with concrete task IDs once PLAN.md files are created. Wave assignment depends on planner's wave structure.

---

## Wave 0 Requirements

This phase has no test infrastructure to install. "Wave 0" here means: the new RFC files do not exist yet — creating them IS the work. There is no separate test-stub phase.

- [x] No framework install needed
- [x] No `tests/` files needed
- [ ] Optional: `scripts/check-rfc-coverage.sh` bundling all smoke-greps into one runnable verifier (planner's discretion — nice-to-have)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Anthropic principle paraphrase quality | RFC-01 | Paraphrase quality cannot be greppable | Read README.md + each stage doc — confirm Anthropic citations are paraphrased (not quote-bombs) and link to `https://www.anthropic.com/engineering/building-effective-agents` once at top of relevant doc per CONTEXT specifics |
| ASCII diagram renders cleanly | RFC-01 | Visual quality | Open each new doc in markdown preview — confirm ASCII boxes/arrows align in monospace, no broken alignment |
| Brand-multitenancy story coherent | D-08 | Cross-section consistency | Read README.md tenancy section + cross-references in stage docs — confirm tenancy is referenced consistently, no hardcoded enums in TS interface examples |
| Forward-references are honest | — | Honesty requires judgement | For each "Phase 64 introduces", "Phase 71 ships", "Phase 70 unifies" claim, verify the cited phase exists in ROADMAP.md and the claim matches its goal |
| Override-model accuracy | RFC-03 | Verifies real today-state | Confirm override-model.md's "today-state" callouts match RESEARCH.md's verified table.column refs (axes 1+4 = real columns; axes 2+3 = forward-referenced honestly) |
| No code-path / migration suggestions | — | Phase boundary | Read all new files — confirm NO recommendations to create migrations, edit `web/`, or otherwise leak out of docs scope |

---

## Validation Sign-Off

- [ ] All planner tasks have `<acceptance_criteria>` with grep-verifiable conditions OR manual-verification with concrete read instructions
- [ ] Every new RFC file has at least one smoke-grep covering its existence + key content
- [ ] All RFC-01..04 requirements map to at least one row in the verification map
- [ ] D-09 (brand correction) covered by both presence and absence smoke-greps
- [ ] Stack-consistency negative grep included
- [ ] No watch-mode flags (N/A — no test framework)
- [ ] Feedback latency < 5s (greps are instant)
- [ ] `nyquist_compliant: true` set in frontmatter once planner fills in task IDs

**Approval:** pending
