# Phase 9: Guardrails and Hardening - Context

**Gathered:** 2026-03-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Promote test evaluators to production guardrails on deployed agents, enable per-agent incremental deployment with quality gates, and add a dedicated `/orq-agent:harden` command. Uses Orq.ai's native guardrails API (MCP-first, REST fallback). Does not add new evaluator types or change the testing/iteration pipeline — extends existing deploy/test/iterate with `--agent` flag and guardrail capabilities.

</domain>

<decisions>
## Implementation Decisions

### Guardrail Attachment
- Use Orq.ai's built-in guardrails via MCP server or REST API — no custom application-layer workarounds
- MCP-first with REST API fallback, consistent with Phase 6-7 pattern
- Guardrails configured in agent spec `.md` files (keeps everything about an agent in one place)
- Guardrail format in spec files: Claude's discretion (YAML frontmatter or dedicated markdown section)
- Severity levels: low-severity violations are logged, high-severity violations block — configurable per evaluator
- Guardrails active during iteration (violations feed back into iterator analysis) AND enforced on final deploy
- Guardrail violations auto-feed into iterator's analysis for tighter feedback loop
- Same scoring threshold from testing carries to production (no separate production thresholds)
- Which evaluator types can be guardrails: whatever Orq.ai's guardrails API supports

### Guardrail Promotion Flow
- Auto-suggest from test results: system analyzes which evaluators caught real issues and suggests promoting those
- User can add/remove from suggested list before confirming (manual override)
- Promotion requires test results to exist first — data-driven, not guesswork

### Quality Gate Thresholds
- Smart defaults per evaluator type (e.g., toxicity: 0.1, instruction_following: 3.5/5), user can override
- Configurable strictness mode: strict (block deploy) or advisory (warn). Default advisory, strict for safety evaluators
- When agent fails quality gate, system suggests running `/orq-agent:iterate` to fix it
- Quality results persisted in both places: summary in deploy-log.md, full details in quality-report.md

### Incremental Deployment
- `--agent` flag on `/orq-agent:deploy`, `/orq-agent:test`, and `/orq-agent:iterate` for per-agent operations
- When no `--agent` flag on deploy: interactive picker showing agent list for selection
- Auto-deploy tool dependencies when deploying a single agent (same dependency resolution as full deploy, scoped)
- Per-agent test/iterate by default, `--all` flag for full swarm validation
- Orchestration can be wired at any time, but swarm-level quality gate checks all agents before marking "production-ready"

### Command Surface
- New `/orq-agent:harden` command — dedicated command for guardrail and quality gate setup
- Harden runs full pipeline in one invocation: analyze test results → suggest guardrails → user approves → attach to agents → set thresholds → quality report
- Harden requires test results to exist first (prerequisite: `/orq-agent:test`)
- `--agent` flag added to all three existing commands: deploy, test, iterate

### Claude's Discretion
- Guardrail config format in agent spec files (YAML frontmatter vs markdown section)
- Smart default threshold values per evaluator type
- Quality report format and detail level
- Harden subagent internal architecture
- How guardrail violations are structured in iterator input

</decisions>

<specifics>
## Specific Ideas

- "Orq.ai has built-in guardrails" — must use native Orq.ai guardrails, not custom application-layer
- MCP + REST fallback pattern already proven in Phases 6-7, reuse same approach
- Iterator already references "add or refine guardrails" in iterate.md — extend this connection
- Tester already produces per-agent, per-evaluator scores in test-results.json — use as guardrail suggestion input

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `orq-agent/references/orqai-evaluator-types.md`: Full catalog of 41 evaluator types with score types — basis for guardrail suggestions
- `orq-agent/agents/deployer.md`: Deployer subagent with create/update pipeline — extend for guardrail attachment
- `orq-agent/agents/tester.md`: Tester subagent producing test-results.json — input for guardrail promotion
- `orq-agent/agents/iterator.md`: Already references guardrails in iteration flow — extend with violation feedback
- `orq-agent/commands/deploy.md`: Deploy command with capability gate and swarm discovery — extend with --agent flag
- `orq-agent/commands/test.md`: Test command — extend with --agent flag
- `orq-agent/commands/iterate.md`: Iterate command — extend with --agent flag

### Established Patterns
- MCP-first with REST API fallback (deployer, tester)
- YAML frontmatter for deployment metadata (orqai_id, version, timestamp)
- deploy-log.md for deployment audit trail
- test-results.json for structured test output
- Capability tier gating in commands (config.json tier check)

### Integration Points
- Guardrail attachment after deploy (deployer reads spec → attaches guardrails via Orq.ai API)
- test-results.json → harden command (scores drive guardrail suggestions)
- Guardrail violations → iterator input (feedback loop during iteration)
- deploy-log.md extended with quality gate column
- SKILL.md updated with new harden command and --agent flags

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 09-guardrails-and-hardening*
*Context gathered: 2026-03-01*
