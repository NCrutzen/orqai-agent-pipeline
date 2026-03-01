# Requirements: Orq Agent Designer

**Defined:** 2026-02-24 (V1.0), 2026-03-01 (V2.0)
**Core Value:** Given any use case description, produce correct, complete Orq.ai Agent specifications and autonomously deploy, test, iterate, and harden them via the Orq.ai MCP server and API — while keeping non-technical colleagues able to review and approve every change.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Input Handling

- [x] **INPT-01**: User can provide a brief use case description (1-3 sentences) and receive a complete agent swarm spec
- [x] **INPT-02**: User can provide a detailed brief (multi-paragraph document) and receive a complete agent swarm spec
- [x] **INPT-03**: Agent adapts pipeline depth based on input detail — skips research subagents when input provides sufficient context

### Agent Architecture

- [x] **ARCH-01**: Architect subagent analyzes use case and determines how many agents are needed (with complexity gate defaulting to single-agent when sufficient)
- [x] **ARCH-02**: Architect subagent defines each agent's role, responsibilities, and relationship to other agents
- [x] **ARCH-03**: Architect subagent determines orchestration pattern: single agent, sequential pipeline, or parallel fan-out with orchestrator
- [x] **ARCH-04**: Architect subagent identifies which agents should be assigned as tools to an orchestrator agent (Orq.ai's native orchestration mechanism)

### Domain Research

- [x] **RSRCH-01**: Domain research subagents investigate best practices per agent role when input lacks sufficient detail
- [x] **RSRCH-02**: Research covers: optimal model selection, prompt patterns, tool needs, guardrail recommendations, and context requirements
- [x] **RSRCH-03**: Research is skipped entirely when user provides detailed input (smart spawning)

### Agent Spec Generation

Each agent `.md` must include ALL Orq.ai Agent fields:

- [x] **SPEC-01**: Agent spec includes **description** — brief purpose summary (Orq.ai Configuration description field)
- [x] **SPEC-02**: Agent spec includes **instructions** — full system prompt (Orq.ai Instructions field)
- [x] **SPEC-03**: Agent spec includes **model** — recommended model in `provider/model-name` format (e.g., `anthropic/claude-sonnet-4-5`)
- [x] **SPEC-04**: Agent spec includes **fallback models** — ordered list of fallback models if primary is unavailable
- [x] **SPEC-05**: Agent spec includes **tools** — categorized by type: Built-in Tools, Function Tools (with JSON schema), HTTP Tools, Python Tools, and Agent Tools (sub-agents as tools for orchestration)
- [x] **SPEC-06**: Agent spec includes **context** — what context the agent needs and how to configure it
- [x] **SPEC-07**: Agent spec includes **evaluators** — recommended evaluator configuration for the agent
- [x] **SPEC-08**: Agent spec includes **guardrails** — recommended guardrails for the agent
- [x] **SPEC-09**: Agent spec includes **runtime constraints** — Max. Turns and Max. Execution Time recommendations
- [x] **SPEC-10**: Agent spec includes **key** — unique identifier following `[domain]-[role]-agent` kebab-case convention
- [x] **SPEC-11**: Agent spec includes **input/output message templates** with `{{variables}}` matching Orq.ai variable syntax
- [x] **SPEC-12**: All specs are copy-paste ready — a non-technical user can transfer each section directly into Orq.ai Studio fields

### Orchestration

- [x] **ORCH-01**: `ORCHESTRATION.md` documents the full agent swarm: which agent is the orchestrator, which agents are assigned as tools to it
- [x] **ORCH-02**: Orchestration spec includes agent-as-tool assignments — explicitly states which sub-agents are added as tools to which parent agents
- [x] **ORCH-03**: Orchestration spec includes data flow — what information passes between agents and in what format
- [x] **ORCH-04**: Orchestration spec includes error handling — what happens when a sub-agent fails or times out
- [x] **ORCH-05**: Orchestration spec includes human-in-the-loop decision points — where human approval is needed before proceeding

### Tool & Function Schemas

- [x] **TOOL-01**: Generate valid JSON Schema definitions for Function Tools each agent needs
- [x] **TOOL-02**: Recommend appropriate Built-in Tools per agent (Web search, Current date, Write/Delete memory store)
- [x] **TOOL-03**: Identify when HTTP Tools or Python Tools are needed and provide configuration guidance
- [x] **TOOL-04**: Identify when MCP Server connections are relevant and recommend them

### Dataset Generation

- [x] **DATA-01**: Generate test input sets per agent — realistic user messages and variable values covering happy path and edge cases
- [x] **DATA-02**: Generate eval pairs per agent — input + expected output for systematic evaluation
- [x] **DATA-03**: Generate multi-model comparison matrices — same test inputs formatted for testing across different providers (OpenAI, Anthropic, Google, etc.)
- [x] **DATA-04**: Include adversarial/messy test cases (minimum 30% of dataset) — not just clean synthetic data

### Output Structure

- [x] **OUT-01**: Output follows directory structure: `Agents/[swarm-name]/ORCHESTRATION.md`, `agents/[agent-name].md`, `datasets/`, `README.md`
- [x] **OUT-02**: Naming convention enforced: `[domain]-[role]-agent` kebab-case for agent keys, swarm directory matches domain
- [x] **OUT-03**: Per-swarm README with numbered step-by-step setup instructions for non-technical users to configure agents in Orq.ai Studio
- [x] **OUT-04**: Output is machine-parseable — structured consistently so future Orq.ai MCP can consume it programmatically

### Distribution

- [x] **DIST-01**: Installable as Claude Code slash command `/orq-agent` via GitHub repo
- [x] **DIST-02**: Simple install process achievable by non-technical employees
- [x] **DIST-03**: `/orq-agent:update` command pulls latest version from GitHub
- [x] **DIST-04**: Integrates with GSD workflow — callable standalone or from within a GSD phase

## V2.0 Requirements

Requirements for V2.0 milestone — Autonomous Orq.ai Pipeline. Each maps to roadmap phases 5+.

### References & Templates

- [ ] **REF-01**: Reference files updated with latest Anthropic evaluator-optimizer pattern, context engineering guidelines, and agent composability patterns
- [ ] **REF-02**: Reference files updated with OpenAI agent-as-tool patterns and Google A2A Protocol v0.3 task lifecycle states
- [ ] **REF-03**: New Orq.ai API endpoints reference (`references/orqai-api-endpoints.md`) covering agents, tools, datasets, evaluators, and experiments endpoints
- [ ] **REF-04**: New Orq.ai evaluator types reference (`references/orqai-evaluator-types.md`) covering 19 built-in function evaluators and 4 custom evaluator categories
- [ ] **REF-05**: New V2.0 output templates for deploy-log, test-results, and iteration-log following existing template patterns

### Install & Onboarding

- [ ] **INST-01**: Install script presents capability tier selection (core/deploy/test/full) with hierarchical enforcement (test requires deploy, full requires test)
- [ ] **INST-02**: Install script prompts for Orq.ai API key, validates with lightweight API call, and stores via environment variable only (never in generated files)
- [ ] **INST-03**: Install script auto-registers Orq.ai MCP server via `claude mcp add` when deploy or higher tier is selected
- [ ] **INST-04**: Commands are capability-gated — `/orq-agent:deploy` only available when deploy tier installed, `/orq-agent:test` only with test tier, etc.
- [ ] **INST-05**: Pipeline gracefully falls back to V1.0 copy-paste behavior when MCP is unavailable or only core tier is installed

### Deployment

- [ ] **DEPL-01**: Deployer creates agents in Orq.ai via MCP or REST API, mapping all V1.0 spec fields to API payload
- [ ] **DEPL-02**: Deployer creates tools in Orq.ai via REST API (5 types: function, HTTP, code, MCP, JSON schema)
- [ ] **DEPL-03**: Deployment is idempotent — re-running creates-or-updates existing agents/tools without duplicates
- [ ] **DEPL-04**: Orchestration wiring configures agent-as-tool relationships (`team_of_agents`) with child agents deployed before orchestrator
- [ ] **DEPL-05**: Deployment status reported as summary table (agent name, status, Orq.ai URL)
- [ ] **DEPL-06**: Local `.md` specs updated with deployment metadata (agent IDs, versions, timestamps) for audit trail
- [ ] **DEPL-07**: Verify-after-deploy pattern — every write is read back and compared to intended spec

### Testing

- [ ] **TEST-01**: V1.0 markdown datasets transformed and uploaded to Orq.ai in experiment format (inputs, messages, expected_outputs)
- [ ] **TEST-02**: Domain-appropriate evaluators created automatically — LLM-as-judge for semantic quality, function evaluators for structural checks
- [ ] **TEST-03**: Experiments executed against deployed agents with 3-run median and variance tracking
- [ ] **TEST-04**: Results presented in RESULTS.md with confidence intervals, per-evaluator scores, pass/fail summary, and worst-performing cases highlighted
- [ ] **TEST-05**: Train/test/holdout dataset split enforced (minimum 30 examples) to prevent prompt overfitting

### Prompt Iteration

- [ ] **ITER-01**: Results analyzed with plain-language diagnosis tied to specific test failures (e.g., "agent fails on X because instructions lack Y")
- [ ] **ITER-02**: Proposed prompt changes shown as diffs with per-change reasoning tied to specific test failures
- [ ] **ITER-03**: User approval required per iteration — no autonomous prompt changes, no batch approval
- [ ] **ITER-04**: Approved changes applied to both local `.md` specs and deployed agents, then re-tested
- [ ] **ITER-05**: Hard stopping conditions enforced: max 3 iterations, 50 API calls, 10-minute timeout, 5% minimum improvement gate
- [ ] **ITER-06**: ITERATIONS.md audit trail tracks every iteration: version, date, changes, reasoning, scores before/after, approval status

### Guardrails & Hardening

- [ ] **GUARD-01**: Test evaluators promotable to runtime guardrails on deployed Orq.ai agents
- [ ] **GUARD-02**: Threshold-based quality gates configurable per evaluator (e.g., helpfulness > 0.8, safety > 0.95)
- [ ] **GUARD-03**: Incremental per-agent deployment option — deploy, test, and iterate each agent individually before wiring orchestration

## Future Requirements

Deferred to future releases. Tracked but not in current roadmap.

### V2.1 — Automated KB Setup

- **KB-01**: Automated vector store provisioning via user-chosen RAG database (Supabase pgvector or alternatives)
- **KB-02**: Embedding configuration and ingestion pipeline generation
- **KB-03**: End-to-end KB setup without manual console interaction

### V3.0 — Browser Automation

- **BROW-01**: Playwright automation script generation
- **BROW-02**: Natural language browser instruction generation for LLM browser agents

### Other Deferred

- **ADV-01**: Iterative refinement — re-run on existing swarm output to modify or extend agents
- **ADV-02**: Agent version management — create new versions of existing agents via `@version-number` tags

## Out of Scope

| Feature | Reason |
|---------|--------|
| Visual/GUI agent builder | Orq.ai Studio already is the visual builder — we generate specs for it, not replace it |
| Real-time production monitoring dashboard | Orq.ai handles observability natively; duplicating it in a CLI tool adds massive scope |
| Multi-environment deployment (dev/staging/prod) | Orq.ai does not natively support environment separation; use agent versioning instead |
| Fully autonomous prompt iteration (no approval) | Non-technical users lose trust when behavior changes without knowledge; V2.0 is always HITL |
| Webhook-based deployment triggers | Event-driven infrastructure incompatible with CLI tool model |
| Multi-platform support | Dilutes Orq.ai-native quality — stay focused on one platform done well |
| Auto-update on launch | Surprise changes break trust for non-technical users |
| Knowledge base automated provisioning | Deferred to V2.1 — different skill set, massive scope expansion |

## Traceability

### V1.0 (Complete)

| Requirement | Phase | Status |
|-------------|-------|--------|
| INPT-01 | Phase 3 | Complete |
| INPT-02 | Phase 3 | Complete |
| INPT-03 | Phase 3 | Complete |
| ARCH-01 | Phase 1 | Complete |
| ARCH-02 | Phase 1 | Complete |
| ARCH-03 | Phase 1 | Complete |
| ARCH-04 | Phase 1 | Complete |
| RSRCH-01 | Phase 2 | Complete |
| RSRCH-02 | Phase 2 | Complete |
| RSRCH-03 | Phase 2 | Complete |
| SPEC-01 | Phase 2 | Complete |
| SPEC-02 | Phase 2 | Complete |
| SPEC-03 | Phase 2 | Complete |
| SPEC-04 | Phase 2 | Complete |
| SPEC-05 | Phase 2 | Complete |
| SPEC-06 | Phase 2 | Complete |
| SPEC-07 | Phase 2 | Complete |
| SPEC-08 | Phase 2 | Complete |
| SPEC-09 | Phase 2 | Complete |
| SPEC-10 | Phase 1 | Complete |
| SPEC-11 | Phase 2 | Complete |
| SPEC-12 | Phase 2 | Complete |
| ORCH-01 | Phase 2 | Complete |
| ORCH-02 | Phase 2 | Complete |
| ORCH-03 | Phase 2 | Complete |
| ORCH-04 | Phase 2 | Complete |
| ORCH-05 | Phase 2 | Complete |
| TOOL-01 | Phase 2 | Complete |
| TOOL-02 | Phase 2 | Complete |
| TOOL-03 | Phase 2 | Complete |
| TOOL-04 | Phase 2 | Complete |
| DATA-01 | Phase 2 | Complete |
| DATA-02 | Phase 2 | Complete |
| DATA-03 | Phase 2 | Complete |
| DATA-04 | Phase 2 | Complete |
| OUT-01 | Phase 1 | Complete |
| OUT-02 | Phase 1 | Complete |
| OUT-03 | Phase 2 | Complete |
| OUT-04 | Phase 1 | Complete |
| DIST-01 | Phase 4 | Complete |
| DIST-02 | Phase 4 | Complete |
| DIST-03 | Phase 4 | Complete |
| DIST-04 | Phase 4 | Complete |

### V2.0 (Pending)

| Requirement | Phase | Status |
|-------------|-------|--------|
| REF-01 | TBD | Pending |
| REF-02 | TBD | Pending |
| REF-03 | TBD | Pending |
| REF-04 | TBD | Pending |
| REF-05 | TBD | Pending |
| INST-01 | TBD | Pending |
| INST-02 | TBD | Pending |
| INST-03 | TBD | Pending |
| INST-04 | TBD | Pending |
| INST-05 | TBD | Pending |
| DEPL-01 | TBD | Pending |
| DEPL-02 | TBD | Pending |
| DEPL-03 | TBD | Pending |
| DEPL-04 | TBD | Pending |
| DEPL-05 | TBD | Pending |
| DEPL-06 | TBD | Pending |
| DEPL-07 | TBD | Pending |
| TEST-01 | TBD | Pending |
| TEST-02 | TBD | Pending |
| TEST-03 | TBD | Pending |
| TEST-04 | TBD | Pending |
| TEST-05 | TBD | Pending |
| ITER-01 | TBD | Pending |
| ITER-02 | TBD | Pending |
| ITER-03 | TBD | Pending |
| ITER-04 | TBD | Pending |
| ITER-05 | TBD | Pending |
| ITER-06 | TBD | Pending |
| GUARD-01 | TBD | Pending |
| GUARD-02 | TBD | Pending |
| GUARD-03 | TBD | Pending |

**Coverage:**
- V1.0 requirements: 40 total — 40 complete
- V2.0 requirements: 26 total — 0 complete
- Total: 66 requirements
- Unmapped: 26 (V2.0 — awaiting roadmap)

---
*Requirements defined: 2026-02-24 (V1.0), 2026-03-01 (V2.0)*
*Last updated: 2026-03-01 after V2.0 milestone requirements definition*
