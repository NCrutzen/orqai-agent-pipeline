# Phase 28: Results Analyzer - Context

**Gathered:** 2026-03-12
**Status:** Ready for planning

<domain>
## Phase Boundary

New Claude Code subagent (`results-analyzer.md`) that reads `experiment-raw.json` from experiment-runner (Phase 27), computes triple-run statistical aggregation (median, variance, 95% CI), determines pass/fail per evaluator per agent, produces category-sliced scoring, and writes three outputs: `test-results.json` (hardener.md-compatible), `test-results.md` (full human-readable report), and terminal summary table. This replaces Phase 8 of the current monolithic tester.md.

Results-analyzer is a pure computation subagent -- no Orq.ai API calls. All data comes from experiment-raw.json on disk.

</domain>

<decisions>
## Implementation Decisions

### Threshold Source
- Role-based defaults, matching tester.md's proven mapping: structural (0.8), conversational (0.7), hybrid (0.75)
- Results-analyzer reads agent role from experiment-raw.json (originally from dataset-prep.json)
- Defaults only -- no override parameters, no config files. If thresholds need tuning, update the subagent itself
- `overall_pass` = true only when ALL agents pass ALL evaluators (strict rule)

### Statistical Methods
- 95% confidence interval computed using Student's t-distribution with n-1 degrees of freedom (correct for small n=3 samples)
- Median as central tendency (not mean -- robust to outliers with 3 data points)
- Variance computed as sample variance

### Worst Cases Selection
- Top 3 worst-performing examples per agent
- "Worst" = lowest minimum score across all evaluators per example (bottleneck ranking, mirrors tester.md terminal output logic)
- worst_cases entries include actual_output and failure reason derived from scores ("Failed {evaluator} ({score} < {threshold})")
- Per-example input, expected_output, and actual_output sourced from experiment-raw.json -- experiment-runner contract must include these fields

### Category Handling
- If NO rows have category metadata: omit category_scores entirely (empty object or absent)
- If SOME rows have category metadata: slice on the subset only, include count field per category so downstream consumers know sample size
- When category coverage is incomplete, note in summary field: "Category breakdown covers X/Y examples (Z without category metadata)"

### Terminal Summary
- Two-level output: compact table by default, detailed per-evaluator table with --verbose flag
- Compact: agent_key | role | bottleneck_score | PASS/FAIL (one row per agent, overall summary line)
- Verbose: adds per-evaluator median scores per agent
- Category breakdown is test-results.md only, never in terminal

### Markdown Report (test-results.md)
- Full report with per-agent sections: evaluator scores table, category breakdown table (if available), top 3 worst cases with inputs
- Includes actionable next-step guidance at the end: "All passing -> ready for /orq-agent:harden" or "N agents failing -> run /orq-agent:iterate"

### Claude's Discretion
- Internal code structure and computation logic
- Exact table formatting and column widths
- How to handle edge cases (e.g., all runs identical, single evaluator)
- Error handling for malformed experiment-raw.json

</decisions>

<specifics>
## Specific Ideas

- experiment-raw.json contract needs updating: must include per-example input, expected_output, and actual_output alongside scores (not just aggregate per-evaluator scores). This is a contract expansion from what Phase 27 originally specified.
- test-results.json MUST match `orq-agent/templates/test-results.json` schema exactly -- hardener.md parses it (ANLZ-04)
- The --verbose flag is a parameter from the calling command (test.md, Phase 29) -- results-analyzer accepts it as input
- Next-step guidance matches pipeline flow: pass -> harden, fail -> iterate

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `orq-agent/templates/test-results.json`: Target output schema (v3.0). Includes per_agent with scores, category_scores, worst_cases, evaluators array, and summary field. Hardener.md reads this directly.
- `orq-agent/agents/tester.md` (Phase 8): Current aggregation logic, bottleneck score computation, terminal table format, category-sliced scoring. Being replaced but logic is reusable reference.
- `orq-agent/agents/experiment-runner.md`: Upstream subagent producing experiment-raw.json -- defines input contract.
- `orq-agent/agents/hardener.md`: Downstream consumer of test-results.json. Parses per_agent[].scores, evaluator IDs, and role fields. Schema compatibility is critical.

### Established Patterns
- JSON file handoff contracts: dataset-prep.json -> experiment-raw.json -> test-results.json (disk-based, no in-memory state)
- Role-based evaluator thresholds: structural 0.8, conversational 0.7, hybrid 0.75 (from tester.md Phase 6)
- Bottleneck score: lowest evaluator median per agent (used in terminal summary)
- Category taxonomy: happy-path, variation, boundary, adversarial, edge-case, stress (from dataset-generator.md)

### Integration Points
- **Input:** Reads `experiment-raw.json` from swarm output directory (produced by experiment-runner, Phase 27)
- **Output:** Writes `test-results.json` + `test-results.md` to swarm output directory
- **Downstream:** hardener.md reads test-results.json for guardrail decisions; failure-diagnoser (Phase 30) reads worst_cases for diagnosis; test.md (Phase 29) orchestrates and passes --verbose flag

</code_context>

<deferred>
## Deferred Ideas

None -- discussion stayed within phase scope

</deferred>

---

*Phase: 28-results-analyzer*
*Context gathered: 2026-03-12*
