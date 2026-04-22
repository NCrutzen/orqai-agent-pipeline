# Phase 30: Failure Diagnoser - Research

**Researched:** 2026-03-12
**Domain:** LLM prompt iteration -- evaluator failure diagnosis, evaluator-to-prompt-section mapping, diff proposal generation, HITL approval collection
**Confidence:** HIGH

## Summary

Phase 30 creates `failure-diagnoser.md`, a new subagent that extracts iterator.md Phases 1-3 plus the HITL approval pause (Phase 4 approval collection only -- not change application). The failure-diagnoser reads `test-results.json` (confirmed schema from Phase 29 pipeline), maps evaluator failures to XML-tagged prompt sections, proposes section-level diffs with reasoning, collects per-agent user approval, and writes `iteration-proposals.json` as the handoff contract for Phase 31's prompt-editor.

This is a pure reasoning/analysis subagent with one file write (`iteration-proposals.json`) and one interactive pause (HITL approval). No API calls. No prompt modifications. The diagnoser's scope ends at approval collection -- applying changes, re-deploying, and re-testing all belong to prompt-editor (Phase 31).

**Primary recommendation:** Extract iterator.md Phases 1-4 (approval collection only) into `failure-diagnoser.md` (~250 lines). Use the existing evaluator-to-section mapping heuristics from iterator.md verbatim. Define `iteration-proposals.json` schema as the output contract. The subagent reads test-results.json + individual agent spec `.md` files, never makes API calls.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| ITPIPE-01 | Failure-diagnoser reads test-results.json and maps evaluator failures to XML-tagged prompt sections | test-results.json schema is confirmed (Phase 29 complete). XML-tagged sections are standardized in agent-spec template (`<task_handling>`, `<constraints>`, `<output_format>`, `<context_management>`, `<examples>`). Mapping heuristics exist in iterator.md Phase 2 Step 2.1. |
| ITPIPE-02 | Failure-diagnoser proposes section-level diffs with plain-language reasoning | iterator.md Phase 3 has the exact proposal format (diff blocks with reason, evaluator link, category link). Proposal generation rules are documented. |
| ITPIPE-03 | Failure-diagnoser collects per-agent HITL approval before any file modifications | iterator.md Phase 4 has the approval flow. HITL is a LOCKED decision from STATE.md. Approval status writes to `iteration-proposals.json` per-agent `approval` field. |
</phase_requirements>

## Standard Stack

### Core

| Component | Purpose | Why Standard |
|-----------|---------|--------------|
| `test-results.json` (input) | Confirmed V3.0 schema from results-analyzer | All downstream consumers (hardener, failure-diagnoser) parse identical fields |
| `iteration-proposals.json` (output) | Handoff contract to prompt-editor | Defined in ARCHITECTURE.md; prompt-editor reads approved proposals only |
| Agent spec `.md` files (read-only) | Current prompt content with XML-tagged sections | Standard template; `<task_handling>`, `<constraints>`, `<output_format>`, `<context_management>`, `<examples>` |
| `iteration-log.json` template | Structured iteration log schema | Exists at `orq-agent/templates/iteration-log.json` V3.0 |

### Supporting

| Component | Purpose | When to Use |
|-----------|---------|-------------|
| `orqai-evaluator-types.md` | Evaluator taxonomy for mapping heuristics | Referenced in `<files_to_read>` for evaluator type awareness |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Heuristic evaluator-to-section mapping | LLM-based analysis of full prompt | Heuristics are deterministic and documented; LLM analysis is implicit. Heuristics win for auditability. |
| iteration-proposals.json file handoff | In-memory state passing | File handoff is the V2.1 pattern (dataset-prep.json, experiment-raw.json). Consistency wins. |

## Architecture Patterns

### Recommended File Structure

```
orq-agent/agents/failure-diagnoser.md    # New subagent (~250 lines)
orq-agent/templates/iteration-proposals.json  # New template (optional but recommended)
```

### Pattern 1: Input Contract from test-results.json

**What:** The failure-diagnoser reads specific fields from `test-results.json`:
- `results.per_agent[].agent_key` -- agent identifier
- `results.per_agent[].role` -- structural/conversational/hybrid
- `results.per_agent[].scores` -- per-evaluator with median, threshold, pass, scale, runs
- `results.per_agent[].category_scores` -- per-category per-evaluator breakdown
- `results.per_agent[].worst_cases` -- bottom 3 examples with input, actual_output, scores, reason
- `results.per_agent[].evaluators_used` -- evaluator names and thresholds
- `results.per_agent[].total_failure_count`
- `results.overall_pass` -- quick check: if true, nothing to diagnose

**When to use:** Phase 1 of the subagent pipeline.

### Pattern 2: Evaluator-to-Section Mapping Heuristics

**What:** Deterministic mapping from evaluator failure type to XML-tagged prompt section. Directly from iterator.md Phase 2 Step 2.1:

| Evaluator Failure | Likely Prompt Section | Reasoning |
|-------------------|----------------------|-----------|
| `instruction_following` low | `<task_handling>` or role definition | Agent not following heuristic approach |
| `coherence` low | `<task_handling>` + `<output_format>` | Responses lack logical flow |
| `helpfulness` low | `<task_handling>` + `<examples>` | Not providing useful responses |
| `relevance` low | Role definition + `<constraints>` | Going off-topic |
| `json_validity` low | `<output_format>` | Output format not enforcing JSON |
| `exactness` low | `<output_format>` + `<examples>` | Output not matching expected patterns |
| `toxicity` high | `<constraints>` | Missing safety boundaries |
| `harmfulness` detected | `<constraints>` + role definition | Constraints insufficient |
| Category-specific (adversarial) | `<constraints>` | Susceptible to prompt injection |
| Category-specific (edge-case) | `<task_handling>` + `<examples>` | Not handling unusual inputs |

**When to use:** During diagnosis (Phase 2 of the subagent).

### Pattern 3: Output Contract -- iteration-proposals.json

**What:** The handoff file to prompt-editor. Schema from ARCHITECTURE.md:

```json
{
  "iteration": 1,
  "proposed_at": "ISO-8601",
  "per_agent": [
    {
      "agent_key": "my-agent",
      "approval": "approved|rejected",
      "diagnosis": "plain-language diagnosis text",
      "changes": [
        {
          "section": "<task_handling>",
          "reason": "instruction_following scored 0.55 (threshold 0.8). Task handling section lacks specific heuristics for...",
          "before": "existing section content",
          "after": "modified section content"
        }
      ]
    }
  ]
}
```

**When to use:** Written after HITL approval collection, before subagent exits.

### Pattern 4: HITL Approval Boundary Placement

**What:** The HITL approval pause lives inside `failure-diagnoser.md`, not in the command file or `prompt-editor.md`. The diagnoser shows diagnosis + proposals in-context, collects approval while the user can still see the reasoning, and writes the approval status to `iteration-proposals.json`.

**Why this placement (from ARCHITECTURE.md):** Separating diagnosis/proposal from application means the full diagnosis context (evaluator scores, worst cases, prompt section analysis) is still in-context when the user approves. If approval lived in the command file, that context would be gone.

### Pattern 5: Guardrail Violation Priority

**What:** Before diagnosing regular evaluator failures, check if the agent has a `## Guardrails` section in its spec file. If a guardrail evaluator is failing, surface it as a guardrail violation with higher priority. This pattern exists in iterator.md Phase 2 Step 2.2a.

**When to use:** As the first check during per-agent diagnosis.

### Anti-Patterns to Avoid

- **Full prompt replacement:** Never propose replacing the entire prompt. Only modify specific XML-tagged sections.
- **API calls from diagnoser:** This is a pure analysis subagent. Zero API calls. All data comes from disk (test-results.json + agent spec files).
- **Applying changes:** The diagnoser ONLY diagnoses and collects approval. Change application belongs to prompt-editor (Phase 31).
- **Hand-rolling XML parsing:** Use string split on `<tag>` / `</tag>` patterns. Agent prompts use simple non-nested XML.
- **Ignoring category_scores:** Category breakdown reveals WHERE failures concentrate (adversarial vs happy-path). Essential for targeted diagnosis.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Evaluator-to-section mapping | Custom ML classifier | Heuristic lookup table from iterator.md | Deterministic, auditable, already documented and tested in V2.0 |
| XML section parsing | Full XML parser | String split on `<tag>`/`</tag>` | Agent prompts use simple non-nested XML; a parser is overkill |
| Diff generation | Unified diff algorithm | LLM-generated before/after with diff formatting | The diagnoser IS the LLM; it generates the modified content directly |
| Approval flow | Custom UI | Terminal prompt (yes/no per agent) | Claude Code interactive pattern; user responds in conversation |

**Key insight:** The failure-diagnoser is the LLM itself analyzing failures and proposing improvements. No custom code, no external tools, no API calls. The "algorithm" is Claude reasoning about evaluator scores and prompt content.

## Common Pitfalls

### Pitfall 1: Scope Creep into Change Application

**What goes wrong:** Including change application logic (file writes to spec files, re-deploy, re-test) in the diagnoser.
**Why it happens:** The old iterator.md combined diagnosis + application in one monolith.
**How to avoid:** Strict boundary: diagnoser writes `iteration-proposals.json` and STOPS. Prompt-editor (Phase 31) reads that file and applies changes.
**Warning signs:** Any reference to "write to spec file" or "invoke deployer" in the diagnoser.

### Pitfall 2: Cascading Changes Breaking Working Sections

**What goes wrong:** A change to `<task_handling>` to fix `instruction_following` accidentally degrades `coherence` or `helpfulness`.
**Why it happens:** Prompt sections are interdependent. Changing one section's behavior affects how other evaluators score.
**How to avoid:** Prefer adding content (new constraints, additional examples) over replacing existing content. Each proposal must explain which evaluator it targets and acknowledge potential side effects.
**Warning signs:** Proposals that delete or substantially rewrite existing content rather than augmenting it.

### Pitfall 3: Overly Complex Input Contract

**What goes wrong:** Passing the entire test-results.json schema through parameters.
**Why it happens:** Desire for completeness.
**How to avoid:** Minimum input contract: swarm directory path + iteration number. The diagnoser reads test-results.json and agent spec files from disk itself.
**Warning signs:** More than 3-4 input parameters to the subagent.

### Pitfall 4: HITL Approval Outside Diagnosis Context

**What goes wrong:** Collecting approval in the command file after the diagnoser returns, when the diagnosis details are no longer visible.
**Why it happens:** Treating HITL as an orchestration concern rather than a diagnosis concern.
**How to avoid:** HITL approval lives inside failure-diagnoser.md. The user sees diagnosis + proposals and approves/rejects while still in context. Approval status is written to iteration-proposals.json.
**Warning signs:** iterate.md handling approval logic.

### Pitfall 5: Missing Guardrail Violation Check

**What goes wrong:** Treating guardrail evaluator failures the same as regular evaluator failures.
**Why it happens:** Guardrails are a hardener concern and easy to overlook during iteration.
**How to avoid:** Check for `## Guardrails` section in spec file. If a guardrail evaluator is failing, flag it with higher priority.
**Warning signs:** No mention of guardrails in the diagnosis phase.

### Pitfall 6: Agents Without XML Tags

**What goes wrong:** Assuming all agents use XML-tagged sections in their instructions.
**Why it happens:** The spec generator always uses XML tags, but older or manually created specs might not.
**How to avoid:** If no XML tags found in instructions, propose adding XML tags around logical sections as a structural improvement (from iterator.md Decision Framework #5).
**Warning signs:** Crash or empty diagnosis when encountering unstructured instructions.

## Code Examples

### Example 1: Failure Priority List Construction

From iterator.md Phase 1 Step 1.3 -- building sorted failure list:

```
For each agent in results.per_agent:
  if ANY evaluator has pass: false:
    bottleneck_score = min(scores[eval].median for all evals)
    add to failure_list
Sort failure_list by bottleneck_score ascending (worst first)
```

### Example 2: Diagnosis Output Format

From iterator.md Phase 2 Step 2.2:

```markdown
### Agent: {agent-key} -- Diagnosis

**Overall:** FAIL (bottleneck: {evaluator} at {score}, threshold {threshold})

**Failure patterns:**
1. **{evaluator} failing on {category} examples** -- {N} of {M} {category} examples scored below threshold
   - Worst case: "{input}" -> scored {score} because {reason from worst_cases}
   - Likely prompt section: `<{section}>` -- {plain-language explanation}
```

### Example 3: Proposal Output Format

From iterator.md Phase 3 Step 3.2:

```markdown
### Agent: {agent-key} -- Proposed Changes

**Change 1 of {N}:** Modify `<{section}>` section
**Reason:** {evaluator} scored {score} (threshold: {threshold}) on {category} examples. {explanation}

\`\`\`diff
- [existing section content]
+ [modified section content]
\`\`\`
```

### Example 4: iteration-proposals.json Output

```json
{
  "iteration": 1,
  "proposed_at": "2026-03-12T18:00:00Z",
  "per_agent": [
    {
      "agent_key": "support-triage-agent",
      "approval": "approved",
      "diagnosis": "FAIL (bottleneck: instruction_following at 0.55, threshold 0.8). Task handling section lacks specific heuristics for classifying support ticket priority.",
      "changes": [
        {
          "section": "<task_handling>",
          "reason": "instruction_following scored 0.55 (threshold 0.8) on happy-path examples. Current task_handling provides generic approach; needs specific priority classification heuristics.",
          "before": "When you receive a support ticket, classify it by urgency.",
          "after": "When you receive a support ticket, classify it by urgency using these heuristics:\n- Mentions system down, data loss, or security breach → P1 Critical\n- Mentions blocked workflow or deadline → P2 High\n- Feature request or cosmetic issue → P3 Normal"
        }
      ]
    }
  ]
}
```

## State of the Art

| Old Approach (V2.0 iterator.md) | New Approach (V2.1 failure-diagnoser) | When Changed | Impact |
|----------------------------------|---------------------------------------|--------------|--------|
| Monolithic 544-line iterator.md combining diagnosis + application + re-deploy + re-test | Separate diagnosis (failure-diagnoser ~250 lines) from application (prompt-editor ~200 lines) | V2.1 restructure | Reduced context load; each subagent fits in context window; clearer separation of concerns |
| HITL approval in the loop control | HITL approval inside diagnosis subagent | V2.1 architecture decision | User approves while diagnosis context is still visible |
| In-memory state between phases | File-based handoff (iteration-proposals.json) | V2.1 pattern (matches dataset-prep.json, experiment-raw.json) | Consistent intermediate file pattern; debuggable; restartable |

## Open Questions

1. **iteration-proposals.json template file**
   - What we know: Schema is defined in ARCHITECTURE.md. Other handoff files (test-results.json, iteration-log.json) have templates in `orq-agent/templates/`.
   - What's unclear: Should we create `orq-agent/templates/iteration-proposals.json` for consistency?
   - Recommendation: Yes, create the template for consistency with existing patterns. Low effort, high consistency value.

2. **Conditional sections in diagnosis (memory_patterns, delegation_framework, thinking_recommendation)**
   - What we know: The agent-spec template includes optional conditional XML sections beyond the 5 standard ones.
   - What's unclear: Should the evaluator-to-section mapping cover these conditional sections?
   - Recommendation: Include them in the mapping table as secondary targets. `delegation_framework` failures would map to orchestration evaluators; `memory_patterns` to context/retrieval evaluators. But keep the primary heuristics focused on the 5 standard sections.

3. **Iteration number parameter**
   - What we know: The iterate command (Phase 32) will pass an iteration number for logging.
   - What's unclear: Whether failure-diagnoser needs this for anything beyond writing it to iteration-proposals.json.
   - Recommendation: Accept iteration number as input parameter, write it to output JSON. No other use.

## Sources

### Primary (HIGH confidence)

- `orq-agent/agents/iterator.md` -- Existing V2.0 implementation containing Phases 1-4 logic to extract
- `orq-agent/templates/test-results.json` -- V3.0 input schema (confirmed by Phase 28/29 completion)
- `orq-agent/templates/agent-spec.md` -- XML-tagged section structure
- `orq-agent/templates/iteration-log.json` -- V3.0 iteration logging schema
- `.planning/research/ARCHITECTURE.md` -- V2.1 architecture with iteration-proposals.json schema and HITL boundary placement
- `.planning/research/SUMMARY.md` -- V2.1 component breakdown and phase rationale
- `.planning/REQUIREMENTS.md` -- ITPIPE-01, ITPIPE-02, ITPIPE-03 requirement definitions

### Secondary (MEDIUM confidence)

- `.planning/ROADMAP.md` -- Phase 30/31/32 descriptions and dependency chain

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All input/output schemas confirmed by completed phases and architecture docs
- Architecture: HIGH - Pattern directly extracted from working iterator.md with documented V2.1 restructure decisions
- Pitfalls: HIGH - All pitfalls derived from actual V2.0 implementation experience documented in iterator.md

**Research date:** 2026-03-12
**Valid until:** 2026-04-12 (stable -- internal project architecture, no external dependencies)
