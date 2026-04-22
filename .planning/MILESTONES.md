# Milestones

## v3.0 Lifecycle Completeness & Eval Science (Shipped: 2026-04-22)

**Phases completed:** 10 phases (34-43), 52 plans
**Timeline:** 3 days (2026-04-20 → 2026-04-22)
**Requirements:** 88/88 satisfied (SKST, MSEL, LCMD, OBSV, TFAIL, DSET, KBM, POPT, XFRM, EVLD, ESCI, ITRX, DIST)

**Key accomplishments:**
1. Agent Skills format foundation — 34 skill files conform to 9-section SKST contract, lint script enforces conformance, 3 protected entry points byte-identical via SHA-256 pipeline hash (Phase 34)
2. Capable-first, snapshot-pinned, cascade-aware model selection policy in researcher + spec-generator with `snapshot-pinned-models` lint rule and Capable Tier lookup seed (Phase 35)
3. Six new lifecycle slash commands — `/orq-agent:workspace`, `:traces`, `:analytics`, `:models`, `:quickstart`, `:automations` — thin MCP-backed (Phase 36)
4. Observability setup skill — framework detection, 3-mode integration (AI Router / OTEL / both), 5 framework snippets, per-tenant `identity` attribution wired through `/orq-agent:traces --identity` (Phase 37)
5. Trace failure analysis skill — grounded-theory taxonomy (4-8 modes), 50/30/20 sampling, first-upstream-failure rule, transition matrix, 4-class handoff (Phase 38)
6. Dataset generator upgrades — two-step mode, 8-vector adversarial catalog, coverage rules, Curation Mode 4, multi-turn + RAG shapes, promote-trace → regression datapoint (Phase 39)
7. KB & Memory lifecycle — retrieval-quality gate, embedding-activation check, content-type chunking policy, KB-vs-Memory blocking rule, new `memory-store-generator` subagent with round-trip test (Phase 40)
8. Prompt optimization (11-guideline framework, diff + new-version) + cross-framework comparison (evaluatorq script across 5 frameworks with fairness guards) (Phase 41)
9. Eval-science methodology across tester/failure-diagnoser/iterator/hardener/results-analyzer + new `evaluator-validator` — binary Pass/Fail default, TPR/TNR ≥ 90% gate, prevalence correction, P0/P1/P2 action plans, regression ⚠️ flagging, sample_rate volume defaults, inter-annotator agreement (Phase 42)
10. Cross-IDE distribution — `.cursor-plugin`/`.codex-plugin`/`.agents/plugins` manifests, root `.mcp.json`/`mcp.json`, `package.json` for `npx skills add`, manifest validator, GitHub Actions + GitLab CI that fail on ITRX-04 regression (Phase 43)

**Tech debt accepted:** 22 deferred manual LLM/MCP smokes across 9 phases — all require live Orq.ai workspace to exercise (see v3.0-MILESTONE-AUDIT.md). Run `/gsd:verify-work <phase>` when ready.

**Archive:** `milestones/v3.0-ROADMAP.md`, `milestones/v3.0-REQUIREMENTS.md`, `milestones/v3.0-MILESTONE-AUDIT.md`

---

## V2.1 Experiment Pipeline Restructure (Shipped: 2026-03-13)

**Phases completed:** 8 phases, 9 plans
**Timeline:** 3 days (2026-03-11 → 2026-03-13)
**Deliverables:** 5 new subagents + 2 rewritten commands (2,421 lines)
**Requirements:** 24/24 satisfied (DATA-01-05, EXPR-01-06, ANLZ-01-05, TEST-01-03, ITPIPE-01-06, LOOP-01-03)

**Key accomplishments:**
1. Dataset-preparer subagent with MCP/REST upload, smoke test validation, stratified 60/20/20 splits, and JSON handoff contract
2. Experiment-runner subagent with REST-only execution, adaptive 10-30s polling, holdout re-test mode, and per-run per-evaluator raw scores
3. Results-analyzer subagent with Student's t 95% CI statistics, role-based pass/fail thresholds, category-sliced scoring, and backward-compatible hardener output
4. Rewritten test.md orchestrating 3 subagents with validation gates between each step
5. Failure-diagnoser + prompt-editor subagents for section-level diagnosis, HITL-approved diffs, re-deploy delegation, and before/after score comparison
6. Rewritten iterate.md with 2-subagent loop, 5 stop conditions, and holdout re-test verification

**Tech debt accepted:** 1 non-blocking item (evaluator_ids passthrough optimization — see V2.1-MILESTONE-AUDIT.md)
**Archive:** `milestones/V2.1-ROADMAP.md`, `milestones/V2.1-REQUIREMENTS.md`

---

## V2.0 Autonomous Orq.ai Pipeline (Shipped: 2026-03-02)

**Phases completed:** 7 phases, 11 plans
**Timeline:** 2 days (2026-03-01 → 2026-03-02)
**Codebase:** 10,628 lines (orq-agent/ — markdown + JSON)
**Requirements:** 23/23 satisfied (DEPLOY-01-08, TEST-01-05, ITER-01-07, GUARD-01-03)

**Key accomplishments:**
1. Deployer subagent with MCP-first/REST-fallback deployment pipeline, idempotent create-or-update, and read-back verification
2. Tester subagent with V1.0 dataset transformation, role-based evaluator auto-selection, and 3x median experiment execution via evaluatorq SDK
3. Iterator subagent with evaluator-to-section failure diagnosis, diff-style proposals, HITL approval, and 4 automatic stopping conditions
4. Hardener subagent with evaluator-to-guardrail promotion via native Orq.ai `settings.guardrails` API and threshold-based quality gates
5. Per-agent incremental operations (`--agent` flag) across all 4 pipeline commands with interactive deploy picker
6. Complete data contract alignment across deploy/test/iterate/harden pipeline (holdout dataset paths, flag conventions, step numbering)

**Tech debt accepted:** 5 non-blocking items (see V2.0-MILESTONE-AUDIT.md)
**Archive:** `milestones/V2.0-ROADMAP.md`, `milestones/V2.0-REQUIREMENTS.md`

---

## v0.3 Core Pipeline + V2.0 Foundation (Shipped: 2026-03-01)

**Phases completed:** 11 phases (V1.0: 8, V2.0: 3), 28 plans, 147 commits
**Timeline:** 6 days (2026-02-24 → 2026-03-01)
**Codebase:** 43 files, 7,162 lines (markdown + shell + JSON)
**Requirements:** 50/50 satisfied (40 V1.0 + 10 V2.0)

**Key accomplishments:**
1. End-to-end agent swarm generation from natural language use cases — architect → researcher → spec-gen → orchestration → tools → datasets → README
2. Adaptive pipeline with structured discussion — surfaces domain gray areas, skips research when input is detailed
3. KB-aware pipeline — end-to-end knowledge base support from discussion through orchestration output
4. XML-tagged prompt strategy with Anthropic context engineering patterns across all 7 subagents
5. Tool resolver with unified catalog — verified recommendations for built-in, function, HTTP, MCP, and agent-as-tool types
6. Modular install with capability tiers (core/deploy/test/full) — API key validation, MCP auto-registration for V2.0

**Tech debt accepted:** 8 non-blocking items (see v0.3-MILESTONE-AUDIT.md)
**Archive:** `milestones/v0.3-ROADMAP.md`, `milestones/v0.3-REQUIREMENTS.md`

---

