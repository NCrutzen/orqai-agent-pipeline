# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-24)

**Core value:** Given any use case description, produce correct, complete, copy-paste-ready Orq.ai Agent specifications with orchestration logic that a non-technical colleague can set up in Orq.ai Studio.
**Current focus:** Phase 4: Distribution

## Current Position

Phase: 4 of 4 (Distribution)
Plan: 3 of 3 in current phase
Status: Complete
Last activity: 2026-02-24 -- Completed 04-03-PLAN.md

Progress: [██████████] 100%

## Performance Metrics

**Velocity:**
- Total plans completed: 11
- Average duration: 2min
- Total execution time: 0.25 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-foundation | 3 | 8min | 3min |

**Recent Trend:**
- Last 5 plans: 01-01 (2min), 01-02 (2min), 01-03 (4min)
- Trend: stable

*Updated after each plan completion*
| 02-01 researcher | 2min | 1 tasks | 1 files |
| 02-02 spec-generator | 2min | 1 tasks | 1 files |
| 02-03 orchestration-generator | 2min | 1 tasks | 1 files |
| Phase 02 P04 | 3min | 1 tasks | 1 files |
| Phase 02 P02 | 3min | 1 tasks | 1 files |
| Phase 02 P05 | 2min | 2 tasks | 2 files |
| Phase 03 P01 | 2min | 2 tasks | 1 files |
| Phase 03 P02 | 3min | 3 tasks | 2 files |
| Phase 04 P02 | 3min | 2 tasks | 4 files |
| Phase 04 P01 | 2min | 2 tasks | 5 files |
| Phase 04 P03 | 2min | 1 tasks | 1 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Roadmap: 4 phases (quick depth) -- Foundation, Core Generation, Orchestrator, Distribution
- Roadmap: Complexity gate must be in Phase 1 architect (research flags it as cannot-bolt-on-later)
- Roadmap: All Orq.ai field coverage in Phase 2 spec generator (expanded from original to include evaluators, guardrails, context, fallback models)
- 01-01: Reference files target 500-1000 words each to preserve subagent context window
- 01-01: Model catalog curates 12 recommended models across 5 use cases rather than listing all 300+
- 01-01: Hyphens-only convention for agent keys despite regex allowing dots and underscores
- 01-02: Used {{PLACEHOLDER}} format matching Orq.ai native variable syntax for consistency
- 01-02: Each template is self-contained with its own legend -- no cross-template dependencies
- 01-02: Included guidance notes in each section for not-applicable cases to guide spec generator
- 01-03: Three few-shot examples (simple/moderate/complex) as primary calibration mechanism for architect
- 01-03: Anti-patterns section in architect prompt to prevent over-engineering at decision time
- 01-03: SKILL.md as lightweight index (84 lines) with Phase 2 subagent placeholders
- [Phase 02-05]: Technical-but-clear tone for READMEs -- assumes Orq.ai Studio basics, no LLM jargon in business sections
- [Phase 02-05]: Complete few-shot example uses 2-agent customer support swarm (consistent with architect examples)
- [Phase 02-05]: Tool Schema Generator confirmed removed from SKILL.md (merged into spec generator)
- 02-03: Mermaid diagram rules embedded directly in subagent prompt for reliable rendering
- 02-03: Error handling categorized by agent role criticality (critical/support/classification/generation)
- 02-03: HITL identification via 6 trigger categories (high-value, sensitive data, scope-exceeding, low-confidence, external writes, irreversible)
- 02-03: Single-agent swarms get simplified ORCHESTRATION.md with N/A sections
- [Phase 02-01]: One researcher for entire swarm with per-agent sections (not one per agent)
- [Phase 02-01]: Confidence scoring (HIGH/MEDIUM/LOW) based on web search result quality
- [Phase 02-01]: Researcher always runs -- skip logic deferred to Phase 3 orchestrator per RSRCH-03
- [Phase 02-04]: All 9 OWASP attack vectors mapped as mandatory categories for edge case datasets
- [Phase 02-04]: Self-validation checklist built into subagent prompt to enforce quality gates
- [Phase 02]: Deep vs shallow instructions comparison embedded in spec generator prompt to calibrate output quality (500+ words with all subsections required)
- [Phase 02]: Tool schema generation merged into spec generator (not separate subagent) -- schemas are one section of agent-spec template
- [Phase 02]: Self-validation checklist (12 checks) embedded in spec generator prompt rather than separate validation subagent
- [Phase 03-01]: Embedded classifier in orchestrator prompt (not separate subagent) -- simpler, less overhead
- [Phase 03-01]: Only researcher stage is ever skippable -- all other stages always run regardless of input detail
- [Phase 03-01]: Blueprint written to output directory for downstream subagent file path consumption (lean orchestrator)
- [Phase 03-01]: Auto-versioning uses [swarm-name]-vN pattern for existing output directories
- [Phase 03-02]: Wave-based parallelism: Wave 1 research, Wave 2 spec generation, Wave 3 post-generation
- [Phase 03-02]: Researcher scaling: 1-3 agents single invocation, 4+ agents parallel instances
- [Phase 03-02]: Lean orchestrator passes file paths to subagents, never loads outputs into context
- [Phase 03-02]: Graceful degradation: failed subagent marked incomplete, pipeline continues, failures reported at end
- [Phase 04-02]: --gsd flag is a hint for metadata/logging, does not change output directory
- [Phase 04-02]: Step 0 argument parsing inserted before Step 1 without disrupting existing pipeline steps
- [Phase 04-02]: OUTPUT_DIR variable replaces hardcoded ./Agents/ in Step 5 for --output flag support
- [Phase 04-01]: Skills directory install path (~/.claude/skills/orq-agent) over commands directory per research
- [Phase 04-01]: Placeholder GitHub URLs (OWNER/REPO) to be replaced when repo is created
- [Phase 04-01]: Version comparison before download to skip if already up to date
- [Phase 04]: [Phase 04-03]: All pipeline file paths use {OUTPUT_DIR} variable -- ./Agents/ preserved only in Step 0 default-value documentation

### Pending Todos

None yet.

### Roadmap Evolution

- Phase 4.1 inserted after Phase 4: Introducing a Discussion phase on start if needed (URGENT)
- Phase 4.2 inserted after Phase 4: Tool Selection and MCP Servers (URGENT)
- Phase 4.3 inserted after Phase 4: Beste Prompt Strategy (URGENT)

### Blockers/Concerns

- Phase 2 may need `/gsd:research-phase` for prompt quality gate criteria and A2A Protocol orchestration spec format (flagged by research)
- Phase 3 input classification implemented: LLM-based per-stage evaluation, only researcher skippable
- Phase 4 requires testing on non-developer machines before release

## Session Continuity

Last session: 2026-02-24
Stopped at: Completed 04-03-PLAN.md
Resume file: .planning/phases/04-distribution/04-03-SUMMARY.md
