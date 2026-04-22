---
phase: 26-dataset-preparer
verified: 2026-03-11T00:00:00Z
status: passed
score: 6/6 must-haves verified
re_verification: false
---

# Phase 26: Dataset Preparer Verification Report

**Phase Goal:** Users get correctly formatted datasets uploaded to Orq.ai with the required `messages` field, stratified splits, and a JSON contract for downstream subagents
**Verified:** 2026-03-11
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Dataset-preparer uploads datapoints with `messages: [{role: 'user', content: input}]` as a top-level field | VERIFIED | Phase 5 smoke test (line 151) and Phase 6 upload (line 186) both show the exact JSON structure with `messages` as a top-level field. Anti-pattern (line 256) explicitly warns against nesting inside `inputs`. |
| 2 | Dataset-preparer uses MCP `create_dataset` for dataset creation and REST `POST /v2/datasets/{id}/rows` for row upload, with fallback | VERIFIED | MCP-First/REST-Fallback section (lines 27-58) documents per-operation pattern. Lines 180-191 confirm MCP `create_dataset` with REST fallback for dataset creation; REST preferred for row upload with MCP `create_datapoints` as fallback. |
| 3 | Dataset-preparer parses markdown eval pairs from clean + edge datasets, augments to 30+ examples, and splits 60/20/20 stratified by category | VERIFIED | Phase 2 (lines 78-103): parses `## Eval Pairs` heading, `|` delimiter, skips `---` separators. Phase 3 (lines 105-119): 4 augmentation techniques to reach 30+. Phase 4 (lines 122-131): 60/20/20 stratified by category. |
| 4 | Dataset-preparer infers agent role (structural/conversational/hybrid) from spec content with frontmatter override | VERIFIED | Phase 7 (lines 199-210): structural signals, conversational signals, hybrid detection, `test_role` frontmatter override, default `hybrid`. |
| 5 | Dataset-preparer writes dataset-prep.json with per-agent dataset IDs, role, status, and example_counts | VERIFIED | Phase 8 (lines 213-248): complete schema with `swarm_name`, `prepared_at`, per-agent `status` (ready/skipped/error), `role`, `test_dataset_id`, `train_dataset_id`, `holdout_dataset_id`, `example_counts` with `original`, `augmented`, `total`, `per_split`. |
| 6 | Dataset-preparer smoke-tests 1 row before bulk upload to verify non-null evaluator scores | VERIFIED | Phase 5 (lines 134-174): creates smoke dataset via MCP, uploads 1 row via REST, creates experiment, polls for results, verifies non-null scores, deletes smoke dataset on success. Explicit ABORT message on null scores. |

**Score:** 6/6 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `orq-agent/agents/dataset-preparer.md` | Dataset preparation subagent with 8 internal phases, min 200 lines | VERIFIED | 258 lines. YAML frontmatter present (name, description, tools, model). All 8 phases present (lines 61, 78, 105, 122, 134, 176, 199, 213). |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `dataset-preparer.md` | MCP `create_dataset` / REST `/v2/datasets` | MCP-first with REST fallback for dataset creation | WIRED | `create_dataset` mentioned 3 times (lines 138, 180); REST fallback documented at lines 37, 180 |
| `dataset-preparer.md` | REST `/v2/datasets/{id}/rows` | REST-preferred for row upload (messages field) | WIRED | `POST /v2/datasets/{dataset_id}/rows` at line 142; `POST /v2/datasets/{id}/rows` at line 185; `messages` top-level requirement at line 186 |
| `dataset-preparer.md` | `dataset-prep.json` | JSON handoff contract written to swarm output directory | WIRED | Phase 8 header at line 213; schema defined lines 216-237; `dataset-prep.json` referenced in role intro (line 15, 25) |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| DATA-01 | 26-01-PLAN.md | Dataset-preparer uploads datapoints with required `messages` field (`[{role: "user", content: input}]`) | SATISFIED | `messages` appears 8 times in dataset-preparer.md; explicitly top-level in Phase 5 smoke test and Phase 6 upload; anti-pattern explicitly warns against nesting |
| DATA-02 | 26-01-PLAN.md | Dataset-preparer uses MCP `create_dataset`/`create_datapoints` with REST fallback | SATISFIED | MCP-first/REST-fallback section fully documents both tools; selective REST override for row upload explicitly documented with reason |
| DATA-03 | 26-01-PLAN.md | Dataset-preparer parses markdown eval pairs, augments to 30+, splits 60/20/20 stratified | SATISFIED | Phase 2: `## Eval Pairs` heading, `|` delimiter, separator skipping. Phase 3: 4 named techniques. Phase 4: 60/20/20 stratified by category with rounding rules |
| DATA-04 | 26-01-PLAN.md | Dataset-preparer infers agent role (structural/conversational/hybrid) from spec content | SATISFIED | Phase 7: structural signals, conversational signals, hybrid detection, `test_role` override, `hybrid` default |
| DATA-05 | 26-01-PLAN.md | Dataset-preparer writes `dataset-prep.json` with per-agent dataset IDs and role | SATISFIED | Phase 8: complete schema with all required fields including `swarm_name`, `prepared_at`, per-agent IDs, role, status, example_counts with per_split |

No orphaned requirements — all 5 DATA-* requirements are claimed in 26-01-PLAN.md and verified in the artifact. REQUIREMENTS.md confirms all 5 marked Complete under Phase 26.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None | — | — | — | — |

No placeholder comments, empty implementations, stub returns, or TODO markers found. The file is substantive instruction content throughout.

---

### Human Verification Required

#### 1. Smoke Test Execution Flow

**Test:** Run `dataset-preparer.md` against a real swarm directory with deployed agents and a `datasets/` directory containing markdown eval pairs.
**Expected:** Phase 5 creates a smoke experiment, polls for results, verifies non-null evaluator scores, deletes the smoke dataset, then proceeds to Phase 6 bulk upload.
**Why human:** Requires live Orq.ai credentials, deployed agents, and MCP server connectivity — cannot be verified from static code analysis.

#### 2. Role Inference Accuracy

**Test:** Run the agent against agent specs with known role signals (one structural, one conversational, one hybrid, one with `test_role` frontmatter override).
**Expected:** Each agent gets the correct role assignment; override takes precedence over heuristic.
**Why human:** Heuristic keyword matching depends on spec content quality and cannot be validated without real agent spec files.

#### 3. Stratified Split Distribution

**Test:** Feed a pool of 32 examples across 4 categories and verify the 60/20/20 split maintains proportional category distribution.
**Expected:** Each split contains roughly proportional representation of all categories; rounding favors test/holdout over train.
**Why human:** Requires running the agent with controlled input data and inspecting the actual split.

---

### Gaps Summary

No gaps. All 6 observable truths verified, all 3 key links wired, all 5 requirements satisfied. The artifact at `orq-agent/agents/dataset-preparer.md` is substantive (258 lines), complete (all 8 phases present), and correctly specifies the `messages` top-level field in both the smoke test and bulk upload phases.

The commit `06ce4fa` exists in git history confirming the artifact was properly committed.

The one notable forward-looking risk documented in SUMMARY.md — MCP tool signatures for `create_experiment` being LOW confidence — is noted but does not block Phase 26's goal. That risk is deferred to Phase 27 execution.

---

_Verified: 2026-03-11_
_Verifier: Claude (gsd-verifier)_
