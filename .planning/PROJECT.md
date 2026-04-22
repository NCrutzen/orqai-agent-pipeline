# Orq Agent Designer

## What This Is

A Claude Code skill that transforms natural language use case descriptions into complete Orq.ai agent swarm specifications, then autonomously deploys, tests, iterates, and hardens them. Also available as a CLI pipeline (`/orq-agent`) for technical users.

## Core Value

Any colleague can go from a use case description to deployed, tested agents on Orq.ai -- through an automated pipeline with real-time visibility and HITL approvals -- without needing to understand the underlying AI platform.

## Requirements

### Validated

Shipped in v0.3 (2026-03-01) — 50 requirements:

- Adaptive input handling (brief → detailed, pipeline depth adapts)
- Architect subagent with complexity gate (single-agent default)
- Domain research subagents (smart skip when input is detailed)
- Agent spec generation (all 18 Orq.ai fields, copy-paste ready)
- Orchestration spec (agent-as-tool, data flow, error handling, HITL)
- Dataset generation (test inputs, eval pairs, adversarial cases 30%+)
- Naming convention (`[domain]-[role]-agent` kebab-case)
- Directory output structure (`Agents/[swarm-name]/`)
- Claude Code skill distribution (install script, update command)
- GSD integration (standalone + within GSD phases)
- Discussion step (surfaces gray areas before architect)
- Tool resolver (unified tool catalog, MCP-first)
- Prompt strategy (XML-tagged, heuristic-first, context-engineered)
- KB-aware pipeline (discussion → researcher → spec generator)
- Modular install with capability tiers (core/deploy/test/full)

Shipped in V2.0 (2026-03-02) — 23 requirements:

- ✓ Autonomous agent deployment to Orq.ai via MCP/API (DEPLOY-01 through DEPLOY-08) — V2.0
- ✓ Automated testing pipeline with dataset upload, evaluator selection, 3x experiments (TEST-01 through TEST-05) — V2.0
- ✓ Prompt iteration loop with diagnosis, diff proposals, HITL approval, stopping conditions (ITER-01 through ITER-07) — V2.0
- ✓ Guardrails and hardening via evaluator promotion and quality gates (GUARD-01 through GUARD-03) — V2.0

Shipped in V2.1 (2026-03-13) — 24 requirements:

- ✓ Dataset-preparer subagent with MCP/REST upload, smoke test, stratified splits (DATA-01 through DATA-05) — V2.1
- ✓ Experiment-runner subagent with REST-only execution, adaptive polling, holdout mode (EXPR-01 through EXPR-06) — V2.1
- ✓ Results-analyzer subagent with triple-run statistics, category slicing, hardener compat (ANLZ-01 through ANLZ-05) — V2.1
- ✓ Rewritten test.md orchestrating 3 subagents with validation gates (TEST-01 through TEST-03) — V2.1
- ✓ Failure-diagnoser + prompt-editor for section-level diagnosis and HITL-approved iteration (ITPIPE-01 through ITPIPE-06) — V2.1
- ✓ Rewritten iterate.md with 2-subagent loop and 5 stop conditions (LOOP-01 through LOOP-03) — V2.1

Shipped in v3.0 (2026-04-22) — 88 requirements:

- ✓ Agent Skills format foundation (SKST-01..10) — 9-section contract, lint script, protected-pipeline SHA hash — v3.0 Phase 34
- ✓ Capable-first / snapshot-pin / cascade model policy (MSEL-01..03) — v3.0 Phase 35
- ✓ Lifecycle slash commands (LCMD-01..07) — workspace/traces/analytics/models/quickstart/automations — v3.0 Phase 36
- ✓ Observability setup skill (OBSV-01..07) — framework detection, integration codegen, `identity` attribution — v3.0 Phase 37
- ✓ Trace failure analysis skill (TFAIL-01..06) — grounded-theory taxonomy — v3.0 Phase 38
- ✓ Dataset generator enhancements (DSET-01..08) — two-step, 8-vector, curation, multi-turn, RAG, promote-trace — v3.0 Phase 39
- ✓ KB & Memory lifecycle (KBM-01..05) — retrieval gate, chunking policy, memory-store generator — v3.0 Phase 40
- ✓ Prompt optimization (POPT-01..04) + cross-framework comparison (XFRM-01..03) — v3.0 Phase 41
- ✓ Evaluator validation (EVLD-01..11) + eval-science methodology (ESCI-01..08) + iterator enrichments (ITRX-01..09) — v3.0 Phase 42
- ✓ Cross-IDE distribution (DIST-01..07) — plugin manifests + `.mcp.json` + CI scaffolds — v3.0 Phase 43

### Out of Scope

- Orq.ai Deployments — output targets Agents API (`/v2/agents`), not the simpler Deployments pattern
- Real-time agent monitoring/observability — Orq.ai handles this natively
- Auto-update on launch — updates are manual via `/orq-agent:update`
- Dynamic/exploratory browser-use — already handled by existing Orq.ai MCP tools

## Current State

**Shipped:** v3.0 — 2026-04-22 (10 phases, 52 plans, 88 requirements). All Build → Evaluate → Optimize lifecycle capabilities are now file-level verified. 22 manual LLM/MCP smokes deferred for live-workspace verification via `/gsd:verify-work <phase>`.

**Next milestone goals:**
- **v4.0 Cross-Swarm Intelligence** (pre-defined) — ecosystem mapping, drift detection between spec and deployed state, overlap and gap analysis, structured fix proposals with HITL approval.
- **v5.0 Browser Automation** (pre-defined, depends on v4.0) — Playwright script generation, VPS-hosted MCP server, agent spec wiring.

<details>
<summary>Previous milestone: v3.0 Lifecycle Completeness & Eval Science</summary>

**Goal:** Promote the pipeline from a spec-generator into a complete Build → Evaluate → Optimize lifecycle tool by absorbing observability, trace-failure analysis, evaluator validation science (TPR/TNR), prompt optimization, and cross-IDE distribution patterns from the orq-ai/assistant-plugins reference — without breaking the existing generation loop.

**Delivered:** Skill Structure (Phase 34) · Model Selection (35) · 6 Lifecycle Slash Commands (36) · Observability (37) · Trace Failure Analysis (38) · Dataset Generator Enhancements (39) · KB & Memory Lifecycle (40) · Prompt Optimization + Cross-Framework (41) · Evaluator Validation & Iterator Enrichments (42) · Cross-IDE Distribution (43).

See `milestones/v3.0-ROADMAP.md` and `milestones/v3.0-MILESTONE-AUDIT.md`.

</details>

## Context

- **Platform:** Orq.ai — Generative AI orchestration platform with Agents API (`/v2/agents`), A2A Protocol support, Task ID-based state persistence, two-step tool execution, and agent versioning via `@version-number` tags
- **Agent config surface:** key, role, description, model (`provider/model-name`), instructions, settings (max_iterations: 3-15, max_execution_time: ~300s), tools (built-in + function with JSON schema)
- **V2.0 pipeline:** 4 commands (`deploy`, `test`, `iterate`, `harden`) with 4 subagents (deployer, tester, iterator, hardener). MCP-first with REST API fallback. Per-agent incremental operations via `--agent` flag.
- **V4.0 context:** As swarms multiply across business processes (Invoice-to-Cash, etc.), they develop blind spots -- overlapping work, missing handoffs, conflicting actions. The ultra architect layer provides cross-swarm awareness.
- **V5.0 context:** Many Moyne Roberts systems (NXT, iController, Intelly) lack APIs. Agents interacting with these need browser automation. Fixed Playwright scripts handle deterministic flows; dynamic browser-use is already available via existing Orq.ai MCP tools. Scripts deploy to a VPS-hosted MCP server.
- **Distribution model:** Claude Code skill (`/orq-agent`) distributed via GitHub install script.
- **Users:** 5-15 Moyne Roberts employees. Claude Code skill is the primary interface for agent pipeline operations.
- **Codebase:** 10,628 lines across orq-agent/ (markdown + JSON). 43 files: 11 agents, 5 commands, 8 references, 7 templates, SKILL.md, install script
- **Shipped:** v0.3 (2026-03-01, 50 requirements), V2.0 (2026-03-02, 23 requirements), V2.1 (2026-03-13, 24 requirements). V4.0-V5.0 defined but deferred behind V3.0
- **V3.0 driver (2026-04-20):** Gap analysis against orq-ai/assistant-plugins reference produced a 60-item improvements list across 9 categories (A–I). The reference plugin ships a broader Build→Evaluate→Optimize lifecycle (observability, trace analysis, evaluator validation with TPR/TNR, prompt optimization, cross-framework comparison) while our pipeline ends at test-results.json. V3.0 absorbs these capabilities under our tier system so core-tier users stay on the fast generator loop

## Constraints

- **Platform:** Must target Orq.ai Agents API -- all output specs must be valid for `/v2/agents` endpoint and/or Orq.ai Studio manual setup
- **Backward compat:** Claude Code skill (`/orq-agent`) must maintain backward compatibility across updates
- **SDK pins:** `@orq-ai/node@^3.14.45`, `@orq-ai/evaluatorq@^1.1.0`, `@orq-ai/evaluators@^1.1.0`

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Target Orq.ai Agents, not Deployments | Agents support orchestration, persistent state, tool execution loops, and A2A Protocol | ✓ Good |
| Kebab-case naming convention | Matches Orq.ai's own deployment key patterns | ✓ Good |
| Directory-per-swarm output structure | Groups related agents with orchestration and datasets | ✓ Good |
| Claude Code skill distribution via GitHub | Easy install for non-technical users with version management | ✓ Good |
| Smart subagent spawning based on input detail | Avoids unnecessary research, reduces token cost | ✓ Good |
| MCP-first with API fallback | MCP covers agents/datasets/evaluators; REST covers tools/prompts/memory | ✓ Good — validated in V2.0 |
| Modular capability tiers | Users control automation; core tier preserves V1.0 behavior | ✓ Good |
| XML-tagged prompt strategy | Anthropic context engineering patterns produce consistent output | ✓ Good |
| Subagents as .md instruction files | LLM reasoning handles diagnosis/proposals — no custom code needed | ✓ Good — validated at scale in V2.1 (5 new subagents) |
| Per-agent `--agent` flag (not positional args) | Consistent convention across all 4 commands, documented in SKILL.md | ✓ Good |
| Native `settings.guardrails` API for guardrail attachment | Direct Orq.ai integration, no application-layer workarounds | ✓ Good |
| Holdout dataset for re-test | Clean isolation between training and iteration testing | ✓ Good |
| HITL approval before any prompt change | Non-technical users maintain trust and control | ✓ Good |
| V3.0 before V4.0/V5.0 | Lifecycle gaps (observability, eval science, optimization) matter before cross-swarm work and browser automation — without production traces there's no signal for V4.0 to detect drift against | — Pending |
| Tier-gate human-label dependencies | TPR/TNR evaluator validation requires human annotation effort, which breaks our "autonomous from a use case" loop — placed under 'full' tier so core/deploy/test users never hit it | — Pending |
| Preserve generator loop through V3.0 | New lifecycle commands are additive; existing `/orq-agent`, `/orq-agent:prompt`, `/orq-agent:architect` must remain byte-identical in behavior | — Pending |
| Binary Pass/Fail default for LLM evaluators | Reference's rule that Likert scales introduce subjectivity and require more data; we'll decompose existing bundled evaluators into per-failure-mode binary judges | — Pending |
| Cross-swarm intelligence layer | Swarms grow siloed; need ecosystem-level awareness to prevent overlaps and missing handoffs | — Pending |
| Dual source of truth (specs + Orq.ai) | Drift detection requires reading both local specs and live deployed state | — Pending |
| Auto-apply low-risk, escalate structural | Shared context additions are safe; rewiring agent relationships needs human judgment | — Pending |
| MCP server on VPS for Playwright scripts | Agents call browser automation via MCP tools; VPS handles Playwright runtime. Non-technical users never touch it. | — Pending |
| Fixed scripts over dynamic browser-use | Deterministic Playwright scripts for known flows; dynamic browser-use already solved via existing Orq.ai MCP tools | — Pending |
| Application capabilities config file | Pipeline reads per-system integration method from config; discussion step fills gaps for unknown systems | — Pending |

---
*Last updated: 2026-04-22 — v3.0 milestone shipped*
