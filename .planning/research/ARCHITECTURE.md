# Architecture Research

**Domain:** LLM agent design tooling / Claude Code skill — V2.0 Autonomous Pipeline Extension
**Researched:** 2026-03-01
**Confidence:** MEDIUM (Orq.ai API surface verified via docs; MCP-to-Orq.ai integration patterns less documented)

## System Overview — V2.0 Extension

V2.0 extends V1.0's spec-generation pipeline with three new stages (deploy, test, iterate) and modifies two existing components (install script, orchestrator). The core V1.0 subagents (architect, researcher, spec-generator, dataset-generator, orchestration-generator, readme-generator, tool-resolver) remain unchanged.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      User Layer (Claude Code CLI)                       │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │  /orq-agent  (V1 entry point — extended with V2 stages)           │ │
│  │  /orq-agent:deploy  /orq-agent:test  /orq-agent:iterate           │ │
│  └──────────────────────────┬─────────────────────────────────────────┘ │
├─────────────────────────────┼───────────────────────────────────────────┤
│                    Orchestration Layer                                   │
│  ┌──────────────────────────┴─────────────────────────────────────────┐ │
│  │              Orchestrator Workflow (orq-agent.md) — MODIFIED        │ │
│  │  V1 Stages (unchanged):                                            │ │
│  │    Discussion → Architect → Tool Resolver → Research → Spec Gen    │ │
│  │    → Post-Gen (Orchestration + Datasets + README)                  │ │
│  │                                                                     │ │
│  │  V2 Stages (NEW — appended after Post-Gen):                        │ │
│  │    → Deploy → Test → Iterate (loop)                                │ │
│  └──┬───────┬───────┬───────┬───────┬───────┬───────┬─────────────────┘ │
├─────┼───────┼───────┼───────┼───────┼───────┼───────┼─────────────────  │
│     │ V1 Subagent Layer (UNCHANGED)  │  V2 Subagent Layer (NEW)    │   │
│  ┌──┴──────┐ ┌──┴──────┐ ┌──┴──────┐│ ┌──┴──────┐ ┌──┴──────┐     │   │
│  │Architect│ │Research │ │Spec Gen ││ │Deployer │ │Tester   │     │   │
│  │         │ │         │ │(per agt)││ │         │ │         │     │   │
│  └─────────┘ └─────────┘ └─────────┘│ └────┬────┘ └────┬────┘     │   │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐│      │           │          │   │
│  │Tool Res │ │Orch Gen │ │Dataset  ││ ┌────┴───────────┴────┐     │   │
│  │         │ │         │ │Generator││ │  Iterator (loop)     │     │   │
│  └─────────┘ └─────────┘ └─────────┘│ └─────────────────────┘     │   │
├──────────────────────────────────────┼─────────────────────────────────┤
│          Reference Layer (EXTENDED)  │  Integration Layer (NEW)        │
│  ┌──────────┐  ┌──────────┐         │  ┌────────────────────────┐     │
│  │Templates │  │Orq.ai Ref│         │  │ Orq.ai API Adapter     │     │
│  │(V1 + V2) │  │(V1 + V2) │         │  │ (REST calls via Bash)  │     │
│  └──────────┘  └──────────┘         │  ├────────────────────────┤     │
│                                      │  │ Orq.ai MCP Server      │     │
│                                      │  │ (registered via claude  │     │
│                                      │  │  mcp add, used by       │     │
│                                      │  │  subagents directly)    │     │
│                                      │  └────────────────────────┘     │
├─────────────────────────────────────────────────────────────────────────┤
│                      Output Layer (Filesystem — EXTENDED)               │
│  Agents/[swarm-name]/                                                   │
│  ├── agents/*.md   ├── datasets/   ├── README.md     (V1: unchanged)  │
│  ├── deploy-log.md ├── test-results.md               (V2: new)        │
│  └── iterations/   └── audit-trail.md                (V2: new)        │
└─────────────────────────────────────────────────────────────────────────┘
```

## What Changes vs What Stays

### UNCHANGED (V1.0 Components)

| Component | Why Unchanged |
|-----------|---------------|
| `agents/architect.md` | Blueprint design has no dependency on deploy/test stages |
| `agents/researcher.md` | Domain research is upstream of all new stages |
| `agents/spec-generator.md` | Spec format is already Orq.ai API-compatible; deployer reads these as-is |
| `agents/orchestration-generator.md` | Orchestration doc is a human reference, not consumed by deployer |
| `agents/dataset-generator.md` | Datasets are already structured for Orq.ai experiments; tester reads these as-is |
| `agents/readme-generator.md` | Human-facing doc, independent of automation |
| `agents/tool-resolver.md` | Tool resolution is upstream of deployment |
| `templates/agent-spec.md` | Template is already aligned with `/v2/agents` API fields |
| `templates/orchestration.md` | No changes needed |
| `templates/dataset.md` | Datasets already contain eval pairs; may need minor format extension for evaluatorq |
| `references/orqai-agent-fields.md` | API field reference stays, may need version bump annotation |
| `references/orqai-model-catalog.md` | Model catalog stays |
| `references/orchestration-patterns.md` | Patterns stay |
| `references/naming-conventions.md` | Naming stays |
| `references/tool-catalog.md` | Tool catalog stays |

### MODIFIED (V1.0 Components Requiring Changes)

| Component | What Changes | Why |
|-----------|-------------|-----|
| `commands/orq-agent.md` (orchestrator) | Add Steps 7-9 (Deploy, Test, Iterate) after current Step 6 (Final Summary). Add `--mode` flag parsing for `core/deploy/test/full`. Add MCP availability detection. | New stages must be wired into the existing pipeline flow |
| `commands/help.md` | Add new commands and modes to help output | Users need to discover V2 capabilities |
| `commands/update.md` | Add MCP re-registration check on update | MCP server config may need refresh after updates |
| `install.sh` | Add capability selection prompt, API key collection, MCP server registration via `claude mcp add` | Modular install is a V2.0 requirement |
| `SKILL.md` | Add new agents, commands, and templates to the index | Skill index must reflect V2 additions |

### NEW (V2.0 Components)

| Component | Purpose | Location |
|-----------|---------|----------|
| `agents/deployer.md` | Subagent: reads agent specs, calls Orq.ai API to create/update agents | `orq-agent/agents/deployer.md` |
| `agents/tester.md` | Subagent: uploads datasets, creates evaluators, runs experiments, presents results | `orq-agent/agents/tester.md` |
| `agents/iterator.md` | Subagent: analyzes test results, proposes prompt changes, applies approved changes | `orq-agent/agents/iterator.md` |
| `commands/deploy.md` | Standalone deploy command for existing spec directories | `orq-agent/commands/deploy.md` |
| `commands/test.md` | Standalone test command for deployed agents | `orq-agent/commands/test.md` |
| `commands/iterate.md` | Standalone iterate command for prompt improvement | `orq-agent/commands/iterate.md` |
| `references/orqai-api-endpoints.md` | API endpoint reference for deployer/tester (paths, methods, request shapes) | `orq-agent/references/orqai-api-endpoints.md` |
| `references/orqai-evaluator-types.md` | Evaluator type reference for tester (6 types, config shapes) | `orq-agent/references/orqai-evaluator-types.md` |
| `templates/deploy-log.md` | Template for deployment audit trail | `orq-agent/templates/deploy-log.md` |
| `templates/test-results.md` | Template for test result presentation | `orq-agent/templates/test-results.md` |
| `templates/iteration-log.md` | Template for iteration audit trail | `orq-agent/templates/iteration-log.md` |

## Recommended Project Structure (V2.0)

```
orq-agent/
├── SKILL.md                              # MODIFIED — add V2 index entries
├── commands/
│   ├── orq-agent.md                      # MODIFIED — add V2 stages + mode flag
│   ├── prompt.md                         # UNCHANGED
│   ├── architect.md                      # UNCHANGED
│   ├── tools.md                          # UNCHANGED
│   ├── research.md                       # UNCHANGED
│   ├── datasets.md                       # UNCHANGED
│   ├── deploy.md                         # NEW — standalone deploy
│   ├── test.md                           # NEW — standalone test
│   ├── iterate.md                        # NEW — standalone iterate
│   ├── help.md                           # MODIFIED
│   └── update.md                         # MODIFIED
├── agents/
│   ├── architect.md                      # UNCHANGED
│   ├── tool-resolver.md                  # UNCHANGED
│   ├── researcher.md                     # UNCHANGED
│   ├── spec-generator.md                 # UNCHANGED
│   ├── orchestration-generator.md        # UNCHANGED
│   ├── dataset-generator.md              # UNCHANGED
│   ├── readme-generator.md              # UNCHANGED
│   ├── deployer.md                       # NEW
│   ├── tester.md                         # NEW
│   └── iterator.md                       # NEW
├── templates/
│   ├── agent-spec.md                     # UNCHANGED
│   ├── orchestration.md                  # UNCHANGED
│   ├── dataset.md                        # UNCHANGED (or minor eval format extension)
│   ├── readme.md                         # UNCHANGED
│   ├── tools.md                          # UNCHANGED
│   ├── deploy-log.md                     # NEW
│   ├── test-results.md                   # NEW
│   └── iteration-log.md                  # NEW
├── references/
│   ├── orqai-agent-fields.md             # UNCHANGED
│   ├── orqai-model-catalog.md            # UNCHANGED
│   ├── orchestration-patterns.md         # UNCHANGED
│   ├── naming-conventions.md             # UNCHANGED
│   ├── tool-catalog.md                   # UNCHANGED
│   ├── orqai-api-endpoints.md            # NEW — deploy/test API paths
│   └── orqai-evaluator-types.md          # NEW — evaluator types + config
└── install.sh                            # MODIFIED — modular install + MCP
```

### Structure Rationale

- **No new directories.** V2 components follow V1 conventions (agents in `agents/`, commands in `commands/`, etc.). This means no structural migration for existing users.
- **New subagents parallel existing ones.** Deployer, tester, and iterator follow the same pattern: markdown prompt file, spawned via Task tool, reads references via `<files_to_read>`, returns structured result.
- **New references are API-surface docs.** V1 references describe Orq.ai's agent configuration surface. V2 references describe Orq.ai's operational API surface (endpoints for CRUD, experiments, evaluators).

## Architectural Patterns

### Pattern 1: MCP-First with API Fallback

**What:** Subagents attempt operations via MCP tools first. If MCP is unavailable (not registered, server down, or operation not supported), fall back to REST API calls via Bash `curl`.

**When to use:** All V2 stages that interact with Orq.ai (deploy, test, iterate).

**Trade-offs:** MCP is the cleanest integration (native tool calls in Claude Code), but the Orq.ai MCP server currently focuses on docs access rather than full CRUD operations. The REST API via `curl` in Bash is always available as a fallback. This dual-path adds complexity to each subagent but ensures the pipeline works regardless of MCP server maturity.

**Implementation:**
```
Deployer subagent logic:
  1. Check: Is `orqai` MCP server registered? (Bash: claude mcp list)
  2. If YES: Attempt agent creation via MCP tool call
     - If MCP operation succeeds → record in deploy-log
     - If MCP operation fails → fall through to API
  3. If NO or fallback: Use Bash curl to POST /v2/agents
     - Read ORQ_API_KEY from environment or config
     - Parse spec markdown → extract JSON-compatible fields
     - POST to https://api.orq.ai/v2/agents
     - Record result in deploy-log
```

**MEDIUM confidence.** The Orq.ai MCP server at `docs.orq.ai/mcp` appears to be a docs-access server (read documentation), not a full platform CRUD server. The REST API (`/v2/agents`, `/v2/tools`, etc.) is well-documented and the more reliable path for V2.0. MCP-first remains the right long-term architecture because Orq.ai is likely to expand their MCP server capabilities, but **V2.0 should treat REST API as the primary path and MCP as an optional enhancement**.

### Pattern 2: Spec-as-Source-of-Truth for Deployment

**What:** The deployer reads the existing V1 agent spec markdown files (e.g., `agents/support-triage-agent.md`) and extracts field values to construct API requests. The spec IS the deployment manifest.

**When to use:** Every deployment operation.

**Trade-offs:** Avoids introducing a separate JSON manifest format. Non-technical users can still read and edit the markdown. The deployer needs a parsing layer to extract structured data from markdown, but the spec template is highly structured (tables, code blocks) making this reliable.

**Why this matters:** The V1 spec-generator already produces output in a format that mirrors the `/v2/agents` API request body. Field names match (`key`, `role`, `description`, `model`, `instructions`, `settings`). The deployer's job is extraction and mapping, not transformation.

```
V1 Agent Spec (.md)          →  Deployer Subagent  →  Orq.ai API
┌──────────────────┐            ┌───────────────┐      POST /v2/agents
│ Key: support-agent│  parse →  │ Extract fields│  →  { "key": "...",
│ Model: anthro/... │           │ Build JSON    │      "model": "...",
│ Instructions: ... │           │ POST to API   │      "instructions": "..."
│ Tools: [...]      │           │ Handle errors │      "settings": {...}  }
└──────────────────┘            └───────────────┘
```

### Pattern 3: Idempotent Deploy (Create-or-Update)

**What:** The deployer checks if an agent with the given key already exists in Orq.ai. If yes, update it (creating a new version). If no, create it. This makes `deploy` safe to re-run.

**When to use:** Every deployment.

**Trade-offs:** Requires a GET-before-POST pattern which adds one API call per agent. But it prevents duplicate agent creation and enables the iterate loop (change spec, re-deploy, re-test).

**Implementation:**
```
For each agent spec:
  1. GET /v2/agents/{agent_key}
     - 200: Agent exists → PUT /v2/agents/{agent_key} (update, new version)
     - 404: Agent not found → POST /v2/agents (create)
  2. Record version number from response
  3. Write to deploy-log.md: agent_key, version, timestamp, status
```

### Pattern 4: Dataset-Driven Testing via Evaluatorq

**What:** The tester subagent takes V1's generated datasets, uploads them to Orq.ai, creates evaluators, runs experiments against deployed agents, and presents results. Uses the `evaluatorq` SDK pattern (Node.js `@orq-ai/evaluatorq` or Python `evaluatorq`).

**When to use:** After successful deployment.

**Trade-offs:** Evaluatorq is the official testing framework. It supports Orq agents, deployments, and third-party frameworks. The SDK approach (running evaluatorq from Bash) is more reliable than raw API calls for experiment orchestration. However, it requires Node.js or Python to be installed (Node.js is already a prerequisite from V1 install).

**Implementation:**
```
Tester subagent logic:
  1. Read dataset files from Agents/[swarm]/datasets/
  2. Upload dataset to Orq.ai (API: POST /v2/datasets or use existing)
  3. Create evaluators matching spec's Evaluators section
     - LLM-as-Judge, JSON Schema, etc. per agent
  4. Run experiment via evaluatorq SDK:
     - Target: deployed agent key + version
     - Dataset: uploaded dataset ID
     - Evaluators: created evaluator IDs
  5. Poll for results / stream results
  6. Present results in test-results.md using template
  7. Return structured result to orchestrator with pass/fail per agent
```

### Pattern 5: Human-in-the-Loop Iteration

**What:** The iterator subagent analyzes test results, identifies underperforming areas, proposes specific prompt changes, and waits for user approval before applying. Each iteration is: analyze → propose → approve → update spec → re-deploy → re-test.

**When to use:** When test results show agents below quality thresholds (e.g., evaluator score < 0.8).

**Trade-offs:** The HITL approval gate prevents autonomous runaway iteration but adds latency. This is a deliberate design choice for a 5-15 user non-technical audience -- they need to understand and approve every change. The loop naturally terminates when all agents pass thresholds or after a configurable max iterations (default: 3).

```
Iterate loop:
  1. Iterator reads test-results.md
  2. Identifies agents below threshold
  3. Proposes changes:
     ┌──────────────────────────────────────────────┐
     │ PROPOSED CHANGES                              │
     │                                                │
     │ Agent: support-triage-agent                   │
     │ Score: 0.62 (threshold: 0.80)                 │
     │                                                │
     │ Change 1: Add edge case example for           │
     │   multi-language inputs to <examples>          │
     │ Change 2: Strengthen constraint about PII      │
     │   handling in <constraints>                    │
     │                                                │
     │ → "approve" to apply, describe changes to edit │
     └──────────────────────────────────────────────┘
  4. On approval:
     - Update agent spec .md file on disk
     - Re-deploy (deployer subagent)
     - Re-test (tester subagent)
     - Present new results
  5. Loop until all pass or max iterations reached
```

### Pattern 6: Modular Install with Capability Tiers

**What:** The install script presents capability tiers and only installs relevant V2 components based on selection. API key and MCP registration happen only when V2 features are selected.

**When to use:** Every install and update.

**Tiers:**
```
core   → V1 only (spec generation). No API key needed.
deploy → core + deployer. Requires API key.
test   → core + deploy + tester. Requires API key.
full   → core + deploy + test + iterate. Requires API key.
```

**Implementation:**
```bash
# Install script flow:
1. Prerequisite checks (Node.js, Claude Code)
2. Download and install V1 core files (always)
3. Prompt: "Select capability level: [core/deploy/test/full]"
4. If deploy+:
   a. Prompt for Orq.ai API key
   b. Store key in ~/.config/orq-agent/config (not in skill directory)
   c. Register MCP server: claude mcp add orqai -- npx -y mcp-remote https://docs.orq.ai/mcp
   d. Install V2 agent files (deployer.md, etc.)
   e. Install V2 reference files (api-endpoints.md, etc.)
   f. Install V2 template files (deploy-log.md, etc.)
5. Verify installation
```

## Data Flow — V2 Extension

### Extended Pipeline Flow

```
V1 Pipeline (UNCHANGED)
    │
    ▼
Step 6: Final Summary (V1 endpoint)
    │
    ▼ (NEW — V2 stages, only if mode >= deploy)
Step 7: Deploy
    │ Reads: Agents/[swarm]/agents/*.md (all agent specs)
    │ Reads: Agents/[swarm]/TOOLS.md (tool configurations)
    │ Calls: Orq.ai API POST/PUT /v2/agents per agent
    │ Calls: Orq.ai API POST /v2/tools per custom tool
    │ Writes: Agents/[swarm]/deploy-log.md
    │ Returns: deployed agent keys + versions
    │
    ▼ (only if mode >= test)
Step 8: Test
    │ Reads: Agents/[swarm]/datasets/*.md (test data)
    │ Reads: Agents/[swarm]/agents/*.md (evaluator config from specs)
    │ Calls: Orq.ai API for dataset upload, evaluator creation
    │ Calls: evaluatorq SDK for experiment execution
    │ Writes: Agents/[swarm]/test-results.md
    │ Returns: pass/fail per agent + scores
    │
    ▼ (only if mode == full AND any agent below threshold)
Step 9: Iterate (loop)
    │ Reads: Agents/[swarm]/test-results.md
    │ Reads: Agents/[swarm]/agents/[failing-agent].md
    │ Proposes: prompt changes (user approves)
    │ Modifies: Agents/[swarm]/agents/[agent].md on disk
    │ Re-runs: Step 7 (deploy) + Step 8 (test) for changed agents only
    │ Writes: Agents/[swarm]/iterations/iteration-N.md
    │ Writes: Agents/[swarm]/audit-trail.md (append)
    │ Loop until: all pass OR max iterations (default 3)
    │
    ▼
Step 10: Final V2 Summary
    │ Extends Step 6 with deployment status, test scores, iterations
    │ Updates: pipeline-run.json with V2 stage data
```

### Key V2 Data Flows

1. **Spec-to-API mapping.** The deployer extracts structured data from V1's markdown specs. The spec template was designed with Orq.ai API field alignment, so this is a parse-and-map operation, not a transform. Key fields: `key`, `model`, `instructions` (the full XML-tagged prompt), `settings.tools` (JSON blocks), `settings.max_iterations`, `settings.max_execution_time`.

2. **Dataset-to-experiment mapping.** V1's dataset generator produces test inputs and eval pairs. The tester maps these to Orq.ai's experiment format: each test input becomes an experiment row, each eval pair provides the expected output for evaluator comparison. The adversarial cases (30%+ of dataset) specifically test guardrails.

3. **Test-results-to-iteration feedback.** The iterator reads structured test results (per-agent scores, failing test cases, evaluator feedback) and correlates failures with specific prompt sections. For example, a low score on edge cases maps to the `<examples>` section; a low score on format compliance maps to `<output_format>`.

4. **Iteration audit trail.** Every change proposal, approval, and result is logged. The `iterations/` directory contains per-iteration snapshots. The `audit-trail.md` is an append-only log of all changes across iterations.

### API Key and Authentication Flow

```
Install time:
  User provides API key → stored in ~/.config/orq-agent/config

Runtime:
  Orchestrator reads config → passes key as env var to subagents
  Subagents use key in Bash curl -H "Authorization: Bearer $ORQ_API_KEY"
  Key NEVER written to output files (deploy-log, test-results, etc.)
```

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| **Orq.ai REST API** (`api.orq.ai`) | Bash `curl` from deployer/tester subagents. Bearer token auth. | Primary integration path. Well-documented. Supports agents, tools, datasets, experiments, evaluators, memory stores |
| **Orq.ai MCP Server** (`docs.orq.ai/mcp`) | Registered via `claude mcp add`. Accessed natively by Claude Code. | Currently docs-access focused. Monitor for CRUD expansion. Optional enhancement, not primary path |
| **evaluatorq SDK** (`@orq-ai/evaluatorq`) | Bash `npx evaluatorq` or Node.js script from tester subagent | Official evaluation framework. Supports Orq agents + third-party. Requires Node.js (already V1 prereq) |
| **Orq.ai Studio** (GUI) | V1 copy-paste path remains for users who prefer manual setup | V2 automates what V1 required manual Studio work for |

### Internal Boundaries (V2 Additions)

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Orchestrator → Deployer | Task() spawn with spec file paths + API key env var | Deployer returns structured deploy result (keys, versions, errors) |
| Orchestrator → Tester | Task() spawn with dataset paths + deployed agent keys | Tester returns structured test results (scores, pass/fail) |
| Orchestrator → Iterator | Task() spawn with test results path + spec paths | Iterator returns proposed changes, waits for HITL approval |
| Deployer → Orq.ai API | Bash curl. POST/PUT /v2/agents, POST /v2/tools | Subagent constructs curl commands, parses JSON responses |
| Tester → evaluatorq | Bash npx. Runs evaluatorq with config | Alternative: direct API calls if evaluatorq unavailable |
| Iterator → Deployer | Orchestrator re-spawns deployer for changed agents only | Not direct subagent-to-subagent; orchestrator mediates |

### MCP Server Boundary

The Orq.ai MCP server integration has two distinct concerns:

1. **Skill-level MCP (V2 install registers it).** This makes Orq.ai docs and potentially platform data available as tools to Claude Code during the pipeline run. Registered with `claude mcp add orqai -- npx -y mcp-remote https://docs.orq.ai/mcp`.

2. **Agent-level MCP (V1 spec generator already handles it).** Agent specs can include MCP tool configurations for the agents being designed. This is unchanged from V1 -- the tool-resolver and spec-generator already handle MCP tool recommendations.

These are separate concerns. (1) is about the skill's own integration with Orq.ai. (2) is about the agents the skill designs.

## Anti-Patterns

### Anti-Pattern 1: Generating a Separate JSON Deployment Manifest

**What people do:** Create a separate JSON file (e.g., `deploy.json`) from the markdown spec, then deploy from that JSON.
**Why it's wrong:** Two sources of truth. Spec and manifest drift apart. Users edit the markdown, forget to regenerate JSON, deploy stale config.
**Do this instead:** Parse the markdown spec directly at deploy time. The spec IS the manifest. One source of truth.

### Anti-Pattern 2: Storing API Keys in the Skill Directory

**What people do:** Save the Orq.ai API key in a config file inside `~/.claude/skills/orq-agent/`.
**Why it's wrong:** The skill directory gets overwritten on every update (`install.sh` does clean install). Key gets deleted. Also, the skill directory might be backed up or shared.
**Do this instead:** Store credentials in `~/.config/orq-agent/config` (XDG-style), separate from the skill installation. Install script checks for existing config and preserves it.

### Anti-Pattern 3: Autonomous Iteration Without Approval

**What people do:** Let the iterate loop run automatically: change prompts, re-deploy, re-test without human checkpoint.
**Why it's wrong:** For a non-technical audience of 5-15 users, unexpected changes are dangerous. Prompt changes affect agent behavior in production. Users need to understand what changed and why.
**Do this instead:** Every iteration requires explicit user approval. The iterator PROPOSES changes and explains rationale. User says "approved" or provides feedback. This mirrors V1's Blueprint Review checkpoint pattern.

### Anti-Pattern 4: Running All V2 Stages by Default

**What people do:** Always run deploy + test + iterate after spec generation.
**Why it's wrong:** Many users just want specs (V1 behavior). Requiring an API key and Orq.ai account for basic spec generation breaks V1 users. Deploy/test stages add significant time and require active Orq.ai infrastructure.
**Do this instead:** Mode flags with `core` as default. V1 behavior is preserved unless user explicitly opts into V2 stages. The `--mode` flag (or install-time capability selection) controls which stages run.

### Anti-Pattern 5: Deploying Multi-Agent Orchestration as Separate Agents Without Wiring

**What people do:** Deploy each agent independently and assume Orq.ai will wire them together.
**Why it's wrong:** Orq.ai's multi-agent orchestration requires explicit `team_of_agents` configuration on the orchestrator agent, with `retrieve_agents` and `call_sub_agent` tools. Deploying agents without the orchestrator config creates disconnected agents.
**Do this instead:** The deployer must deploy agents in dependency order: sub-agents first, orchestrator last. The orchestrator agent's `team_of_agents` array must reference the deployed sub-agent keys. Verify each sub-agent exists before deploying the orchestrator.

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 1-3 agent swarms | Deploy sequentially. Test each agent individually. Iterate is straightforward. Full pipeline in 5-10 minutes. |
| 4-8 agent swarms | Deploy in parallel (multiple curl calls). Test agents in parallel experiments. Iterate only failing agents. 10-20 minutes total. |
| 9+ agent swarms | Batch deployments (groups of 5). Stagger experiments to avoid API rate limits. Consider deploying and testing in phases rather than all-at-once. |

### Scaling Priorities

1. **First bottleneck: API rate limits.** Orq.ai API likely has rate limits on agent creation and experiment execution. The deployer should implement retry-with-backoff. Start sequential, parallelize only after confirming rate limits.
2. **Second bottleneck: Experiment execution time.** Each experiment involves running the agent against a full dataset. For large datasets or complex agents, this can take minutes per agent. The tester should run experiments in parallel where possible and stream results.

## Build Order (V2.0 Dependencies)

```
Phase 1: Research & References (no code dependencies)
    │  Update agentic framework research in existing references
    │  Create orqai-api-endpoints.md (API paths, methods, request shapes)
    │  Create orqai-evaluator-types.md (6 evaluator types, config)
    │  Create V2 templates (deploy-log.md, test-results.md, iteration-log.md)
    │
Phase 2: Deployer Subagent (depends on: API reference, V1 spec format)
    │  agents/deployer.md — spec parsing + API calls + idempotent create/update
    │  commands/deploy.md — standalone deploy command
    │  Test with: manually deploy one existing V1 spec to Orq.ai
    │
Phase 3: Tester Subagent (depends on: deployer working, evaluator reference)
    │  agents/tester.md — dataset upload + evaluator creation + experiment run
    │  commands/test.md — standalone test command
    │  Test with: run evaluatorq against a deployed agent from Phase 2
    │
Phase 4: Iterator Subagent (depends on: tester producing results)
    │  agents/iterator.md — result analysis + change proposal + HITL approval
    │  commands/iterate.md — standalone iterate command
    │  Test with: propose changes to a low-scoring agent, re-deploy, re-test
    │
Phase 5: Install Script Modification (depends on: all V2 subagents exist)
    │  Modular capability selection (core/deploy/test/full)
    │  API key collection + secure storage
    │  MCP server registration
    │  Test with: fresh install with each capability tier
    │
Phase 6: Orchestrator Integration (depends on: all V2 subagents + install)
    │  Add Steps 7-9 to commands/orq-agent.md
    │  Add --mode flag parsing
    │  Add MCP availability detection
    │  Wire V2 subagents into pipeline
    │  Test with: full end-to-end run (brief → spec → deploy → test → iterate)
    │
Phase 7: Polish & Documentation
    │  Update SKILL.md index
    │  Update help.md
    │  Update README for GitHub
    │  Audit trail verification
    │  Edge case handling (API failures, partial deploys, etc.)
```

**Critical path:** API Reference → Deployer → Tester → Iterator → Orchestrator Integration. Each V2 stage depends on the previous stage's output being available. The install script modification can happen in parallel with Phase 3-4 since it is structurally independent.

**Why standalone commands before orchestrator integration:** Each V2 subagent should be testable independently (`/orq-agent:deploy`, `/orq-agent:test`, `/orq-agent:iterate`) before being wired into the full pipeline. This mirrors V1's development where standalone commands (`/orq-agent:architect`, `/orq-agent:research`, etc.) were built and tested before the orchestrator was assembled.

## Sources

- [Orq.ai Agent API Documentation](https://docs.orq.ai/docs/agents/agent-api) -- Agent CRUD endpoints, versioning, invocation
- [Orq.ai Evaluator Introduction](https://docs.orq.ai/docs/evaluator) -- 6 evaluator types, experiment integration
- [Orq.ai Experiments Platform](https://orq.ai/platform/experiment) -- SDK-driven experiment execution
- [Orq.ai Deployment Documentation](https://docs.orq.ai/docs/deployment) -- Deployment vs Agent distinction
- [Orq.ai Release 4.1 Changelog](https://docs.orq.ai/changelog/release-4-1) -- evaluatorq SDK, experiment improvements
- [Orq.ai MCP Documentation](https://docs.orq.ai/docs/common-architecture/mcp) -- MCP server setup
- [orq-ai/orq-python GitHub](https://github.com/orq-ai/orq-python) -- Python SDK for platform operations
- [orq-ai/orqkit GitHub](https://github.com/orq-ai/orqkit) -- evaluatorq open-source framework
- [orq-ai/orq-node GitHub](https://github.com/orq-ai/orq-node) -- Node.js SDK
- [Orq.ai PyPI Package](https://pypi.org/project/orq-ai-sdk/) -- Python SDK installation

---
*Architecture research for: Orq Agent Designer V2.0 Autonomous Pipeline*
*Researched: 2026-03-01*
