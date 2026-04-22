# Phase 28: Results Analyzer - Research

**Researched:** 2026-03-12
**Domain:** Statistical aggregation, JSON schema compatibility, subagent file contracts
**Confidence:** HIGH

## Summary

Phase 28 creates a pure computation subagent (`results-analyzer.md`) that reads `experiment-raw.json` from experiment-runner (Phase 27), computes triple-run statistical aggregation, determines pass/fail per evaluator per agent, produces category-sliced scoring, and writes three outputs: `test-results.json` (hardener-compatible), `test-results.md` (human-readable report), and a terminal summary table.

This is a no-API subagent -- all inputs come from disk (experiment-raw.json) and all outputs go to disk plus terminal. The statistical methods are straightforward (median, sample variance, Student's t CI for n=3). The primary complexity is schema compatibility: `test-results.json` must exactly match what hardener.md parses, and the input contract from experiment-runner.md must include per-example input/output text alongside scores.

**Primary recommendation:** Build results-analyzer.md as a single-phase subagent following the established agent file pattern (YAML frontmatter, `<files_to_read>`, phased execution). Focus implementation effort on the test-results.json schema fidelity -- hardener.md reads specific fields and any deviation breaks the pipeline.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Role-based defaults, matching tester.md's proven mapping: structural (0.8), conversational (0.7), hybrid (0.75)
- Results-analyzer reads agent role from experiment-raw.json (originally from dataset-prep.json)
- Defaults only -- no override parameters, no config files. If thresholds need tuning, update the subagent itself
- `overall_pass` = true only when ALL agents pass ALL evaluators (strict rule)
- 95% confidence interval computed using Student's t-distribution with n-1 degrees of freedom (correct for small n=3 samples)
- Median as central tendency (not mean -- robust to outliers with 3 data points)
- Variance computed as sample variance
- Top 3 worst-performing examples per agent
- "Worst" = lowest minimum score across all evaluators per example (bottleneck ranking, mirrors tester.md terminal output logic)
- worst_cases entries include actual_output and failure reason derived from scores ("Failed {evaluator} ({score} < {threshold})")
- Per-example input, expected_output, and actual_output sourced from experiment-raw.json
- If NO rows have category metadata: omit category_scores entirely (empty object or absent)
- If SOME rows have category metadata: slice on the subset only, include count field per category
- When category coverage is incomplete, note in summary field
- Two-level terminal output: compact table by default, detailed per-evaluator table with --verbose flag
- Compact: agent_key | role | bottleneck_score | PASS/FAIL
- Verbose: adds per-evaluator median scores per agent
- Category breakdown is test-results.md only, never in terminal
- Full markdown report with per-agent sections, actionable next-step guidance
- Next-step guidance: "All passing -> ready for /orq-agent:harden" or "N agents failing -> run /orq-agent:iterate"

### Claude's Discretion
- Internal code structure and computation logic
- Exact table formatting and column widths
- How to handle edge cases (e.g., all runs identical, single evaluator)
- Error handling for malformed experiment-raw.json

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| ANLZ-01 | Results-analyzer computes triple-run aggregation (median, variance, 95% CI) | Student's t-distribution for n=3 (df=2), t-critical = 4.303. Median of sorted[1], sample variance with n-1 denominator, CI = median +/- t * (stddev / sqrt(n)). Scale-aware clamping. |
| ANLZ-02 | Results-analyzer determines pass/fail per evaluator per agent against thresholds | Role-based thresholds from CONTEXT.md (structural 0.8, conversational 0.7, hybrid 0.75). Per-evaluator comparison, overall_pass = ALL pass. Hardener.md reads `scores.{evaluator}.pass` and `scores.{evaluator}.threshold`. |
| ANLZ-03 | Results-analyzer produces category-sliced scoring from `inputs.category` metadata | experiment-raw.json per_example entries include category from dataset upload. Slice by category, compute per-evaluator median within each slice. Template shows 6 categories. Graceful handling when categories are absent/partial. |
| ANLZ-04 | Results-analyzer writes `test-results.json` preserving schema compatibility with hardener.md | Template at `orq-agent/templates/test-results.json` (v3.0) defines exact schema. Hardener reads: `results.per_agent[].scores`, `results.per_agent[].role`, `results.per_agent[].evaluators_used`, `results.per_agent[].category_scores`, `results.per_agent[].worst_cases`, `results.per_agent[].total_failure_count`. |
| ANLZ-05 | Results-analyzer produces `test-results.md` and terminal summary table | Markdown report with per-agent evaluator scores, category breakdown, worst cases, next-step guidance. Terminal: compact (bottleneck) and verbose (per-evaluator) modes. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| No external libraries | N/A | Pure computation subagent | This is a Claude Code agent (.md file), not a Node/Python application. All computation is described in natural language instructions that the LLM executes via bash/jq. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| jq | system | JSON parsing and transformation | Reading experiment-raw.json, writing test-results.json |
| bash arithmetic | system | Statistical calculations | Median, variance, CI computation |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| bash/jq math | Node.js script | Adds dependency; bash is sufficient for n=3 aggregation |
| Hand-computed t-value | stats library | t-critical for df=2 at 95% is a constant (4.303); no library needed |

## Architecture Patterns

### Recommended Project Structure
```
orq-agent/agents/results-analyzer.md    # The subagent (new file)
orq-agent/templates/test-results.json   # Output schema template (existing)
```

### Pattern 1: Phased Subagent Execution
**What:** Agent file follows the established pattern: YAML frontmatter, `<files_to_read>` block, numbered phases, each phase with clear inputs/outputs.
**When to use:** All subagents in this project follow this pattern.
**Example:** See dataset-preparer.md (Phase 26) and experiment-runner.md (Phase 27) for the canonical pattern:
```markdown
---
name: orq-results-analyzer
description: Reads experiment-raw.json, computes statistical aggregation, determines pass/fail, writes test-results.json and test-results.md
tools: Read, Bash, Glob, Grep
model: inherit
---

<files_to_read>
- orq-agent/templates/test-results.json
</files_to_read>
```

### Pattern 2: Disk-Based Handoff Contract
**What:** Subagents communicate via JSON files on disk. experiment-raw.json is the input contract; test-results.json is the output contract.
**When to use:** All inter-subagent communication in this pipeline.
**Key detail:** The input contract (experiment-raw.json) includes per-example data nested under `agents.{key}.runs[].scores.{evaluator}.per_example[]` with fields: `eval_id`, `input`, `output`, `score`.

### Pattern 3: Role-Based Threshold Mapping
**What:** Agent role determines pass/fail thresholds. No per-evaluator threshold configuration -- role is the single input.
**When to use:** Pass/fail determination phase.
**Mapping (from CONTEXT.md, matching tester.md):**
- structural: 0.8 threshold for all evaluators
- conversational: 0.7 threshold for all evaluators
- hybrid: 0.75 threshold for all evaluators

**Important nuance from tester.md Phase 6:** The existing tester.md uses PER-EVALUATOR thresholds that differ (e.g., json_validity=1.0, exactness=0.8, coherence=0.7). The CONTEXT.md decision says "role-based defaults matching tester.md's proven mapping" with values structural=0.8, conversational=0.7, hybrid=0.75. These are the ROLE-LEVEL pass thresholds applied uniformly to all evaluators for that role. This is a simplification from tester.md's per-evaluator thresholds. The CONTEXT.md decision is locked -- use role-level thresholds.

### Anti-Patterns to Avoid
- **Computing mean instead of median:** User locked median as central tendency. With n=3, median = sorted[1] (the middle value).
- **Using z-distribution (1.96) for CI:** The tester.md Phase 8 uses 1.96 (z-distribution). But CONTEXT.md locks Student's t with n-1 df. For n=3, df=2, t-critical at 95% = 4.303. This is the correct choice for small samples.
- **Including category breakdown in terminal output:** Locked decision -- category breakdown appears in test-results.md only, never in terminal.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JSON schema construction | Manual string concatenation | jq for JSON assembly | Edge cases with escaping, nested objects |
| Markdown table formatting | Character-by-character alignment | printf-based column formatting in bash | Consistent alignment, handles variable-width content |
| CI clamping | Unclamped intervals | Explicit min/max bounds per scale | CIs must not exceed scale bounds (0-1 for binary, 1-5 for LLM evaluators) |

**Key insight:** The statistical computations are trivial for n=3 -- the real complexity is in JSON schema fidelity and handling partial/missing data gracefully.

## Common Pitfalls

### Pitfall 1: test-results.json Schema Drift
**What goes wrong:** Hardener.md reads specific fields from test-results.json. Any missing or renamed field breaks the downstream pipeline silently.
**Why it happens:** Schema is documented in a template but not validated at runtime.
**How to avoid:** Reference `orq-agent/templates/test-results.json` explicitly in the subagent instructions. List every field hardener.md reads.
**Warning signs:** Hardener fails at Phase 1 Step 1.2 with "No test results found" or missing field errors.

**Fields hardener.md reads (from hardener.md Phase 1 Step 1.2):**
- `results.per_agent[].agent_key`
- `results.per_agent[].role`
- `results.per_agent[].scores` (per-evaluator with median, variance, confidence_interval, pass, threshold, scale, runs)
- `results.per_agent[].evaluators_used` (name, threshold, scale)
- `results.per_agent[].category_scores`
- `results.per_agent[].worst_cases`
- `results.per_agent[].total_failure_count`
- `results.overall_pass`
- `evaluators[]` (top-level array with name, type, threshold, scale, orqai_evaluator_id)

### Pitfall 2: experiment-raw.json Missing Per-Example Data
**What goes wrong:** experiment-raw.json may not include per-example input/output text if experiment-runner only exports aggregate scores.
**Why it happens:** The CONTEXT.md notes this explicitly: "experiment-raw.json contract needs updating: must include per-example input, expected_output, and actual_output alongside scores."
**How to avoid:** The experiment-runner.md Phase 5 export does include per-example data (`per_example: [{ eval_id, input, output, score }]`). Verify the field names match: experiment-runner uses `output` while test-results.json template uses `actual_output`. Results-analyzer must map between these.
**Warning signs:** worst_cases entries have null/empty actual_output fields.

### Pitfall 3: Scale Mismatch in Worst-Case Ranking
**What goes wrong:** Comparing scores across different scales (binary 0-1, continuous 0-1, continuous 1-5) without normalization leads to incorrect worst-case identification.
**Why it happens:** Different evaluators use different scales. A score of 0.8 on a binary evaluator means something different than 0.8 on a 1-5 scale.
**How to avoid:** CONTEXT.md says worst = "lowest minimum score across all evaluators per example." The tester.md Phase 8.4 normalizes 1-5 scores to 0-1 via `(score - 1) / 4`. Results-analyzer should use the same normalization for bottleneck ranking.
**Warning signs:** Worst cases are dominated by LLM evaluators (1-5 scale) because their raw scores are always higher.

### Pitfall 4: Incorrect Sample Variance Formula
**What goes wrong:** Using population variance (divide by n) instead of sample variance (divide by n-1).
**Why it happens:** CONTEXT.md says "sample variance" which means n-1 denominator.
**How to avoid:** For n=3: variance = sum((x - mean)^2) / 2. Note: variance uses mean for computation even though median is the reported central tendency.
**Warning signs:** Variance values are suspiciously low.

### Pitfall 5: CI Computed from Median Instead of Mean
**What goes wrong:** Using median as the center of the CI while using standard deviation computed from mean.
**Why it happens:** CONTEXT.md says "median as central tendency" but CI formula traditionally centers on mean.
**How to avoid:** The CI should still center on the median (user decision), but stddev is computed from the mean (standard formula). CI = median +/- t * (stddev / sqrt(n)). Clamp to scale bounds.
**Warning signs:** CI doesn't contain the median (impossible if formula is correct).

### Pitfall 6: Missing dataset Metadata in test-results.json
**What goes wrong:** The test-results.json template includes a `dataset` section with split counts and per-agent dataset IDs.
**Why it happens:** Results-analyzer reads experiment-raw.json which may not carry full dataset metadata.
**How to avoid:** Results-analyzer should also read `dataset-prep.json` from the same swarm directory to fill in dataset metadata. experiment-raw.json doesn't carry train/test/holdout counts.
**Warning signs:** dataset section in test-results.json has all zeros.

## Code Examples

### Student's t CI for n=3
```bash
# t-critical for df=2 at 95% confidence level
T_CRIT=4.303

# Given 3 run scores
SCORES=(0.85 0.90 0.82)

# Sort and take median
SORTED=($(printf '%s\n' "${SCORES[@]}" | sort -n))
MEDIAN=${SORTED[1]}  # Middle of 3

# Mean and sample variance
MEAN=$(echo "scale=6; (${SCORES[0]} + ${SCORES[1]} + ${SCORES[2]}) / 3" | bc)
VARIANCE=$(echo "scale=6; ((${SCORES[0]} - $MEAN)^2 + (${SCORES[1]} - $MEAN)^2 + (${SCORES[2]} - $MEAN)^2) / 2" | bc)
STDDEV=$(echo "scale=6; sqrt($VARIANCE)" | bc)

# 95% CI centered on median
MARGIN=$(echo "scale=6; $T_CRIT * ($STDDEV / sqrt(3))" | bc)
CI_LOW=$(echo "scale=4; $MEDIAN - $MARGIN" | bc)
CI_HIGH=$(echo "scale=4; $MEDIAN + $MARGIN" | bc)

# Clamp to scale bounds (example: 0-1 scale)
CI_LOW=$(echo "if ($CI_LOW < 0) 0 else $CI_LOW" | bc)
CI_HIGH=$(echo "if ($CI_HIGH > 1) 1 else $CI_HIGH" | bc)
```

### Bottleneck Score for Terminal Summary
```bash
# Per agent: find the lowest evaluator median (normalized to 0-1)
# Binary/continuous-01: use as-is
# Continuous 1-5: normalize with (score - 1) / 4
# Bottleneck = min across all evaluators
```

### experiment-raw.json Input Structure (from experiment-runner.md)
```json
{
  "agents": {
    "agent-key": {
      "status": "complete",
      "role": "structural",
      "evaluators_used": [{ "name": "json_validity", "id": "...", "type": "function" }],
      "runs": [
        {
          "run": 1,
          "scores": {
            "json_validity": {
              "per_example": [
                { "eval_id": "E-01", "input": "...", "output": "...", "score": 1.0 }
              ],
              "aggregate": 0.95
            }
          }
        }
      ],
      "successful_runs": 3
    }
  }
}
```

### test-results.json Output Structure (key fields for hardener compatibility)
```json
{
  "evaluators": [
    { "name": "json_validity", "type": "function", "threshold": 0.8, "scale": "binary", "orqai_evaluator_id": "..." }
  ],
  "results": {
    "overall_pass": true,
    "per_agent": [
      {
        "agent_key": "my-agent",
        "role": "structural",
        "evaluators_used": [{ "name": "json_validity", "threshold": 0.8, "scale": "binary" }],
        "scores": {
          "json_validity": {
            "median": 0.95,
            "variance": 0.001,
            "confidence_interval": [0.82, 1.0],
            "pass": true,
            "threshold": 0.8,
            "scale": "binary",
            "runs": [0.93, 0.95, 0.97]
          }
        },
        "category_scores": {},
        "worst_cases": [],
        "total_failure_count": 0
      }
    ]
  },
  "summary": "1/1 agents passing. All agents ready for /orq-agent:harden."
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Monolithic tester.md Phase 8 | Dedicated results-analyzer subagent | V2.1 restructure (current) | Separates concerns; analyzer is reusable across standard and holdout modes |
| z-distribution CI (1.96) | Student's t CI (4.303 for df=2) | Phase 28 CONTEXT decision | Wider, more honest CIs for small n=3 samples |
| Population variance (n divisor) | Sample variance (n-1 divisor) | Phase 28 CONTEXT decision | Statistically correct for sample data |

**Deprecated/outdated:**
- tester.md Phase 8: Being replaced by this subagent. Logic is reusable as reference but the file itself will not be used in V2.1 pipeline.
- z-distribution for n=3 CI: tester.md uses 1.96; results-analyzer uses 4.303 (t-distribution).

## Open Questions

1. **Field name mismatch: output vs actual_output**
   - What we know: experiment-runner.md per_example uses `output`; test-results.json template uses `actual_output`
   - What's unclear: Whether this is intentional or an oversight
   - Recommendation: Results-analyzer should map `output` from experiment-raw.json to `actual_output` in test-results.json. Document this mapping explicitly.

2. **dataset section population**
   - What we know: test-results.json template has a `dataset` section with split counts, per-agent dataset IDs, train/test/holdout IDs
   - What's unclear: experiment-raw.json does not carry dataset split metadata
   - Recommendation: Results-analyzer should also read `dataset-prep.json` from the swarm directory to populate the dataset section. This is a second input file.

3. **Evaluator threshold vs role threshold**
   - What we know: CONTEXT.md says role-based defaults (structural=0.8, conversational=0.7, hybrid=0.75). tester.md had per-evaluator thresholds.
   - What's unclear: Whether the role threshold applies uniformly to all evaluators or if certain evaluators (e.g., toxicity with threshold 0.1) need special handling
   - Recommendation: Apply role-based threshold uniformly. Toxicity and harmfulness evaluators from category overlays should use the same role threshold. The CONTEXT decision is locked and doesn't mention exceptions.

4. **expected_output in experiment-raw.json**
   - What we know: CONTEXT.md says worst_cases need expected_output. experiment-runner.md per_example schema shows `eval_id`, `input`, `output`, `score` but NOT `expected_output`.
   - What's unclear: Whether experiment-runner exports expected_output
   - Recommendation: The CONTEXT.md notes "experiment-raw.json contract needs updating" for this. The planner should include a contract verification/expansion note. Results-analyzer should handle missing expected_output gracefully (use "N/A" or empty string).

## Sources

### Primary (HIGH confidence)
- `orq-agent/templates/test-results.json` - Exact output schema, v3.0
- `orq-agent/agents/hardener.md` - Downstream consumer, field-by-field parsing in Phase 1 Step 1.2
- `orq-agent/agents/experiment-runner.md` - Upstream producer, experiment-raw.json schema in Phase 6
- `orq-agent/agents/tester.md` Phase 8 - Reference implementation for aggregation, category slicing, worst cases, terminal output

### Secondary (MEDIUM confidence)
- Student's t-distribution critical value for df=2 at 95%: 4.303 (standard statistical table, verified from training data)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - No external libraries needed; pure computation in a .md subagent
- Architecture: HIGH - Follows established subagent pattern from Phases 26-27; all I/O contracts documented
- Pitfalls: HIGH - Schema compatibility verified against actual hardener.md source; field name mismatches identified

**Research date:** 2026-03-12
**Valid until:** 2026-04-12 (stable -- no external dependencies to go stale)
