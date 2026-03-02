---
gsd_state_version: 1.0
milestone: v0.3
milestone_name: milestone
status: unknown
last_updated: "2026-03-02T10:14:41.957Z"
progress:
  total_phases: 7
  completed_phases: 7
  total_plans: 11
  completed_plans: 11
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-01)

**Core value:** Given any use case description, produce correct, complete Orq.ai Agent specifications and autonomously deploy, test, iterate, and harden them via the Orq.ai MCP server and API.
**Current focus:** Phase 10 — Fix Holdout Dataset Path (complete)
**Previous milestone:** v0.3 shipped 2026-03-01 — 11 phases, 28 plans, 50/50 requirements

## Current Position

Phase: 11 of 11 (Flag Conventions and Tech Debt)
Plan: 1 of 1 complete
Status: Complete
Last activity: 2026-03-02 — Completed 11-01 (Flag Conventions and Tech Debt)

Progress: [██████████] 100% (1/1 plans in Phase 11)

## Performance Metrics

**Velocity:**
- Total plans completed: 8 (V2.0)
- Average duration: 2.9min
- Total execution time: 23min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 6. Orq.ai Deployment | 2/2 | 7min | 3.5min |
| 7. Automated Testing | 2/2 | 6min | 3min |
| 8. Prompt Iteration Loop | 2/2 | 6min | 3min |
| 7.1 Test Pipeline Tech Debt | 1/1 | 1min | 1min |
| 9. Guardrails and Hardening | 1/2 | 4min | 4min |
| Phase 09 P01 | 4min | 2 tasks | 3 files |
| 10. Fix Holdout Dataset Path | 1/1 | 2min | 2min |
| Phase 11 P01 | 3min | 2 tasks | 6 files |

## Accumulated Context

### Key Decisions (carried forward)

- MCP-first integration, API fallback for tools/prompts/memory stores
- Pin `@orq-ai/node@^3.14.45` — v4 dropped MCP server binary
- Local `.md` specs remain source of truth with full audit trail
- User approval required before applying prompt changes (HITL)
- Modular install — user selects capabilities (core/deploy/test/full)
- Build order strictly: Deploy > Test > Iterate > Guardrails
- Deployer is a subagent (.md file with natural language instructions), not application code
- Step 2 MCP unavailable continues with REST-only deploy (no longer stops with V1.0 fallback)
- team_of_agents: try strings first, fall back to objects on 422 (runtime validation needed)
- Tool list cached per deploy run to avoid N+1 API calls
- Verification discrepancies are warnings only -- never block the deploy
- Frontmatter merge-safe: preserve existing fields when annotating spec files
- Tool IDs stored in TOOLS.md frontmatter as tool_ids mapping
- Studio link inferred as https://cloud.orq.ai/toolkit/agents/{orqai_id}
- Dataset operations use REST-only via @orq-ai/node SDK (MCP dataset tools may not be exposed)
- Hybrid role defaults when both structural and conversational signals present (union of evaluators)
- Three separate platform datasets per agent per split (train/test/holdout) for clean isolation
- LLM evaluators run platform-side (Orq.ai scores), function evaluators use local evaluatorq scorers with platform fallback
- Bottleneck score (lowest evaluator median) as single per-agent summary metric in terminal output
- Step 2 MCP unavailable + API key set continues via REST for test command (matches deploy pattern)
- Iterator is a subagent (.md file) -- LLM reasoning does diagnosis and proposal generation, no custom code
- Four iteration stop conditions: max 3 iterations, <5% improvement, user_declined, 10min wall-clock timeout
- Logs written BEFORE applying changes to preserve audit trail even on apply/test failure
- Deployer subagent unmodified for re-deploy -- existing idempotent create-or-update logic handles selective updates
- Holdout dataset IDs passed directly from test-results.json to tester for re-test (no new upload)
- Step 2 MCP unavailable + API key set continues via REST for iterate command (matches deploy/test pattern)
- REST fallback is documentation-only -- no parallel code path created (SDK handles REST internally)
- Deploy shows interactive picker when no --agent flag (per-agent incremental workflow)
- All commands use `--agent` flag exclusively for per-agent workflows (no positional args)
- Auto-deploy tool dependencies when deploying single agent via --agent
- Guardrail violations surfaced with higher priority in iterator diagnosis for tighter feedback loop
- Guardrail config stored in ## Guardrails markdown section in agent spec files (not YAML frontmatter)
- Severity and threshold are application-layer fields only -- NOT sent to Orq.ai API (API accepts only id, execute_on, sample_rate)
- Pre-built guardrails (orq_pii_detection, orq_harmful_moderation, orq_sexual_moderation) always suggested for conversational/hybrid agents
- Preserve existing dataset_id field for backward compatibility while adding per-split fields (train/test/holdout) alongside it

### Blockers/Concerns

- Guardrails API surface unconfirmed on Agents API — validate during Phase 6 to unblock Phase 9 design
- Exact MCP tool names need runtime validation (`claude mcp list-tools orq`) at Phase 6 start
- Experiment API schema (`POST /v2/experiments`) needs hands-on validation at Phase 7 start

### Tech Debt (from v0.3 audit)

- ~~TOOLS.md not passed to Wave 3 dataset-gen/readme-gen~~ (resolved in Phase 11)
- ~~agentic-patterns.md not in orchestration-generator files_to_read~~ (resolved in Phase 11)
- ~~Step 5.5/5 numbering inversion in orchestrator~~ (resolved in Phase 11)

## Session Continuity

Last session: 2026-03-02
Stopped at: Completed 11-01-PLAN.md (Flag Conventions and Tech Debt)
Resume with: All phases complete
