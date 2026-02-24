# Requirements: Orq Agent Designer

**Defined:** 2026-02-24
**Core Value:** Given any use case description, produce correct, complete, copy-paste-ready Orq.ai Agent specifications with orchestration logic that a non-technical colleague can set up in Orq.ai Studio.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Input Handling

- [ ] **INPT-01**: User can provide a brief use case description (1-3 sentences) and receive a complete agent swarm spec
- [ ] **INPT-02**: User can provide a detailed brief (multi-paragraph document) and receive a complete agent swarm spec
- [ ] **INPT-03**: Agent adapts pipeline depth based on input detail — skips research subagents when input provides sufficient context

### Agent Architecture

- [ ] **ARCH-01**: Architect subagent analyzes use case and determines how many agents are needed (with complexity gate defaulting to single-agent when sufficient)
- [ ] **ARCH-02**: Architect subagent defines each agent's role, responsibilities, and relationship to other agents
- [ ] **ARCH-03**: Architect subagent determines orchestration pattern: single agent, sequential pipeline, or parallel fan-out with orchestrator
- [ ] **ARCH-04**: Architect subagent identifies which agents should be assigned as tools to an orchestrator agent (Orq.ai's native orchestration mechanism)

### Domain Research

- [ ] **RSRCH-01**: Domain research subagents investigate best practices per agent role when input lacks sufficient detail
- [ ] **RSRCH-02**: Research covers: optimal model selection, prompt patterns, tool needs, guardrail recommendations, and context requirements
- [ ] **RSRCH-03**: Research is skipped entirely when user provides detailed input (smart spawning)

### Agent Spec Generation

Each agent `.md` must include ALL Orq.ai Agent fields:

- [ ] **SPEC-01**: Agent spec includes **description** — brief purpose summary (Orq.ai Configuration description field)
- [ ] **SPEC-02**: Agent spec includes **instructions** — full system prompt (Orq.ai Instructions field)
- [ ] **SPEC-03**: Agent spec includes **model** — recommended model in `provider/model-name` format (e.g., `anthropic/claude-sonnet-4-5`)
- [ ] **SPEC-04**: Agent spec includes **fallback models** — ordered list of fallback models if primary is unavailable
- [ ] **SPEC-05**: Agent spec includes **tools** — categorized by type: Built-in Tools, Function Tools (with JSON schema), HTTP Tools, Python Tools, and Agent Tools (sub-agents as tools for orchestration)
- [ ] **SPEC-06**: Agent spec includes **context** — what context the agent needs and how to configure it
- [ ] **SPEC-07**: Agent spec includes **evaluators** — recommended evaluator configuration for the agent
- [ ] **SPEC-08**: Agent spec includes **guardrails** — recommended guardrails for the agent
- [ ] **SPEC-09**: Agent spec includes **runtime constraints** — Max. Turns and Max. Execution Time recommendations
- [ ] **SPEC-10**: Agent spec includes **key** — unique identifier following `[domain]-[role]-agent` kebab-case convention
- [ ] **SPEC-11**: Agent spec includes **input/output message templates** with `{{variables}}` matching Orq.ai variable syntax
- [ ] **SPEC-12**: All specs are copy-paste ready — a non-technical user can transfer each section directly into Orq.ai Studio fields

### Orchestration

- [ ] **ORCH-01**: `ORCHESTRATION.md` documents the full agent swarm: which agent is the orchestrator, which agents are assigned as tools to it
- [ ] **ORCH-02**: Orchestration spec includes agent-as-tool assignments — explicitly states which sub-agents are added as tools to which parent agents
- [ ] **ORCH-03**: Orchestration spec includes data flow — what information passes between agents and in what format
- [ ] **ORCH-04**: Orchestration spec includes error handling — what happens when a sub-agent fails or times out
- [ ] **ORCH-05**: Orchestration spec includes human-in-the-loop decision points — where human approval is needed before proceeding

### Tool & Function Schemas

- [ ] **TOOL-01**: Generate valid JSON Schema definitions for Function Tools each agent needs
- [ ] **TOOL-02**: Recommend appropriate Built-in Tools per agent (Web search, Current date, Write/Delete memory store)
- [ ] **TOOL-03**: Identify when HTTP Tools or Python Tools are needed and provide configuration guidance
- [ ] **TOOL-04**: Identify when MCP Server connections are relevant and recommend them

### Dataset Generation

- [ ] **DATA-01**: Generate test input sets per agent — realistic user messages and variable values covering happy path and edge cases
- [ ] **DATA-02**: Generate eval pairs per agent — input + expected output for systematic evaluation
- [ ] **DATA-03**: Generate multi-model comparison matrices — same test inputs formatted for testing across different providers (OpenAI, Anthropic, Google, etc.)
- [ ] **DATA-04**: Include adversarial/messy test cases (minimum 30% of dataset) — not just clean synthetic data

### Output Structure

- [ ] **OUT-01**: Output follows directory structure: `Agents/[swarm-name]/ORCHESTRATION.md`, `agents/[agent-name].md`, `datasets/`, `README.md`
- [ ] **OUT-02**: Naming convention enforced: `[domain]-[role]-agent` kebab-case for agent keys, swarm directory matches domain
- [ ] **OUT-03**: Per-swarm README with numbered step-by-step setup instructions for non-technical users to configure agents in Orq.ai Studio
- [ ] **OUT-04**: Output is machine-parseable — structured consistently so future Orq.ai MCP can consume it programmatically

### Distribution

- [ ] **DIST-01**: Installable as Claude Code slash command `/orq-agent` via GitHub repo
- [ ] **DIST-02**: Simple install process achievable by non-technical employees
- [ ] **DIST-03**: `/orq-agent:update` command pulls latest version from GitHub
- [ ] **DIST-04**: Integrates with GSD workflow — callable standalone or from within a GSD phase

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Direct Orq.ai Integration

- **INTG-01**: When Orq.ai MCP is available, `/orq-agent:deploy` pushes specs directly to Orq.ai
- **INTG-02**: Agent version management — create new versions of existing agents via `@version-number` tags

### Advanced Features

- **ADV-01**: Iterative refinement — re-run on existing swarm output to modify or extend agents
- **ADV-02**: Prompt optimization loop — use eval results to suggest prompt improvements
- **ADV-03**: Knowledge base content scaffolding — generate starter content for referenced knowledge bases

## Out of Scope

| Feature | Reason |
|---------|--------|
| Visual/GUI agent builder | Orq.ai Studio already is the visual builder — we generate specs for it, not replace it |
| Direct Orq.ai API deployment | Orq.ai MCP doesn't exist yet — building custom API integration is fragile and removes human review |
| Real-time agent monitoring | Orq.ai handles observability natively |
| Knowledge base content creation | Massive scope expansion into data engineering — specs reference KBs but don't populate them |
| Auto-update on launch | Surprise changes break trust for non-technical users |
| Multi-platform support | Dilutes Orq.ai-native quality — stay focused on one platform done well |
| Prompt fine-tuning loop | Requires runtime infrastructure beyond spec generation scope |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| INPT-01 | — | Pending |
| INPT-02 | — | Pending |
| INPT-03 | — | Pending |
| ARCH-01 | — | Pending |
| ARCH-02 | — | Pending |
| ARCH-03 | — | Pending |
| ARCH-04 | — | Pending |
| RSRCH-01 | — | Pending |
| RSRCH-02 | — | Pending |
| RSRCH-03 | — | Pending |
| SPEC-01 | — | Pending |
| SPEC-02 | — | Pending |
| SPEC-03 | — | Pending |
| SPEC-04 | — | Pending |
| SPEC-05 | — | Pending |
| SPEC-06 | — | Pending |
| SPEC-07 | — | Pending |
| SPEC-08 | — | Pending |
| SPEC-09 | — | Pending |
| SPEC-10 | — | Pending |
| SPEC-11 | — | Pending |
| SPEC-12 | — | Pending |
| ORCH-01 | — | Pending |
| ORCH-02 | — | Pending |
| ORCH-03 | — | Pending |
| ORCH-04 | — | Pending |
| ORCH-05 | — | Pending |
| TOOL-01 | — | Pending |
| TOOL-02 | — | Pending |
| TOOL-03 | — | Pending |
| TOOL-04 | — | Pending |
| DATA-01 | — | Pending |
| DATA-02 | — | Pending |
| DATA-03 | — | Pending |
| DATA-04 | — | Pending |
| OUT-01 | — | Pending |
| OUT-02 | — | Pending |
| OUT-03 | — | Pending |
| OUT-04 | — | Pending |
| DIST-01 | — | Pending |
| DIST-02 | — | Pending |
| DIST-03 | — | Pending |
| DIST-04 | — | Pending |

**Coverage:**
- v1 requirements: 40 total
- Mapped to phases: 0
- Unmapped: 40 ⚠️

---
*Requirements defined: 2026-02-24*
*Last updated: 2026-02-24 after initial definition*
