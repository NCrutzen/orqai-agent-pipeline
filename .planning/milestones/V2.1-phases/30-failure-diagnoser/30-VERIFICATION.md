---
phase: 30-failure-diagnoser
verified: 2026-03-12T18:45:00Z
status: passed
score: 15/15 must-haves verified
re_verification:
  previous_status: gaps_found
  previous_score: 14/15
  gaps_closed:
    - "failure-diagnoser.md Phase 2 Step 2.2 step 1 now specifies explicit path convention {swarm_dir}/agents/{agent_key}.md with Glob fallback"
  gaps_remaining: []
  regressions: []
---

# Phase 30: Failure Diagnoser Verification Report

**Phase Goal:** Users get precise, section-level diagnosis of why their agents failed specific evaluators, with diff proposals they can approve before any changes are made
**Verified:** 2026-03-12T18:45:00Z
**Status:** passed
**Re-verification:** Yes — after gap closure (plan 30-02, commit c71fcf4)

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | failure-diagnoser.md reads test-results.json and filters per_agent[] to agents where ANY evaluator has pass: false | VERIFIED | Lines 31-46: reads `{swarm_dir}/test-results.json`, checks each evaluator's `pass` field, agent is failing if ANY evaluator has `pass: false` |
| 2 | failure-diagnoser.md builds failure priority list sorted by bottleneck score ascending (lowest evaluator median first) | VERIFIED | Lines 50-53: explicit sort ascending by bottleneck score = lowest evaluator median |
| 3 | failure-diagnoser.md reads each failing agent's spec .md file and parses XML-tagged sections from ## Instructions code block | VERIFIED | Line 103: explicit path `{swarm_dir}/agents/{agent_key}.md` with Glob fallback added in plan 30-02; line 104: parses XML tags generically by split on `<tag>`/`</tag>` |
| 4 | failure-diagnoser.md maps evaluator failures to XML-tagged sections using deterministic heuristic lookup table | VERIFIED | Lines 70-81: full 10-row heuristic table (instruction_following, coherence, helpfulness, relevance, json_validity, exactness, toxicity, harmfulness, adversarial, edge-case) |
| 5 | failure-diagnoser.md uses category_scores to identify WHERE failures concentrate for targeted diagnosis | VERIFIED | Lines 35, 106, 264: category_scores extracted from input, used in diagnosis step 3a, anti-pattern warns against ignoring |
| 6 | failure-diagnoser.md uses worst_cases to provide specific failing examples with input, actual_output, scores, reason | VERIFIED | Lines 36, 107, 118-119, 141: worst_cases collected in Phase 1, used in diagnosis and in proposal generation |
| 7 | failure-diagnoser.md checks for ## Guardrails section in spec file and surfaces guardrail evaluator failures with higher priority | VERIFIED | Lines 87-101: Step 2.2a explicitly checks for ## Guardrails section, surfaces guardrail violations before regular failures with explicit format block |
| 8 | failure-diagnoser.md proposes section-level diffs with before/after content for each implicated XML section, with plain-language reasoning linking to evaluator scores and categories | VERIFIED | Phase 3 (lines 131-173): diff blocks with before/after, reason field linking to evaluator score and category, change format shown verbatim |
| 9 | failure-diagnoser.md prefers adding content over replacing existing content in proposals | VERIFIED | Line 140, Rule 4: "Prefer adding content (new constraints, additional examples) over replacing existing content" |
| 10 | failure-diagnoser.md collects per-agent HITL approval (yes/no) after displaying diagnosis and proposals — no file modifications without explicit consent | VERIFIED | Phase 4 (lines 177-197): yes/no prompt per agent, LOCKED safety rule at line 197, explicit "does NOT modify agent spec files" |
| 11 | failure-diagnoser.md writes iteration-proposals.json with per_agent array containing agent_key, approval status, diagnosis text, and changes array with section/reason/before/after | VERIFIED | Phase 5 (lines 201-225): full JSON schema present, all fields confirmed |
| 12 | failure-diagnoser.md accepts swarm_dir and iteration_number as input parameters | VERIFIED | Line 14: "You receive a swarm directory path (swarm_dir) and an iteration number (iteration_number)" |
| 13 | failure-diagnoser.md makes ZERO API calls — pure analysis subagent | VERIFIED | Line 14: "You make ZERO API calls"; line 261: anti-pattern "Do NOT make API calls" |
| 14 | failure-diagnoser.md handles agents without XML-tagged sections by proposing addition of XML tags | VERIFIED | Line 127: "If no XML tags are found in the instructions, note in the diagnosis that the agent uses unstructured instructions. Propose adding XML tags around logical sections as a structural improvement." |
| 15 | failure-diagnoser.md stops early with 'All agents passing. No iteration needed.' when results.overall_pass is true | VERIFIED | Line 39: "if results.overall_pass is true, display 'All agents passing. No iteration needed.' and STOP" |

**Score:** 15/15 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `orq-agent/agents/failure-diagnoser.md` | New subagent: diagnoses evaluator failures, proposes section-level diffs, collects HITL approval | VERIFIED | 265 lines — meets 200-line minimum; all 5 phases present; frontmatter correct (name, description, tools, model: inherit); path resolution gap closed in plan 30-02 |
| `orq-agent/templates/iteration-proposals.json` | Template for iteration-proposals.json handoff contract | VERIFIED | Valid JSON — meets 20-line minimum; _template_meta block present; full per_agent schema with agent_key, approval, diagnosis, changes array |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| failure-diagnoser.md | test-results.json (disk) | Phase 1 reads results.per_agent[] for evaluator scores, category_scores, worst_cases | WIRED | Pattern `test-results.json` present 4 times; all fields (per_agent, scores, category_scores, worst_cases, overall_pass) explicitly extracted |
| failure-diagnoser.md | agent spec .md files (disk) | Phase 2 Step 2.2 step 1 resolves agent_key to {swarm_dir}/agents/{agent_key}.md with Glob fallback | WIRED | Line 103: explicit path convention added in plan 30-02 — path resolution gap closed, commit c71fcf4 verified |
| failure-diagnoser.md | iteration-proposals.json (disk) | Phase 5 writes approved/rejected proposals as handoff to prompt-editor | WIRED | Pattern `iteration-proposals.json` present 7 times; Phase 5 provides exact write schema; both approved and rejected agents included |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| ITPIPE-01 | 30-01-PLAN.md | Failure-diagnoser reads test-results.json and maps evaluator failures to XML-tagged prompt sections | SATISFIED | test-results.json reading: Phase 1 (lines 31-46). Evaluator-to-section mapping: 10-row heuristic table (lines 70-81). category_scores used for WHERE (line 106). worst_cases for specific examples (line 107). |
| ITPIPE-02 | 30-01-PLAN.md | Failure-diagnoser proposes section-level diffs with plain-language reasoning | SATISFIED | Phase 3 (lines 131-173): diff blocks with before/after, reason field explicitly links evaluator score + threshold + category. Rule 4 prefers adding over replacing. Proposal format shown verbatim with reasoning templates. |
| ITPIPE-03 | 30-01-PLAN.md | Failure-diagnoser collects per-agent HITL approval before any file modifications | SATISFIED | Phase 4 (lines 177-197): per-agent "Approve changes for {agent-key}? [yes/no]" prompt, LOCKED safety rule explicitly forbids spec file modification, approval status written to iteration-proposals.json per-agent field. |

**Note:** ITPIPE-04, ITPIPE-05, ITPIPE-06 are Phase 31 requirements and are correctly not claimed here. LOOP-01, LOOP-02, LOOP-03 are Phase 32. No orphaned requirements.

### Anti-Patterns Found

None. No TODO/FIXME/placeholder comments. No empty implementations. No stub returns. No scope creep. The single warning from the initial verification (missing path resolution) was resolved in plan 30-02.

### Human Verification Required

None — all checks are programmatic for this agent-spec-only phase. The subagent is an LLM-executed workflow document, not running code.

### Gap Closure Summary

The one gap from the initial verification is closed. Plan 30-02 added an explicit path convention to Phase 2 Step 2.2 step 1 (line 103):

> "Read the agent spec `.md` file at `{swarm_dir}/agents/{agent_key}.md`. If the file does not exist at that path, use Glob to find `{agent_key}.md` within the swarm directory."

This was a surgical single-line edit (commit c71fcf4, verified to exist). No other lines were changed. All 14 previously-verified truths regress-checked and confirmed intact: file remains 265 lines, test-results.json wired 4 times, iteration-proposals.json wired 7 times, ZERO API calls rule present, overall_pass early-stop present, HITL LOCKED rule present.

All three ITPIPE requirements (ITPIPE-01, ITPIPE-02, ITPIPE-03) are satisfied. Phase 31 (prompt-editor) can proceed — it consumes `iteration-proposals.json` written by this subagent.

---

_Verified: 2026-03-12T18:45:00Z_
_Verifier: Claude (gsd-verifier)_
