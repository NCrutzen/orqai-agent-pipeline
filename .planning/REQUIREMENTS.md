# Requirements: Orq Agent Designer

**Defined:** 2026-03-01
**Core Value:** Given any use case description, produce correct, complete Orq.ai Agent specifications and autonomously deploy, test, iterate, and harden them via the Orq.ai MCP server and API.

## V2.0 Requirements

Requirements for V2.0 Autonomous Orq.ai Pipeline. Each maps to roadmap phases.

### Deployment

- [ ] **DEPLOY-01**: User can deploy all agents in a swarm to Orq.ai with a single command
- [ ] **DEPLOY-02**: Tool definitions are created/updated in Orq.ai before agents that reference them
- [ ] **DEPLOY-03**: Orchestrator agent is deployed with agent-as-tool wiring after all sub-agents exist
- [ ] **DEPLOY-04**: Re-running deploy updates existing agents (new version) instead of creating duplicates
- [ ] **DEPLOY-05**: Every deployed resource is read back from Orq.ai to verify successful creation
- [ ] **DEPLOY-06**: User sees a deploy-log.md with status table (created/updated/failed per agent)
- [ ] **DEPLOY-07**: Local agent spec files are annotated with deployment metadata (agent ID, version, timestamp)
- [ ] **DEPLOY-08**: Deployment works via REST API when MCP server is unavailable

### Testing

- [ ] **TEST-01**: User can upload V1.0-generated datasets to Orq.ai in platform format
- [ ] **TEST-02**: Evaluators are auto-selected based on agent role (structural agents get schema validation, conversational agents get relevance + coherence)
- [ ] **TEST-03**: User can run experiments against deployed agents via evaluatorq SDK
- [ ] **TEST-04**: Test results are presented as readable markdown with per-agent scores and worst-performing cases
- [ ] **TEST-05**: Experiments run 3 times with median scores to handle non-deterministic outputs

### Iteration

- [ ] **ITER-01**: User sees analysis of failing agents with patterns tied to specific prompt sections
- [ ] **ITER-02**: Proposed prompt changes show diff-style view with reasoning linked to test failures
- [ ] **ITER-03**: User must approve each proposed change per-agent before it is applied
- [ ] **ITER-04**: Approved changes update both local spec files and re-deploy the agent to Orq.ai
- [ ] **ITER-05**: After iteration, changed agents are re-tested with score comparison (before vs after)
- [ ] **ITER-06**: Iteration loop stops on: all pass, max 3 iterations, <5% improvement, user declines, or 10min timeout
- [ ] **ITER-07**: All iterations are logged locally (iteration-log.md per cycle, audit-trail.md append-only)

### Guardrails

- [ ] **GUARD-01**: Test evaluators can be promoted to runtime guardrails on deployed agents
- [ ] **GUARD-02**: User can set minimum score thresholds per evaluator as quality gates
- [ ] **GUARD-03**: User can deploy, test, and iterate agents individually before wiring orchestration

## Future Requirements (V2.1+)

### Knowledge Base Provisioning

- **KB-01**: User can create and populate knowledge bases automatically
- **KB-02**: KB content syncs from local files to Orq.ai

### Advanced Operations

- **ADV-01**: Multi-environment deployment (dev/staging/prod)
- **ADV-02**: Production monitoring integration
- **ADV-03**: Batch approval mode ("approve all" for trusted iterations)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Fully autonomous iteration (no approval) | Non-technical users lose trust; Anthropic guidelines recommend HITL |
| Real-time monitoring dashboard | Duplicates Orq.ai native observability; requires persistent infrastructure |
| Multi-environment deployment | Orq.ai doesn't natively support environment separation; use versioning instead |
| A/B testing in production | Requires traffic management infrastructure; out of scope for CLI tool |
| Custom evaluator code generation | Generated code is untested; compose from Orq.ai's 41 built-in evaluator types |
| Parallel multi-model comparison | Expensive, noisy; V1.0 already recommends models per role |
| Webhook-based deployment triggers | Event-driven infrastructure in CLI tool; deployment should be conscious action |
| Knowledge base provisioning | Massive scope expansion; deferred to V2.1 |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| DEPLOY-01 | — | Pending |
| DEPLOY-02 | — | Pending |
| DEPLOY-03 | — | Pending |
| DEPLOY-04 | — | Pending |
| DEPLOY-05 | — | Pending |
| DEPLOY-06 | — | Pending |
| DEPLOY-07 | — | Pending |
| DEPLOY-08 | — | Pending |
| TEST-01 | — | Pending |
| TEST-02 | — | Pending |
| TEST-03 | — | Pending |
| TEST-04 | — | Pending |
| TEST-05 | — | Pending |
| ITER-01 | — | Pending |
| ITER-02 | — | Pending |
| ITER-03 | — | Pending |
| ITER-04 | — | Pending |
| ITER-05 | — | Pending |
| ITER-06 | — | Pending |
| ITER-07 | — | Pending |
| GUARD-01 | — | Pending |
| GUARD-02 | — | Pending |
| GUARD-03 | — | Pending |

**Coverage:**
- V2.0 requirements: 23 total
- Mapped to phases: 0
- Unmapped: 23

---
*Requirements defined: 2026-03-01*
*Last updated: 2026-03-01 after milestone V2.0 initialization*
