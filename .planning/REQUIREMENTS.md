# Requirements: Orq Agent Designer

**Defined:** 2026-03-15 (v0.3/V2.0/V2.1), updated 2026-04-20 (V3.0)
**Core Value:** Any colleague can go from a use case description to deployed, tested agents on Orq.ai -- through an automated pipeline with real-time visibility and HITL approvals -- without needing to understand the underlying AI platform.

## V3.0 Requirements — Lifecycle Completeness & Eval Science

Derived from the 2026-04-20 gap analysis against orq-ai/assistant-plugins. Shifts our pipeline from a spec-generator into a full Build → Evaluate → Optimize lifecycle tool while preserving the generation loop. REQ-IDs grouped by capability area.

### Lifecycle Commands (LCMD)

Thin MCP-backed slash commands that give users direct visibility into their workspace without leaving Claude Code.

- [x] **LCMD-01**: User can run `/orq-agent:workspace [section]` to see a single-screen overview of agents, deployments, prompts, datasets, experiments, projects, KBs, and evaluators (with analytics summary line)
- [x] **LCMD-02**: User can run `/orq-agent:traces [--deployment] [--status] [--last] [--limit]` to query and summarize production traces, grouped errors-first with full trace IDs
- [x] **LCMD-03**: User can run `/orq-agent:analytics [--last] [--group-by]` to view requests/cost/tokens/error rate with optional model/deployment/agent/status drill-down
- [x] **LCMD-04**: User can run `/orq-agent:models [search-term]` to list Model Garden models by type (chat/embedding/image/rerank/etc.) with provider grouping
- [x] **LCMD-05**: User can run `/orq-agent:quickstart` for interactive onboarding — API-key check, MCP registration, first-skill routing
- [x] **LCMD-06**: User can run `/orq-agent:automations` to list/create Orq.ai Trace Automation rules that auto-kick-off an experiment when new traces match a filter, closing the production-monitoring loop without leaving Claude Code
- [x] **LCMD-07**: `/orq-agent:quickstart` delivers a 12-step interactive tour modeled on the orq.ai webinar flow — connect MCP → enable models → create project → build agent → invoke → analyze traces → build evaluator → build dataset → run experiment → human review → annotation analysis → promote evaluator (each step has a copy-paste prompt the user runs sequentially)

### Observability Setup (OBSV)

New skill for instrumenting LLM applications so downstream trace-analysis and eval workflows have signal to work with.

- [ ] **OBSV-01**: Skill detects user's LLM framework (OpenAI SDK, LangChain, CrewAI, Vercel AI, etc.) and existing instrumentation state
- [ ] **OBSV-02**: Skill recommends integration mode — AI Router (zero-code), OTEL-only, or both — based on detection
- [x] **OBSV-03**: Skill generates framework-specific integration code with correct import order (instrumentors before SDK clients)
- [ ] **OBSV-04**: Skill verifies baseline trace quality — traces appearing, model/tokens captured, span hierarchy, no PII
- [ ] **OBSV-05**: Skill enriches traces with session_id, user_id, feature tags, customer_id when inferred from code
- [ ] **OBSV-06**: Skill guides `@traced` decorator placement for custom spans (agent/llm/tool/retrieval/embedding/function types)
- [ ] **OBSV-07**: Skill documents attaching `identity` attributes to traces (per-customer / per-tenant attribution) and guides filtering traces by identity via `/orq-agent:traces` — enables per-client cost/quality reporting with billing margins

### Trace Failure Analysis (TFAIL)

New skill for mining production traces into actionable failure taxonomies using grounded-theory methodology.

- [ ] **TFAIL-01**: Skill samples traces via mixed strategy (random 50% + failure-driven 30% + outlier 20%) targeting ~100 traces
- [ ] **TFAIL-02**: Skill supports open-coding phase (freeform annotations per trace) and axial-coding phase (grouping into 4-8 non-overlapping failure modes)
- [ ] **TFAIL-03**: Skill identifies the first upstream failure in each trace, never labels downstream cascading effects
- [ ] **TFAIL-04**: Skill produces a transition failure matrix for multi-step pipelines (rows = last success, columns = first failure)
- [ ] **TFAIL-05**: Skill classifies each failure mode as specification / generalization (code-checkable) / generalization (subjective) / trivial bug
- [ ] **TFAIL-06**: Skill outputs an error-analysis report with failure taxonomy, rates, example traces, and recommended next steps (hand off to build-evaluator / optimize-prompt / etc.)

### Evaluator Validation (EVLD)

Extends our tester/hardener with the validation protocol the reference enforces: binary judges with measured TPR/TNR on held-out human-labeled test sets.

- [ ] **EVLD-01**: System defaults all new LLM-as-judge evaluators to binary Pass/Fail; continuous scales require explicit justification in the spec
- [ ] **EVLD-02**: System enforces one evaluator per failure mode — bundled criteria get split automatically
- [ ] **EVLD-03**: Skill generates judge prompts using the 4-component template (role, task, criterion, pass/fail definitions, examples, chain-of-thought-before-answer JSON output)
- [ ] **EVLD-04**: System guides collection of 100+ human labels per criterion via orq.ai Annotation Queues or Human Review, balanced ~50 Pass / ~50 Fail
- [ ] **EVLD-05**: System splits labeled data into disjoint train/dev/test (10-20% / 40-45% / 40-45%) and enforces no dev/test leakage into few-shot examples
- [ ] **EVLD-06**: System measures TPR and TNR on held-out test set (≥30 Pass / ≥30 Fail) before evaluator is marked validated; stores results with evaluator
- [ ] **EVLD-07**: System applies prevalence correction (`theta_hat = (p_observed + TNR - 1) / (TPR + TNR - 1)`) when reporting estimated true success rates from imperfect judges
- [ ] **EVLD-08**: Hardener rejects promotion of any evaluator to a runtime guardrail unless TPR ≥ 90% AND TNR ≥ 90% on the test set
- [ ] **EVLD-09**: System creates orq.ai Annotation Queue / Human Review entities programmatically (via MCP or REST) — name, description, categorical Pass/Fail + sentiment OR numeric range OR free-text field — rather than only suggesting users create them in the Studio UI
- [ ] **EVLD-10**: Results-analyzer computes inter-annotator agreement when ≥2 humans label the same trace/datapoint; flags criteria with IAA < 85% for re-calibration before they feed evaluator validation
- [ ] **EVLD-11**: Iterator supports evaluator-version A/B by attaching both the current and proposed evaluator prompt as separate columns in the same experiment, enabling per-datapoint judgment comparison (not just score averages)

### Prompt Optimization (POPT)

New skill for proactive prompt review using the 11-point prompting guidelines framework.

- [ ] **POPT-01**: Skill fetches a target prompt (inline text or orq.ai prompt key) and preserves template variables (`{{variable}}`) literally
- [ ] **POPT-02**: Skill analyzes the prompt against the 11-guideline framework (role, task, stress, guidelines, output format, tool calling, reasoning, examples, unnecessary content, variable usage, recap) and produces up to 5 actionable suggestions
- [ ] **POPT-03**: Skill rewrites the prompt from accepted suggestions, presents a diff, and only applies after explicit user approval
- [ ] **POPT-04**: Skill creates the rewritten prompt as a new version on orq.ai, preserving the original for rollback, and recommends `run-experiment` / A/B validation

### Cross-Framework Comparison (XFRM)

New skill for benchmarking agents across frameworks using `evaluatorq`.

- [ ] **XFRM-01**: Skill generates an `evaluatorq` comparison script (Python or TypeScript) with one job per agent across supported frameworks (orq.ai, LangGraph, CrewAI, OpenAI Agents SDK, Vercel AI SDK)
- [ ] **XFRM-02**: Skill enforces fairness — same dataset, same evaluator(s), same model (unless model isolation is the explicit goal)
- [ ] **XFRM-03**: Skill verifies each agent is independently invocable before running the full experiment, and reports results side-by-side in the orq.ai Experiment UI

### Eval Science Methodology (ESCI)

Cross-cutting rules applied across tester, failure-diagnoser, iterator, hardener, and new evaluator skill.

- [ ] **ESCI-01**: Failure-diagnoser classifies every failure as specification / generalization / dataset / evaluator before proposing fixes
- [ ] **ESCI-02**: Failure-diagnoser and iterator grade outcomes, not paths — no evaluator encodes exact tool-call sequences
- [ ] **ESCI-03**: Tester uses isolated graders per quality dimension (tool selection, argument quality, output interpretation) rather than one omnibus grader
- [ ] **ESCI-04**: Tester tracks capability suites (expect low pass-rate initially) separately from regression suites (expect near-100% pass-rate); graduates items on sustained success
- [ ] **ESCI-05**: Tester surfaces a warning when average pass rate ≥ 95% — flagged as "eval may be too easy," targets 70-85%
- [ ] **ESCI-06**: Iterator publishes explicit decision trees users can inspect: "prompt fix vs evaluator," "upgrade model?," "eval good enough?"
- [ ] **ESCI-07**: Tester flags suspected overfitting when a newly-iterated evaluator scores ≥ 98% on a dataset smaller than 100 datapoints; recommends dataset expansion before the evaluator is marked validated
- [ ] **ESCI-08**: Failure-diagnoser separates dataset-quality issues (mislabeled data, missing reference outputs, contradictory cases) from evaluator-quality issues in its output — each gets its own action-plan section rather than being conflated

### Dataset Generation (DSET)

Enhancements to dataset-generator and the standalone `/orq-agent:datasets` command.

- [ ] **DSET-01**: Dataset-generator supports a structured two-step mode: dimensions (3-6) → tuples (combinations, manual-then-LLM-scaled) → natural-language inputs generated in a separate pass
- [ ] **DSET-02**: Datasets include 15-20% adversarial cases from an 8-vector catalog (persona-breaking, instruction override, language switching, formality mismatch, refusal, format forcing, multi-turn manipulation, contradiction), ≥3 per relevant vector
- [ ] **DSET-03**: Dataset-generator enforces coverage rules — every dimension value appears in ≥2 datapoints, no value dominates >30%
- [ ] **DSET-04**: Dataset-generator supports a curation mode (Mode 4) for deduplication, rebalancing, gap-filling, and contradiction resolution on existing datasets, with user confirmation before deletions
- [ ] **DSET-05**: Every datapoint is tagged by category AND dimension to enable slice analysis in results-analyzer
- [ ] **DSET-06**: Dataset-generator produces a multi-turn shape (Messages column + perturbation scenarios) for conversational agents
- [ ] **DSET-07**: Dataset-generator produces a RAG-specific shape (expected source chunk IDs in reference) for agents with KBs
- [ ] **DSET-08**: User can promote a production trace directly into a dataset as a regression test case, preserving the trace's input, output, intermediate steps, and metadata — enables continuous dataset curation from real traffic

### Knowledge Base & Memory (KBM)

Improvements to `/orq-agent:kb` plus a new memory-store generator.

- [ ] **KBM-01**: KB command tests retrieval quality after chunking (sample queries → verify relevant chunks returned) before the KB is wired to a deployment
- [ ] **KBM-02**: KB command verifies the embedding model is activated in AI Router before attempting KB creation
- [ ] **KBM-03**: KB command picks the chunking strategy based on content type — sentence for prose, recursive for structured docs — and documents the choice
- [ ] **KBM-04**: Pipeline distinguishes KB (static reference data) from Memory Store (dynamic user context) with an explicit decision rule; agents never use memory for docs/FAQs or KBs for conversation context
- [ ] **KBM-05**: Pipeline includes a memory-store generator — creates memory stores with descriptive keys, wires agents with memory instructions, tests read/write/recall cycle

### Model Selection (MSEL)

Researcher and spec-generator discipline around model choice.

- [x] **MSEL-01**: Researcher starts recommendations with the most capable tier model for the task; budget-profile-driven downgrades only trigger after a quality baseline run
- [x] **MSEL-02**: Spec-generator pins production model references to a specific snapshot/version (e.g., `claude-sonnet-4-5-20250929`), not a floating alias
- [x] **MSEL-03**: Researcher supports a model-cascade pattern (cheap-first with escalation on low confidence) with mandatory quality-equivalence experiment before the cascade is approved

### Skill Structure & Agent Skills Format (SKST)

Structural conventions aligned with the Agent Skills standard.

- [x] **SKST-01**: Every skill file (top-level and subagent) declares `allowed-tools` in YAML frontmatter (e.g., `Bash, Read, Write, Edit, Grep, Glob, WebFetch, Task, AskUserQuestion, orq*`)
- [x] **SKST-02**: Skill-specific long-form docs live under `<skill>/resources/` co-located with the skill, not in the flat root `references/` directory
- [x] **SKST-03**: Every skill includes "When to use" and "When NOT to use" sections with explicit trigger phrases and anti-triggers
- [x] **SKST-04**: Every skill lists Companion Skills with directional handoffs (e.g., "→ build-evaluator after taxonomy")
- [x] **SKST-05**: Every skill declares a "Done When" checklist with falsifiable criteria
- [x] **SKST-06**: Every skill opens with a Constraints block (NEVER/ALWAYS rules) followed by a "Why these constraints:" paragraph
- [x] **SKST-07**: Every skill includes an Anti-Patterns table at the bottom (pattern → what to do instead)
- [x] **SKST-08**: Every skill declares a Destructive Actions list that requires `AskUserQuestion` confirmation (e.g., overwriting configs, deleting resources)
- [x] **SKST-09**: Every skill includes a Documentation & Resolution footer that establishes trust order (MCP tools > docs MCP > docs.orq.ai > skill file)
- [x] **SKST-10**: Every skill includes an "Open in orq.ai" section with deep links to Experiments/Traces/Agent Studio

### Distribution — Cross-IDE (DIST)

Optional multi-IDE plugin support. Lower priority than lifecycle capabilities.

- [ ] **DIST-01**: Repo ships a `.claude-plugin/plugin.json` manifest for one-line install via `/plugin install github:NCrutzen/orqai-agent-pipeline`
- [ ] **DIST-02**: Repo ships a `.cursor-plugin/plugin.json` manifest referencing `./skills/` and `./.mcp.json`, loadable from `~/.cursor/plugins/local/`
- [ ] **DIST-03**: Repo ships a `.codex-plugin/plugin.json` manifest at `plugins/orq/` with a repo-level `.agents/plugins/marketplace.json`
- [ ] **DIST-04**: Repo ships root `mcp.json` / `.mcp.json` registering the `orq-workspace` MCP server with `${ORQ_API_KEY}` expansion
- [ ] **DIST-05**: Repo is installable via `npx skills add NCrutzen/orqai-agent-pipeline` (skills-only path for Cursor/Gemini/Cline/Copilot/Windsurf)
- [ ] **DIST-06**: Repo includes `tests/scripts/validate-plugin-manifests.sh` plus `tests/commands.md`, `tests/skills.md`, `tests/mcp-tools.md` specifying expected behavior per capability
- [ ] **DIST-07**: Repo ships CI/CD scaffolds — GitHub Actions workflow + GitLab CI template — that run `/orq-agent:test` on a deployed agent and fail the build on regression detected by results-analyzer (ITRX-04)

### Iterator/Hardener Enrichments (ITRX)

Upgrades to existing iterator and hardener subagents with methodology from the reference.

- [ ] **ITRX-01**: Iterator assigns P0/P1/P2 priority to every proposed improvement (P0: prompt wording, few-shot, constraints; P1: decomposition, tool descriptions, RAG tuning; P2: model upgrade, expand eval set, fine-tuning)
- [ ] **ITRX-02**: Iterator produces a structured Action Plan (Summary + Priority Improvements + Re-run Criteria) per iteration, in addition to the existing iteration-log.json
- [ ] **ITRX-03**: Tester produces a run-comparison table across iterations (Run | Date | Model | Avg Score | Cost | Key Changes) for trend tracking
- [ ] **ITRX-04**: Results-analyzer flags regressions when any score drops vs the previous run (⚠️ marker in output)
- [ ] **ITRX-05**: Iterator refuses to re-run the same optimizer on the same prompt without an explicit user override (no-drift rule)
- [ ] **ITRX-06**: Hardener exposes a human-review-queue hook — promoting an evaluator to a guardrail can require a minimum number of human-reviewed spans (configurable, tier-gated)
- [ ] **ITRX-07**: Iterator ticket output includes Evidence (datapoints affected, current scores, run ID) and Success Criteria (target re-run score), not just the proposed diff
- [ ] **ITRX-08**: Hardener sets an evaluator `sample_rate` when promoting to a runtime guardrail — configurable percentage with volume-based defaults (e.g., 100% for <1K/day, 30% for 1K–100K/day, 10% for ≥100K/day) so high-volume agents do not pay full LLM-judge cost on every invocation
- [ ] **ITRX-09**: Iterator absorbs free-text human-annotation comments as signal when proposing prompt diffs; each diff proposal cites the relevant annotator reasoning inline, not just the Pass/Fail label

## Tier-Gating (cross-cutting)

V3.0 respects existing tier semantics. Mapping:

| Requirement cluster | Tier required |
|--------------------|---------------|
| LCMD, SKST, DIST, MSEL | **core** (no API calls for structural items; LCMD uses MCP so effectively runs wherever MCP is registered) |
| OBSV | **core** (guidance-only for most cases; no Orq.ai API writes) |
| TFAIL, POPT, XFRM | **deploy+** (reads traces / prompt versions / runs experiments) |
| DSET, KBM improvements | **deploy+** (creates datasets / KBs / memory stores) |
| EVLD, ESCI, ITRX | **full** (evaluator validation + iteration enrichments; EVLD-04's human-label dependency is the strongest tier-gate) |

## Future Requirements

### V4.0 Cross-Swarm Intelligence

- **XSWM-01**: Unified inventory of all swarms from local specs and live Orq.ai state
- **XSWM-02**: Drift detection between spec and deployed state
- **XSWM-03**: Overlap and gap analysis across swarms
- **XSWM-04**: Structured fix proposals with HITL approval

### V5.0 Browser Automation

- **BRWS-01**: Playwright script generation for deterministic browser flows
- **BRWS-02**: VPS-hosted MCP server for script execution
- **BRWS-03**: Agent spec wiring with browser automation MCP tools

## Out of Scope

| Feature | Reason |
|---------|--------|
| Real-time agent monitoring | Orq.ai handles this natively; no need to duplicate |
| Zapier integration | Existing Orq.ai Zapier integration covers this |
| Rewriting existing V2.0/V2.1 subagents from scratch | Additive-only; ESCI/ITRX enhances existing subagents in-place |
| Auto-collecting human labels | EVLD-04 guides users to annotation queues; we do not simulate human labels via LLM (explicitly banned in reference) |
| Backwards-compatible Likert scales | Binary Pass/Fail is the default for all new LLM evaluators; existing ones get decomposed, not dual-emitted |

## Traceability

Populated during roadmap creation (2026-04-20). All 86 V3.0 requirements mapped across 10 phases (34-43). 12 amendments added 2026-04-20 from orq.ai webinar review (LCMD-06, LCMD-07, OBSV-07, DSET-08, EVLD-09, EVLD-10, EVLD-11, ESCI-07, ESCI-08, ITRX-08, ITRX-09, DIST-07).

| Requirement | Phase | Status |
|-------------|-------|--------|
| LCMD-01 | 36 | Complete |
| LCMD-02 | 36 | Complete |
| LCMD-03 | 36 | Complete |
| LCMD-04 | 36 | Complete |
| LCMD-05 | 36 | Complete |
| LCMD-06 | 36 | Complete |
| LCMD-07 | 36 | Complete |
| OBSV-01 | 37 | Pending |
| OBSV-02 | 37 | Pending |
| OBSV-03 | 37 | Complete |
| OBSV-04 | 37 | Pending |
| OBSV-05 | 37 | Pending |
| OBSV-06 | 37 | Pending |
| OBSV-07 | 37 | Pending |
| TFAIL-01 | 38 | Pending |
| TFAIL-02 | 38 | Pending |
| TFAIL-03 | 38 | Pending |
| TFAIL-04 | 38 | Pending |
| TFAIL-05 | 38 | Pending |
| TFAIL-06 | 38 | Pending |
| EVLD-01 | 42 | Pending |
| EVLD-02 | 42 | Pending |
| EVLD-03 | 42 | Pending |
| EVLD-04 | 42 | Pending |
| EVLD-05 | 42 | Pending |
| EVLD-06 | 42 | Pending |
| EVLD-07 | 42 | Pending |
| EVLD-08 | 42 | Pending |
| EVLD-09 | 42 | Pending |
| EVLD-10 | 42 | Pending |
| EVLD-11 | 42 | Pending |
| POPT-01 | 41 | Pending |
| POPT-02 | 41 | Pending |
| POPT-03 | 41 | Pending |
| POPT-04 | 41 | Pending |
| XFRM-01 | 41 | Pending |
| XFRM-02 | 41 | Pending |
| XFRM-03 | 41 | Pending |
| ESCI-01 | 42 | Pending |
| ESCI-02 | 42 | Pending |
| ESCI-03 | 42 | Pending |
| ESCI-04 | 42 | Pending |
| ESCI-05 | 42 | Pending |
| ESCI-06 | 42 | Pending |
| ESCI-07 | 42 | Pending |
| ESCI-08 | 42 | Pending |
| DSET-01 | 39 | Pending |
| DSET-02 | 39 | Pending |
| DSET-03 | 39 | Pending |
| DSET-04 | 39 | Pending |
| DSET-05 | 39 | Pending |
| DSET-06 | 39 | Pending |
| DSET-07 | 39 | Pending |
| DSET-08 | 39 | Pending |
| KBM-01 | 40 | Pending |
| KBM-02 | 40 | Pending |
| KBM-03 | 40 | Pending |
| KBM-04 | 40 | Pending |
| KBM-05 | 40 | Pending |
| MSEL-01 | 35 | Complete |
| MSEL-02 | 35 | Complete |
| MSEL-03 | 35 | Complete |
| SKST-01 | 34 | Complete |
| SKST-02 | 34 | Complete |
| SKST-03 | 34 | Complete |
| SKST-04 | 34 | Complete |
| SKST-05 | 34 | Complete |
| SKST-06 | 34 | Complete |
| SKST-07 | 34 | Complete |
| SKST-08 | 34 | Complete |
| SKST-09 | 34 | Complete |
| SKST-10 | 34 | Complete |
| DIST-01 | 43 | Pending |
| DIST-02 | 43 | Pending |
| DIST-03 | 43 | Pending |
| DIST-04 | 43 | Pending |
| DIST-05 | 43 | Pending |
| DIST-06 | 43 | Pending |
| DIST-07 | 43 | Pending |
| ITRX-01 | 42 | Pending |
| ITRX-02 | 42 | Pending |
| ITRX-03 | 42 | Pending |
| ITRX-04 | 42 | Pending |
| ITRX-05 | 42 | Pending |
| ITRX-06 | 42 | Pending |
| ITRX-07 | 42 | Pending |
| ITRX-08 | 42 | Pending |
| ITRX-09 | 42 | Pending |

**Coverage:**
- V3.0 requirements: 86 total
- Mapped to phases: 86 (100%)
- Unmapped: 0

---
*Requirements defined: 2026-03-15 (earlier milestones)*
*Last updated: 2026-04-20 — V3.0 traceability populated (10 phases, 34-43) + 12 webinar-derived amendments*
