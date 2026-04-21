---
name: orq-agent
description: Generate complete, copy-paste-ready Orq.ai Agent specifications with orchestration logic from use case descriptions
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, WebSearch, WebFetch, Task
---

# orq-agent

Generate complete, copy-paste-ready Orq.ai Agent specifications with orchestration logic from use case descriptions.

## Constraints

- **NEVER** rename this file, any command file, or any subagent file — slash-command routing depends on these exact paths
- **NEVER** add files to `orq-agent/references/` with fewer than 2 consumer skills — single-consumer docs go in `<skill>/resources/`
- **ALWAYS** load this SKILL.md when any `/orq-agent*` command runs (it declares the skill suite's directory layout, profile rules, and shared conventions)
- **ALWAYS** cross-check new skill files against `orq-agent/scripts/lint-skills.sh` before committing — the lint is the SKST-01..10 acceptance test

**Why these constraints:** The skill suite depends on fixed file paths for slash-command routing; misplacing shared vs single-consumer references breaks the invariant the lint enforces; not running lint lets drift accumulate silently; skipping SKILL.md as context makes every command behave as if the suite's conventions don't exist.

## When to use

- Claude loads this file as context for every `/orq-agent*` command (the suite's entry point)
- Users want to understand the skill suite's scope, command inventory, or directory layout
- Contributors to Phases 36-43 need to confirm the SKST format conventions before adding new skills

## When NOT to use

- User wants to use a non-Orq.ai agent platform → no orq-agent skill applies
- User wants to invoke a specific command → use that command's SKILL file (`orq-agent/commands/<name>.md`) directly, not this index
- User wants to read a shared reference → use `orq-agent/references/<name>.md` directly

## Companion Skills

Directional pipeline (→ means "typical next step"):

- → `/orq-agent:architect` (blueprint creation) → `/orq-agent:tools` (tool resolution) → `/orq-agent:research` (model + pattern research) → `/orq-agent` (full pipeline: specs + orchestration + datasets + README) → `/orq-agent:deploy` → `/orq-agent:test` → `/orq-agent:iterate` → `/orq-agent:harden`
- Lateral entry points: `/orq-agent:prompt` (single-agent fast path), `/orq-agent:architect` (blueprint-only), `/orq-agent:datasets`, `/orq-agent:kb`, `/orq-agent:research`, `/orq-agent:tools`
- Meta-commands: `/orq-agent:systems`, `/orq-agent:set-profile`, `/orq-agent:update`, `/orq-agent:help`

## Done When

- [ ] All 15 slash commands under `orq-agent/commands/` match the commands listed in the body below
- [ ] All 17 subagents under `orq-agent/agents/` match the subagents listed in the body below
- [ ] All 8 shared references under `orq-agent/references/` have ≥2 consumer skills (verified by `bash orq-agent/scripts/lint-skills.sh --rule references-multi-consumer`)
- [ ] `bash orq-agent/scripts/lint-skills.sh` exits 0 across the full suite

## Destructive Actions

- **N/A at the suite level** — individual commands and subagents declare their own Destructive Actions sections. This index file makes no mutations; it is loaded as context only.

## Directory Structure

```
orq-agent/
  SKILL.md                       # This file -- skill index
  systems.md                     # User-configurable IT systems registry
  commands/
    orq-agent.md                 # Phase 3: Orchestrator slash command
    prompt.md                    # Quick single-agent spec generator
    architect.md                 # Standalone architect command
    tools.md                     # Standalone tool resolver command
    research.md                  # Standalone researcher command
    datasets.md                  # Standalone dataset generator command
    deploy.md                    # Phase 5: Deploy to Orq.ai (requires deploy+ tier)
    kb.md                        # KB management: generate, provision, upload
    test.md                      # Phase 5: Automated testing (requires test+ tier)
    iterate.md                   # Phase 5: Prompt iteration (requires full tier)
    harden.md                    # Phase 9: Guardrails and quality gates (requires full tier)
    set-profile.md               # Phase 5: Model profile management
    workspace.md                 # Phase 36: Single-screen workspace overview (LCMD-01)
    traces.md                    # Phase 36: Production traces query (LCMD-02)
    analytics.md                 # Phase 36: Analytics summary (LCMD-03)
    models.md                    # Phase 36: Model Garden lookup (LCMD-04)
    quickstart.md                # Phase 36: 12-step onboarding tour (LCMD-05 + LCMD-07)
    automations.md               # Phase 36: Trace Automations list + create (LCMD-06)
    observability.md             # Phase 37: LLM instrumentation setup (OBSV-01..07)
    observability/
      resources/
        openai-sdk.md            # Phase 37: OpenAI SDK integration snippet
        langchain.md             # Phase 37: LangChain integration snippet
        crewai.md                # Phase 37: CrewAI integration snippet
        vercel-ai.md             # Phase 37: Vercel AI SDK integration snippet
        generic-otel.md          # Phase 37: Generic OpenTelemetry snippet
    trace-failure-analysis.md    # Phase 38: Trace failure analysis skill (TFAIL-01..06)
    trace-failure-analysis/
      resources/
        grounded-theory-methodology.md  # Phase 38: Open + axial coding + first-upstream rule
        failure-mode-classification.md  # Phase 38: 4-category decision rules
        handoff-matrix.md                # Phase 38: Classification → next skill mapping
  agents/
    architect.md                 # Phase 1: Architect subagent
    tool-resolver.md             # Phase 4.2: Tool resolver subagent
    researcher.md                # Phase 2: Domain researcher subagent
    spec-generator.md            # Phase 2: Spec generator subagent (includes tool schemas)
    orchestration-generator.md   # Phase 2: Orchestration generator subagent
    dataset-generator.md         # Phase 2: Dataset generator subagent
    readme-generator.md          # Phase 2: README generator subagent
    kb-generator.md              # KB content generation from pipeline context
    hardener.md                  # Phase 9: Guardrails promotion and quality gates
  templates/
    agent-spec.md                # Template: individual agent specification
    orchestration.md             # Template: swarm orchestration document
    dataset.md                   # Template: test dataset with adversarial cases
    readme.md                    # Template: swarm README for non-technical users
    tools.md                     # Template: tool landscape and per-agent assignments
    test-results.json            # Phase 5: V2.0 test results template (JSON)
    iteration-log.json           # Phase 5: V2.0 iteration audit template (JSON)
    quality-report.json          # Phase 9: Quality gate results template (JSON)
  references/
    orqai-agent-fields.md        # Orq.ai v2 API field reference (18 fields, 15 tool types)
    orqai-model-catalog.md       # Model catalog by use case (14 providers, 12 models)
    orchestration-patterns.md    # Three orchestration patterns with complexity gate
    naming-conventions.md        # Agent key naming rules with regex validation
    tool-catalog.md              # Unified tool catalog (built-in + MCP + HTTP/function patterns)
    agentic-patterns.md          # Phase 5: Anthropic composable patterns + context engineering
    orqai-api-endpoints.md       # Phase 5: REST API endpoint reference for V2.0 subagents
    orqai-evaluator-types.md     # Phase 5: Evaluator taxonomy for automated testing
  .orq-agent/
    config.json                  # Capability tier + model profile settings
```

## Output Directory Convention

Generated swarms are written to the following structure:

```
Agents/[swarm-name]/
  TOOLS.md                       # Tool landscape and per-agent assignments (always generated)
  ORCHESTRATION.md               # Swarm orchestration document (multi-agent only)
  agents/
    [agent-name].md              # Per-agent specification
  datasets/
    [agent-name]-dataset.md      # Per-agent test data with adversarial cases
  README.md                      # Setup guide for non-technical users
```

- `[swarm-name]` matches the domain portion of agent keys (e.g., `customer-support`)
- Single-agent swarms omit ORCHESTRATION.md; all files are markdown

## Commands

### Orchestrator

| Command | File | Purpose |
|---------|------|---------|
| `/orq-agent` | `commands/orq-agent.md` | Main orchestrator -- accepts use case descriptions, runs structured discussion, enriches input, runs adaptive pipeline (Architect -> Tool Resolver -> Researcher -> Spec Generator -> Post-Generation), produces complete swarm specs |
| `/orq-agent:update` | `commands/update.md` | Check for and install updates from GitHub |
| `/orq-agent:prompt` | `commands/prompt.md` | Quick single-agent spec generator -- skips full pipeline, asks 2-3 questions inline, spawns spec-generator directly |
| `/orq-agent:architect` | `commands/architect.md` | Standalone architect -- designs swarm blueprint from use case description |
| `/orq-agent:tools` | `commands/tools.md` | Standalone tool resolver -- resolves tool needs and produces TOOLS.md |
| `/orq-agent:research` | `commands/research.md` | Standalone researcher -- investigates domain best practices for agent roles |
| `/orq-agent:datasets` | `commands/datasets.md` | Standalone dataset generator -- produces dual test datasets (clean + edge) |
| `/orq-agent:help` | `commands/help.md` | Show available commands, usage examples, and version |

### V2.0 Commands (Phase 5+)

| Command | File | Tier Required | Purpose |
|---------|------|---------------|---------|
| `/orq-agent:deploy` | `commands/deploy.md` | deploy+ | Deploy agent specs to Orq.ai via MCP (V1.0 fallback: copy-paste steps) |
| `/orq-agent:kb` | `commands/kb.md` | deploy+ | Manage KBs -- generate content, provision, upload files |
| `/orq-agent:test` | `commands/test.md` | test+ | Run automated tests against deployed agents (V1.0 fallback: manual steps) |
| `/orq-agent:iterate` | `commands/iterate.md` | full | Iterate on prompts using evaluator feedback (V1.0 fallback: manual steps) |
| `/orq-agent:harden` | `commands/harden.md` | full | Set up guardrails and quality gates from test results |
| `/orq-agent:set-profile` | `commands/set-profile.md` | any | View or change model profile (quality/balanced/budget) |
| `/orq-agent:systems` | `commands/systems.md` | any | Manage IT systems registry (list, add, remove) |

### Phase 36 (Lifecycle Slash Commands)

| Command | File | Tier Required | Purpose |
|---------|------|---------------|---------|
| `/orq-agent:workspace` | `commands/workspace.md` | any | Single-screen Orq.ai workspace overview -- agents / deployments / prompts / datasets / experiments / projects / KBs / evaluators + analytics summary |
| `/orq-agent:traces` | `commands/traces.md` | any | Query production traces; errors first; supports `--deployment / --status / --last / --limit` + `--identity` stub (Phase 37) |
| `/orq-agent:analytics` | `commands/analytics.md` | any | Requests / cost / tokens / error-rate summary with `--last` and `--group-by model\|deployment\|agent\|status` |
| `/orq-agent:models` | `commands/models.md` | any | List Model Garden models grouped by provider × type (chat / embedding / image / rerank / speech / completion) |
| `/orq-agent:quickstart` | `commands/quickstart.md` | any | 12-step interactive onboarding tour covering the full Build → Evaluate → Optimize lifecycle |
| `/orq-agent:automations` | `commands/automations.md` | any | List / create Orq.ai Trace Automation rules (auto-kick-off experiments on matching traces) |

### Phase 37 (Observability)

| Command | File | Tier Required | Purpose |
|---------|------|---------------|---------|
| `/orq-agent:observability` | `commands/observability.md` | any | Instrument LLM application for Orq.ai trace capture -- framework detection (OBSV-01), mode recommendation AI Router / OTEL / both (OBSV-02), integration codegen with instrumentors-before-SDK ordering (OBSV-03), baseline verification script with PII scan (OBSV-04), trace enrichment session_id / user_id / customer_id (OBSV-05), @traced decorators for 6 span types agent/llm/tool/retrieval/embedding/function (OBSV-06), per-tenant identity attribution + filter via `/orq-agent:traces --identity` (OBSV-07) |

**`/orq-agent:observability` requirement coverage:**

- OBSV-01 — Framework detection via import-pattern grep (OpenAI, LangChain, CrewAI, Vercel AI, generic OTEL); see `commands/observability.md` Step 1.
- OBSV-02 — Mode recommendation (AI Router / OTEL-only / both); default AI Router when an Orq.ai-supported SDK is already in use.
- OBSV-03 — Framework-specific integration codegen with instrumentors-BEFORE-SDK import ordering; snippets live in `commands/observability/resources/`.
- OBSV-04 — Baseline verification script emitted locally (trace appears, model + tokens captured, PII scan warning); skill never uploads test scripts to production.
- OBSV-05 — Trace enrichment walkthrough for `session_id` / `user_id` / `customer_id` / feature tags.
- OBSV-06 — `@traced` decorator examples for the 6 canonical span types: agent / llm / tool / retrieval / embedding / function.
- OBSV-07 — Per-tenant identity attribution (`setIdentity({...})`) + `/orq-agent:traces --identity` filter pass-through (wired live in Plan 03 of Phase 37).

Resource snippets under `orq-agent/commands/observability/resources/` are consumed only by `commands/observability.md` (single-consumer; see Resources Policy below).

### Phase 38 (Trace Failure Analysis)

| Command | File | Tier Required | Purpose |
|---------|------|---------------|---------|
| `/orq-agent:trace-failure-analysis` | `commands/trace-failure-analysis.md` | deploy+ | Turn ~100 production traces into a 4-8 mode failure taxonomy via grounded-theory coding — mixed 50/30/20 sampling (TFAIL-01), open + axial coding (TFAIL-02), first-upstream-failure labeling (TFAIL-03), transition matrix for multi-step pipelines (TFAIL-04), 4-category classification specification/generalization-code-checkable/generalization-subjective/trivial-bug (TFAIL-05), error-analysis report with handoff recommendations (TFAIL-06) |

**`/orq-agent:trace-failure-analysis` requirement coverage:**

- TFAIL-01 — Mixed sampling: 50% random + 30% failure-driven + 20% outliers targeting ~100 traces; sampling plan recorded in the final report.
- TFAIL-02 — Open coding (freeform per-trace annotations) then axial coding clustering annotations into 4-8 non-overlapping failure modes; saturation heuristic stops open coding when two consecutive batches yield no new themes.
- TFAIL-03 — First-upstream-failure rule: label ONLY the first span in topological order whose output fails its criterion; cascade children carry `cascade-of: <parent_mode>`.
- TFAIL-04 — Transition failure matrix (rows = last success, columns = first failure) for multi-step pipelines; skipped with explicit note for single-step pipelines.
- TFAIL-05 — Mutually-exclusive classification of every mode into specification / generalization-code-checkable / generalization-subjective / trivial-bug.
- TFAIL-06 — `error-analysis-YYYYMMDD-HHMM.md` report with taxonomy, rates, 3 example trace IDs per mode, transition matrix, and per-mode handoff (to `/orq-agent:prompt`, `/orq-agent:harden`, or developer fix).

Resource docs under `orq-agent/commands/trace-failure-analysis/resources/` (grounded-theory methodology, failure-mode classification, handoff matrix) are consumed only by `commands/trace-failure-analysis.md` (single-consumer; see Resources Policy below).

**Invocation:** `/orq-agent "description"` | `/orq-agent` (interactive) | `--gsd` flag | `--output <path>`

## Command Flags

| Flag | Commands | Purpose |
|------|----------|---------|
| `--agent {key}` | deploy, test, iterate, harden | Scope operation to a single agent (+ tool dependencies for deploy) |
| `--all` | test, iterate, harden | Explicitly run on all agents in swarm |
| `--gsd` | orq-agent | Run in GSD mode |
| `--output <path>` | orq-agent | Override default output directory |

## Subagents

### Phase 1 (Foundation)

| Agent | File | Purpose |
|-------|------|---------|
| Architect | `agents/architect.md` | Analyzes use cases, applies complexity gate, produces swarm blueprints |

### Phase 2 (Core Generation)

| Agent | File | Purpose |
|-------|------|---------|
| Researcher | `agents/researcher.md` | Investigates domain best practices, produces research briefs with model/prompt/tool/guardrail recommendations |
| Spec Generator | `agents/spec-generator.md` | Fills agent-spec template with all Orq.ai fields including full system prompts and tool schemas |
| Orchestration Generator | `agents/orchestration-generator.md` | Creates ORCHESTRATION.md with agent-as-tool assignments, data flow, Mermaid diagrams, error handling |
| Dataset Generator | `agents/dataset-generator.md` | Produces dual datasets (clean + edge case) with eval pairs and multi-model comparison matrices |
| README Generator | `agents/readme-generator.md` | Generates per-swarm README with setup instructions for non-technical users |

### Phase 4.2 (Tool Resolution)

| Agent | File | Purpose |
|-------|------|---------|
| Tool Resolver | `agents/tool-resolver.md` | Resolves tool needs per agent by consulting curated catalog and web search, produces TOOLS.md with verified Orq.ai-native configs |

### Phase 8 (Prompt Iteration)

| Agent | File | Purpose |
|-------|------|---------|
| Iterator | `agents/iterator.md` | Analyzes test failures, proposes targeted prompt changes with diff-style views, collects per-agent approval, orchestrates re-deploy/re-test cycle with holdout validation |

### Phase 5 (KB Management)

| Agent | File | Purpose |
|-------|------|---------|
| KB Generator | `agents/kb-generator.md` | Generates KB-ready documents from pipeline context or domain templates |

### Phase 9 (Guardrails)

| Agent | File | Purpose |
|-------|------|---------|
| Hardener | `agents/hardener.md` | Analyzes test results, suggests guardrails for promotion, collects approval, attaches to deployed agents, generates quality gate reports |

## References

| File | Purpose |
|------|---------|
| `orqai-agent-fields.md` | All 18 Orq.ai v2 API fields and 15 tool types with configuration JSON |
| `orqai-model-catalog.md` | 14 providers with format patterns, 12 curated models across 5 use cases |
| `orchestration-patterns.md` | Single, sequential, and parallel patterns with selection criteria and complexity gate |
| `naming-conventions.md` | `[domain]-[role]-agent` convention, regex validation, 12 valid and 7 invalid examples |
| `tool-catalog.md` | Unified catalog: built-in tools, 21 MCP servers, HTTP/function patterns with resolution priority chain |
| `agentic-patterns.md` | Anthropic composable patterns mapped to Orq.ai equivalents |
| `orqai-api-endpoints.md` | REST API endpoints for V2.0 deploy/test/iterate subagents |
| `orqai-evaluator-types.md` | Evaluator taxonomy: 3 built-in categories + 4 custom types |

## Capability Tiers

Installed via `install.sh`. Config stored at `.orq-agent/config.json`.

| Tier | Capabilities | Commands |
|------|-------------|----------|
| core | Spec generation | `/orq-agent` |
| deploy | + Deployment | `/orq-agent:deploy` |
| test | + Automated testing | `/orq-agent:test` |
| full | + Prompt iteration + Hardening | `/orq-agent:iterate`, `/orq-agent:harden` |

- Default profile: **quality** (best output out-of-the-box)
- Change profile: `/orq-agent:set-profile [quality|balanced|budget]`
- V2.0 commands check MCP availability; fall back to V1.0 copy-paste output when MCP unavailable

## V2.0 Runtime Dependencies

Packages required by V2.0 subagents at runtime. Not installed by `install.sh` (which only copies files) — subagents ensure availability at execution time.

| Package | Version | Purpose | Tier Required |
|---------|---------|---------|---------------|
| `@orq-ai/node` | latest | Orq.ai SDK — used for `deployments.invoke()` with modelId override (A/B testing). Env: `ORQ_API_KEY` | deploy+ |
| `@orq-ai/evaluatorq` | `^1.1.0` | Experiment execution framework (Effect-based parallel evaluations) | test+ |
| `@orq-ai/evaluators` | `^1.1.0` | Local evaluator scorers (peer dep of evaluatorq — cosine similarity, threshold evaluators) | test+ |

> **Note:** `@orq-ai/evaluatorq` also declares peer dependencies on `@opentelemetry/*` packages for tracing. These are optional — evaluatorq works without them but npm may issue warnings.
>
> **SDK vs REST vs MCP:** The SDK is used for `deployments.invoke()` with modelId override. Agent CRUD uses MCP tools. Experiments and dataset uploads use REST via curl. See `orqai-api-endpoints.md` for the full pattern.

## Templates

| File | Purpose |
|------|---------|
| `agent-spec.md` | Template for individual agent specs with all Orq.ai fields and tool subsections |
| `orchestration.md` | Template for swarm orchestration docs with setup steps and data flow |
| `dataset.md` | Template for test datasets requiring 30% adversarial cases minimum |
| `readme.md` | Template for swarm READMEs with non-technical setup instructions |
| `tools.md` | Template for TOOLS.md output with capability-first organization and per-agent config JSON |
| `test-results.json` | V2.0 test results template (JSON) |
| `iteration-log.json` | V2.0 iteration audit log template (JSON) |
| `quality-report.json` | V2.0 quality gate results template (JSON) |

## Distribution

- **Install:** `curl -sfL https://raw.githubusercontent.com/NCrutzen/orqai-agent-pipeline/main/install.sh | bash`
- **Update:** `/orq-agent:update` (version-aware, shows changelog, auto-rollback)
- **Location:** Installed to `~/.claude/skills/orq-agent/`
- **GSD integration:** Use `--gsd` flag when invoking from a GSD phase
- **Custom output:** Use `--output <path>` to override default `./Agents/` directory

## Key Design Decisions

- **Complexity gate:** Architect defaults to single-agent; each extra agent requires justification
- **Reference files under 1000 words:** Preserves subagent context window for reasoning
- **Discussion-first flow:** Structured discussion enriches input before architect runs
- **Only researcher is skippable:** Internal decision after discussion, not user-facing
- **Wave-based parallelism:** Research -> spec generation -> post-generation, parallel within waves
- **Lean orchestrator:** Passes file paths to subagents, not full content
- **Tool resolver always runs:** Resolves tools from blueprint even when researcher skipped
- **TOOLS.md is authoritative:** Spec generator and researcher defer to TOOLS.md for tool selection
- **MCP-first V2.0:** Deploy/test/iterate use MCP when available, V1.0 copy-paste fallback otherwise
- **Clean install:** Always overwrite from GitHub; no user customization preservation
- **`--gsd` flag is a hint:** Skill works standalone without GSD installed

## User Configuration

| File | Purpose | Managed By |
|------|---------|------------|
| `systems.md` | IT systems your agents interact with (integration methods, URLs, auth) | User |
| `.orq-agent/config.json` | Capability tier, model profile, API key | Installer |

## Resources Policy

Skill documentation lives in two places. The placement rule is driven by consumer count:

- **`orq-agent/references/`** — Shared references consumed by 2+ skills. All 8 current files (`agentic-patterns.md`, `naming-conventions.md`, `orchestration-patterns.md`, `orqai-agent-fields.md`, `orqai-api-endpoints.md`, `orqai-evaluator-types.md`, `orqai-model-catalog.md`, `tool-catalog.md`) are multi-consumer (verified 2026-04-20 — see `.planning/phases/34-skill-structure-format-foundation/34-RESEARCH.md` Reference Consumer Graph).

- **`<skill>/resources/`** — Single-consumer long-form docs. When a V3.0 skill (Phases 36-43) has reference content used by exactly one skill, that skill creates its own `resources/` subdirectory instead of adding to the flat `references/` directory.

**Invariant (enforced by lint):** Every file under `orq-agent/references/` MUST be consumed by ≥2 skills. The `references-multi-consumer` rule in `orq-agent/scripts/lint-skills.sh` enforces this. If a file drops to 1 consumer, the lint fails and the file must move to that consumer's `<skill>/resources/`.

**Migration status:** No existing references qualify for migration (all 8 have ≥2 consumers). Phase 37 established the first live per-skill resources directory at `orq-agent/commands/observability/resources/` (5 framework snippets consumed only by `observability.md`). Phase 38 adds a second at `orq-agent/commands/trace-failure-analysis/resources/` (3 files: grounded-theory-methodology, failure-mode-classification, handoff-matrix — consumed only by `trace-failure-analysis.md`). Phases 39-43 will create additional per-skill `resources/` directories on demand when single-consumer content appears.

## Anti-Patterns

| Pattern | Do Instead |
|---------|-----------|
| Treating `orq-agent/` as loose scripts | Every command and subagent is a skill — follow the SKILL.md format conventions |
| Pre-creating empty `<skill>/resources/` directories | YAGNI — create on demand when single-consumer content actually appears |
| Adding a new file to `orq-agent/references/` without ≥2 consumers | Place it in the single consumer's `<skill>/resources/` instead; lint enforces this |
| Duplicating content between `references/` and a skill body | Reference the shared file via `orq-agent/references/<name>.md` — do not inline |
| Writing `allowed-tools:` into subagent frontmatter | Subagents use `tools:` (Claude Code schema); `allowed-tools:` is a no-op on subagents |

## Open in orq.ai

- **Agent Studio:** https://my.orq.ai/agents
- **Deployments:** https://my.orq.ai/deployments
- **Experiments:** https://my.orq.ai/experiments
- **Traces:** https://my.orq.ai/traces

## Documentation & Resolution

When skill content conflicts with live API behavior or official docs, trust the source higher in this list:

1. **orq MCP tools** — query live data first (`search_entities`, `get_agent`, `models-list`); API responses are authoritative.
2. **orq.ai documentation MCP** — use `search_orq_ai_documentation` or `get_page_orq_ai_documentation`.
3. **Official docs** — browse https://docs.orq.ai directly.
4. **This skill file** — may lag behind API or docs changes.
