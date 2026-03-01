# Project Research Summary

**Project:** V2.0 Autonomous Orq.ai Pipeline (Orq Agent Designer)
**Domain:** Autonomous LLM agent deployment, testing, and prompt iteration pipeline — Claude Code skill extension
**Researched:** 2026-03-01
**Confidence:** MEDIUM

## Executive Summary

V2.0 extends an existing, working Claude Code skill (V1.0) that generates Orq.ai agent specs from natural language. The extension adds three new automation stages — deploy, test, and iterate — transforming the tool from a spec generator into an end-to-end pipeline from natural language brief to production-ready, tested agents. The recommended approach uses the `@orq-ai/node` SDK as both the MCP server source and direct REST API client, with `@orq-ai/evaluatorq` for experiment execution. The architecture extends V1.0's subagent pattern with three new subagents (deployer, tester, iterator) wired into the existing orchestrator. V2.0 introduces npm dependencies for the first time — V1.0 was zero-dependency markdown-driven — and the install is modular (core/deploy/test/full tiers) to preserve V1.0 behavior for users who only want spec generation. Every autonomous operation requires explicit human approval before taking effect, which is a non-negotiable design constraint for the 5-15 non-technical user audience.

The core value proposition is the full loop: no competitor goes from natural language through spec generation, deployment, automated testing, and prompt iteration in a single CLI workflow. Braintrust, Promptfoo, and LangSmith each handle 1-2 stages but not the full integration. The integration IS the product and the moat. A critical architecture clarification emerged from research: despite the "MCP-first" framing in early design thinking, the Orq.ai MCP server's CRUD capabilities are not fully verified — it may be primarily a docs-access server. The REST API (`/v2/agents`, `/v2/tools`, `/v2/datasets`, `/v2/evaluators`) is the more stable and better-documented path. Implementation should treat REST API as primary and MCP as an optional enhancement to be validated at build time.

The top three risks that must be designed in from day one are: (1) runaway iteration loops that burn API budget without stopping conditions — hard caps at 3 iterations, 50 API calls, and 10 minutes must be built into the iteration controller before the first user touches it; (2) MCP state desync creating ghost deployments where Orq.ai's actual state diverges from local audit files — a verify-after-deploy pattern must be the foundation of every deployment operation; and (3) prompt overfitting to evaluation datasets that produces score inflation without real improvement — train/test/holdout splits must be enforced before the iteration loop is built, not added retroactively.

## Key Findings

### Recommended Stack

V2.0 introduces runtime npm dependencies for the first time. The Orq.ai Node SDK (`@orq-ai/node@^3.2.8`) serves dual purpose: it is both the TypeScript SDK for direct REST API calls and the source of the Orq.ai MCP server. Node.js >= 20 is required. The evaluatorq SDK (`@orq-ai/evaluatorq@^1.0.7`) is the dedicated experiment runner — it connects platform datasets to deployed agents, runs jobs, applies evaluators, and sends results to Orq.ai automatically. The `@orq-ai/evaluators` companion package provides ready-made cosine similarity evaluators but requires `OPENAI_API_KEY` for embeddings. Capability tiers determine which packages are installed: `core` (zero deps, V1.0 behavior), `deploy` (adds `@orq-ai/node` + MCP), `test` (adds evaluatorq packages), `full` (everything).

Tool CRUD is confirmed to require the REST API — it is not exposed via MCP. This is the most actionable stack constraint from research: the deployer subagent will always need two integration paths (MCP for agents, REST for tools), and both paths must be abstracted behind a single adapter interface. The agentic framework research confirms that V2.0's iteration loop is a direct implementation of Anthropic's evaluator-optimizer pattern, and the existing V1.0 orchestrator already uses the orchestrator-workers pattern. V2.0 adds the evaluation layer on top.

**Core technologies:**
- `@orq-ai/node@^3.2.8`: TypeScript SDK + MCP server source — primary Orq.ai platform integration (Node.js >= 20)
- `@orq-ai/evaluatorq@^1.0.7`: Experiment engine — dataset-driven evaluations against deployed agents, results sent to Orq.ai automatically
- `@orq-ai/evaluators`: Pre-built cosine similarity evaluators — requires OpenAI API key for embeddings
- Orq.ai REST API (`api.orq.ai/v2/*`): Primary CRUD path for agents, tools, datasets, evaluators, prompts
- Orq.ai MCP Server (HTTP transport): Optional enhancement — validate CRUD capabilities before treating as primary
- `dotenv@^16.4`: Environment variable management (only needed if users do not export keys in shell profile)

**What NOT to use:** LangChain, LangGraph, CrewAI (V2.0 deploys to Orq.ai runtime — local execution frameworks are the wrong abstraction), Orq.ai Deployments API `/v2/deployments` (single-call, no orchestration — use Agents API), Jest/Vitest (evaluatorq handles experiment execution), custom MCP server wrapper (the `@orq-ai/node` SDK already is the MCP server).

See `.planning/research/STACK.md` for full API endpoint reference, SDK code patterns, A2A protocol context, and alternatives considered.

### Expected Features

V2.0 features are strictly sequential by dependency: Install gates Deploy, Deploy gates Test, Test gates Iterate, Iterate gates Guardrails. Reference updates are independent of this chain and improve all V1.0 output quality immediately.

**Must have (table stakes):**
- Modular install with capability selection (core/deploy/test/full) — hierarchical, not independent flags; cannot install test without deploy
- Orq.ai API key prompt, validation, and env-var-only storage — must never appear in any generated file
- MCP server auto-registration via `claude mcp add --transport http --scope project`
- Agent creation/update via MCP + tool creation via REST API (confirmed split responsibility)
- Idempotent create-or-update deployment (GET-before-POST) — re-running deploy must always be safe
- Orchestration wiring (`team_of_agents`, `retrieve_agents`, `call_sub_agent`) — without this, multi-agent swarms are disconnected
- Dataset upload and transformation from V1.0 markdown format to Orq.ai experiment format
- Evaluator creation: LLM-as-judge for semantic quality + function evaluators for structural checks, selected by agent domain
- Experiment execution and structured results (RESULTS.md) with confidence intervals, not point estimates
- Results analysis with plain-language interpretation — not raw scores for non-technical users
- Proposed prompt changes with per-change reasoning tied to specific test failures, shown as diffs
- Human approval gate per iteration — no batch approval in V2.0
- Local audit trail (ITERATIONS.md) — two layers: user-facing summary and technical log

**Should have (competitive differentiators):**
- End-to-end spec-to-production pipeline integration — the full loop is the competitive moat
- Evaluator-based runtime guardrails on deployed agents — promotes test evaluators to production safety
- Threshold-based quality gates — configurable minimum scores before "production-ready"
- Smart evaluator selection from V1.0 architect blueprint context (agent role and domain)
- Diff-based prompt versioning with rollback — track changes as diffs, support reverting to any version
- Incremental per-agent deployment — deploy and test each agent before wiring orchestration

**Defer to V2.1+:**
- Knowledge base automated provisioning — different skill set, massive scope expansion
- Multi-environment deployment (dev/staging/prod) — Orq.ai does not natively support environment separation
- Production monitoring dashboard — Orq.ai handles natively; would duplicate platform capability
- Webhook-based deployment triggers — event-driven infrastructure incompatible with CLI tool model
- Fully autonomous prompt iteration without approval — not appropriate for V2.0 audience; consider V2.1 after trust is established

See `.planning/research/FEATURES.md` for full feature dependency graph, competitor matrix (Braintrust, Promptfoo, LangSmith), and Orq.ai platform capability table.

### Architecture Approach

V2.0 extends V1.0's sequential pipeline with parallel fan-out by appending three new stages after V1.0's Step 6 (Final Summary): Step 7 Deploy, Step 8 Test, Step 9 Iterate. The V1.0 subagents (architect, researcher, spec-generator, dataset-generator, orchestration-generator, readme-generator, tool-resolver) are entirely unchanged. Three new subagents follow the same pattern as V1.0 — markdown prompt files in `agents/`, spawned via Task tool, reading references via `<files_to_read>`, returning structured results. No new directories are created. The spec file IS the deployment manifest; the deployer parses V1.0 markdown and maps directly to `/v2/agents` API fields, which were designed in alignment with the spec template. An API key management distinction matters: the key is stored in `~/.config/orq-agent/config` (not the skill directory, which gets overwritten on updates), and passed as an environment variable to subagents at runtime.

A critical architecture note on MCP: there are two distinct MCP concerns that must not be conflated. (1) The skill's own Orq.ai MCP integration registered during V2 install (`claude mcp add --transport http orq https://my.orq.ai/v2/mcp`). (2) MCP tool configurations within the agents being designed — handled by V1.0's tool-resolver, unchanged. The adapter layer abstracting MCP and REST paths must be built in Phase 2 before any deployment features; retrofitting it later means every feature inherits two divergent code paths.

**Major components:**
1. Modified Orchestrator (`commands/orq-agent.md`) — adds `--mode` flag parsing (core/deploy/test/full), MCP availability detection at session start, wires Steps 7-9
2. Deployer subagent (`agents/deployer.md`) — parses V1.0 specs, calls Orq.ai API for create/update, verifies after every write, records version numbers in deploy-log
3. Tester subagent (`agents/tester.md`) — uploads datasets, creates domain-appropriate evaluators, runs evaluatorq experiments (3-run median), writes RESULTS.md with confidence intervals
4. Iterator subagent (`agents/iterator.md`) — analyzes results, proposes diffs with per-change reasoning, enforces per-iteration HITL approval, re-spawns deployer+tester for changed agents only
5. API Adapter layer — single interface normalizing MCP (JSON-RPC errors) and REST (HTTP status codes) into a common error type; path detected once at session start
6. Standalone commands (`commands/deploy.md`, `commands/test.md`, `commands/iterate.md`) — each stage independently testable before orchestrator integration

Build order: API Reference + Templates (Phase 1) -> Deployer + Adapter (Phase 2) -> Tester (Phase 3) -> Iterator (Phase 4) -> Install Script (parallel with Phase 3-4) -> Orchestrator Integration (Phase 6) -> Polish.

See `.planning/research/ARCHITECTURE.md` for full system diagram, data flow specifications, anti-patterns, and build order dependency graph.

### Critical Pitfalls

1. **Runaway iteration loops** — The iterate loop has no natural stopping condition; LLMs optimize greedily and have no cost awareness. Prevention: hard cap at 3 iterations per session, 50 Orq.ai API call budget ceiling, 10-minute wall-clock timeout, 5% minimum improvement gate. All four limits must be built into the iteration controller from the first line of code — they cannot be added after the first user hits runaway behavior.

2. **MCP state desync ("ghost deployments")** — MCP calls are not transactional; Orq.ai may have a different state than local audit files reflect. Prevention: verify-after-deploy pattern on every write (immediately read back config after any create/update, compare to intended spec), track Orq.ai version numbers in deploy-log, implement `--sync` reconciliation command. This is architectural, not a feature to add later.

3. **Prompt overfitting to evaluation datasets** — After 3-5 iterations, prompt scores inflate on the eval set while real-world performance degrades. Prevention: enforce train/test/holdout split before iteration begins (minimum 30 examples required), holdout set never exposed during iteration, use LLM-as-judge semantic evaluators rather than exact-match evaluators for iteration feedback.

4. **API key exposure** — The key flows through onboarding, MCP config, API calls, and audit logs; any one can leak it. Prevention: env-var-only storage, never written to any generated file, `.gitignore` for config files, all examples use `orq_sk_REPLACE_WITH_YOUR_KEY` placeholder, onboarding explicitly instructs shell profile (`~/.zshrc`), not project file.

5. **MCP/API fallback path divergence** — Two code paths for the same operations doubles testing burden and creates unreproducible bugs. Prevention: single adapter interface that normalizes both error formats, detect path at session start (not per-call), test fallback path with equal rigor to primary path, never switch paths mid-session.

## Implications for Roadmap

The dependency chain is strict and consistent across all four research files: references and install before deploy, deploy before test, test before iterate, iterate before guardrails. FEATURES.md's MVP definition and ARCHITECTURE.md's build order independently converge on the same 5-phase structure. The phase suggestions below are well-supported by cross-file evidence.

### Phase 1: References, Install, and Capability Infrastructure
**Rationale:** API key security patterns and capability hierarchy must be established before any code that touches the API key is written. Reference updates are independent and improve V1.0 output quality immediately. The modular install architecture (hierarchical tiers, not independent flags) must be designed here — retrofitting a clean capability model onto ad-hoc feature flags is painful. The `/orq-agent:status` command and capability checks must exist before V2 commands are wired.
**Delivers:** Updated agentic framework references (Anthropic evaluator-optimizer pattern, A2A v0.3 task states, OpenAI agent-as-tool), new API endpoint reference (`references/orqai-api-endpoints.md`), new evaluator type reference (`references/orqai-evaluator-types.md`), new V2 output templates (deploy-log, test-results, iteration-log), modular install script with core/deploy/test/full tiers, Orq.ai API key onboarding with env-var-only storage, MCP server registration, `/orq-agent:status` capability check command.
**Addresses:** Modular install, API key onboarding, MCP registration, capability-gated command availability, reference update system.
**Avoids:** API key exposure (Pitfall 4) — security pattern established here cascades to all subsequent phases; broken partial install states (Pitfall 6) — hierarchical capability model prevents invalid combinations.
**Research flag:** Standard patterns for install scripts, env var management, and MCP registration. No additional research needed.

### Phase 2: Orq.ai Deployment
**Rationale:** Deployment is the first automation stage and the foundation for testing. The API adapter layer (abstracting MCP and REST paths) must be built here, not retrofitted after deployment features exist. The deployer subagent must be tested standalone (`/orq-agent:deploy`) before orchestrator integration. Tool creation is confirmed to require REST API regardless of MCP availability — handle both paths from the start.
**Delivers:** `agents/deployer.md` subagent, `commands/deploy.md` standalone command, API adapter layer (single interface, session-start path detection), idempotent create-or-update for agents and tools (GET-before-POST), orchestration wiring (`team_of_agents` configuration, sub-agents deployed before orchestrator), verify-after-deploy pattern (read-back after every write), version number tracking in deploy-log, deployment status reporting, graceful MCP fallback.
**Uses:** `@orq-ai/node@^3.2.8` SDK, Orq.ai REST API (`/v2/agents`, `/v2/tools`), Orq.ai MCP server (optional enhancement — validate CRUD availability at this phase).
**Implements:** Deployer subagent, API Adapter layer, spec-as-manifest pattern, idempotent deploy.
**Avoids:** Ghost deployments / MCP state desync (Pitfall 2) — verify-after-deploy is the foundation of this phase; MCP fallback chaos (Pitfall 8) — single adapter interface built here; autonomous operations without user feedback (Pitfall 7) — deployment status reporting and diff view before changes.
**Research flag:** Validate Orq.ai MCP server CRUD capabilities against the live platform before committing to MCP-primary design. Specifically validate tool creation endpoint behavior and `team_of_agents` field configuration. If MCP CRUD is not available, commit fully to REST API as primary and remove MCP-primary framing.

### Phase 3: Automated Testing
**Rationale:** Testing requires deployed agents to exist. The train/test/holdout dataset split that prevents prompt overfitting must be enforced here, before the iteration loop is built. Evaluator creation in this phase determines the feedback signal the iterator will use. Multi-run evaluation (3-run median) and variance reporting must be designed into the testing harness from the start — single-run evaluation is a fundamental design flaw, not a minor issue.
**Delivers:** `agents/tester.md` subagent, `commands/test.md` standalone command, dataset transformation pipeline (V1.0 markdown -> Orq.ai experiment format), train/test/holdout split enforcement (minimum 30 examples), domain-appropriate evaluator creation (LLM-as-judge for semantic quality, function evaluators for structural checks), experiment execution via evaluatorq with 3-run median and variance tracking, RESULTS.md with confidence intervals and plain-language interpretation, smoke test subset definition (10-15 examples for iteration, full dataset for final validation).
**Uses:** `@orq-ai/evaluatorq@^1.0.7`, `@orq-ai/evaluators`, Orq.ai REST API (`/v2/datasets`, `/v2/evaluators`).
**Implements:** Tester subagent, dataset-driven testing pattern, statistical evaluation.
**Avoids:** Prompt overfitting (Pitfall 3) — train/test/holdout split enforced here; non-deterministic eval results (Pitfall 5) — 3-run median and variance reporting built here.
**Research flag:** Evaluatorq SDK behavior needs hands-on validation before implementation: dataset batch size limit (5,000 datapoints per request), experiment polling backoff patterns, evaluator project-scoping migration status. V1.0 dataset format to Orq.ai experiment format transformation needs a concrete specification before coding.

### Phase 4: Prompt Iteration Loop
**Rationale:** Iteration is only meaningful with test results to analyze. The iteration controller must have all four hard stopping conditions from the first line of code — not added after users hit runaway behavior. HITL approval is per-iteration and the only valid option in V2.0. The audit trail must be two-layered (user-facing summary and technical log) from the start — a user-readable summary cannot be bolted onto a developer-only log later.
**Delivers:** `agents/iterator.md` subagent, `commands/iterate.md` standalone command, results analysis with plain-language diagnosis (e.g., "agent fails on multi-language inputs because instructions lack i18n guidance"), diff-based prompt change proposals with per-change reasoning tied to specific test failures, per-iteration approval flow with diff view before every change, hard stopping conditions (count=3, budget=50 API calls, time=10min, improvement<5%), re-deploy and re-test of changed agents only, ITERATIONS.md audit trail (user summary + technical log), session summary at end of every run.
**Implements:** Iterator subagent, HITL approval gate, evaluator-optimizer pattern (Anthropic), iteration stopping conditions.
**Avoids:** Runaway iteration loops (Pitfall 1) — all four stopping conditions built from day one; lost user oversight (Pitfall 7) — per-iteration approval, plain-language summaries, diff view, session summary; prompt overfitting (extends Phase 3 protections into the iteration loop).
**Research flag:** Standard HITL and audit trail patterns — well-documented. The 5% improvement threshold and 3-iteration cap should be configurable; validate with real user sessions to calibrate.

### Phase 5: Guardrails and Hardening
**Rationale:** Guardrails reuse evaluators from Phase 3 — no new platform primitives required. Quality gates are simple threshold checks on existing evaluation output. Incremental per-agent deployment is an enhancement to Phase 2's deployer. This phase converts the testing infrastructure into production safety infrastructure and adds operational polish.
**Delivers:** Evaluator promotion to runtime guardrails on deployed Orq.ai agents, threshold-based quality gates (configurable per evaluator, e.g., helpfulness > 0.8, safety > 0.95), incremental per-agent deployment option (deploy agent 1, test, iterate; then agent 2, etc.), rollback command (`/orq-agent:rollback` via Orq.ai agent versioning), updated SKILL.md index, updated help.md, edge case handling for API failures and partial deploys.
**Implements:** Guardrail configuration on agent specs, quality gate logic in orchestrator, rollback support.
**Avoids:** Shipping agents that pass some tests but fail critical evaluators.
**Research flag:** Orq.ai's evaluator-as-guardrail attachment mechanism needs verification — the capability is confirmed in docs but the configuration API surface is not fully specified. Validate before implementing.

### Phase Ordering Rationale

- **Install before everything:** API key, MCP config, and capability tiers are prerequisites for all API-touching phases. Security patterns established in Phase 1 cascade to all subsequent phases. Getting this wrong early means every subsequent feature inherits the vulnerability.
- **Deploy before test:** Experiments require deployed agents — this dependency is absolute and enforced by the platform.
- **Test before iterate:** Iteration requires test results. The train/test/holdout split designed in Phase 3 prevents overfitting in Phase 4. These two phases are tightly coupled on the overfitting pitfall.
- **Iterate before guardrails:** Guardrails reuse Phase 3 evaluators and Phase 2's deployment mechanism. No new primitives needed in Phase 5.
- **Standalone commands before orchestrator integration:** Each subagent is independently testable before being wired into the full pipeline. This mirrors V1.0's development pattern, catches integration bugs early, and is explicitly recommended by ARCHITECTURE.md.
- **Adapter layer in Phase 2, not later:** If MCP and REST paths are built separately for each feature and then unified, the adapter will never fully abstract the differences. It must be the first thing built in Phase 2.

### Research Flags

Phases needing deeper research or hands-on validation during implementation:
- **Phase 2 (Deploy):** Orq.ai MCP server CRUD capabilities not fully verified — run `claude mcp list` after registration and introspect tool list before committing to MCP-primary design for agent CRUD. If CRUD is unavailable, remove MCP-primary framing and treat REST API as sole primary.
- **Phase 3 (Test):** Evaluatorq SDK behavior needs hands-on platform validation — batch size limits, polling backoff patterns, evaluator project-scoping migration. Also need a concrete V1.0 -> Orq.ai dataset format transformation specification before coding.
- **Phase 5 (Guardrails):** Evaluator-as-guardrail attachment API surface needs verification — capability confirmed, configuration not fully documented.

Phases with standard patterns (skip research-phase):
- **Phase 1 (Install):** Modular install, env var management, and MCP server registration are well-documented standard patterns. Capability hierarchy design is straightforward given the strict dependency model.
- **Phase 4 (Iterate):** HITL approval flow, audit trails, and iteration stopping conditions are well-established patterns. Implementation is straightforward given the design constraints are clearly specified.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | MEDIUM | `@orq-ai/node` and `@orq-ai/evaluatorq` versions verified via npm. REST API endpoints verified via official Orq.ai docs. Orq.ai MCP server CRUD capabilities partially verified — docs confirm existence but exact tool list not enumerated. |
| Features | MEDIUM | Orq.ai platform capabilities (19 function evaluators, 4 custom evaluator types, guardrail attachment) verified via official docs. MCP tool coverage partially verified. Competitor analysis based on secondary sources. |
| Architecture | MEDIUM | REST API surface verified. MCP-to-Orq.ai CRUD integration patterns less documented than REST. V1.0 subagent extension approach is HIGH confidence — mirrors proven V1.0 patterns. Adapter layer design is inferred from general MCP/API integration best practices. |
| Pitfalls | MEDIUM-HIGH | Runaway loops, API key exposure, and prompt overfitting have strong research backing. MCP state desync confirmed as a class of problem; Orq.ai-specific behavior is inferred from general MCP patterns. Non-deterministic eval results supported by published research. |

**Overall confidence:** MEDIUM

The MEDIUM rating reflects the partially-verified nature of Orq.ai's MCP server CRUD capabilities and evaluatorq SDK behavior, which are the two most implementation-critical unknowns. The overall architecture and feature approach are well-supported; the integration details need hands-on validation.

### Gaps to Address

- **Orq.ai MCP server CRUD surface:** The exact set of CRUD operations available via MCP (vs docs-access only) is not confirmed. During Phase 2, validate before committing to MCP-primary design. If agent CRUD is not available as MCP tools, treat REST API as sole primary path and remove MCP-primary framing from deployer.
- **Evaluator project scoping migration:** Orq.ai is migrating evaluators to project scope. The exact state of this migration and API implications need validation before Phase 3 implementation. Create evaluators within project context from day one regardless.
- **Orq.ai API rate limits:** Rate limit specifics for agent creation and experiment execution are not documented in research. Phase 2 deployer should implement retry-with-exponential-backoff from day one and instrument cumulative call counts to support the budget ceiling.
- **Dataset format transformation spec:** V1.0 dataset generator produces markdown output. The exact mapping to Orq.ai's experiment format (inputs, messages, expected_outputs) needs a concrete specification before Phase 3 coding begins.
- **Iteration threshold calibration:** The 5% improvement gate and 3-iteration cap are reasonable defaults but may need calibration based on real user sessions. Make both configurable and instrument them from day one.

## Sources

### Primary (HIGH confidence)
- [Orq.ai Agent API Documentation](https://docs.orq.ai/docs/agents/agent-api) — Agent CRUD, invocation, orchestrator pattern, tool requirements
- [Orq.ai Function Evaluator](https://docs.orq.ai/docs/function-evaluator) — 19 built-in function evaluators, configuration
- [Orq.ai Datasets Overview](https://docs.orq.ai/docs/datasets/overview) — Dataset structure, 5,000 datapoint batch limit
- [Orq.ai LLM Guardrails Guide](https://orq.ai/blog/llm-guardrails) — Platform guardrail capabilities
- [@orq-ai/node on npm](https://www.npmjs.com/package/@orq-ai/node) — Version 3.2.8 verified, TypeScript SDK, MCP server mode
- [@orq-ai/evaluatorq on npm](https://www.npmjs.com/package/@orq-ai/evaluatorq) — Version 1.0.7 verified, experiment runner
- [orq-ai/orq-node GitHub](https://github.com/orq-ai/orq-node) — SDK source, 102+ methods, FUNCTIONS.md
- [Anthropic: Building Effective Agents](https://www.anthropic.com/research/building-effective-agents) — Six composable patterns, evaluator-optimizer, guardrails
- [Anthropic: Multi-Agent Research System](https://www.anthropic.com/engineering/multi-agent-research-system) — Orchestrator-worker pattern in production
- [OpenAI Agents SDK](https://openai.github.io/openai-agents-python/) — Handoff and agent-as-tool patterns
- [Google A2A Protocol](https://developers.googleblog.com/en/a2a-a-new-era-of-agent-interoperability/) — A2A v0.3, task lifecycle states
- [Claude Code MCP Docs](https://code.claude.com/docs/en/mcp) — HTTP transport, scope options, header configuration
- [ArXiv: When "Better" Prompts Hurt](https://arxiv.org/html/2601.22025) — Evaluation-driven iteration pitfalls and overfitting
- [Orq.ai Docs: Datasets Overview](https://docs.orq.ai/docs/datasets/overview) — Dataset format and 5,000 datapoint limit

### Secondary (MEDIUM confidence)
- [Orq.ai MCP Documentation](https://docs.orq.ai/docs/common-architecture/mcp) — MCP server setup, capabilities overview (exact tool list not fully enumerated)
- [orq-ai/orqkit GitHub](https://github.com/orq-ai/orqkit) — evaluatorq and evaluators monorepo
- [Orq.ai Evaluator Introduction](https://docs.orq.ai/docs/evaluator) — Evaluator types, project-scoping migration
- [Braintrust: Best Prompt Engineering Tools 2026](https://www.braintrust.dev/articles/best-prompt-engineering-tools-2026) — Industry landscape and competitor analysis
- [Fast.io: MCP Server Rate Limiting](https://fast.io/resources/mcp-server-rate-limiting/) — 1,000 calls/minute runaway agent scenario
- [Stainless: Error Handling and Debugging MCP Servers](https://www.stainless.com/mcp/error-handling-and-debugging-mcp-servers) — MCP error patterns and JSON-RPC debugging
- [Flagsmith: 5 Feature Flag Management Pitfalls](https://www.flagsmith.com/blog/pitfalls-of-feature-flags) — Modular install complexity
- [Martin Fowler: Feature Toggles](https://martinfowler.com/articles/feature-toggles.html) — Capability hierarchy design
- [Langfuse: Testing LLM Applications](https://langfuse.com/blog/2025-10-21-testing-llm-applications) — Non-deterministic evaluation strategies
- [Statsig: Prompt Regression Testing](https://www.statsig.com/perspectives/slug-prompt-regression-testing) — Regression-safe prompt iteration
- [Skywork.ai: Agentic AI Safety Best Practices 2025](https://skywork.ai/blog/agentic-ai-safety-best-practices-2025-enterprise/) — Risk tiers and approval frameworks

### Tertiary (LOW confidence)
- [Prompt Learning Loops](https://www.startuphub.ai/ai-news/ai-video/2026/prompt-learning-loops-define-the-next-generation-of-llm-reliability/) — Iteration loop patterns (single source, needs validation)

---
*Research completed: 2026-03-01*
*Ready for roadmap: yes*
