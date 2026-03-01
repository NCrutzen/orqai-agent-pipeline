# Phase 5: References, Install, and Capability Infrastructure - Context

**Gathered:** 2026-03-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Establish the knowledge foundation (updated agentic framework references, new Orq.ai API/evaluator references, V2.0 output templates) and modular install infrastructure (capability tiers, API key onboarding, MCP server registration, model profiles) so all subsequent V2.0 phases have references to build against and a capability-gated environment to operate in.

V1.0 subagent prompt modifications happen in later phases when those subagents need new capabilities. This phase creates and updates reference files and templates only.

</domain>

<decisions>
## Implementation Decisions

### Install flow & tier selection
- Explicit tier selection during install (core/deploy/test/full) — user picks, not auto-unlocked
- Re-running the install script handles upgrades (no separate upgrade command)
- Automatic cascading — selecting "deploy" includes core setup, "test" includes deploy+core, etc.
- Show a tier comparison table during install so users see what each tier unlocks before choosing

### API key handling
- Store API key in shell profile (~/.zshrc or ~/.bashrc) as `export ORQ_API_KEY=...`
- Validate key during install by calling the list models endpoint (GET /v2/models) — lightweight, read-only
- When key is missing or invalid mid-pipeline: prompt for key inline, validate, then continue (don't force re-install)
- Auto-register Orq.ai MCP server via `claude mcp add` during install when deploy+ tier is selected (no extra confirmation)

### Capability gating
- Tier stored in config file (e.g., `.orq-agent/config.json`) — checked at command start
- When user runs a command above their tier: show upgrade message with tier comparison table explaining what they need
- When MCP is unavailable but user has deploy+ tier: warn then fall back to V1.0 copy-paste output
- Base `/orq-agent` generation output is identical at all tiers — deploy/test/iterate are separate commands that act on V1.0 output

### Reference content scope
- External framework patterns (Anthropic evaluator-optimizer, OpenAI agent-as-tool, Google A2A): actionable patterns only, skip theory and history
- Orq.ai API reference: single file with sections per domain (agents, tools, datasets, evaluators, experiments) — not split into separate files
- V1.0 subagent prompts NOT modified in this phase — references created/updated only, subagents consume them naturally or get updated in Phase 6+
- V2.0 output templates (deploy-log, test-results, iteration-log): structured data format (JSON/YAML), not markdown — humans can see pipeline activity in Orq.ai UI directly

### Model profiles
- Three named profiles like GSD: quality, balanced, budget
- Quality: best models everywhere (Opus)
- Balanced: Opus for architect+spec-gen, Sonnet for rest
- Budget: Sonnet everywhere, Haiku for dataset-gen
- Separate `/orq-agent:set-profile` command (not part of install flow)
- Default profile: quality (best output out-of-the-box, user opts into cheaper profiles)
- Profile stored in same config file as tier (`.orq-agent/config.json`)

### Claude's Discretion
- Exact config file structure and location
- How model profile maps to specific subagent `model` parameters
- Reference file internal organization and section ordering
- MCP server registration command details

</decisions>

<specifics>
## Specific Ideas

- "Like GSD's model profiles" — follow the same quality/balanced/budget pattern with `/orq-agent:set-profile` command
- Structured data for V2.0 templates because "humans can see what is happening in Orq.ai UI" — logs are for pipeline audit trail and subagent consumption
- Tier comparison table during install mirrors the clear, informative style of the existing install experience

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 05-references-install-and-capability-infrastructure*
*Context gathered: 2026-03-01*
