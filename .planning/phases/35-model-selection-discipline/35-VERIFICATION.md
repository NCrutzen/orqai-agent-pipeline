---
phase: 35-model-selection-discipline
verified: 2026-04-20T00:00:00Z
status: human_needed
score: 4/4 mechanical must-haves verified; 2/4 ROADMAP success criteria require LLM-runtime smoke
re_verification:
  previous_status: null
  note: "Plan-level 35-05-VERIFICATION.md already exists and documents COMPLETE status for the mechanical gates. This phase-level 35-VERIFICATION.md is the goal-backward rollup for the phase as a whole."
human_verification:
  - test: "Run `/orq-agent:research` on a canned use case (e.g., 'Slack FAQ bot') and confirm the primary recommendation is a capable-tier model (e.g., anthropic/claude-sonnet-4-5-20250929) while budget-profile downgrades only appear as an alternative tagged `after quality baseline run`."
    expected: "Primary recommendation is capable-tier; any budget alternatives carry the verbatim `after quality baseline run` tag. No cheap-first ordering."
    why_human: "LLM-runtime behavior — grep proves the policy text is in researcher.md but cannot confirm the LLM applies it at runtime. Covered by ROADMAP Success Criterion #1 and deferred per 35-VALIDATION.md §Manual-Only Verifications row 1."
  - test: "Invoke `/orq-agent`, `/orq-agent:prompt`, `/orq-agent:architect` on a canned use case (e.g., 'CRM deal-stage coaching agent') before-and-after Phase 35; diff the emitted agent-spec JSON."
    expected: "Spec structure unchanged; the only differences are `model:` fields where previously-floating aliases have been replaced by dated snapshots (e.g., `claude-sonnet-4-5` → `claude-sonnet-4-5-20250929`)."
    why_human: "Semantic equivalence on LLM output is not byte-level; the SHA-256 check only guards `<pipeline>` blocks. Covered by ROADMAP Success Criterion #4 and deferred per 35-VALIDATION.md §Manual-Only Verifications row 2."
  - test: "(optional) Invoke the researcher with an explicit cost-optimization request (e.g., `budget_profile=cost-first` or 'cheapest possible') and confirm the researcher proposes a two-tier cascade tagged `cascade-candidate: true` with a quality-equivalence experiment block (`approved: false` until the experiment runs)."
    expected: "Cascade block emitted with cheap-tier primary + capable-tier escalation + trigger + quality_equivalence_experiment section; `approved: false` remains until Phase 42 runtime flips it."
    why_human: "LLM-runtime behavior — grep proves the cascade template + `quality-equivalence experiment` text is in researcher.md and spec-generator.md, but runtime adherence is a behavioral property. Covered by ROADMAP Success Criterion #3."
---

# Phase 35: Model Selection Discipline — Verification Report

**Phase Goal:** Researcher and spec-generator recommend models using a capable-first, snapshot-pinned, cascade-aware policy so generated swarms start from a quality baseline instead of a cost floor.

**Verified:** 2026-04-20
**Status:** human_needed (mechanical gates green; LLM-runtime smokes deferred to `/gsd:verify-work`)
**Score:** 4/4 mechanical must-haves verified; 2 of 4 ROADMAP success criteria require LLM-runtime smoke testing per 35-VALIDATION.md §Manual-Only Verifications

---

## Goal Achievement

### Observable Truths (Phase-Level)

| # | Truth                                                                                                                                                                                  | Status     | Evidence                                                                                                                                                                                                                                                                                                                                            |
| - | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 | Capable-first policy is encoded in `orq-agent/agents/researcher.md` as authoritative text                                                                                              | ✓ VERIFIED | `## Model Selection Policy` H2 section present at line 123; `capable-first` phrase at lines 125/134/173/184/454; `after quality baseline run` at lines 136/176/177/180/454. MSEL-01 requirement ID traceable inline.                                                                                                                                |
| 2 | Snapshot pinning is mechanically enforced at emission-time (spec-generator self-check) AND at review-time (lint rule)                                                                  | ✓ VERIFIED | `#### Snapshot Pinning Rule (MSEL-02)` subsection in `spec-generator.md` with embedded regex `(-latest|:latest|-beta)`; `snapshot-pinned-models` lint rule in `orq-agent/scripts/lint-skills.sh` with matching regex. Default-set run exits 0; negative fixture exits 1 (FAIL line names MSEL-02); positive fixture exits 0. `regex reject` phrase at line 332; `snapshot-pinned` phrase at lines 327/329.                                                                                                                   |
| 3 | Cascade-aware pattern (cheap-first + escalation) is documented with a mandatory quality-equivalence experiment gate                                                                    | ✓ VERIFIED | `cascade-candidate` tag at lines 138/150/157 in `researcher.md`; `quality-equivalence experiment` step at lines 140/159/165. Spec-generator consumes the tag in `#### Cascade Block Emission (MSEL-03)` subsection with `quality_equivalence_experiment` YAML block. `approved: false` gate remains until Phase 42 runtime.                                          |
| 4 | Generator loop (/orq-agent, /orq-agent:prompt, /orq-agent:architect) remains byte-identical on `<pipeline>` blocks (no regression)                                                     | ✓ VERIFIED | `bash orq-agent/scripts/check-protected-pipelines.sh` exits 0 with all three SHA-256 matches (orq-agent.sha256, prompt.sha256, architect.sha256). Policy edits stayed strictly outside `<pipeline>` blocks as designed.                                                                                                                                |

**Score:** 4/4 truths verified at the mechanical/file level. Runtime LLM behavior for truths 1 and 3 (and semantic-equivalence for truth 4) requires human verification — see Human Verification Required section.

---

### Required Artifacts

| Artifact                                              | Expected                                                                                                                                      | Status     | Details                                                                                                                                       |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `orq-agent/scripts/lint-skills.sh`                    | Contains `snapshot-pinned-models` rule + `check_snapshot_pinned_models` function + rule registered in dispatcher, default set, and all-rules  | ✓ VERIFIED | 8 matches for `snapshot-pinned-models\|check_snapshot_pinned_models`; rule registered in usage(), run_rule_on_file(), run_rule_on_default_set(), lint_file_all_rules(). All 5 rules exit 0 on default set.                                                          |
| `tests/fixtures/35-bad-pin.md`                        | Negative fixture with `model: openai/gpt-4o-latest`; rule exits 1 with FAIL line naming MSEL-02                                               | ✓ VERIFIED | File exists. Rule exits 1 with `FAIL: tests/fixtures/35-bad-pin.md:5 — floating-alias model ID (use a dated snapshot, e.g. claude-sonnet-4-5-20250929) [MSEL-02]`. Fixture lives outside `default_file_set()` by design.     |
| `tests/fixtures/35-good-pin.md`                       | Positive fixture with dated-snapshot; rule exits 0                                                                                            | ✓ VERIFIED | File exists. Rule exits 0 on the file.                                                                                                        |
| `orq-agent/agents/researcher.md`                      | Contains `## Model Selection Policy` H2 + 4 verbatim phrases (capable-first, after quality baseline run, cascade-candidate, quality-equivalence experiment) + SKST intact + no floating aliases | ✓ VERIFIED | All 4 phrases grep-verified (16 total matches). `bash orq-agent/scripts/lint-skills.sh --file orq-agent/agents/researcher.md` exits 0 (9 SKST sections intact). No floating-alias model IDs introduced.                                                             |
| `orq-agent/agents/spec-generator.md`                  | Contains `#### Snapshot Pinning Rule (MSEL-02)` + `#### Cascade Block Emission (MSEL-03)` subsections + 4 verbatim phrases + SKST intact      | ✓ VERIFIED | All 4 phrases grep-verified (8 total matches). `snapshot-pinned` (2), `regex reject` (2), `alias-only -- pinning unavailable` (2), `cascade-candidate` (inside cascade subsection). SKST lint exits 0. Embedded regex matches lint rule regex. |
| `orq-agent/references/orqai-model-catalog.md`         | Contains `## Capable Tier Lookup` section with 4 task-category rows × dated-snapshot model IDs                                                | ✓ VERIFIED | Section present at line 83; cross-reference at line 113. All 4 dated snapshots present (claude-sonnet-4-5-20250929, claude-opus-4-20250514, claude-haiku-4-5-20251001, gpt-4o-2024-11-20). WARNING block preserved. `references-multi-consumer` rule remains green.           |

---

### Key Link Verification

| From                                                            | To                                                           | Via                                                                                                                                 | Status | Details                                                                                                                                                                                                                                                                   |
| --------------------------------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `researcher.md` Model Selection Policy                          | `spec-generator.md` Instructions (cascade consumption)       | `cascade-candidate: true/false` tag emitted by researcher, read by spec-generator                                                   | WIRED  | Researcher emits the tag; spec-generator `#### Cascade Block Emission (MSEL-03)` subsection explicitly reads the tag ("When the research brief's Model Recommendation carries `cascade-candidate: true`, do NOT collapse it into a single `model:` line").                                                     |
| `researcher.md` cascade block                                   | Phase 42 runtime (EVLD evaluator wiring)                     | `quality-equivalence experiment` text block + `approved: false` default                                                             | WIRED (text-level) | Researcher emits the experiment instructions; Phase 42 wires the runtime. `approved: false` gate documented at line 161. Phase 42 is a downstream dependency (not in scope for Phase 35).                                                                                 |
| `spec-generator.md` Snapshot Pinning                            | `orq-agent/scripts/lint-skills.sh` snapshot-pinned-models    | Identical regex `(-latest\|:latest\|-beta)` in both files; self-check at emission, lint at review                                   | WIRED  | Regex pattern is byte-identical between `spec-generator.md:332` and `lint-skills.sh`. Two independent guards against floating-alias regressions.                                                                                                                          |
| `researcher.md` Capable Tier Lookup subsection                  | `orq-agent/references/orqai-model-catalog.md §Capable Tier Lookup` | Forward reference by section heading                                                                                                | WIRED  | Researcher references the catalog section (line ~144); catalog contains the table at line 83. `references-multi-consumer` rule remains green (catalog has ≥2 consumers: researcher.md + spec-generator.md).                                                               |
| Generator loop pipelines (orq-agent, prompt, architect)         | Policy-updated subagents (researcher, spec-generator)        | Pipeline `<pipeline>` blocks unchanged; pipelines call subagents which apply the new policy as text rules                           | WIRED  | `check-protected-pipelines.sh` exits 0 (3/3 SHA-256 matches). Subagent changes are consumed by the pipelines at runtime without any pipeline-block changes. Semantic equivalence on LLM output is deferred to manual smoke.                                               |

---

### Requirements Coverage

| Requirement  | Source Plan         | Description (verbatim REQUIREMENTS.md)                                                                                                                                                                | Status       | Evidence                                                                                                                                                                                                                                                          |
| ------------ | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **MSEL-01**  | 35-02, 35-04, 35-05 | Researcher starts recommendations with the most capable tier model for the task; budget-profile-driven downgrades only trigger after a quality baseline run                                          | ✓ SATISFIED  | `## Model Selection Policy` H2 in researcher.md; `capable-first` + `after quality baseline run` phrases present; `## Capable Tier Lookup` table in orqai-model-catalog.md with 4 dated-snapshot IDs. Marked `[x]` in REQUIREMENTS.md:118.                           |
| **MSEL-02**  | 35-01, 35-03, 35-05 | Spec-generator pins production model references to a specific snapshot/version (e.g., `claude-sonnet-4-5-20250929`), not a floating alias                                                           | ✓ SATISFIED  | `snapshot-pinned-models` lint rule in lint-skills.sh; `#### Snapshot Pinning Rule (MSEL-02)` subsection in spec-generator.md with embedded regex + self-check; positive fixture exits 0, negative fixture exits 1 with MSEL-02 diagnostic. Marked `[x]` at REQUIREMENTS.md:119. |
| **MSEL-03**  | 35-02, 35-03, 35-05 | Researcher supports a model-cascade pattern (cheap-first with escalation on low confidence) with mandatory quality-equivalence experiment before the cascade is approved                             | ✓ SATISFIED  | `cascade-candidate` tag + `quality-equivalence experiment` step in researcher.md; `#### Cascade Block Emission (MSEL-03)` subsection in spec-generator.md with `quality_equivalence_experiment` YAML block; `approved: false` default gate. Marked `[x]` at REQUIREMENTS.md:120. |

**Orphaned requirements:** None. All 3 phase-35 requirement IDs (MSEL-01, MSEL-02, MSEL-03) are declared in plan frontmatter and traceable to implementation evidence. REQUIREMENTS.md traceability table (lines 265-267) lists all three as "Complete" for Phase 35.

---

### ROADMAP Phase 35 Success Criteria

| # | Criterion (verbatim)                                                                                                                                                                                                                                   | Evidence                                                                                                                                                                                                                                                                                                              | Status                                                                                                                    |
| - | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 1 | Running the researcher on a sample use case returns the most capable tier model for the task as the primary recommendation; budget-profile downgrades only appear as an alternative tagged "after quality baseline run."                              | Policy text encoded in `researcher.md` §Model Selection Policy: capable-first ordering (line 134), `after quality baseline run` tag (line 136), Capable Tier Lookup reference (line 144). Catalog §Capable Tier Lookup provides 4 task-category mapping. **LLM-runtime smoke required.**                                                                 | ✓ (file-level); **manual LLM smoke deferred to `/gsd:verify-work`**                                                       |
| 2 | Every generated agent spec contains a snapshot-pinned model reference (e.g., `claude-sonnet-4-5-20250929`), never a floating alias.                                                                                                                    | `snapshot-pinned-models` lint rule enforced mechanically. Default-set run exits 0. Positive fixture exits 0. Negative fixture exits 1 with MSEL-02 diagnostic. Spec-generator embeds self-check regex + alias-only exception shape.                                                                                                                                                     | ✓ (mechanical enforcement live)                                                                                            |
| 3 | When a user requests cost optimization, the researcher proposes a model-cascade pattern (cheap-first + escalation) together with a mandatory quality-equivalence experiment step before the cascade is marked approved.                                | `cascade-candidate` + `quality-equivalence experiment` + `approved: false` gate encoded in researcher.md; spec-generator consumes the tag and emits a cascade block with `quality_equivalence_experiment` YAML. **LLM-runtime smoke on cost-optimization use case recommended (not required per 35-VALIDATION.md).**                                                             | ✓ (file-level); optional manual LLM smoke                                                                                  |
| 4 | Existing `/orq-agent`, `/orq-agent:prompt`, `/orq-agent:architect` produce functionally equivalent output with the new policy applied (no regressions on the generator loop).                                                                          | `check-protected-pipelines.sh` exits 0 (all three SHA-256 matches). `<pipeline>` blocks byte-identical to Phase 34 baseline. **Semantic spec-JSON diff deferred to manual smoke.**                                                                                                                                                                                                  | ✓ (byte-level); **manual semantic diff deferred to `/gsd:verify-work`**                                                    |

---

### Anti-Patterns Found

None. Scan covered:

- `orq-agent/scripts/lint-skills.sh` (modified in plan 01)
- `tests/fixtures/35-bad-pin.md`, `tests/fixtures/35-good-pin.md` (created in plan 01)
- `orq-agent/agents/researcher.md` (modified in plan 02)
- `orq-agent/agents/spec-generator.md` (modified in plan 03)
- `orq-agent/references/orqai-model-catalog.md` (modified in plan 04)

Observations:

- No `TODO|FIXME|XXX|HACK` placeholders in the Phase 35 additions.
- The `[TODO]` / `TODO` substrings that appear inside spec-generator.md are part of skill documentation (showing how to produce specs), not actual in-code TODOs. The negative fixture's `-latest` suffix is intentional (it is the test payload).
- All illustrative model IDs in the new sections use dated snapshots (lint rule confirmed — snapshot-pinned-models passes on the full default set).
- `approved: false` default is documented as a deliberate gate, not a stub.

---

### Human Verification Required

#### 1. Researcher capable-first LLM runtime smoke (MSEL-01, ROADMAP criterion 1)

**Test:** Invoke `/orq-agent:research "Slack FAQ bot"` (or similar canned use case).
**Expected:** Primary recommendation is a capable-tier model (e.g., `anthropic/claude-sonnet-4-5-20250929`). Any budget alternatives are labelled verbatim with the `after quality baseline run` tag. No cheap-first ordering.
**Why human:** Grep confirms the policy text is in `researcher.md`; it cannot confirm the LLM actually applies the policy at runtime. Deferred per 35-VALIDATION.md §Manual-Only Verifications row 1.

#### 2. Generator loop semantic equivalence diff (MSEL-02, ROADMAP criterion 4)

**Test:** Invoke `/orq-agent "CRM deal-stage coaching agent"` before and after Phase 35. Diff the emitted agent-spec JSON.
**Expected:** Spec structure unchanged; the only differences are `model:` fields where previously-floating aliases (`claude-sonnet-4-5`, `gpt-4o`) are now dated snapshots (`claude-sonnet-4-5-20250929`, `gpt-4o-2024-11-20`).
**Why human:** SHA-256 check only guards `<pipeline>` blocks; semantic equivalence on LLM output cannot be verified byte-level. Deferred per 35-VALIDATION.md §Manual-Only Verifications row 2.

#### 3. Cascade + quality-equivalence experiment runtime smoke (MSEL-03, ROADMAP criterion 3) — OPTIONAL

**Test:** Invoke the researcher with an explicit cost-optimization request (e.g., `budget_profile=cost-first` or "cheapest possible").
**Expected:** A two-tier cascade tagged `cascade-candidate: true` with a quality-equivalence experiment block and `approved: false` until Phase 42 runtime closes the gate.
**Why human:** LLM-runtime behavior; grep confirms the cascade template exists in researcher.md / spec-generator.md, but runtime adherence is behavioral. Optional per 35-VALIDATION.md (the manual-only table explicitly lists only criteria 1 and 4 as required manual smokes; criterion 3 is implicitly covered by criterion 1's researcher smoke if the canned use case includes a cost-optimization prompt).

---

### File Inventory

| Bucket                      | Count | Status                                             |
| --------------------------- | ----- | -------------------------------------------------- |
| `orq-agent/SKILL.md`        | 1     | ✓ passes all 5 lint rules                          |
| `orq-agent/commands/*.md`   | 15    | ✓ all pass lint; 3 protected pipelines byte-identical |
| `orq-agent/agents/*.md`     | 17    | ✓ all pass lint (includes researcher.md + spec-generator.md updates) |
| **Default-set total**       | **33** | ✓ full-suite lint exit 0                          |
| `tests/fixtures/35-*.md`    | 2     | out-of-default-set by design; positive exits 0, negative exits 1 as intended |
| **Scripts modified**        | 1     | `orq-agent/scripts/lint-skills.sh` gained `snapshot-pinned-models` rule (+27 lines) |
| **References modified**     | 1     | `orq-agent/references/orqai-model-catalog.md` gained `## Capable Tier Lookup` section |

---

### Mechanical Checks Summary

All 9 commands specified in the user brief were executed and match expected exit codes:

| Command                                                                                              | Expected | Actual | Status |
| ---------------------------------------------------------------------------------------------------- | -------- | ------ | ------ |
| `bash orq-agent/scripts/lint-skills.sh`                                                              | 0        | 0      | ✓      |
| `bash orq-agent/scripts/lint-skills.sh --rule snapshot-pinned-models`                                | 0        | 0      | ✓      |
| `bash orq-agent/scripts/lint-skills.sh --rule snapshot-pinned-models --file tests/fixtures/35-good-pin.md` | 0        | 0      | ✓      |
| `bash orq-agent/scripts/lint-skills.sh --rule snapshot-pinned-models --file tests/fixtures/35-bad-pin.md`  | 1        | 1      | ✓ (intentional FAIL) |
| `bash orq-agent/scripts/check-protected-pipelines.sh`                                                | 0        | 0      | ✓      |
| `bash orq-agent/scripts/lint-skills.sh --rule allowed-tools`                                         | 0        | 0      | ✓      |
| `bash orq-agent/scripts/lint-skills.sh --rule tools-declared`                                        | 0        | 0      | ✓      |
| `bash orq-agent/scripts/lint-skills.sh --rule required-sections`                                     | 0        | 0      | ✓      |
| `bash orq-agent/scripts/lint-skills.sh --rule references-multi-consumer`                             | 0        | 0      | ✓      |

All phrase anchors present:

- `researcher.md`: capable-first (5 matches), after quality baseline run (5 matches), cascade-candidate (3 matches in grep-head, more present), quality-equivalence experiment (3 matches in head, more present).
- `spec-generator.md`: snapshot-pinned (2), regex reject (2), alias-only -- pinning unavailable (2), cascade-candidate (3+).
- `orqai-model-catalog.md`: `## Capable Tier Lookup` (1 section heading + 1 self-reference).

MSEL-01, MSEL-02, MSEL-03 all marked `[x]` in REQUIREMENTS.md (lines 118-120) and listed as "Complete" in the traceability table (lines 265-267).

---

### Gaps Summary

**No gaps.** All mechanical checks pass. All phrase anchors present. All requirement IDs traceable to implementation evidence. Policy-text is encoded in the owning subagent files.

The only items not mechanically closable are the LLM-runtime behavior smokes for ROADMAP Success Criteria #1 (capable-first at runtime) and #4 (generator-loop semantic equivalence diff). These were explicitly designed as manual-only verifications per 35-VALIDATION.md §Manual-Only Verifications and are deferred to `/gsd:verify-work` rather than re-raised as gaps.

---

### Re-verification Context

A plan-level verification (`35-05-VERIFICATION.md`) already exists with status COMPLETE, produced as part of Plan 05 of this phase. This phase-level `35-VERIFICATION.md` rolls up the goal-backward verification across all 5 plans (01-05) for the phase as a whole, mapping each MSEL requirement and each ROADMAP success criterion to concrete mechanical evidence, and explicitly scoping the LLM-runtime smokes as `human_needed` deliverables for `/gsd:verify-work`.

---

_Verified: 2026-04-20_
_Verifier: Claude (gsd-verifier)_
