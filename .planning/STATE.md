---
gsd_state_version: 1.0
milestone: V3.0
milestone_name: Lifecycle Completeness & Eval Science
status: Roadmap approved - ready to plan Phase 34
stopped_at: Phase 34 pending plan-phase
last_updated: "2026-04-20T00:00:00.000Z"
last_activity: "2026-04-20 - V3.0 roadmap created (10 phases, 74/74 requirements mapped). V4.0/V5.0 renumbered."
progress:
  total_phases: 10
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-20)

**Core value:** Any colleague can go from a use case description to deployed, tested agents on Orq.ai -- through an automated pipeline with real-time visibility and HITL approvals -- without needing to understand the underlying AI platform.
**Current focus:** V3.0 Lifecycle Completeness & Eval Science — roadmap approved, Phase 34 next
**Previous milestones:** v0.3 shipped 2026-03-01 (11 phases, 28 plans), V2.0 shipped 2026-03-02 (7 phases, 11 plans), V2.1 shipped 2026-03-13 (8 phases, 9 plans)

## Current Position

Phase: 34 - Skill Structure & Format Foundation (next active)
Plan: —
Status: Awaiting `/gsd:plan-phase 34`
Last activity: 2026-04-20 — V3.0 roadmap created (10 phases, 74/74 requirements mapped)

Progress: V2.1 complete. V3.0 roadmapped with 10 phases (34-43). V4.0 renumbered to 44-48. V5.0 renumbered to 49-52.

## Performance Metrics

No active phase metrics. V3.0 Phase 34 not yet started.

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- V3.0 before V4.0/V5.0 -- lifecycle gaps (observability, eval science, optimization) matter before cross-swarm work and browser automation (2026-04-20)
- Tier-gate human-label dependencies -- TPR/TNR evaluator validation placed under 'full' tier so core/deploy/test users never hit it (2026-04-20)
- Preserve generator loop through V3.0 -- `/orq-agent`, `/orq-agent:prompt`, `/orq-agent:architect` remain byte-identical (2026-04-20)
- Binary Pass/Fail default for LLM evaluators -- Likert scales require explicit justification (2026-04-20)
- V3.0 phase ordering optimized for autonomous execution -- SKST format foundation first, human-label-dependent EVLD work last, DIST manifests late (2026-04-20)
- systems.md uses markdown format (not JSON) for maximum user editability -- user-configurable IT systems registry (2026-03-23)
- Browser automation installer default is "none" to keep setup frictionless for users who don't need it (2026-03-23)
- REVISED: workflow-discovery agent (NEW) sits after discussion, before architect -- conversational system identification replaces architect-embedded detection (2026-03-23)
- REVISED: workflow-builder replaces SOP-dependent approach -- conversation is primary input, screenshots secondary, SOP optional (2026-03-23)
- REVISED: architect priority MEDIUM (not HIGH) -- receives workflow-discovery output, no longer performs detection (2026-03-23)
- 3 new subagents for browser automation: workflow-discovery, workflow-builder, script-generator (2026-03-23)
- MCP tool as integration surface for browser automation -- test/iterate/harden pipeline unchanged (2026-03-23)
- Direct Claude messages.create() over Agent SDK -- pipeline stages are predetermined, not agent-decided
- GitHub raw URL for .md file fetching with PIPELINE_REPO_RAW_URL env var -- runtime fetching per user decision
- Vitest for test framework -- ESM-native, fast, TypeScript out of the box
- [Phase quick-260326-ann]: evaluatorq is NOT legacy -- use with caution for local custom scoring; REST is primary experiment path

### Blockers/Concerns

None.

### Quick Tasks Completed

| # | Description | Date | Commit | Status | Directory |
|---|-------------|------|--------|--------|-----------|
| 260319-cbi | Strip dropped code directories and update planning docs for CLI-only focus | 2026-03-19 | 7cfa1d4 | | [260319-cbi-strip-web-interface-supabase-and-vercel-](./quick/260319-cbi-strip-web-interface-supabase-and-vercel-/) |
| 260323-c2b | Remove dropped web pipeline artifacts from planning docs | 2026-03-23 | fd8b91b | Verified | [260323-c2b-remove-web-pipeline-keep-only-claude-cod](./quick/260323-c2b-remove-web-pipeline-keep-only-claude-cod/) |
| 260323-bzl | Assess all 17 pipeline agents for browser automation relevance (V4.0 Browserless.io) | 2026-03-23 | 497f85c | Superseded by ep2 | [260323-bzl-beoordeel-pipeline-agents-met-browserles](./quick/260323-bzl-beoordeel-pipeline-agents-met-browserles/) |
| 260323-ep2 | Rewrite assessment with workflow-discovery + workflow-builder model (replaces SOP-dependent approach) | 2026-03-23 | 260ac19 | Verified | [260323-ep2-herschrijf-browser-automation-assessment](./quick/260323-ep2-herschrijf-browser-automation-assessment/) |
| 260323-ey0 | Neutralize skill set for public repo: systems.md registry, browser automation installer prompt, zero IT-specific refs | 2026-03-23 | 5e944d6 | Verified | [260323-ey0-neutralize-skill-set-for-public-repo-ext](./quick/260323-ey0-neutralize-skill-set-for-public-repo-ext/) |
| 260323-gex | Create /orq-agent:systems command for managing IT systems registry (list/add/remove) | 2026-03-23 | 5946bae | Verified | [260323-gex-create-orq-agent-systems-command-for-man](./quick/260323-gex-create-orq-agent-systems-command-for-man/) |
| 260325-r2j | Apply 6 experiment learnings to agent specs and reference files (json_schema, two-evaluator, portionOptimizer, KB heuristic, API pitfalls) | 2026-03-25 | b528587 | | [260325-r2j-apply-orq-ai-experiment-learnings-to-age](./quick/260325-r2j-apply-orq-ai-experiment-learnings-to-age/) |
| 260326-ann | Apply all 21 pipeline optimizations (evaluators, deploy, testing, specs, architecture) | 2026-03-26 | 17b7d4e | Verified | [260326-ann-apply-all-21-pipeline-optimizations-eval](./quick/260326-ann-apply-all-21-pipeline-optimizations-eval/) |

### Pending Todos

None yet.

## Session Continuity

Last session: 2026-04-20T00:00:00.000Z
Stopped at: V3.0 roadmap created (10 phases). Phase 34 (Skill Structure & Format Foundation) is next active.
Resume with: `/gsd:plan-phase 34` to start Phase 34 planning, or run `/gsd:autonomous` for continuous execution.
Resume file: None
