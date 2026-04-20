---
gsd_state_version: 1.0
milestone: v0.3
milestone_name: milestone
status: verifying
stopped_at: Completed 35-01-PLAN.md
last_updated: "2026-04-20T15:17:34.578Z"
last_activity: "2026-04-20 — Phase 35 Plan 01 complete: snapshot-pinned-models lint rule added to lint-skills.sh (MSEL-02 enforcement live, 2 fixtures proving both exit paths, full suite + protected pipelines still green)"
progress:
  total_phases: 10
  completed_phases: 1
  total_plans: 10
  completed_plans: 6
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-20)

**Core value:** Any colleague can go from a use case description to deployed, tested agents on Orq.ai -- through an automated pipeline with real-time visibility and HITL approvals -- without needing to understand the underlying AI platform.
**Current focus:** V3.0 Lifecycle Completeness & Eval Science — Phase 35 Model Selection Discipline in progress (Plan 01 of 05 complete)
**Previous milestones:** v0.3 shipped 2026-03-01 (11 phases, 28 plans), V2.0 shipped 2026-03-02 (7 phases, 11 plans), V2.1 shipped 2026-03-13 (8 phases, 9 plans)

## Current Position

Phase: 35 - Model Selection Discipline (IN PROGRESS)
Plan: 01 complete (1 of 5) — snapshot-pinned-models lint rule shipped; Plan 02 (researcher capable-first policy) is next
Status: Wave 1 green; ready to proceed with Plan 02
Last activity: 2026-04-20 — Phase 35 Plan 01 complete: snapshot-pinned-models lint rule added to lint-skills.sh (MSEL-02 enforcement live, 2 fixtures proving both exit paths, full suite + protected pipelines still green)

Progress: V3.0 Phase 34 COMPLETE. Phase 35 Plan 01 COMPLETE (MSEL-02 mechanical enforcement). Remaining Phase 35 plans: 02 researcher policy, 03 spec-generator policy, 04 capable-tier table, 05 verification sweep.

## Performance Metrics

| Phase | Plan | Duration | Tasks | Files |
|-------|------|----------|-------|-------|
| 34-skill-structure-format-foundation | 01 | 3 min | 3 | 6 |
| 34-skill-structure-format-foundation | 02 | 13 min | 3 | 15 |
| 34-skill-structure-format-foundation | 03 | 13 min | 3 | 17 |
| 34-skill-structure-format-foundation | 04 | 2 min | 1 | 1 |
| 34-skill-structure-format-foundation | 05 | 3 min | 1 | 1 |
| Phase 34-skill-structure-format-foundation P05 | 3 min | 1 tasks | 1 files |
| Phase 35-model-selection-discipline P01 | 2 min | 2 tasks | 3 files |

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
- [Phase 34-skill-structure-format-foundation]: Golden baselines hash <pipeline> block only (not whole file) — operationalizes ROADMAP #5 'byte-identical in behavior' (2026-04-20)
- [Phase 34-skill-structure-format-foundation]: POSIX bash + grep/awk/shasum only for Wave-0 validation scripts — zero runtime deps, CI-ready by default for Phase 43 (2026-04-20)
- [Phase 34-skill-structure-format-foundation]: For XML-tagged command files, SKST pre-body sections go between </files_to_read> and <pipeline>; footer sections after </pipeline> — keeps pipeline SHA-256 byte-identical (2026-04-20)
- [Phase 34-skill-structure-format-foundation]: Local-config commands (systems, set-profile, update, help) use "- **N/A** — this skill manages local configuration only" for Open in orq.ai; lint accepts N/A per SKST-10 exception (2026-04-20)
- [Phase 34-skill-structure-format-foundation]: help.md Destructive Actions uses "- **None** — this command is read-only" — read-only commands pass SKST-08 with this explicit shape (2026-04-20)
- [Phase 34-skill-structure-format-foundation]: SKST-01 satisfied for subagents by existing tools: frontmatter — allowed-tools: is a no-op on subagents per Claude Code schema (RESEARCH.md Pitfall 2); zero frontmatter edits made on 17 subagent files
- [Phase 34-skill-structure-format-foundation]: Non-destructive subagents use explicit Non-destructive wording in Destructive Actions; failure-diagnoser documents downstream AskUserQuestion HITL gate (it collects approval but does not mutate itself)
- [Phase 34-skill-structure-format-foundation]: Forward-link graph to future-phase requirement IDs established across subagents (TFAIL-03, ITRX-01/05/07/08, EVLD-08, KBM-01-04, ESCI-01/08, DSET-02-05, MSEL-01/02); Phases 35/38/39/40/42 can grep for these IDs to find entry points
- [Phase 34-skill-structure-format-foundation]: SKILL.md receives full 9-section SKST superset with meta-framing per RESEARCH.md Open Question #2 — suite-level Destructive Actions explicitly N/A (index file makes no mutations); allowed-tools: union of tools across 15 commands
- [Phase 34-skill-structure-format-foundation]: Resources Policy pinned to a lint rule (references-multi-consumer) instead of a migration action — zero files moved because zero files qualified (all 8 refs have >=2 consumers, verified 2026-04-20)
- [Phase 34-skill-structure-format-foundation]: Phase-close VERIFICATION.md pattern established — structured evidence document (captured output + 10-row traceability table + 5-row ROADMAP criteria checklist + inventory + deferred items) sits next to SUMMARY.md and feeds /gsd:verify-work (2026-04-20)
- [Phase 34-skill-structure-format-foundation]: TODO(SKST-10) inferred-URL marker count is 2 (datasets.md + dataset-generator.md Annotation Queues URL) — resolution deferred to Phase 37+ when live MCP surfaces canonical my.orq.ai/annotation-queues path (2026-04-20)
- [Phase 34-skill-structure-format-foundation]: Lateral lint enforcement for downstream phases — each V3.0 phase (36-43) must call bash orq-agent/scripts/lint-skills.sh on its new skill files before marking plans complete; CI wiring owned by Phase 43 DIST (2026-04-20)
- [Phase 35-model-selection-discipline]: MSEL-02 enforcement via extending lint-skills.sh (not new script) — one CI entry point, reuses extensible-rule pattern from 34-01
- [Phase 35-model-selection-discipline]: Fixtures live outside default_file_set() under tests/fixtures/ so full-suite green baseline stays stable; rule tested via explicit --file invocation
- [Phase 35-model-selection-discipline]: YAGNI on embedding/speech alias allow-list — no such model currently in skill set; documented inline as bash comment with the # alias-only -- pinning unavailable <date> convention spec-generator will use in Plan 03

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

Last session: 2026-04-20T15:17:34.575Z
Stopped at: Completed 35-01-PLAN.md
Resume with: `/gsd:verify-work 34` to verify Phase 34 close, then `/gsd:plan-phase 35` for Model Selection Discipline.
Resume file: None
