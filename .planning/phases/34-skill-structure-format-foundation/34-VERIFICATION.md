---
phase: 34-skill-structure-format-foundation
verified: 2026-04-20T00:00:00Z
status: passed
score: 5/5 must-haves verified
---

# Phase 34: Skill Structure & Format Foundation Verification Report

**Phase Goal:** Every existing and new skill conforms to the Agent Skills format so downstream V3.0 skills have a consistent structural substrate to build on.
**Verified:** 2026-04-20
**Status:** passed
**Re-verification:** No — initial phase-level verification (Plan 34-05 shipped a plan-level VERIFICATION on the same date; this document is the phase-level roll-up required by `/gsd:verify-phase`).

## Goal Achievement

### Observable Truths

Truths derived from ROADMAP Phase 34 Success Criteria (1-5, verbatim).

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Every skill file (top-level command + subagent) has `allowed-tools` declared (subagents via `tools:`) AND a Constraints block with NEVER/ALWAYS rules plus a "Why these constraints" paragraph. | ✓ VERIFIED | `lint-skills.sh --rule allowed-tools` exits 0 (16 files: SKILL.md + 15 commands); `lint-skills.sh --rule tools-declared` exits 0 (17 agent files); per-file NEVER/ALWAYS + "Why these constraints" audit: 0/33 missing. |
| 2 | Every skill declares "When to use", "When NOT to use", Companion Skills with directional handoffs, falsifiable "Done When" checklist, Anti-Patterns table, Destructive Actions list requiring `AskUserQuestion`, Documentation & Resolution footer, and "Open in orq.ai" deep-link section. | ✓ VERIFIED | `lint-skills.sh --rule required-sections` exits 0; per-section spot-check all 9 H2 headings present in 0/33 missing files; Done When `- [ ]` checkbox audit: 0/33 missing; `AskUserQuestion` wired in Destructive Actions (spot-checked `deploy.md`). |
| 3 | Skill-specific long-form docs moved from flat `references/` to per-skill `<skill>/resources/` (or invariant enforced where no migration needed). | ✓ VERIFIED | `lint-skills.sh --rule references-multi-consumer` exits 0 — all 8 files in `orq-agent/references/` have ≥2 consumers per RESEARCH.md Reference Consumer Graph; SKILL.md `## Resources Policy` subsection (line 284) documents the invariant; zero migration candidates today (correctly deferred to Phases 36-43 on-demand). |
| 4 | A lint/validation check confirms all skills pass the new format. | ✓ VERIFIED | `bash orq-agent/scripts/lint-skills.sh` exits 0 (full suite, 4 rules × 33 files). Per-rule exits: allowed-tools=0, tools-declared=0, required-sections=0, references-multi-consumer=0. |
| 5 | The three protected entry points (`/orq-agent`, `/orq-agent:prompt`, `/orq-agent:architect`) remain byte-identical in behavior when invoked with the same input (locked interpretation: SHA-256 of extracted `<pipeline>` block matches golden baselines). | ✓ VERIFIED | `bash orq-agent/scripts/check-protected-pipelines.sh` exits 0 with `OK: {orq-agent,prompt,architect}.sha256 matches` for all 3. Goldens present at `.planning/phases/34-skill-structure-format-foundation/golden/{orq-agent,prompt,architect}.sha256`. SKST sections sit outside `<pipeline>` XML block (verified by script's awk extraction). |

**Score:** 5/5 truths verified

### Required Artifacts

Artifacts derived from Success Criteria (what must EXIST for each truth).

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `orq-agent/SKILL.md` | Top-level skill with `allowed-tools:` + `## Resources Policy` + all 9 required sections | ✓ VERIFIED | `allowed-tools: Read, Write, Edit, Glob, Grep, Bash, WebSearch, WebFetch, Task` at line 4; `## Resources Policy` at line 284 with invariant documented; all 9 required H2 headings present; 366+ lines (substantive). |
| `orq-agent/commands/*.md` (15 files) | Each has `allowed-tools:` + 9 required sections + NEVER/ALWAYS + Done-When checkboxes + AskUserQuestion in Destructive Actions | ✓ VERIFIED | All 15 files pass `lint-skills.sh`. Spot-check of `orq-agent.md`, `deploy.md`, `harden.md` confirms substantive content (655, 366, 655 lines respectively); sections grepped at expected line ranges. |
| `orq-agent/agents/*.md` (17 files) | Each has `tools:` (subagent schema) + 9 required sections + NEVER/ALWAYS + Done-When checkboxes | ✓ VERIFIED | All 17 files pass `lint-skills.sh`. Spot-check of `hardener.md`, `deployer.md`, `tester.md` confirms substantive content (642, 805, 861 lines respectively); `tools:` frontmatter present. |
| `orq-agent/scripts/lint-skills.sh` | Lint script enforcing 4 SKST rules | ✓ VERIFIED | Exists; uses XML-tag boundary guards (not naive grep); supports `--rule`, `--file`, `--files`, `--help` modes; exits 0 on full suite. |
| `orq-agent/scripts/check-protected-pipelines.sh` | Pipeline SHA-256 verifier | ✓ VERIFIED | Exists; extracts `<pipeline>...</pipeline>` block via awk; SHA-256 via `shasum -a 256`; supports `--baseline` mode for intentional re-baseline; exits 0 on all 3 matches. |
| `.planning/phases/34-skill-structure-format-foundation/golden/*.sha256` | Golden baselines for 3 protected entry points | ✓ VERIFIED | `architect.sha256` (af05911f…), `orq-agent.sha256` (e05a45d0…), `prompt.sha256` (2db50ffe…) present; all match current state. |
| `orq-agent/references/` shared docs | 8 files, each consumed by ≥2 skills | ✓ VERIFIED | 8 files present (agentic-patterns, naming-conventions, orchestration-patterns, orqai-agent-fields, orqai-api-endpoints, orqai-evaluator-types, orqai-model-catalog, tool-catalog); `references-multi-consumer` lint exits 0 confirming all have ≥2 consumers. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `orq-agent/SKILL.md` | 8 reference files | Resources Policy subsection + lint enforcement | ✓ WIRED | SKILL.md line 284-294 documents the invariant and names all 8 files. Lint rule `references-multi-consumer` enforces laterally. |
| `orq-agent/scripts/lint-skills.sh` | 33 skill files | default file set (SKILL.md + commands/*.md + agents/*.md) | ✓ WIRED | Script scans all 33 files via glob; confirmed by running full suite and seeing exit 0 across all 4 rules. |
| `orq-agent/scripts/check-protected-pipelines.sh` | 3 golden SHA files | `GOLDEN_DIR=.planning/phases/34-skill-structure-format-foundation/golden` hardcoded | ✓ WIRED | Script reads goldens; goldens exist; hashes match. |
| Destructive action sections | `AskUserQuestion` tool | Inline tool-name reference | ✓ WIRED | Spot-checked `deploy.md` — 3 references to `AskUserQuestion` in Constraints + Destructive Actions; pattern repeats across skill files (enforced by SKST-08 convention). |
| 33 skill files | 9 required sections (lint-enforced) | `required-sections` lint rule | ✓ WIRED | Lint rule iterates `REQUIRED_SECTIONS` array at lint-skills.sh lines 10-20; tests with XML-boundary guard so headings inside `<role>` or `<pipeline>` blocks don't false-pass. |

### Requirements Coverage

All 10 SKST requirement IDs from PLAN frontmatter cross-referenced against REQUIREMENTS.md:

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| SKST-01 | 34-01..05 | Every skill declares `allowed-tools` (or `tools:` for subagents) | ✓ SATISFIED | REQUIREMENTS.md:126 marked `[x]`; `allowed-tools` lint + `tools-declared` lint both exit 0; traceability matrix (line 268) maps to Phase 34 Complete. |
| SKST-02 | 34-01..05 | Skill-specific docs live under `<skill>/resources/` (multi-consumer invariant) | ✓ SATISFIED | REQUIREMENTS.md:127 `[x]`; `references-multi-consumer` lint exits 0; Resources Policy documented in SKILL.md line 284; traceability 269 Complete. |
| SKST-03 | 34-01..05 | "When to use" / "When NOT to use" sections present | ✓ SATISFIED | REQUIREMENTS.md:128 `[x]`; required-sections lint exits 0 (both headings in the 9-section list); 0/33 files missing per spot check; traceability 270 Complete. |
| SKST-04 | 34-01..05 | Companion Skills with directional handoffs | ✓ SATISFIED | REQUIREMENTS.md:129 `[x]`; required-sections lint exits 0; arrow bullets (→ / ←) present in every file (spot-checked `orq-agent.md` lines 43-50); traceability 271 Complete. |
| SKST-05 | 34-01..05 | "Done When" falsifiable checklist | ✓ SATISFIED | REQUIREMENTS.md:130 `[x]`; 0/33 files missing `- [ ]` checkbox in Done When section per custom audit; traceability 272 Complete. |
| SKST-06 | 34-01..05 | Constraints block (NEVER/ALWAYS) + "Why these constraints" paragraph | ✓ SATISFIED | REQUIREMENTS.md:131 `[x]`; 0/33 files missing NEVER/ALWAYS rules per custom audit; 0/33 missing "Why these constraints" per custom audit; traceability 273 Complete. |
| SKST-07 | 34-01..05 | Anti-Patterns table (pattern → what to do instead) | ✓ SATISFIED | REQUIREMENTS.md:132 `[x]`; required-sections lint exits 0; spot-checked SKILL.md lines 296-304 shows 5-row markdown table; traceability 274 Complete. |
| SKST-08 | 34-01..05 | Destructive Actions list requiring `AskUserQuestion` | ✓ SATISFIED | REQUIREMENTS.md:133 `[x]`; required-sections lint exits 0; `AskUserQuestion` references wired in Destructive Actions (spot-checked deploy.md line 52); traceability 275 Complete. |
| SKST-09 | 34-01..05 | Documentation & Resolution footer with trust order | ✓ SATISFIED | REQUIREMENTS.md:134 `[x]`; required-sections lint exits 0; 4-item trust order shown in SKILL.md lines 313-319 (MCP tools → docs MCP → docs.orq.ai → skill file); traceability 276 Complete. |
| SKST-10 | 34-01..05 | "Open in orq.ai" section with deep links | ✓ SATISFIED | REQUIREMENTS.md:135 `[x]`; required-sections lint exits 0; deep-link bullets present (spot-checked SKILL.md lines 308-311); 2 files carry `TODO(SKST-10)` markers for URLs awaiting Phase 37+ verification (documented deferral, not blocker); traceability 277 Complete. |

**All 10 SKST requirements accounted for in REQUIREMENTS.md. No orphaned requirements.**

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `orq-agent/commands/datasets.md` | 290 | `<!-- TODO(SKST-10): verified in Phase 37+ -->` | ℹ️ Info | Documented deferral — URL `https://my.orq.ai/annotation-queues` is inferred, not yet validated against live Studio. Resolution owner: Phase 37+. Lint does not check URL validity, only section presence. Not a blocker. |
| `orq-agent/agents/dataset-generator.md` | 451 | `<!-- TODO(SKST-10): verified in Phase 37+ -->` | ℹ️ Info | Same as above — same URL, second consumer. Not a blocker. |

No other TODOs / FIXMEs / HACKs / PLACEHOLDER markers found in skill files. The 8 `{{PLACEHOLDER}}` matches in `spec-generator.md`, `orchestration-generator.md`, and `tool-resolver.md` are legitimate domain references to the Orq.ai secret-token syntax (`{{SLACK_BOT_TOKEN}}`, etc.), not code stubs.

No blocker or warning anti-patterns found.

### Human Verification Required

None — this phase is pure infrastructure with mechanical success criteria (lint exits + SHA-256 matches). All 5 success criteria have deterministic, grep- or hash-checkable evidence. The semantic byte-identical smoke test of the 3 protected entry points (invoking `/orq-agent` on a canned fixture and diffing output) was explicitly deferred in 34-VALIDATION.md as a manual-only verification; the locked decision re-interpreted success criterion #5 as the `<pipeline>` SHA check, which is mechanically verifiable and was captured in goldens pre-change.

### Gaps Summary

No gaps. All 5 ROADMAP success criteria verified mechanically:

1. Full lint suite exits 0 across 33 files × 4 rules
2. Protected pipeline SHA-256 check exits 0 for 3 entry points
3. All 10 SKST requirements marked `[x]` complete in REQUIREMENTS.md and traceable to Phase 34
4. All 9 required H2 sections present in 0/33 missing files per independent spot check
5. NEVER/ALWAYS + "Why these constraints" + Done-When checkboxes audited independently: 0/33 missing
6. Resources Policy subsection documented in SKILL.md with invariant enforced via lint
7. Golden baselines present for all 3 protected entry points
8. Two documented `TODO(SKST-10)` URL deferrals are correctly scoped to Phase 37+ (not blockers)

Phase 34 goal achieved: the structural substrate is in place for downstream V3.0 skills (Phases 36-43) to build on with lateral lint enforcement. Ready to proceed.

---

_Verified: 2026-04-20_
_Verifier: Claude (gsd-verifier)_
