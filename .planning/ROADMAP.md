# Roadmap: Orq Agent Designer

## Overview

Build a Claude Code skill that transforms natural language use case descriptions into complete Orq.ai agent swarm specifications, then autonomously deploys, tests, iterates, and hardens them via the Orq.ai MCP server and API. V3.0 promotes the pipeline from a spec-generator into a complete Build → Evaluate → Optimize lifecycle tool by absorbing observability, trace-failure analysis, evaluator validation science, prompt optimization, and cross-IDE distribution patterns — without breaking the existing generation loop. V4.0 adds cross-swarm intelligence so that agent swarms don't operate in silos -- overlaps are surfaced, missing coordination is identified, and fixes are proposed across the entire ecosystem. V5.0 extends the pipeline to detect browser automation needs, generate deterministic Playwright scripts, deploy them to a VPS-hosted MCP server, and wire agent specs with the right MCP tools.

## Milestones

| Version | Milestone | Status |
|---------|-----------|--------|
| **v0.3** | Core Pipeline + V2.0 Foundation -- V1.0 spec generation + V2.0 install infrastructure | **Shipped 2026-03-01** |
| **V2.0** | Autonomous Orq.ai Pipeline -- deploy, test, iterate, and harden agent swarms via MCP/API | **Shipped 2026-03-02** |
| **V2.1** | Experiment Pipeline Restructure -- rewrite test/iterate with native MCP, smaller subagents | **Shipped 2026-03-13** |
| **V3.0** | Lifecycle Completeness & Eval Science -- observability, trace analysis, evaluator validation, prompt optimization, cross-IDE | **Active (2026-04-20)** |
| **V4.0** | Cross-Swarm Intelligence -- ecosystem mapping, drift detection, overlap analysis, and fix proposals | **Defined** |
| **V5.0** | Browser Automation -- Playwright script generation, VPS MCP server, automated deployment, agent spec wiring | **Defined** |

---

<details>
<summary>v0.3 Core Pipeline + V2.0 Foundation (Phases 1-05.2) -- SHIPPED 2026-03-01</summary>

**11 phases, 28 plans, 50 requirements satisfied**
**Full archive:** `milestones/v0.3-ROADMAP.md` | `milestones/v0.3-REQUIREMENTS.md`

- [x] Phase 1: Foundation -- References, templates, architect subagent (completed 2026-02-24)
- [x] Phase 2: Core Generation Pipeline -- 5 subagents: researcher, spec-gen, orch-gen, dataset-gen, readme-gen (completed 2026-02-24)
- [x] Phase 3: Orchestrator and Adaptive Pipeline -- Orchestrator wiring with adaptive depth (completed 2026-02-24)
- [x] Phase 4: Distribution -- Install script, update command, GSD integration (completed 2026-02-24)
- [x] Phase 04.1: Discussion Step -- Structured gray area surfacing (completed 2026-02-24)
- [x] Phase 04.2: Tool Selection & MCP Servers -- Tool resolver + unified catalog (completed 2026-02-24)
- [x] Phase 04.3: Prompt Strategy -- XML-tagged, context-engineered instructions (completed 2026-02-24)
- [x] Phase 04.4: KB-Aware Pipeline -- End-to-end knowledge base support (completed 2026-02-26)
- [x] Phase 5: References, Install, Capability Infrastructure -- V2.0 references + modular install (completed 2026-03-01)
- [x] Phase 05.1: Fix Distribution Placeholders -- OWNER/REPO to NCrutzen/orqai-agent-pipeline (completed 2026-03-01)
- [x] Phase 05.2: Fix Tool Catalog & Pipeline Wiring -- Memory tool identifiers + research brief wiring (completed 2026-03-01)

</details>

<details>
<summary>V2.0 Autonomous Orq.ai Pipeline (Phases 6-11) -- SHIPPED 2026-03-02</summary>

**7 phases, 11 plans, 23 requirements satisfied**
**Full archive:** `milestones/V2.0-ROADMAP.md` | `milestones/V2.0-REQUIREMENTS.md`

- [x] Phase 6: Orq.ai Deployment -- Deployer subagent, MCP/REST adapter, idempotent deploy (completed 2026-03-01)
- [x] Phase 7: Automated Testing -- Tester subagent, dataset pipeline, evaluator selection, 3x experiments (completed 2026-03-01)
- [x] Phase 7.1: Test Pipeline Tech Debt -- SDK-to-REST mapping, package declaration, template cleanup (completed 2026-03-01)
- [x] Phase 8: Prompt Iteration Loop -- Iterator subagent, diagnosis, proposals, HITL approval, audit trail (completed 2026-03-01)
- [x] Phase 9: Guardrails and Hardening -- Hardener subagent, guardrail promotion, quality gates, --agent flags (completed 2026-03-01)
- [x] Phase 10: Fix Holdout Dataset Path -- Holdout dataset ID alignment, step label fixes (completed 2026-03-02)
- [x] Phase 11: Flag Conventions + Tech Debt -- Flag alignment, step renumbering, files_to_read fixes (completed 2026-03-02)

</details>

<details>
<summary>V2.1 Experiment Pipeline Restructure (Phases 26-33) -- SHIPPED 2026-03-13</summary>

**8 phases, 9 plans, 24 requirements satisfied**
**Full archive:** `milestones/V2.1-ROADMAP.md` | `milestones/V2.1-REQUIREMENTS.md`

- [x] Phase 26: Dataset Preparer -- MCP/REST upload, smoke test, stratified splits, JSON contract (completed 2026-03-11)
- [x] Phase 27: Experiment Runner -- REST-only execution, adaptive polling, holdout mode (completed 2026-03-11)
- [x] Phase 28: Results Analyzer -- Student's t statistics, category slicing, hardener compatibility (completed 2026-03-12)
- [x] Phase 29: Test Command Rewrite -- 3-subagent orchestration with validation gates (completed 2026-03-12)
- [x] Phase 30: Failure Diagnoser -- Evaluator-to-section mapping, diff proposals, HITL approval (completed 2026-03-12)
- [x] Phase 31: Prompt Editor -- Section-level changes, re-deploy delegation, score comparison (completed 2026-03-12)
- [x] Phase 32: Iterate Command Rewrite -- 2-subagent loop with 5 stop conditions (completed 2026-03-13)
- [x] Phase 33: Fix Iteration Pipeline Wiring -- Holdout schema path + mcp_available forwarding (completed 2026-03-13)

</details>

---

## Phases

### V3.0 Lifecycle Completeness & Eval Science (Phases 34-43)

- [x] **Phase 34: Skill Structure & Format Foundation** -- Agent Skills format conventions (SKST) applied across all existing and new skills
- [x] **Phase 35: Model Selection Discipline** -- Capable-first recommendations, snapshot pinning, cascade pattern (MSEL)
- [ ] **Phase 36: Lifecycle Slash Commands** -- Thin MCP-backed workspace/traces/analytics/models/quickstart commands (LCMD)
- [ ] **Phase 37: Observability Setup Skill** -- Framework detection, integration codegen, baseline verification, @traced guidance (OBSV)
- [ ] **Phase 38: Trace Failure Analysis Skill** -- Mixed sampling, open/axial coding, first-upstream-failure, transition matrix, taxonomy report (TFAIL)
- [ ] **Phase 39: Dataset Generator Enhancements** -- Dimensions→tuples→NL mode, adversarial catalog, coverage rules, curation, multi-turn, RAG shape (DSET)
- [ ] **Phase 40: KB & Memory Lifecycle** -- Retrieval testing, embedding activation, chunking picker, KB-vs-memory rule, memory-store generator (KBM)
- [ ] **Phase 41: Prompt Optimization & Cross-Framework Comparison** -- 11-guideline prompt review skill + evaluatorq cross-framework benchmarking (POPT, XFRM)
- [ ] **Phase 42: Evaluator Validation & Iterator Enrichments** -- Binary-first judges, TPR/TNR validation, prevalence correction, P0/P1/P2 plans, run comparisons, no-repeat rule (EVLD, ESCI, ITRX)
- [ ] **Phase 43: Cross-IDE Distribution & Manifests** -- .claude-plugin / .cursor-plugin / .codex-plugin manifests, root mcp.json, npx skills, validation scripts (DIST)

<details>
<summary>V4.0 Cross-Swarm Intelligence (Phases 44-48) -- DEFINED</summary>

- [ ] Phase 44: Ecosystem Foundation -- Unified inventory of all swarms from local specs and live Orq.ai state
- [ ] Phase 45: Drift Detection -- Field-by-field comparison between spec and deployed state
- [ ] Phase 46: Overlap & Gap Analysis -- Semantic role overlap, tool duplication, blind spot identification
- [ ] Phase 47: Fix Proposals -- Structured fix proposals with diff previews, risk classification, HITL approval
- [ ] Phase 48: Command Integration & Auto-Trigger -- On-demand audit command and auto-trigger after new swarm designs

</details>

<details>
<summary>V5.0 Browser Automation (Phases 49-52) -- DEFINED</summary>

- [ ] Phase 49: Capabilities Config & VPS Scaffold -- Application capabilities config file, VPS MCP server setup
- [ ] Phase 50: Script Generation & Pipeline Integration -- Playwright script generator, pipeline browser-use detection
- [ ] Phase 51: Deployment, Wiring & NXT Validation -- Automated script deployment to VPS, agent spec wiring
- [ ] Phase 52: Hardening & Second System -- Script health monitoring, iController validation

</details>

---

## Phase Details

### Phase 34: Skill Structure & Format Foundation
**Goal**: Every existing and new skill conforms to the Agent Skills format so downstream V3.0 skills have a consistent structural substrate to build on.
**Depends on**: V2.1 complete
**Tier**: core
**Requirements**: SKST-01, SKST-02, SKST-03, SKST-04, SKST-05, SKST-06, SKST-07, SKST-08, SKST-09, SKST-10
**Success Criteria** (what must be TRUE):
  1. Every skill file (top-level command + every subagent) has `allowed-tools` declared in YAML frontmatter and a Constraints block opening with NEVER/ALWAYS rules plus a "Why these constraints" paragraph.
  2. Every skill declares "When to use", "When NOT to use", Companion Skills with directional handoffs, a falsifiable "Done When" checklist, an Anti-Patterns table, a Destructive Actions list requiring `AskUserQuestion` confirmation, a Documentation & Resolution footer, and an "Open in orq.ai" deep-link section.
  3. Skill-specific long-form docs are moved from flat `references/` to per-skill `<skill>/resources/` directories without breaking existing file reads (links updated in every consumer).
  4. A lint/validation check confirms all skills pass the new format (no skill missing any required section).
  5. The three protected entry points (`/orq-agent`, `/orq-agent:prompt`, `/orq-agent:architect`) remain byte-identical in behavior when invoked with the same input.
**Plans**: 5 plans
  - [x] 34-01-PLAN.md — Wave 0 infra: build lint-skills.sh + check-protected-pipelines.sh + scripts/README.md; capture 3 golden SHA-256 baselines for protected <pipeline> blocks
  - [x] 34-02-PLAN.md — Wave 1 commands: add 9 SKST sections to all 15 files under orq-agent/commands/ (protected entry points get new sections OUTSIDE <pipeline>)
  - [x] 34-03-PLAN.md — Wave 1 subagents: add 9 SKST sections to all 17 files under orq-agent/agents/ (uses tools: key not allowed-tools: key per Claude Code subagent schema)
  - [x] 34-04-PLAN.md — Wave 2 SKILL.md: add allowed-tools frontmatter + 9 SKST sections + Resources Policy subsection + references-multi-consumer invariant docs
  - [x] 34-05-PLAN.md — Wave 3 verify: run full lint + protected-pipeline hash check; produce 34-05-VERIFICATION.md with SKST-01..10 traceability table and ROADMAP success-criteria checklist

### Phase 35: Model Selection Discipline
**Goal**: Researcher and spec-generator recommend models using a capable-first, snapshot-pinned, cascade-aware policy so generated swarms start from a quality baseline instead of a cost floor.
**Depends on**: Phase 34
**Tier**: core
**Requirements**: MSEL-01, MSEL-02, MSEL-03
**Success Criteria** (what must be TRUE):
  1. Running the researcher on a sample use case returns the most capable tier model for the task as the primary recommendation; budget-profile downgrades only appear as an alternative tagged "after quality baseline run."
  2. Every generated agent spec contains a snapshot-pinned model reference (e.g., `claude-sonnet-4-5-20250929`), never a floating alias.
  3. When a user requests cost optimization, the researcher proposes a model-cascade pattern (cheap-first + escalation) together with a mandatory quality-equivalence experiment step before the cascade is marked approved.
  4. Existing `/orq-agent`, `/orq-agent:prompt`, `/orq-agent:architect` produce functionally equivalent output with the new policy applied (no regressions on the generator loop).
**Plans**: 5 plans
  - [x] 35-01-PLAN.md — Wave 1 lint infra: extend lint-skills.sh with snapshot-pinned-models rule; fixtures at tests/fixtures/35-{bad,good}-pin.md (MSEL-02)
  - [x] 35-02-PLAN.md — Wave 2 researcher policy: insert Model Selection Policy section (capable-first + cascade-candidate + quality-equivalence experiment) in orq-agent/agents/researcher.md (MSEL-01, MSEL-03)
  - [x] 35-03-PLAN.md — Wave 2 spec-generator policy: insert Snapshot Pinning Rule + Cascade Block Emission subsections in orq-agent/agents/spec-generator.md; embed lint regex + alias-only exception (MSEL-02)
  - [x] 35-04-PLAN.md — Wave 2 Capable Tier lookup: add `## Capable Tier Lookup` section to orq-agent/references/orqai-model-catalog.md with dated-snapshot seed table (MSEL-01)
  - [x] 35-05-PLAN.md — Wave 3 verify: full lint + snapshot-pinned-models fixture sweep + protected-pipeline hash check + phrase-presence greps; produce 35-05-VERIFICATION.md with MSEL-{01,02,03} traceability table and ROADMAP success-criteria checklist

### Phase 36: Lifecycle Slash Commands
**Goal**: Users can inspect workspace, traces, analytics, models, onboarding, and trace-automation rules directly from Claude Code via thin MCP-backed slash commands without opening the Orq.ai dashboard.
**Depends on**: Phase 34
**Tier**: core
**Requirements**: LCMD-01, LCMD-02, LCMD-03, LCMD-04, LCMD-05, LCMD-06, LCMD-07
**Success Criteria** (what must be TRUE):
  1. `/orq-agent:workspace [section]` prints a single-screen overview of agents, deployments, prompts, datasets, experiments, projects, KBs, and evaluators with an analytics summary line, with optional section filter.
  2. `/orq-agent:traces` supports `--deployment`, `--status`, `--last`, `--limit` flags and lists errors first with full trace IDs.
  3. `/orq-agent:analytics` reports requests, cost, tokens, and error rate with optional `--last` and `--group-by` (model/deployment/agent/status) drill-down.
  4. `/orq-agent:models [search-term]` lists Model Garden models grouped by provider, broken out by type (chat/embedding/image/rerank/etc.).
  5. `/orq-agent:quickstart` delivers a 12-step interactive tour (MCP connect → enable models → create project → build agent → invoke → analyze traces → build evaluator → build dataset → run experiment → human review → annotation analysis → promote evaluator), and `/orq-agent:automations` lists/creates Orq.ai Trace Automation rules that auto-trigger experiments on new matching traces.
**Plans**: 8 plans
  - [ ] 36-01-PLAN.md — Wave 1: create orq-agent/commands/workspace.md (LCMD-01) — single-screen workspace overview
  - [ ] 36-02-PLAN.md — Wave 1: create orq-agent/commands/traces.md (LCMD-02) — traces query with --deployment/--status/--last/--limit + --identity stub
  - [ ] 36-03-PLAN.md — Wave 1: create orq-agent/commands/analytics.md (LCMD-03) — analytics summary with --last + --group-by
  - [x] 36-04-PLAN.md — Wave 1: create orq-agent/commands/models.md (LCMD-04) — Model Garden listing grouped by provider × type
  - [ ] 36-05-PLAN.md — Wave 1: create orq-agent/commands/quickstart.md (LCMD-05 + LCMD-07) — 12-step onboarding tour
  - [ ] 36-06-PLAN.md — Wave 1: create orq-agent/commands/automations.md (LCMD-06) — Trace Automations list + --create with AskUserQuestion
  - [ ] 36-07-PLAN.md — Wave 2: wire 6 new commands into orq-agent/SKILL.md index + orq-agent/commands/help.md pipeline-order block
  - [ ] 36-08-PLAN.md — Wave 3: full lint + protected-pipeline + phrase-presence verify; write 36-08-VERIFICATION.md with LCMD-{01..07} traceability + ROADMAP criteria checklist

### Phase 37: Observability Setup Skill
**Goal**: Users can instrument their LLM application with correct framework integration, baseline trace verification, and rich metadata (including per-tenant `identity` attribution) so downstream trace-analysis and eval skills have signal to work with.
**Depends on**: Phase 34
**Tier**: core
**Requirements**: OBSV-01, OBSV-02, OBSV-03, OBSV-04, OBSV-05, OBSV-06, OBSV-07
**Success Criteria** (what must be TRUE):
  1. Skill detects the user's LLM framework (OpenAI SDK, LangChain, CrewAI, Vercel AI, etc.) and reports whether instrumentation is already present.
  2. Skill recommends an integration mode (AI Router / OTEL-only / both) with a written rationale tied to the detection result.
  3. Skill emits framework-specific integration code with instrumentors imported before SDK clients; user can paste it and see traces in Orq.ai.
  4. Skill runs a baseline verification step confirming traces appear, model + tokens captured, span hierarchy present, and no PII leaking.
  5. Skill enriches traces with `session_id`, `user_id`, feature tags, `customer_id`, and `identity` attributes (per-customer/per-tenant attribution) when inferable, guides `@traced` decorator placement across agent/llm/tool/retrieval/embedding/function spans, and documents filtering by identity via `/orq-agent:traces`.
**Plans**: 5 plans
  - [ ] 37-01-PLAN.md — Wave 1: create orq-agent/commands/observability.md with all 9 SKST sections + OBSV-01/02/04/05/06/07 content
  - [ ] 37-02-PLAN.md — Wave 1: create orq-agent/commands/observability/resources/ with 5 framework snippets (openai-sdk, langchain, crewai, vercel-ai, generic-otel) enforcing instrumentors-BEFORE-SDK order (OBSV-03)
  - [ ] 37-03-PLAN.md — Wave 2: replace TODO(OBSV-07) stub in orq-agent/commands/traces.md with live --identity MCP pass-through + client-side fallback (OBSV-07)
  - [ ] 37-04-PLAN.md — Wave 2: wire /orq-agent:observability into orq-agent/SKILL.md index + orq-agent/commands/help.md pipeline-order block
  - [ ] 37-05-PLAN.md — Wave 3: full lint + protected-pipeline SHA-256 + 7 OBSV grep anchors; write 37-05-VERIFICATION.md with OBSV-{01..07} traceability + ROADMAP criteria checklist

### Phase 38: Trace Failure Analysis Skill
**Goal**: Users can turn a pile of production traces into a 4-8 mode failure taxonomy with rates, examples, and a recommended next-skill handoff using grounded-theory methodology.
**Depends on**: Phase 37
**Tier**: deploy+
**Requirements**: TFAIL-01, TFAIL-02, TFAIL-03, TFAIL-04, TFAIL-05, TFAIL-06
**Success Criteria** (what must be TRUE):
  1. Skill samples ~100 traces using the 50% random / 30% failure-driven / 20% outlier mix and records the sampling plan in the output.
  2. Skill supports an open-coding phase (freeform per-trace annotations) followed by an axial-coding phase that clusters annotations into 4-8 non-overlapping failure modes.
  3. For every trace, the skill labels only the first upstream failure and explicitly never labels downstream cascading effects; pipelines with multi-step flows get a transition failure matrix (rows = last success, columns = first failure).
  4. Every failure mode is classified as specification / generalization-code-checkable / generalization-subjective / trivial-bug.
  5. Skill writes an error-analysis report containing the taxonomy, rates, example trace IDs, and a recommended next step (handoff to build-evaluator / optimize-prompt / etc.).
**Plans**: 4 plans
  - [ ] 38-01-PLAN.md — Wave 1: create orq-agent/commands/trace-failure-analysis.md with 9 SKST sections + 7 Steps covering TFAIL-01..06
  - [ ] 38-02-PLAN.md — Wave 1: create 3 resources under orq-agent/commands/trace-failure-analysis/resources/ (grounded-theory-methodology, failure-mode-classification, handoff-matrix)
  - [ ] 38-03-PLAN.md — Wave 2: index-wire into SKILL.md + help.md (pipeline-order) + traces.md Companion Skills (resolve TODO(TFAIL))
  - [ ] 38-04-PLAN.md — Wave 3: full lint + protected-pipeline + 6 TFAIL anchors; write 38-04-VERIFICATION.md with TFAIL-01..06 traceability + 5-row ROADMAP criteria checklist

### Phase 39: Dataset Generator Enhancements
**Goal**: Dataset-generator and `/orq-agent:datasets` produce structurally sound, adversarially hardened, slice-analyzable datasets including multi-turn and RAG shapes, and support promoting production traces directly into datasets as regression cases.
**Depends on**: Phase 34
**Tier**: deploy+
**Requirements**: DSET-01, DSET-02, DSET-03, DSET-04, DSET-05, DSET-06, DSET-07, DSET-08
**Success Criteria** (what must be TRUE):
  1. Two-step generation mode produces dimensions (3-6) → tuples (manual seed, LLM-scaled) → natural-language inputs in separate passes, with the intermediate artifacts inspectable.
  2. Generated datasets include 15-20% adversarial cases drawn from the 8-vector catalog (persona-breaking, instruction override, language switching, formality mismatch, refusal, format forcing, multi-turn manipulation, contradiction) with ≥3 per relevant vector.
  3. Coverage rules are enforced: every dimension value appears in ≥2 datapoints and no single value dominates >30%; violations block dataset upload with a clear remediation message.
  4. Mode 4 curation deduplicates, rebalances, fills gaps, and resolves contradictions on an existing dataset, requiring explicit user confirmation before any deletion.
  5. Every datapoint is tagged by category AND dimension so results-analyzer can slice scores; the generator emits a multi-turn shape (Messages + perturbation scenarios) and a RAG shape (expected source chunk IDs) when the agent profile requests it; and a production trace can be promoted directly into a dataset as a regression case, preserving input, output, intermediate steps, and metadata.
**Plans**: 5 plans
  - [ ] 39-01-PLAN.md — Wave 1 subagent: extend orq-agent/agents/dataset-generator.md with Two-Step Mode + 8-vector catalog + Coverage Rules + Curation Mode 4 + multi-turn + RAG + Promote-From-Trace (DSET-01..08)
  - [ ] 39-02-PLAN.md — Wave 1 command: extend orq-agent/commands/datasets.md with --mode two-step|flat|curation|promote-trace + --trace-id + --shape single|multi-turn|rag + Step 1b dispatch
  - [ ] 39-03-PLAN.md — Wave 1 resources: create orq-agent/agents/dataset-generator/resources/{adversarial-vectors,coverage-rules,shapes}.md (DSET-02, DSET-03, DSET-06, DSET-07)
  - [x] 39-04-PLAN.md — Wave 2 index-wire: SKILL.md Phase 39 block + resources tree + help.md datasets flag summary (completed 2026-04-21)
  - [ ] 39-05-PLAN.md — Wave 3 verify: full lint + protected-pipeline + DSET-01..08 anchor sweep; produce 39-05-VERIFICATION.md with DSET traceability + 5-row ROADMAP criteria checklist

### Phase 40: KB & Memory Lifecycle
**Goal**: `/orq-agent:kb` and a new memory-store generator apply KB-vs-memory discipline, verified chunking, retrieval quality testing, and full memory read/write/recall wiring before a deployment uses them.
**Depends on**: Phase 34
**Tier**: deploy+
**Requirements**: KBM-01, KBM-02, KBM-03, KBM-04, KBM-05
**Success Criteria** (what must be TRUE):
  1. KB command tests retrieval quality with sample queries after chunking and refuses to wire the KB to a deployment if relevant chunks are not returned.
  2. KB command verifies the embedding model is activated in AI Router before any KB creation attempt; missing activation produces a clear remediation step.
  3. KB command picks chunking strategy from content type (sentence for prose, recursive for structured docs) and records the choice in the KB metadata.
  4. Pipeline enforces a documented KB-vs-Memory decision rule; attempts to use memory for docs/FAQs or KBs for conversation context are blocked with guidance.
  5. Memory-store generator creates memory stores with descriptive keys, wires agents with the right memory instructions, and runs a read/write/recall round-trip test before handoff.
**Plans**: 6 plans
  - [ ] 40-01-PLAN.md — Wave 1: enhance orq-agent/commands/kb.md with Step 1b mode dispatch + Step 7.0 embedding activation + Step 7.1.5 chunking picker + Step 7.6 retrieval quality test + KB-vs-Memory rule (KBM-01..04)
  - [ ] 40-02-PLAN.md — Wave 1: enhance orq-agent/agents/kb-generator.md with Chunking Strategy Policy + manifest.json emission (KBM-01, KBM-02, KBM-03)
  - [ ] 40-03-PLAN.md — Wave 1: create orq-agent/agents/memory-store-generator.md subagent with full 9 SKST + read/write/recall round-trip test (KBM-05)
  - [ ] 40-04-PLAN.md — Wave 1: create 3 resources under orq-agent/commands/kb/resources/ (chunking-strategies, kb-vs-memory, retrieval-test-template) (KBM-01, KBM-03, KBM-04)
  - [x] 40-05-PLAN.md — Wave 2: index-wire into SKILL.md (Phase 40 H3 block + subagent row + Directory Structure + Resources Policy) + help.md (/orq-agent:kb flag summary) (completed 2026-04-21)
  - [ ] 40-06-PLAN.md — Wave 3: full lint + protected-pipeline + KBM-01..05 anchor sweep; produce 40-06-VERIFICATION.md with KBM traceability + 5-row ROADMAP criteria checklist

### Phase 41: Prompt Optimization & Cross-Framework Comparison
**Goal**: Users can proactively improve a single prompt against the 11-guideline framework and benchmark the same agent across frameworks with fair comparison semantics.
**Depends on**: Phase 34
**Tier**: deploy+
**Requirements**: POPT-01, POPT-02, POPT-03, POPT-04, XFRM-01, XFRM-02, XFRM-03
**Success Criteria** (what must be TRUE):
  1. Prompt-optimization skill fetches a target prompt (inline text or orq.ai prompt key), preserves `{{variable}}` placeholders literally, and produces up to 5 actionable suggestions mapped to the 11-guideline framework (role, task, stress, guidelines, output format, tool calling, reasoning, examples, unnecessary content, variable usage, recap).
  2. Skill rewrites the prompt from accepted suggestions, presents a diff, and only applies the change after explicit user approval; the rewritten prompt is created as a new version on orq.ai preserving the original for rollback, and `run-experiment` / A/B validation is recommended.
  3. Cross-framework skill generates an `evaluatorq` comparison script (Python or TypeScript) with one job per agent across orq.ai, LangGraph, CrewAI, OpenAI Agents SDK, and Vercel AI SDK.
  4. Script enforces fairness — same dataset, same evaluator(s), same model unless model isolation is the explicit goal — and verifies each agent is independently invocable before running the full experiment.
  5. Comparison results surface side-by-side in the orq.ai Experiment UI.
**Plans**: 5 plans
  - [ ] 41-01-PLAN.md — Wave 1: create orq-agent/commands/prompt-optimization.md with 9 SKST sections + 11 guideline anchors + {{variable}} preservation + ≤5 suggestions + diff + AskUserQuestion + new-version creation (POPT-01..04)
  - [ ] 41-02-PLAN.md — Wave 1: create orq-agent/commands/compare-frameworks.md with 9 SKST sections + 5 framework names + evaluatorq Python/TS script + fairness checks + smoke-invocation precheck + --isolate-model + --lang python|ts (XFRM-01..03)
  - [ ] 41-03-PLAN.md — Wave 1: create 4 single-consumer resources under commands/prompt-optimization/resources/ and commands/compare-frameworks/resources/ (11-guidelines, rewrite-examples, evaluatorq-script-templates, framework-adapters)
  - [x] 41-04-PLAN.md — Wave 2: index-wire into orq-agent/SKILL.md (Phase 41 H3 block + Directory Structure + Resources Policy migration status) + orq-agent/commands/help.md (banner + flag summaries) (completed 2026-04-21)
  - [ ] 41-05-PLAN.md — Wave 3: full lint + protected-pipeline SHA-256 + POPT/XFRM anchor sweep; write 41-05-VERIFICATION.md with POPT-01..04 + XFRM-01..03 traceability + 5-row ROADMAP criteria checklist

### Phase 42: Evaluator Validation & Iterator Enrichments
**Goal**: Tester, failure-diagnoser, iterator, and hardener enforce eval-science methodology — binary-first judges with measured TPR/TNR, prevalence correction, outcome-based grading, P0/P1/P2 action plans, regression flagging, evaluator-version A/B, inter-annotator agreement, overfitting detection, and sample-rate-aware guardrail promotion — so quality signals stay trustworthy at production scale.
**Depends on**: Phase 38, Phase 39
**Tier**: full
**Requirements**: EVLD-01, EVLD-02, EVLD-03, EVLD-04, EVLD-05, EVLD-06, EVLD-07, EVLD-08, EVLD-09, EVLD-10, EVLD-11, ESCI-01, ESCI-02, ESCI-03, ESCI-04, ESCI-05, ESCI-06, ESCI-07, ESCI-08, ITRX-01, ITRX-02, ITRX-03, ITRX-04, ITRX-05, ITRX-06, ITRX-07, ITRX-08, ITRX-09
**Success Criteria** (what must be TRUE):
  1. All new LLM-as-judge evaluators default to binary Pass/Fail; continuous scales require explicit justification; bundled criteria are split one-evaluator-per-failure-mode; judge prompts follow the 4-component template (role, task, criterion + pass/fail definitions, examples, chain-of-thought-before-answer JSON).
  2. System programmatically creates orq.ai Annotation Queue / Human Review entities (via MCP or REST) — name, description, categorical Pass/Fail + sentiment OR numeric range OR free text — guides collection of 100+ balanced human labels, splits into disjoint train/dev/test (10-20% / 40-45% / 40-45%) with no dev/test leakage into few-shot, measures TPR and TNR on a held-out set with ≥30 Pass / ≥30 Fail, and stores results with the evaluator; prevalence correction is applied when reporting estimated true success rates; inter-annotator agreement is computed whenever ≥2 humans label the same item and flagged < 85% for re-calibration.
  3. Hardener refuses to promote any evaluator to a runtime guardrail unless TPR ≥ 90% AND TNR ≥ 90% on the test set; a configurable, tier-gated human-review-queue hook can require a minimum number of human-reviewed spans before promotion; promotion also sets an evaluator `sample_rate` with volume-based defaults (100% for <1K/day, 30% for 1K–100K/day, 10% for ≥100K/day) so high-volume agents do not pay full LLM-judge cost on every invocation.
  4. Failure-diagnoser classifies every failure as specification / generalization / dataset / evaluator before proposing fixes, grades outcomes not paths (no evaluator encodes exact tool-call sequences), separates dataset-quality issues (mislabeled data, missing references, contradictions) from evaluator-quality issues in its output, and iterator publishes inspectable decision trees ("prompt fix vs evaluator," "upgrade model?," "eval good enough?").
  5. Iterator produces P0/P1/P2-prioritized Action Plans with Evidence and Success Criteria, supports evaluator-version A/B (both the current and proposed evaluator prompt attached to the same experiment as separate columns for per-datapoint comparison), absorbs free-text human-annotation comments into diff proposal reasoning, refuses to re-run the same optimizer on the same prompt without explicit override; tester emits a run-comparison table, flags suspected overfitting when a newly-iterated evaluator scores ≥ 98% on a dataset < 100 datapoints, tracks capability suites separately from regression suites, and warns when average pass rate ≥ 95%; results-analyzer flags regressions when any score drops with a ⚠️ marker.
**Plans**: TBD

### Phase 43: Cross-IDE Distribution & Manifests
**Goal**: The repo installs cleanly across Claude Code, Cursor, Codex, and skills-only IDEs with validated plugin manifests, a single-source MCP registration, and CI/CD scaffolds — so V3.0 capabilities reach users outside Claude Code and can run unattended in a pipeline.
**Depends on**: Phase 34
**Tier**: core
**Requirements**: DIST-01, DIST-02, DIST-03, DIST-04, DIST-05, DIST-06, DIST-07
**Success Criteria** (what must be TRUE):
  1. Repo ships `.claude-plugin/plugin.json` enabling one-line install via `/plugin install github:NCrutzen/orqai-agent-pipeline`.
  2. Repo ships `.cursor-plugin/plugin.json` referencing `./skills/` and `./.mcp.json`, loadable from `~/.cursor/plugins/local/`, and `.codex-plugin/plugin.json` at `plugins/orq/` with a repo-level `.agents/plugins/marketplace.json`.
  3. Repo ships root `mcp.json` / `.mcp.json` registering the `orq-workspace` MCP server with `${ORQ_API_KEY}` expansion.
  4. Repo is installable via `npx skills add NCrutzen/orqai-agent-pipeline` for Cursor/Gemini/Cline/Copilot/Windsurf users who only want the skills layer.
  5. `tests/scripts/validate-plugin-manifests.sh` plus `tests/commands.md`, `tests/skills.md`, `tests/mcp-tools.md` exist and pass in CI; a GitHub Actions workflow and a GitLab CI template run `/orq-agent:test` on a deployed agent and fail the build when results-analyzer (ITRX-04) detects a regression.
**Plans**: TBD

## Progress

**Execution Order:**
Next active phase: Phase 34 (V3.0 milestone).

## Progress Summary

| Version | Phase | Plans Complete | Status | Completed |
|---------|-------|----------------|--------|-----------|
| v0.3 | 1-05.2 (11 phases) | 28/28 | **Shipped** | 2026-03-01 |
| V2.0 | 6-11 (7 phases) | 11/11 | **Shipped** | 2026-03-02 |
| V2.1 | 26-33 (8 phases) | 9/9 | **Shipped** | 2026-03-13 |
| V3.0 | 34. Skill Structure & Format Foundation | 5/5 | Complete    | 2026-04-20 |
| V3.0 | 35. Model Selection Discipline | 5/5 | Complete    | 2026-04-20 |
| V3.0 | 36. Lifecycle Slash Commands | 8/8 | Complete    | 2026-04-20 |
| V3.0 | 37. Observability Setup Skill | 5/5 | Complete    | 2026-04-21 |
| V3.0 | 38. Trace Failure Analysis Skill | 4/4 | Complete    | 2026-04-21 |
| V3.0 | 39. Dataset Generator Enhancements | 0/5 | Complete    | 2026-04-21 |
| V3.0 | 40. KB & Memory Lifecycle | 6/6 | Complete    | 2026-04-21 |
| V3.0 | 41. Prompt Optimization & Cross-Framework Comparison | 3/5 | Complete    | 2026-04-21 |
| V3.0 | 42. Evaluator Validation & Iterator Enrichments | 0/TBD | Not started | - |
| V3.0 | 43. Cross-IDE Distribution & Manifests | 0/TBD | Not started | - |
| V4.0 | 44-48 (5 phases) | 0/TBD | **Defined** | - |
| V5.0 | 49-52 (4 phases) | 0/TBD | **Defined** | - |
