# Requirements: Orq Agent Designer

**Defined:** 2026-03-10
**Core Value:** Any colleague can go from a use case description to deployed, tested agents on Orq.ai -- without touching a terminal or needing technical knowledge.

## V2.1 Requirements

Requirements for V2.1 Experiment Pipeline Restructure. Each maps to roadmap phases.

### Dataset Preparation

- [x] **DATA-01**: Dataset-preparer uploads datapoints with required `messages` field (`[{role: "user", content: input}]`)
- [x] **DATA-02**: Dataset-preparer uses MCP `create_dataset`/`create_datapoints` with REST fallback
- [x] **DATA-03**: Dataset-preparer parses markdown eval pairs, augments to 30+, splits 60/20/20 stratified
- [x] **DATA-04**: Dataset-preparer infers agent role (structural/conversational/hybrid) from spec content
- [x] **DATA-05**: Dataset-preparer writes `dataset-prep.json` with per-agent dataset IDs and role

### Experiment Execution

- [x] **EXPR-01**: Experiment-runner creates experiments via MCP `create_experiment` (task.type: "agent") with REST fallback
- [x] **EXPR-02**: Experiment-runner uses agent `key` (not `orqai_id`) for experiment task configuration
- [x] **EXPR-03**: Experiment-runner resolves evaluator IDs (create custom via MCP or use built-in by name)
- [x] **EXPR-04**: Experiment-runner executes 3 runs per agent with polling loop (adaptive 10-30s interval)
- [x] **EXPR-05**: Experiment-runner accepts `dataset_id` as direct input for holdout re-test mode
- [x] **EXPR-06**: Experiment-runner writes `experiment-raw.json` with per-run per-evaluator raw scores

### Results Analysis

- [x] **ANLZ-01**: Results-analyzer computes triple-run aggregation (median, variance, 95% CI)
- [x] **ANLZ-02**: Results-analyzer determines pass/fail per evaluator per agent against thresholds
- [x] **ANLZ-03**: Results-analyzer produces category-sliced scoring from `inputs.category` metadata
- [x] **ANLZ-04**: Results-analyzer writes `test-results.json` preserving schema compatibility with hardener.md
- [x] **ANLZ-05**: Results-analyzer produces `test-results.md` and terminal summary table

### Test Command

- [x] **TEST-01**: Rewritten test.md orchestrates dataset-preparer -> experiment-runner -> results-analyzer in sequence
- [x] **TEST-02**: Test command preserves `--agent` flag for single-agent testing
- [x] **TEST-03**: Test command checks intermediate JSON files between subagent steps and aborts on upstream errors

### Iteration Pipeline

- [x] **ITPIPE-01**: Failure-diagnoser reads test-results.json and maps evaluator failures to XML-tagged prompt sections
- [x] **ITPIPE-02**: Failure-diagnoser proposes section-level diffs with plain-language reasoning
- [x] **ITPIPE-03**: Failure-diagnoser collects per-agent HITL approval before any file modifications
- [x] **ITPIPE-04**: Prompt-editor applies approved section-level changes preserving YAML frontmatter and non-instruction sections
- [x] **ITPIPE-05**: Prompt-editor delegates re-deploy to deployer and holdout re-test to experiment-runner (skips dataset-preparer)
- [x] **ITPIPE-06**: Prompt-editor computes before/after score comparison and flags regressions

### Iterate Command

- [x] **LOOP-01**: Rewritten iterate.md orchestrates failure-diagnoser -> prompt-editor in loop with stop conditions
- [x] **LOOP-02**: Iterate command enforces 5 stop conditions (max_iterations, timeout, min_improvement, all_pass, user_declined)
- [x] **LOOP-03**: Iterate command preserves `--agent` flag and produces iteration-log.md + audit-trail.md

## Future Requirements

### Cleanup

- **CLEAN-01**: Remove `@orq-ai/evaluatorq` from install script after V2.1 audit confirms zero references
- **CLEAN-02**: Fix `@orq-ai/node` version pin (^3.14.45 doesn't exist on npm)

### Enhancements

- **ENH-01**: Parallel experiment execution across agents
- **ENH-02**: Custom domain-specific evaluator creation for per-swarm evaluation criteria

### V5.0 Browser Automation (Deferred)

- **CAP-01 through CAP-04**: Application capabilities config and browser-use detection
- **SCRIPT-01 through SCRIPT-05**: Playwright script generation
- **VPS-01 through VPS-04**: VPS MCP server
- **DEPLOY-01 through DEPLOY-03**: Automated script deployment
- **WIRE-01, WIRE-02**: Agent spec wiring
- **HARD-01, HARD-02**: Script health monitoring and multi-system validation
- **VAL-01**: End-to-end NXT validation

## Out of Scope

| Feature | Reason |
|---------|--------|
| New pipeline capabilities | V2.1 is a restructure -- same features, better architecture |
| evaluatorq SDK support | Root cause of timeouts; replaced entirely by native MCP/REST |
| Dataset generation from scratch | Dataset-preparer reads existing markdown datasets; dataset-generator handles creation |
| Parallel experiment runs | Adds complexity; sequential is sufficient for V2.1 |
| Web UI integration | V3.0 milestone scope |
| Browser automation | V5.0 milestone scope |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| DATA-01 | Phase 26 | Complete |
| DATA-02 | Phase 26 | Complete |
| DATA-03 | Phase 26 | Complete |
| DATA-04 | Phase 26 | Complete |
| DATA-05 | Phase 26 | Complete |
| EXPR-01 | Phase 27 | Complete |
| EXPR-02 | Phase 27 | Complete |
| EXPR-03 | Phase 27 | Complete |
| EXPR-04 | Phase 27 | Complete |
| EXPR-05 | Phase 27 | Complete |
| EXPR-06 | Phase 27 | Complete |
| ANLZ-01 | Phase 28 | Complete |
| ANLZ-02 | Phase 28 | Complete |
| ANLZ-03 | Phase 28 | Complete |
| ANLZ-04 | Phase 28 | Complete |
| ANLZ-05 | Phase 28 | Complete |
| TEST-01 | Phase 29 | Complete |
| TEST-02 | Phase 29 | Complete |
| TEST-03 | Phase 29 | Complete |
| ITPIPE-01 | Phase 30 | Complete |
| ITPIPE-02 | Phase 30 | Complete |
| ITPIPE-03 | Phase 30 | Complete |
| ITPIPE-04 | Phase 31 | Complete |
| ITPIPE-05 | Phase 33 | Complete |
| ITPIPE-06 | Phase 31 | Complete |
| LOOP-01 | Phase 33 | Complete |
| LOOP-02 | Phase 32 | Complete |
| LOOP-03 | Phase 32 | Complete |

**Coverage:**
- V2.1 requirements: 24 total
- Satisfied: 24
- Pending: 0
- Unmapped: 0

---
*Requirements defined: 2026-03-10*
*Last updated: 2026-03-13 after Phase 33 gap closure*
