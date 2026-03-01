# Roadmap: Orq Agent Designer

## Overview

Build a Claude Code skill that transforms natural language use case descriptions into complete Orq.ai agent swarm specifications, then autonomously deploys, tests, iterates, and hardens them via the Orq.ai MCP server and API. The build progresses from foundational knowledge through core generation, orchestration, distribution, and finally a fully autonomous deployment-to-iteration pipeline.

## Version Milestones

| Version | Milestone | Status |
|---------|-----------|--------|
| **V1.0** | Core Pipeline — generate complete agent swarm specs from natural language | **Complete** |
| **V2.0** | Autonomous Orq.ai Pipeline — deploy, test, iterate, and harden agent swarms via MCP/API | In progress |
| **V2.1** | Automated KB Setup — provision vector stores and ingestion pipelines (Supabase or user-chosen RAG DB) | Planned |
| **V3.0** | Browser Automation — Playwright scripts or natural language browser instructions | Planned |

---

## V1.0 — Core Pipeline (COMPLETE)

**Ship date:** 2026-02-26
**Value:** Given any use case description, produce correct, complete, copy-paste-ready Orq.ai Agent specs with orchestration logic that a non-technical colleague can set up in Orq.ai Studio.

### Phases

- [x] **Phase 1: Foundation** — References, templates, and architect subagent with complexity gate (completed 2026-02-24)
- [x] **Phase 2: Core Generation Pipeline** — Research, spec generation, orchestration, tool schemas, and dataset subagents (completed 2026-02-24)
- [x] **Phase 3: Orchestrator and Adaptive Pipeline** — Orchestrator workflow wiring all subagents with adaptive input depth (completed 2026-02-24)
- [x] **Phase 4: Distribution** — Claude Code plugin packaging, install script, update command, and GSD integration (completed 2026-02-24)
- [x] **Phase 04.1: Discussion Step** — Structured discussion that surfaces gray areas before architect runs (completed 2026-02-24)
- [x] **Phase 04.2: Tool Selection & MCP Servers** — Tool resolver and unified tool catalog (completed 2026-02-24)
- [x] **Phase 04.3: Prompt Strategy** — XML-tagged, heuristic-first agent instructions with Anthropic context engineering patterns (completed 2026-02-24)
- [x] **Phase 04.4: KB-Aware Pipeline** — Discussion, researcher, and spec generator all KB-aware end-to-end (completed 2026-02-26)

### V1.0 Phase Details

<details>
<summary>Phase 1: Foundation</summary>

**Goal**: Establish the knowledge base and architect subagent so the pipeline has something to reference and a blueprint to work from
**Depends on**: Nothing (first phase)
**Requirements**: ARCH-01, ARCH-02, ARCH-03, ARCH-04, SPEC-10, OUT-01, OUT-02, OUT-04
**Success Criteria** (what must be TRUE):
  1. Architect subagent accepts a use case description and produces a blueprint specifying agent count, roles, responsibilities, and orchestration pattern
  2. Architect subagent defaults to single-agent design for simple use cases and requires justification for each additional agent (complexity gate)
  3. Architect subagent identifies which agents should be tools of an orchestrator agent when multi-agent patterns are needed
  4. Reference files exist for all Orq.ai agent fields, model catalog, orchestration patterns, and naming conventions
  5. Output templates exist for agent spec, orchestration doc, dataset, and README file types following the directory structure convention

Plans:
- [x] 01-01-PLAN.md — Orq.ai reference files (agent fields, model catalog, orchestration patterns, naming conventions)
- [x] 01-02-PLAN.md — Output templates (agent spec, orchestration, dataset, README)
- [x] 01-03-PLAN.md — Architect subagent with complexity gate and blueprint output
</details>

<details>
<summary>Phase 2: Core Generation Pipeline</summary>

**Goal**: Build all generation subagents so the pipeline can produce complete, quality-gated Orq.ai agent specs, orchestration docs, tool schemas, and datasets
**Depends on**: Phase 1
**Requirements**: RSRCH-01, RSRCH-02, RSRCH-03, SPEC-01, SPEC-02, SPEC-03, SPEC-04, SPEC-05, SPEC-06, SPEC-07, SPEC-08, SPEC-09, SPEC-11, SPEC-12, ORCH-01, ORCH-02, ORCH-03, ORCH-04, ORCH-05, TOOL-01, TOOL-02, TOOL-03, TOOL-04, DATA-01, DATA-02, DATA-03, DATA-04, OUT-03
**Success Criteria** (what must be TRUE):
  1. Domain researcher subagent investigates best practices per agent role (model selection, prompt patterns, tools, guardrails, context) and is skippable when input is detailed
  2. Spec generator subagent produces a complete agent `.md` file with all Orq.ai fields that a non-technical user can copy-paste into Orq.ai Studio
  3. Orchestration generator produces an `ORCHESTRATION.md` documenting agent-as-tool assignments, data flow, error handling, and human-in-the-loop decision points
  4. Tool schema generator produces valid JSON Schema definitions for function tools, recommends built-in tools, and identifies HTTP/Python/MCP tool needs
  5. Dataset generator produces test inputs, eval pairs, and multi-model comparison matrices with at least 30% adversarial/messy cases

Plans:
- [x] 02-01-PLAN.md — Domain researcher subagent with web search and structured research briefs
- [x] 02-02-PLAN.md — Spec generator subagent with all Orq.ai fields, tool schemas, and self-validation
- [x] 02-03-PLAN.md — Orchestration generator subagent with Mermaid diagrams and error handling
- [x] 02-04-PLAN.md — Dataset generator subagent with dual datasets and adversarial taxonomy
- [x] 02-05-PLAN.md — README generator subagent and SKILL.md update
</details>

<details>
<summary>Phase 3: Orchestrator and Adaptive Pipeline</summary>

**Goal**: Wire all subagents into a single orchestrator workflow that handles any input from brief to detailed and adapts pipeline depth accordingly
**Depends on**: Phase 2
**Requirements**: INPT-01, INPT-02, INPT-03
**Success Criteria** (what must be TRUE):
  1. User can provide a brief use case description (1-3 sentences) and receive a complete agent swarm specification in the correct directory structure
  2. User can provide a detailed multi-paragraph brief and receive a complete agent swarm specification without unnecessary research stages running
  3. Pipeline adapts its depth based on input detail level -- skipping research subagents when the user provides sufficient context

Plans:
- [x] 03-01-PLAN.md — Orchestrator command with input handling, classification, and architect stage (Steps 1-5)
- [x] 03-02-PLAN.md — Generation pipeline waves, output assembly, metadata, and SKILL.md update (Steps 6-7)
</details>

<details>
<summary>Phase 4: Distribution</summary>

**Goal**: Package everything as an installable Claude Code plugin that non-technical colleagues can set up and update
**Depends on**: Phase 3
**Requirements**: DIST-01, DIST-02, DIST-03, DIST-04
**Success Criteria** (what must be TRUE):
  1. Non-technical user can install `/orq-agent` as a Claude Code slash command from the GitHub repo using a simple install process
  2. User can run `/orq-agent:update` to pull the latest version from GitHub
  3. Skill works standalone (`/orq-agent`) and is callable from within a GSD phase
  4. Total skill size stays within Claude Code character budget limits

Plans:
- [x] 04-01-PLAN.md — Plugin packaging, install script with prerequisite checks, version tracking, and rollback
- [x] 04-02-PLAN.md — Update command, help command, GSD integration flags, and SKILL.md update
- [x] 04-03-PLAN.md — Gap closure: Replace hardcoded ./Agents/ paths with {OUTPUT_DIR} in Waves 1-3 and Step 7
</details>

<details>
<summary>Phase 04.1: Discussion Step (INSERTED)</summary>

**Goal:** Replace the classify-then-confirm flow with a GSD-style structured discussion that always runs, surfaces domain-specific gray areas, and enriches user input before the architect runs
**Depends on:** Phase 3
**Requirements:** INPT-01, INPT-02, INPT-03
**Success Criteria** (what must be TRUE):
  1. Every `/orq-agent` invocation presents a structured discussion step with domain-specific gray areas before the architect runs
  2. Discussion adapts naturally to input detail level -- brief inputs produce longer discussions, detailed inputs produce shorter ones
  3. Researcher skip classification still functions internally after discussion enrichment without user-facing checkpoint

Plans:
- [x] 04.1-01-PLAN.md — Replace Steps 2-3 with discussion step, renumber flow, update SKILL.md
</details>

<details>
<summary>Phase 04.2: Tool Selection and MCP Servers (INSERTED)</summary>

**Goal:** Build a tool resolver pipeline stage and unified tool catalog so generated Orq.ai agent specs include accurate, verified tool recommendations with copy-paste-ready configuration
**Depends on:** Phase 4
**Requirements:** TOOL-01, TOOL-02, TOOL-03, TOOL-04

Plans:
- [x] 04.2-01-PLAN.md — Unified tool catalog reference, TOOLS.md template, and tool resolver subagent prompt
- [x] 04.2-02-PLAN.md — Wire tool resolver into orchestrator pipeline, update downstream subagents and SKILL.md
</details>

<details>
<summary>Phase 04.3: Prompt Strategy (INSERTED)</summary>

**Goal:** Upgrade all generation subagents to produce XML-tagged, heuristic-first agent instructions with Anthropic context engineering patterns (delegation frameworks, context budget awareness, Memory Store integration, few-shot examples as primary calibration)
**Depends on:** Phase 4
**Requirements:** SPEC-02, SPEC-05, SPEC-06, SPEC-12, ORCH-01, ORCH-02, RSRCH-02, TOOL-01, TOOL-02

Plans:
- [x] 04.3-01-PLAN.md — Spec generator and agent-spec template: XML-tagged instructions, heuristic-first, context management, few-shot examples
- [x] 04.3-02-PLAN.md — Orchestration generator, researcher, and orchestration template: delegation frameworks, effort scaling, tool overlap detection, context management recommendations
- [x] 04.3-03-PLAN.md — Orchestrator prompt and secondary subagents (architect, dataset-gen, readme-gen): XML tags, heuristic guidelines, consistent patterns
</details>

<details>
<summary>Phase 04.4: KB-Aware Discussion & Researcher (INSERTED)</summary>

**Goal:** Make the pipeline knowledge-base-aware end-to-end — the Discussion step surfaces KB source questions, the Researcher produces actionable KB design guidance, and the Spec Generator includes KB setup instructions in its output
**Depends on:** Phase 04.1, Phase 04.2
**Requirements:** ADV-03 (partial — design guidance, not full scaffolding)
**Success Criteria** (what must be TRUE):
  1. Discussion step generates KB-specific gray areas whenever the use case involves documents, policies, FAQs, or data retrieval
  2. Researcher subagent output includes a "Knowledge Base Design" section with chunking strategy, embedding model recommendation, metadata fields, and document preparation guidance
  3. Spec Generator includes actionable KB setup instructions in the agent spec and README output
  4. Pipeline correctly skips KB questions when the use case has no knowledge base needs

Plans:
- [x] 04.4-01-PLAN.md — Architect KB classification (blueprint fields) + Discussion conditional KB section
- [x] 04.4-02-PLAN.md — Researcher KB Design section + Orchestration KB output and template
- [x] 04.4-03-PLAN.md — Spec Generator KB context references + README KB setup steps
</details>

---

## V2.0 — Autonomous Orq.ai Pipeline (IN PROGRESS)

**Value:** Go from natural language use case to fully deployed, tested, and iterated agent swarm in Orq.ai — autonomously. MCP-first integration with API fallback. Modular install lets users control which automation capabilities are enabled. Local `.md` specs remain the source of truth with full audit trail of all iterations and reasoning.

**Key design decisions:**
- MCP-first (Orq.ai MCP server), REST API as fallback where MCP doesn't cover (tools, prompts, memory stores)
- Local `.md` files updated throughout the process with all iterations and reasoning for audit and human review
- User approval required before applying any prompt changes — present test results, conclusions, and proposed changes first
- Modular install — user selects which capabilities to enable (core, deploy, test, full)
- Orq.ai API key onboarding during install

**Orq.ai integration coverage (researched 2026-03-01):**

| Capability | MCP | REST API | Pipeline stage |
|---|---|---|---|
| Agent creation/config | Yes | - | Deploy |
| Tool creation (5 types) | - | Yes | Deploy |
| Dataset management | Yes | Yes | Test |
| Experiments | Yes | SDK (evaluatorq) | Test |
| Evaluators (4 types) | Yes | Yes | Test |
| Prompt creation/versioning | - | Yes | Iterate |
| Memory Stores | - | Yes | Deploy (if KB) |
| Traces/Observability | Yes | - | Iterate |
| Annotations | - | Yes | Iterate |
| Models listing | Yes | Yes | Deploy |
| Search/Analytics | Yes | - | Monitor |

### Phases

- [x] **Phase 5: References, Install, and Capability Infrastructure** — Updated agentic framework references, new API/evaluator references, V2.0 output templates, modular install with capability tiers and API key onboarding
- [x] **Phase 05.1: Fix Distribution Placeholders** — Replace OWNER/REPO literals in command files with correct GitHub repo path (gap closure) (completed 2026-03-01)
- [ ] **Phase 05.2: Fix Tool Catalog & Pipeline Wiring** — Correct memory tool identifiers and wire research brief to orchestration generator (gap closure)
- [ ] **Phase 6: Orq.ai Deployment** — Deployer subagent, API adapter layer, idempotent agent/tool creation, orchestration wiring, verify-after-deploy, deployment status reporting
- [ ] **Phase 7: Automated Testing** — Tester subagent, dataset transformation and upload, evaluator creation, experiment execution with statistical rigor, structured results presentation
- [ ] **Phase 8: Prompt Iteration Loop** — Iterator subagent, results analysis with plain-language diagnosis, diff-based prompt proposals, per-iteration user approval, hard stopping conditions, audit trail
- [ ] **Phase 9: Guardrails and Hardening** — Evaluator promotion to runtime guardrails, threshold-based quality gates, incremental per-agent deployment

### V2.0 Phase Details

### Phase 5: References, Install, and Capability Infrastructure
**Goal**: Establish the knowledge foundation, output templates, and modular install infrastructure so all subsequent V2.0 phases have references to build against and a capability-gated environment to operate in
**Depends on**: Phase 04.4 (V1.0 complete)
**Requirements**: REF-01, REF-02, REF-03, REF-04, REF-05, INST-01, INST-02, INST-03, INST-04, INST-05
**Success Criteria** (what must be TRUE):
  1. Reference files contain latest Anthropic evaluator-optimizer pattern, OpenAI agent-as-tool patterns, Google A2A v0.3 task lifecycle, Orq.ai API endpoints, and Orq.ai evaluator types -- and V1.0 subagents can consume them
  2. User can run the install script and select a capability tier (core/deploy/test/full) where each tier includes all lower tiers
  3. Install script prompts for Orq.ai API key, validates it against the live API, stores it as an environment variable only (never in generated files), and registers the Orq.ai MCP server when deploy tier or higher is selected
  4. V2.0 commands (`/orq-agent:deploy`, `/orq-agent:test`, `/orq-agent:iterate`) are only available when the corresponding capability tier is installed; running them at a lower tier produces a clear upgrade message
  5. Pipeline falls back to V1.0 copy-paste behavior when MCP is unavailable or only core tier is installed
**Plans:** 4 plans

Plans:
- [ ] 05-01-PLAN.md — Update/create agentic framework references (Anthropic composable patterns, context engineering, OpenAI agent-as-tool, A2A v0.3)
- [ ] 05-02-PLAN.md — Create Orq.ai API endpoints reference, evaluator types reference, and V2.0 JSON output templates
- [ ] 05-03-PLAN.md — Extend install script with capability tier selection, API key validation, and MCP server registration
- [ ] 05-04-PLAN.md — Create capability-gated V2.0 command stubs, model profile management, and update SKILL.md

### Phase 05.1: Fix Distribution Placeholders
**Goal**: Replace all `OWNER/REPO` placeholder literals in command files with the correct `NCrutzen/orqai-agent-pipeline` values so the update command and all GitHub URLs are functional
**Depends on**: Phase 5
**Requirements**: DIST-03, INST-05
**Gap Closure**: Closes gaps from v0.3 audit
**Success Criteria** (what must be TRUE):
  1. All 5 command files (update.md, deploy.md, test.md, iterate.md, help.md) use `NCrutzen/orqai-agent-pipeline` instead of `OWNER/REPO`
  2. `/orq-agent:update` curl URLs resolve to valid GitHub endpoints
  3. Flow D-Update completes end-to-end

Plans:
- [ ] 05.1-01-PLAN.md — Global find-replace OWNER/REPO in command files and verify URLs

### Phase 05.2: Fix Tool Catalog & Pipeline Wiring
**Goal**: Correct wrong memory tool identifiers in tool-catalog.md and wire research brief path to orchestration generator so KB use cases produce complete orchestration output
**Depends on**: Phase 5
**Requirements**: TOOL-02, ORCH-01, ARCH-04
**Gap Closure**: Closes gaps from v0.3 audit
**Success Criteria** (what must be TRUE):
  1. tool-catalog.md uses correct memory tool identifiers: `write_memory_store` and `delete_memory_document`
  2. Orchestrator Wave 3 passes research brief path to orchestration generator inputs
  3. Flow C (KB use case) research brief data reaches ORCHESTRATION.md KB Design section

Plans:
- [ ] 05.2-01-PLAN.md — Fix memory tool identifiers in tool-catalog.md and wire research brief to Wave 3 orchestration generator

### Phase 6: Orq.ai Deployment
**Goal**: Users can deploy a generated agent swarm to Orq.ai with a single command and get back a verified, live deployment with all agents wired together
**Depends on**: Phase 5
**Requirements**: DEPL-01, DEPL-02, DEPL-03, DEPL-04, DEPL-05, DEPL-06, DEPL-07
**Success Criteria** (what must be TRUE):
  1. User can run `/orq-agent:deploy` on any V1.0 swarm output and see all agents and tools created in their Orq.ai workspace, with orchestrator agents correctly wired to sub-agents via agent-as-tool relationships
  2. Re-running deploy on an already-deployed swarm updates existing agents and tools without creating duplicates
  3. After every deployment, the system reads back each agent's config from Orq.ai and confirms it matches the intended spec -- discrepancies are surfaced to the user
  4. Local `.md` spec files are updated with deployment metadata (agent IDs, version numbers, timestamps) and a deployment status summary table is displayed
**Plans**: TBD

### Phase 7: Automated Testing
**Goal**: Users can run automated evaluations against their deployed agents and receive structured, interpretable results that identify exactly where agents succeed and fail
**Depends on**: Phase 6
**Requirements**: TEST-01, TEST-02, TEST-03, TEST-04, TEST-05
**Success Criteria** (what must be TRUE):
  1. User can run `/orq-agent:test` and V1.0 markdown datasets are automatically transformed, split into train/test/holdout sets (minimum 30 examples), and uploaded to Orq.ai
  2. Domain-appropriate evaluators are created automatically -- LLM-as-judge for semantic quality assessment, function evaluators for structural validation checks
  3. Experiments run against deployed agents with 3-run median scoring and variance tracking, and results are presented in RESULTS.md with confidence intervals, per-evaluator scores, pass/fail summary, and worst-performing cases highlighted
**Plans**: TBD

### Phase 8: Prompt Iteration Loop
**Goal**: Users can improve underperforming agents through a guided analyze-propose-approve-retest cycle that explains every change in plain language and never acts without permission
**Depends on**: Phase 7
**Requirements**: ITER-01, ITER-02, ITER-03, ITER-04, ITER-05, ITER-06
**Success Criteria** (what must be TRUE):
  1. After testing, the system analyzes results and presents plain-language diagnosis tied to specific test failures (e.g., "agent fails on multi-language inputs because instructions lack i18n guidance")
  2. Proposed prompt changes are shown as diffs with per-change reasoning, and the user must explicitly approve each iteration before any changes are applied
  3. Approved changes update both local `.md` specs and deployed Orq.ai agents, then re-run tests to validate improvement
  4. Iteration automatically stops when any hard limit is reached: 3 iterations, 50 API calls, 10-minute timeout, or less than 5% improvement between iterations
  5. ITERATIONS.md audit trail records every iteration with version, date, changes made, reasoning, scores before/after, and approval status
**Plans**: TBD

### Phase 9: Guardrails and Hardening
**Goal**: Users can promote test evaluators to production guardrails and deploy agents incrementally with quality gates, ensuring only agents that meet defined thresholds reach production
**Depends on**: Phase 8
**Requirements**: GUARD-01, GUARD-02, GUARD-03
**Success Criteria** (what must be TRUE):
  1. User can promote any test evaluator to a runtime guardrail on its corresponding deployed Orq.ai agent
  2. User can configure threshold-based quality gates per evaluator (e.g., helpfulness > 0.8, safety > 0.95) that must pass before an agent is considered production-ready
  3. User can deploy, test, and iterate each agent individually before wiring the full orchestration -- enabling incremental rollout of multi-agent swarms
**Plans**: TBD

---

## V2.1 — Automated KB Setup (PLANNED)

**Value:** Provision vector stores, configure embeddings, and generate ingestion pipelines — turning KB design guidance into fully automated setup. User chooses their RAG database (Supabase, or alternatives).

**Goal:** Add a KB Setup subagent that automatically creates vector stores, configures embeddings, generates ingestion pipelines, and populates knowledge bases
**Depends on:** V2.0, Phase 04.4
**Requirements:** ADV-03 (full — automated KB provisioning and data ingestion)
**Success Criteria** (what must be TRUE):
  1. KB Setup subagent produces a `KB-SETUP.md` per knowledge base referenced in the swarm with table schema, embedding config, and ingestion pipeline
  2. When a supported RAG DB MCP is available, the subagent automatically provisions vector storage, configures embedding dimensions, and sets up access policies
  3. Ingestion pipeline scaffold handles common document formats (PDF, markdown, HTML, CSV) with configurable chunking parameters
  4. Generated ingestion scripts are runnable and include upsert logic for keeping KBs updated as source documents change
  5. The full KB setup process (store creation → embedding config → initial data load) can run end-to-end without manual console interaction
  6. User can select their preferred RAG database during install (Supabase pgvector, or alternatives)
**Plans:** 1/1 plans complete

---

## V3.0 — Browser Automation (PLANNED)

**Value:** Generate Playwright automation scripts or natural language browser instructions for agents that need web interaction capabilities.

**Goal:** Automated process for Playwright automation scripts development or explicit LLM instructions for natural language browser use
**Depends on:** V2.0
**Requirements:** TBD
**Plans:** TBD

---

## Progress Summary

| Version | Phase | Plans Complete | Status | Completed |
|---------|-------|----------------|--------|-----------|
| V1.0 | 1. Foundation | 3/3 | Complete | 2026-02-24 |
| V1.0 | 2. Core Generation Pipeline | 5/5 | Complete | 2026-02-24 |
| V1.0 | 3. Orchestrator and Adaptive Pipeline | 2/2 | Complete | 2026-02-24 |
| V1.0 | 4. Distribution | 3/3 | Complete | 2026-02-24 |
| V1.0 | 04.1 Discussion Step | 1/1 | Complete | 2026-02-24 |
| V1.0 | 04.2 Tool Selection & MCP | 2/2 | Complete | 2026-02-24 |
| V1.0 | 04.3 Prompt Strategy | 3/3 | Complete | 2026-02-24 |
| V1.0 | 04.4 KB-Aware Pipeline | 3/3 | Complete | 2026-02-26 |
| **V1.0** | **All phases** | **22/22** | **Complete** | **2026-02-26** |
| V2.0 | 5. References, Install, and Capability Infrastructure | 4/4 | Complete | 2026-03-01 |
| V2.0 | 05.1 Fix Distribution Placeholders | 1/1 | Complete   | 2026-03-01 |
| V2.0 | 05.2 Fix Tool Catalog & Pipeline Wiring | 0/1 | Gap closure | - |
| V2.0 | 6. Orq.ai Deployment | 0/? | Not started | - |
| V2.0 | 7. Automated Testing | 0/? | Not started | - |
| V2.0 | 8. Prompt Iteration Loop | 0/? | Not started | - |
| V2.0 | 9. Guardrails and Hardening | 0/? | Not started | - |
| V2.1 | Automated KB Setup | - | Not started | - |
| V3.0 | Browser Automation | - | Not started | - |
