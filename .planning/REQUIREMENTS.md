# Requirements: Orq Agent Designer

**Defined:** 2026-03-10
**Core Value:** Any colleague can go from a use case description to deployed, tested agents on Orq.ai — without touching a terminal or needing technical knowledge.

## V2.1 Requirements

Requirements for V2.1 Experiment Pipeline Restructure. Each maps to roadmap phases.

### Dataset Preparation

- [ ] **DATA-01**: Dataset-preparer uploads datapoints with required `messages` field (`[{role: "user", content: input}]`)
- [ ] **DATA-02**: Dataset-preparer uses MCP `create_dataset`/`create_datapoints` with REST fallback
- [ ] **DATA-03**: Dataset-preparer parses markdown eval pairs, augments to 30+, splits 60/20/20 stratified
- [ ] **DATA-04**: Dataset-preparer infers agent role (structural/conversational/hybrid) from spec content
- [ ] **DATA-05**: Dataset-preparer writes `dataset-prep.json` with per-agent dataset IDs and role

### Experiment Execution

- [ ] **EXPR-01**: Experiment-runner creates experiments via MCP `create_experiment` (task.type: "agent") with REST fallback
- [ ] **EXPR-02**: Experiment-runner uses agent `key` (not `orqai_id`) for experiment task configuration
- [ ] **EXPR-03**: Experiment-runner resolves evaluator IDs (create custom via MCP or use built-in by name)
- [ ] **EXPR-04**: Experiment-runner executes 3 runs per agent with polling loop (adaptive 10-30s interval)
- [ ] **EXPR-05**: Experiment-runner accepts `dataset_id` as direct input for holdout re-test mode
- [ ] **EXPR-06**: Experiment-runner writes `experiment-raw.json` with per-run per-evaluator raw scores

### Results Analysis

- [ ] **ANLZ-01**: Results-analyzer computes triple-run aggregation (median, variance, 95% CI)
- [ ] **ANLZ-02**: Results-analyzer determines pass/fail per evaluator per agent against thresholds
- [ ] **ANLZ-03**: Results-analyzer produces category-sliced scoring from `inputs.category` metadata
- [ ] **ANLZ-04**: Results-analyzer writes `test-results.json` preserving schema compatibility with hardener.md
- [ ] **ANLZ-05**: Results-analyzer produces `test-results.md` and terminal summary table

### Test Command

- [ ] **TEST-01**: Rewritten test.md orchestrates dataset-preparer → experiment-runner → results-analyzer in sequence
- [ ] **TEST-02**: Test command preserves `--agent` flag for single-agent testing
- [ ] **TEST-03**: Test command checks intermediate JSON files between subagent steps and aborts on upstream errors

### Iteration Pipeline

- [ ] **ITPIPE-01**: Failure-diagnoser reads test-results.json and maps evaluator failures to XML-tagged prompt sections
- [ ] **ITPIPE-02**: Failure-diagnoser proposes section-level diffs with plain-language reasoning
- [ ] **ITPIPE-03**: Failure-diagnoser collects per-agent HITL approval before any file modifications
- [ ] **ITPIPE-04**: Prompt-editor applies approved section-level changes preserving YAML frontmatter and non-instruction sections
- [ ] **ITPIPE-05**: Prompt-editor delegates re-deploy to deployer and holdout re-test to experiment-runner (skips dataset-preparer)
- [ ] **ITPIPE-06**: Prompt-editor computes before/after score comparison and flags regressions

### Iterate Command

- [ ] **LOOP-01**: Rewritten iterate.md orchestrates failure-diagnoser → prompt-editor in loop with stop conditions
- [ ] **LOOP-02**: Iterate command enforces 5 stop conditions (max_iterations, timeout, min_improvement, all_pass, user_declined)
- [ ] **LOOP-03**: Iterate command preserves `--agent` flag and produces iteration-log.md + audit-trail.md

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
| New pipeline capabilities | V2.1 is a restructure — same features, better architecture |
| evaluatorq SDK support | Root cause of timeouts; replaced entirely by native MCP/REST |
| Dataset generation from scratch | Dataset-preparer reads existing markdown datasets; dataset-generator handles creation |
| Parallel experiment runs | Adds complexity; sequential is sufficient for V2.1 |
| Web UI integration | V3.0 milestone scope |
| Browser automation | V5.0 milestone scope |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| DATA-01 | — | Pending |
| DATA-02 | — | Pending |
| DATA-03 | — | Pending |
| DATA-04 | — | Pending |
| DATA-05 | — | Pending |
| EXPR-01 | — | Pending |
| EXPR-02 | — | Pending |
| EXPR-03 | — | Pending |
| EXPR-04 | — | Pending |
| EXPR-05 | — | Pending |
| EXPR-06 | — | Pending |
| ANLZ-01 | — | Pending |
| ANLZ-02 | — | Pending |
| ANLZ-03 | — | Pending |
| ANLZ-04 | — | Pending |
| ANLZ-05 | — | Pending |
| TEST-01 | — | Pending |
| TEST-02 | — | Pending |
| TEST-03 | — | Pending |
| ITPIPE-01 | — | Pending |
| ITPIPE-02 | — | Pending |
| ITPIPE-03 | — | Pending |
| ITPIPE-04 | — | Pending |
| ITPIPE-05 | — | Pending |
| ITPIPE-06 | — | Pending |
| LOOP-01 | — | Pending |
| LOOP-02 | — | Pending |
| LOOP-03 | — | Pending |

**Coverage:**
- V2.1 requirements: 24 total
- Mapped to phases: 0
- Unmapped: 24 ⚠️

---
*Requirements defined: 2026-03-10*
*Last updated: 2026-03-10 after initial definition*
