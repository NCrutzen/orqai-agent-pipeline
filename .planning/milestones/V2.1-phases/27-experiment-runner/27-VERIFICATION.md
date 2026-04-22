---
phase: 27-experiment-runner
verified: 2026-03-11T14:32:20Z
status: passed
score: 6/6 must-haves verified
re_verification: false
---

# Phase 27: Experiment Runner Verification Report

**Phase Goal:** Users get working experiment execution on Orq.ai using native MCP/REST tools instead of the broken evaluatorq SDK, with triple-run reliability and adaptive polling
**Verified:** 2026-03-11T14:32:20Z
**Status:** passed
**Re-verification:** No -- initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Experiment-runner creates experiments via REST `POST /v2/experiments` with `task.type: 'agent'` and `agents: [{ agent_key }]` -- REST-only, no MCP for experiments | VERIFIED | Lines 41-44: "All experiment operations use REST API exclusively." Lines 142-154: curl POST with `"type": "agent"` and `"agent_key": "${AGENT_KEY_FROM_FRONTMATTER}"` |
| 2 | Experiment-runner uses agent `key` from YAML frontmatter (not `orqai_id`) for experiment task configuration | VERIFIED | Line 73: "parse YAML frontmatter for the `key` field -- this is the Orq.ai agent key used in experiment task configuration (NOT `orqai_id`)". Line 156: explicit repetition "The `agent_key` in `task.agents` is the `key` field from the agent spec YAML frontmatter -- NOT `orqai_id`" |
| 3 | Experiment-runner resolves evaluator IDs at runtime via `GET /v2/evaluators` list-and-filter, with role-based selection from dataset-prep.json role field | VERIFIED | Lines 114-126: `GET /v2/evaluators?limit=200` with jq name-to-ID extraction. Lines 99-111: role-based mappings (structural/conversational/hybrid) with category overlays. Line 128: CRITICAL warning about 422 on names vs IDs |
| 4 | Experiment-runner executes 3 runs per agent with adaptive polling (10s start, back off to 30s, 15-minute timeout) and live status updates | VERIFIED | Lines 179-184: "Start interval: 10 seconds. Back off by +5s per poll until reaching 30 seconds max interval. Maximum timeout: 15 minutes (900 seconds) per experiment. Each poll cycle, print status: Agent {key} run {N}/{total}: polling... ({elapsed}s elapsed)" |
| 5 | Experiment-runner accepts `dataset_id` directly for holdout re-test mode, with configurable `run_count` and optional `agent_key` filter | VERIFIED | Lines 31-37: Holdout mode spec. Line 32: `dataset_id` (required). Line 33: `run_count` (optional, default: 3). Line 34: `agent_key` (optional). Line 37: writes to `experiment-raw-holdout.json` |
| 6 | Experiment-runner writes `experiment-raw.json` with per-run per-evaluator raw scores (no thresholds, no aggregation) | VERIFIED | Lines 229-265: Full schema with per-agent, per-run, per-evaluator `per_example` array and `aggregate` float. Lines 273-277: "Do NOT include: Thresholds or pass/fail determinations. Aggregation across runs. Any scoring judgment -- raw data only." |

**Score:** 6/6 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `orq-agent/agents/experiment-runner.md` | Experiment execution subagent with 6 internal phases (min 200 lines) | VERIFIED | File exists, 300 lines. YAML frontmatter present (name, description, tools, model). All 6 phases present: Read Inputs (line 65), Resolve Evaluators (line 93), Create Experiments (line 134), Execute Runs with Adaptive Polling (line 163), Export Results (line 199), Write experiment-raw.json (line 222). Anti-Patterns section present (line 292, 7 items). |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `experiment-runner.md` | REST POST /v2/experiments | REST-only experiment creation with agent task type | WIRED | Lines 43, 142: explicit curl POST with task.type: "agent" in body |
| `experiment-runner.md` | REST POST /v2/experiments/{id}/run | REST run triggering with adaptive polling loop | WIRED | Lines 44, 169: explicit curl POST. Lines 179-184: adaptive polling 10s->30s, 15min timeout |
| `experiment-runner.md` | dataset-prep.json | Reads test_dataset_id and role per agent from upstream contract | WIRED | Lines 69-72: reads dataset-prep.json, filters status:ready, extracts agent_key, test_dataset_id, role |
| `experiment-runner.md` | experiment-raw.json | JSON handoff contract written to swarm output directory | WIRED | Lines 224-226: "Write to the swarm output directory (same location as dataset-prep.json). Standard mode: experiment-raw.json. Holdout mode: experiment-raw-holdout.json." Full schema at lines 229-265. |

---

### Requirements Coverage

| Requirement | Source Plan | Description (from REQUIREMENTS.md) | Status | Evidence |
|-------------|-------------|-------------------------------------|--------|----------|
| EXPR-01 | 27-01-PLAN.md | "Experiment-runner creates experiments via MCP `create_experiment` (task.type: 'agent') with REST fallback" | SATISFIED (with intentional deviation) | Implementation uses REST-only per locked user decision documented in CONTEXT.md, RESEARCH.md, and SUMMARY.md. The core requirement intent -- experiment creation with task.type: "agent" -- is fully implemented via REST. The "MCP with REST fallback" wording in REQUIREMENTS.md predates the user decision to lock REST-only due to LOW-confidence MCP schema. PLAN frontmatter captures the resolved form: "REST-only, no MCP for experiments". |
| EXPR-02 | 27-01-PLAN.md | "Experiment-runner uses agent `key` (not `orqai_id`) for experiment task configuration" | SATISFIED | Line 73 and 156 both explicitly distinguish `key` from `orqai_id`. Bash template uses `${AGENT_KEY_FROM_FRONTMATTER}` (the parsed `key` field). |
| EXPR-03 | 27-01-PLAN.md | "Experiment-runner resolves evaluator IDs (create custom via MCP or use built-in by name)" | SATISFIED | Runtime resolution via `GET /v2/evaluators?limit=200` + jq name-to-ID mapping (lines 114-126). If not found, warns and skips (line 118). Role-based selection covers structural/conversational/hybrid plus toxicity/harmfulness overlays. |
| EXPR-04 | 27-01-PLAN.md | "Experiment-runner executes 3 runs per agent with polling loop (adaptive 10-30s interval)" | SATISFIED | 3 runs via configurable `run_count` default 3 (line 167). Adaptive polling 10s->30s backoff via +5s per poll step (lines 179-181). 15-min timeout (line 181). Live status output (lines 183-184). |
| EXPR-05 | 27-01-PLAN.md | "Experiment-runner accepts `dataset_id` as direct input for holdout re-test mode" | SATISFIED | Lines 31-37: full holdout mode spec. `dataset_id` required, `run_count` optional (default 3), `agent_key` optional filter. Writes to `experiment-raw-holdout.json`. Lines 83-89: Phase 1 holdout handling. |
| EXPR-06 | 27-01-PLAN.md | "Experiment-runner writes `experiment-raw.json` with per-run per-evaluator raw scores" | SATISFIED | Lines 229-265: full JSON schema with per-agent, per-run, per-evaluator `per_example` array + `aggregate`. Lines 273-277: no-thresholds constraint. Evaluator metadata and platform IDs included. |

**Orphaned requirements:** None. All 6 EXPR-* requirements declared in PLAN frontmatter. No additional EXPR-* requirements appear in REQUIREMENTS.md for other phases.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None | - | - | - | No TODO/FIXME/placeholder/stub patterns detected |

Anti-pattern scan: no `TODO`, `FIXME`, `HACK`, `placeholder`, `return null`, `return []`, or empty implementation patterns found in `experiment-runner.md`.

---

### Human Verification Required

None. This phase produces a subagent prompt file (`experiment-runner.md`), not runtime code. All verifiable properties -- file existence, line count, content patterns, structural completeness, and requirement coverage -- are amenable to static inspection. The subagent's runtime behavior (actual experiment creation on Orq.ai, polling behavior, JSONL parsing from signed URLs) depends on the live platform, but these are operational concerns when the test command (Phase 29) is built, not verification concerns for this phase's deliverable.

---

### EXPR-01 Requirement Wording Divergence (Informational)

REQUIREMENTS.md EXPR-01 states "MCP `create_experiment` with REST fallback." The implementation uses REST-only with no MCP for experiment creation. This is not a gap -- it is a deliberate, documented user decision:

- Documented in: CONTEXT.md ("Locked Decisions: REST-only for experiment creation and execution"), RESEARCH.md ("User decision locks this phase to REST-only"), PLAN frontmatter truth 1 ("REST-only, no MCP for experiments"), SUMMARY.md key-decisions.
- Rationale: MCP `create_experiment` schema was rated LOW confidence in STATE.md blockers. REST-only eliminates that risk entirely.
- The substantive intent of EXPR-01 -- creating experiments with `task.type: "agent"` -- is fully implemented via REST.

REQUIREMENTS.md wording reflects the original specification before the research phase confirmed the risk. The PLAN frontmatter is the authoritative contract for what this phase was instructed to build.

---

## Gaps Summary

No gaps. All 6 must-have truths are verified, the sole artifact passes all three levels (exists, substantive, wired), all four key links are confirmed, all 6 EXPR-* requirements are satisfied, and no anti-patterns were found.

---

_Verified: 2026-03-11T14:32:20Z_
_Verifier: Claude (gsd-verifier)_
