# Phase 33: Fix Iteration Pipeline Wiring - Research

**Researched:** 2026-03-13
**Domain:** Cross-agent JSON handoff contracts and context forwarding in markdown-based agent orchestration
**Confidence:** HIGH

## Summary

Phase 33 fixes two integration breaks identified by the V2.1 milestone audit. Both are wiring bugs -- not logic errors -- in the handoff contracts between iterate.md, prompt-editor.md, and dataset-prep.json. The fixes are small, precisely scoped, and well-understood from the audit evidence.

**Break 1:** prompt-editor.md Phase 1.2 reads `holdout_dataset_id` from `per_agent_datasets[]` (an array structure that exists in `test-results.json`), but the file it actually reads is `dataset-prep.json`, which stores per-agent data under `agents.{agent_key}` as a flat map. The lookup always fails, triggering the STOP guard and making the holdout re-test path unreachable.

**Break 2:** iterate.md Step 5.4 invokes prompt-editor but does not forward `mcp_available` in the context. When prompt-editor delegates to deployer.md in Phase 3, the deployer lacks the MCP state signal and will attempt MCP first in MCP-unavailable environments before falling back to REST (performance degradation, not a hard break).

**Primary recommendation:** Fix both issues with targeted text edits to prompt-editor.md (Step 1.2 schema path) and iterate.md (Step 5.4 forwarded context), then verify the JSON handoff contracts are aligned end-to-end.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| ITPIPE-05 | Prompt-editor delegates re-deploy to deployer and holdout re-test to experiment-runner (skips dataset-preparer) | Break 1 fix: correct schema path in prompt-editor Phase 1.2 so holdout_dataset_id resolves correctly, making the re-test path reachable. Break 2 fix: forward mcp_available so deployer delegation works efficiently. |
| LOOP-01 | Rewritten iterate.md orchestrates failure-diagnoser -> prompt-editor in loop with stop conditions | Break 2 fix: iterate.md Step 5.4 must forward mcp_available to prompt-editor context. Break 1 fix indirectly: the holdout re-test path feeds updated scores to test-results.json, which iterate.md reads for stop condition evaluation (all_pass, min_improvement). |
</phase_requirements>

## Standard Stack

Not applicable -- this phase edits markdown agent instruction files only. No libraries, packages, or code are involved.

## Architecture Patterns

### Pattern 1: JSON Handoff Contract Alignment

**What:** Subagents communicate via JSON files written to the swarm directory. Each producer defines the schema; each consumer must read using the exact same schema paths.

**When to use:** Always -- this is the V2.1 architecture's core inter-agent communication pattern (STATE.md decision: "Intermediate JSON files as subagent handoff contracts").

**The two schemas that must align for holdout re-test:**

**dataset-prep.json (producer: dataset-preparer.md Phase 8):**
```json
{
  "agents": {
    "{agent-key}": {
      "status": "ready",
      "role": "structural|conversational|hybrid",
      "holdout_dataset_id": "{ulid}",
      "test_dataset_id": "{ulid}",
      "train_dataset_id": "{ulid}"
    }
  }
}
```
Access pattern: `agents.{agent_key}.holdout_dataset_id`

**test-results.json (producer: results-analyzer.md, template: orq-agent/templates/test-results.json):**
```json
{
  "dataset": {
    "per_agent_datasets": [
      {
        "agent_key": "{agent-key}",
        "holdout_dataset_id": "{ulid}"
      }
    ]
  }
}
```
Access pattern: `dataset.per_agent_datasets[]` filtered by `agent_key` -> `.holdout_dataset_id`

**Current bug in prompt-editor.md Phase 1.2:** Uses `per_agent_datasets[]` array lookup syntax on `dataset-prep.json`, which uses `agents.{key}` flat map. The array syntax belongs to `test-results.json`.

### Pattern 2: mcp_available Context Propagation

**What:** Commands detect MCP availability in their Step 2 and forward the boolean to subagents that need it for API channel selection (MCP-first vs REST-only).

**When to use:** When a command invokes a subagent that itself invokes deployer.md (which uses MCP-first/REST-fallback pattern).

**Reference implementations (working correctly):**

- `test.md` Step 5.1 forwards `mcp_available` to dataset-preparer (line 201)
- `test.md` Step 5.2 explicitly does NOT forward to experiment-runner (REST-only, line 238)
- `deploy.md` Step 4.4 forwards `mcp_available` to deployer (line 399)

**Current bug in iterate.md Step 5.4:** Does not include `mcp_available` in the forwarded context list when invoking prompt-editor. Prompt-editor Phase 3 delegates to deployer, which needs this flag.

### Anti-Patterns to Avoid

- **Reading from wrong JSON file:** prompt-editor needs holdout IDs. Both dataset-prep.json and test-results.json have them, but with different schemas. The correct source is `dataset-prep.json` (it is the canonical source for dataset IDs, written by dataset-preparer). Do NOT switch to reading from test-results.json -- that would create a circular dependency (prompt-editor updates test-results.json in Phase 5.4).
- **Forwarding mcp_available to agents that don't need it:** experiment-runner is REST-only (LOCKED P27 decision). results-analyzer makes no API calls. Only deployer needs mcp_available.

## Don't Hand-Roll

Not applicable -- no custom solutions needed. Both fixes are text edits to existing instruction files.

## Common Pitfalls

### Pitfall 1: Choosing the Wrong Source for Holdout Dataset IDs

**What goes wrong:** Fixing prompt-editor Phase 1.2 by switching the source from dataset-prep.json to test-results.json. While test-results.json also has holdout IDs (in `dataset.per_agent_datasets[]`), prompt-editor Phase 5.4 updates test-results.json with new holdout scores. Reading from the same file you later write creates confusion about stale data.

**Why it happens:** The old iterator.md (V2.0) read holdout IDs from test-results.json. The refactored prompt-editor should read from dataset-prep.json (the canonical dataset source).

**How to avoid:** Fix the schema path to match dataset-prep.json's flat map: `agents.{agent_key}.holdout_dataset_id`. Keep the source file as dataset-prep.json.

**Warning signs:** Any reference to `per_agent_datasets[]` in the context of reading from dataset-prep.json.

### Pitfall 2: Incomplete Context Forwarding

**What goes wrong:** Adding `mcp_available` to iterate.md Step 5.4 but not explaining what it's for, leading to future confusion about which subagents need it.

**Why it happens:** The forwarding pattern is implicit -- you need to trace the chain: iterate -> prompt-editor -> deployer.

**How to avoid:** Add a brief comment explaining the propagation chain, consistent with test.md's pattern (which explicitly notes why experiment-runner does NOT get mcp_available).

**Warning signs:** Missing documentation of why specific context variables are or aren't forwarded.

### Pitfall 3: Not Verifying Both Directions of the Contract

**What goes wrong:** Fixing prompt-editor's read path but not verifying that dataset-preparer actually writes `holdout_dataset_id` at that path.

**Why it happens:** Trusting the audit without cross-checking the producer side.

**How to avoid:** Verify dataset-preparer.md Phase 8 output schema matches the new read path. (Already verified in this research -- Phase 8 writes `agents.{agent_key}.holdout_dataset_id`.)

## Code Examples

### Fix 1: prompt-editor.md Phase 1.2 -- Current (Broken)

```markdown
### Step 1.2: Read Dataset Prep for Holdout IDs

Read `{swarm_dir}/dataset-prep.json`. For each approved agent, extract `holdout_dataset_id` from the matching entry in `per_agent_datasets[]` (where `agent_key` matches).
```

### Fix 1: prompt-editor.md Phase 1.2 -- Corrected

```markdown
### Step 1.2: Read Dataset Prep for Holdout IDs

Read `{swarm_dir}/dataset-prep.json`. For each approved agent, extract `holdout_dataset_id` from `agents.{agent_key}.holdout_dataset_id`.
```

### Fix 2: iterate.md Step 5.4 -- Current (Broken)

```markdown
### Step 5.4: Invoke Prompt Editor

...Read subagent instructions from `orq-agent/agents/prompt-editor.md`. Invoke with:
- **swarm_dir** (from Step 3)
- **iteration_number** (current iteration count)
```

### Fix 2: iterate.md Step 5.4 -- Corrected

```markdown
### Step 5.4: Invoke Prompt Editor

...Read subagent instructions from `orq-agent/agents/prompt-editor.md`. Invoke with:
- **swarm_dir** (from Step 3)
- **iteration_number** (current iteration count)
- **mcp_available** (from Step 2 -- forwarded to deployer via prompt-editor Phase 3)
```

## State of the Art

Not applicable -- this is a project-internal wiring fix, not a technology domain.

## Existing File Locations

| File | Path | Role in Fix |
|------|------|-------------|
| prompt-editor.md | `orq-agent/agents/prompt-editor.md` | Fix Step 1.2 schema path (line 32) |
| iterate.md | `orq-agent/commands/iterate.md` | Fix Step 5.4 to forward mcp_available (lines 307-310) |
| dataset-preparer.md | `orq-agent/agents/dataset-preparer.md` | Producer of dataset-prep.json -- verify Phase 8 schema (lines 217-237) |
| test-results.json template | `orq-agent/templates/test-results.json` | Reference for per_agent_datasets[] schema (NOT the source for prompt-editor) |
| V2.1 Milestone Audit | `.planning/V2.1-MILESTONE-AUDIT.md` | Documents both breaks with fix recommendations |

## Contract Verification Matrix

Post-fix, all JSON handoff contracts should be aligned:

| Contract | Producer | Consumer | Access Pattern | Status |
|----------|----------|----------|----------------|--------|
| dataset-prep.json -> prompt-editor | dataset-preparer P8 | prompt-editor P1.2 | `agents.{agent_key}.holdout_dataset_id` | BROKEN -> fix |
| dataset-prep.json -> experiment-runner | dataset-preparer P8 | experiment-runner P1 | `agents.{agent_key}.*` | Aligned |
| dataset-prep.json -> results-analyzer | dataset-preparer P8 | results-analyzer P1.2 | `agents.{agent_key}.*` | Aligned |
| iterate.md -> prompt-editor context | iterate Step 5.4 | prompt-editor (-> deployer) | `mcp_available` forwarded | BROKEN -> fix |
| test-results.json -> iterate stop conditions | results-analyzer P6 | iterate Steps 4.1/5.5 | `results.overall_pass`, `results.per_agent[]` | Aligned |

## Open Questions

None. Both breaks are well-characterized by the audit with clear fix paths. The producer schemas (dataset-preparer Phase 8) and consumer expectations are fully documented.

## Sources

### Primary (HIGH confidence)
- `orq-agent/agents/prompt-editor.md` -- current broken text at line 32 (Step 1.2)
- `orq-agent/commands/iterate.md` -- current Step 5.4 missing mcp_available at lines 307-310
- `orq-agent/agents/dataset-preparer.md` -- Phase 8 output schema at lines 217-237
- `orq-agent/templates/test-results.json` -- per_agent_datasets[] schema at lines 17-30
- `.planning/V2.1-MILESTONE-AUDIT.md` -- Break 1 and Break 2 documentation
- `.planning/STATE.md` -- Project decisions history
- `.planning/REQUIREMENTS.md` -- ITPIPE-05 and LOOP-01 definitions

## Metadata

**Confidence breakdown:**
- Standard stack: N/A - markdown edits only
- Architecture: HIGH - all schemas verified by reading actual files
- Pitfalls: HIGH - failure modes are documented in audit with evidence

**Research date:** 2026-03-13
**Valid until:** 2026-04-13 (stable -- internal project files)
