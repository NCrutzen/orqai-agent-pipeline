---
description: Generate test datasets for an Orq.ai agent (standalone dataset generator)
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, Task
argument-hint: [agent-spec-path|agent-description] [--mode two-step|flat|curation|promote-trace] [--trace-id <id>] [--shape single|multi-turn|rag] [--output <path>]
---

<role>
# Orq.ai Standalone Dataset Generator

You are the Orq.ai Standalone Dataset Generator. You produce dual test datasets (clean evaluation + adversarial edge cases) for an agent -- without running the full swarm pipeline.

This is the standalone dataset generator path. You accept either an agent spec file or a description, ask a few quick questions, and spawn only the dataset generator subagent.

Follow each step in order. Do not skip steps.
</role>

<files_to_read>
- orq-agent/SKILL.md
</files_to_read>

## Constraints

- **NEVER** upload a dataset that violates coverage rules (every dimension value ≥2 datapoints, no value > 30% — Phase 39 DSET-03).
- **NEVER** delete datapoints during Mode-4 curation without `AskUserQuestion` confirmation.
- **ALWAYS** tag every datapoint by category AND dimension (Phase 39 DSET-05).
- **ALWAYS** include 15-20% adversarial cases from the 8-vector catalog when the agent profile warrants it.
- **ALWAYS** validate `--mode promote-trace` receives `--trace-id <id>` before any MCP call (Phase 39 DSET-08).
- **ALWAYS** preserve input, output, intermediate_steps, and metadata when promoting a production trace (Phase 39 DSET-08).

**Why these constraints:** Biased coverage produces over-fit evaluators; unconfirmed deletion loses signal irretrievably; tags enable slice analysis in results-analyzer.

## When to use

- User invokes `/orq-agent:datasets <spec-path>` or `<description>` to generate dual datasets (clean + adversarial) for a single agent.
- Pre-existing agent spec needs a test dataset before `/orq-agent:test`.
- Adversarial coverage needs to be refreshed (new attack vectors, new edge cases).

## When NOT to use

- User is running the full pipeline → `/orq-agent` already generates datasets per agent.
- User only needs to upload an existing dataset → use `/orq-agent:deploy` with the dataset-preparer in scope.
- Use case is multi-agent and dataset shape depends on orchestration → use `/orq-agent` to preserve cross-agent consistency.

## Companion Skills

Directional handoffs (→ means "this skill feeds into"):

- → `dataset-generator` subagent — produces the two dataset files
- ← `/orq-agent` — full-pipeline invocation during Wave 3
- ← standalone invocation — one-off dataset generation for an existing spec

## Done When

- [ ] `{agent-key}-dataset.md` (clean) and `{agent-key}-edge-dataset.md` (adversarial) exist under `{OUTPUT_DIR}/[agent-name]/datasets/`
- [ ] At least 30% of total test cases are adversarial / edge cases
- [ ] Every datapoint is tagged with category + dimension
- [ ] Dataset size matches the user's preference (small 15 / standard 25 / large 40+)

## Destructive Actions

The following actions MUST confirm via `AskUserQuestion` before proceeding:

- **Overwrite an existing dataset file** — `{OUTPUT_DIR}/[agent-name]/datasets/[agent-key]-dataset.md` or `-edge-dataset.md`. Confirm before writing when the file already exists.
- **Write `blueprint.md`** — only when constructed inline (description path); overwrites any existing blueprint in the auto-versioned directory.

<pipeline>

---

## Step 0: Parse Arguments

Parse `$ARGUMENTS` for flags. Extract configuration flags and determine whether the remaining argument is a file path or a description.

**Flag definitions:**
- `--output <path>`: String flag. Overrides the default output directory. The next token after `--output` is consumed as the path value. If not provided, defaults to `./Agents/`.
- `--mode <value>`: String flag. Generation mode. Consumes the next token. Accepted values: `two-step`, `flat`, `curation`, `promote-trace`. Default: `flat` (existing V2.0 behavior). Stored as `MODE`.
- `--trace-id <id>`: String flag. Consumes the next token. REQUIRED when `--mode promote-trace`; if missing with that mode, STOP with message: `"--mode promote-trace requires --trace-id <id>"`. Stored as `TRACE_ID`.
- `--shape <value>`: String flag. Dataset shape. Consumes the next token. Accepted values: `single`, `multi-turn`, `rag`. Default: `single`. Stored as `SHAPE`.

**Parsing rules:**
1. Scan `$ARGUMENTS` for `--output`, `--mode`, `--trace-id`, `--shape` flags
2. Flags can appear anywhere in the arguments string
3. Each flag consumes the next whitespace-delimited token as its value
4. Everything that is NOT a flag or flag value becomes the input argument
5. Reject unknown `--mode` / `--shape` values with an explicit error and STOP
6. If `--mode promote-trace` is set and `--trace-id` is absent, STOP with: `"--mode promote-trace requires --trace-id <id>"` — do NOT make any MCP call (Phase 39 DSET-08)

**Input detection:**
- If the remaining argument ends in `.md` or contains `/`, treat it as a file path (`SPEC_PATH`)
- Otherwise, treat it as an agent description (`AGENT_DESCRIPTION`)

**Store the parsed values:**
- `SPEC_PATH`: The file path if detected, or empty
- `AGENT_DESCRIPTION`: The description text if detected, or empty
- `OUTPUT_DIR`: The path from `--output` flag, or `./Agents/` if not provided
- `MODE`: `two-step` | `flat` | `curation` | `promote-trace`. Default `flat`.
- `TRACE_ID`: Trace ID string, required only when `MODE == promote-trace`.
- `SHAPE`: `single` | `multi-turn` | `rag`. Default `single`.

**Examples:**
- `./Agents/support/agents/support-triage-agent.md` --> SPEC_PATH=./Agents/support/agents/support-triage-agent.md, MODE=flat, SHAPE=single
- `--output ./my-agents "A customer FAQ bot that answers common questions"` --> OUTPUT_DIR=./my-agents, AGENT_DESCRIPTION="A customer FAQ bot that answers common questions"
- `"A customer FAQ bot"` --> OUTPUT_DIR=./Agents/, AGENT_DESCRIPTION="A customer FAQ bot"
- `--shape single ./Agents/support/agents/triage.md` --> SHAPE=single (default), SPEC_PATH=./Agents/support/agents/triage.md
- `--mode two-step --shape multi-turn ./Agents/support/agents/triage.md` --> MODE=two-step, SHAPE=multi-turn, SPEC_PATH=./Agents/support/agents/triage.md
- `--shape rag ./Agents/support/agents/triage.md` --> SHAPE=rag, SPEC_PATH=./Agents/support/agents/triage.md
- `--mode promote-trace --trace-id tr_01JRXYZ` --> MODE=promote-trace, TRACE_ID=tr_01JRXYZ
- `--mode curation ./Agents/support/datasets/support-triage-agent-dataset.md` --> MODE=curation, SPEC_PATH=./Agents/support/datasets/support-triage-agent-dataset.md (positional = existing dataset)
- `--mode promote-trace` (no `--trace-id`) --> STOP: "--mode promote-trace requires --trace-id <id>"

Proceed to Step 1.

---

## Step 1: Capture Input

If `SPEC_PATH` is set, read the agent spec file. Extract the agent key, role, and responsibility from the spec metadata.

If `AGENT_DESCRIPTION` is set, use it as the agent description.

If `$ARGUMENTS` is empty, prompt the user:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ORQ > DATASET GENERATOR
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Provide a path to an agent spec file, or describe the agent to generate datasets for.
```

Wait for the user's response. Once received, detect if it is a file path or description (same rules as Step 0), store the input, and proceed to Step 1b.

---

## Step 1b: Mode Dispatch

Branch on `MODE` BEFORE running the Step 2 clarification block. Each mode has distinct downstream semantics.

**`MODE == "promote-trace"` (Phase 39 DSET-08):**
- Skip Steps 2, 3, and 4 entirely — no clarifications, no blueprint construction, no new versioned directory.
- Precondition: `TRACE_ID` MUST be non-empty (Step 0 already enforced this; re-verify defensively).
- Call MCP `get_span` on `TRACE_ID` to fetch the root span. Call `list_spans` (or equivalent) to collect children and the full tool-call sequence.
- Construct a single regression datapoint that preserves ALL of: `input` (root span input), `output` (root span output), `intermediate_steps` (ordered tool-call sequence with tool name + args + result), and `metadata` (session_id, user_id, customer_id, identity — whatever the trace exposes). Tag with `category: regression`, `source: production-trace`, `source_trace_id: {TRACE_ID}`.
- Derive the agent name from the trace's agent-key attribute (or the spec, if provided positionally). Ensure `{OUTPUT_DIR}/[agent-name]/datasets/` exists.
- Write the single-datapoint dataset to `{OUTPUT_DIR}/[agent-name]/datasets/trace-promoted-{TRACE_ID}.md`.
- Jump directly to Step 6 (Summary).

**`MODE == "curation"` (Phase 39 DSET-04):**
- Require an existing dataset path as the positional argument (use `SPEC_PATH`). If missing, STOP with: `"--mode curation requires an existing dataset path as the positional argument"`.
- Skip Step 2 clarifications (curation is driven by the existing dataset's content, not by fresh Q&A).
- Proceed to Step 5 with `MODE=curation` — the subagent performs dedupe (group by input-hash), rebalance (flag any value >30%), gap-fill (flag values with <2 datapoints), and contradiction surfacing (conflicting expected outputs on equivalent inputs).
- EVERY proposed deletion MUST be confirmed via `AskUserQuestion` before the subagent removes it (Destructive Actions constraint).

**`MODE == "two-step"` (Phase 39 DSET-01):**
- Proceed through Steps 2-4 normally.
- In Step 5, instruct the subagent to emit TWO intermediate artifacts BEFORE the final dataset:
  - `{OUTPUT_DIR}/[agent-name]/datasets/dimensions.md` — 3-6 dimensions with 2-5 values each
  - `{OUTPUT_DIR}/[agent-name]/datasets/tuples.md` — enumerated (dim-value) tuples that seed the natural-language inputs
- These artifacts are part of the subagent's output contract for two-step mode and must be written alongside the dataset files.

**`MODE == "flat"` (default, existing V2.0 behavior):**
- Proceed through Steps 2-6 as written. No behavioral change from pre-Phase 39.

In all modes, `SHAPE` is passed to the subagent in Step 5 so the datapoint emission can honor single / multi-turn / rag shape contracts (Phase 39 DSET-05/06/07).

---

## Step 2: Quick Clarifications

Present 3 focused questions in a single prompt block. Do NOT spawn any subagents for this step -- handle it inline.

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ORQ > DATASET SETUP
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Dataset size?
   a) Small (15 cases)
   b) Standard (25 cases)
   c) Large (40+ cases)

2. Adversarial focus?
   a) OWASP LLM Top 10 coverage
   b) Domain-specific edge cases
   c) Prompt injection focus
   d) All categories

3. Any specific scenarios to include?
   (e.g., "test multilingual inputs", "test rate limit handling", or "none")

──────────────────────────────────────────────────────
> Answer each (e.g., "1b, 2d, 3: multilingual")
> Type "skip" to let Claude decide everything
──────────────────────────────────────────────────────
```

Wait for user response. Parse their answers for use in Step 3.

---

## Step 3: Construct Context

**If `SPEC_PATH` was provided:**
Read the agent spec file. Extract the agent key, role, model, and responsibility from the spec. Construct a minimal blueprint from the spec's metadata:

```markdown
# Blueprint: [Agent Name]

## Swarm Overview
- **Pattern:** single-agent
- **Agent count:** 1

## Agent: [agent-key]
- **Key:** [from spec metadata]
- **Role:** [from spec metadata]
- **Responsibility:** [from spec metadata]
- **Model:** [from spec metadata]
```

The spec file itself serves as the agent spec input for the dataset generator.

**If `AGENT_DESCRIPTION` was provided (no spec file):**
Build both a minimal blueprint AND a minimal spec context inline. Read `orq-agent/references/naming-conventions.md` for key derivation.

```markdown
# Blueprint: [Agent Name]

## Swarm Overview
- **Pattern:** single-agent
- **Agent count:** 1

## Agent: [agent-key]
- **Key:** [derived from description using naming-conventions.md: domain-role-agent]
- **Role:** [derived from description]
- **Responsibility:** [1-2 sentences from description]
- **Model:** anthropic/claude-sonnet-4-5
```

Also construct a minimal spec context:

```markdown
# Agent Spec Context: [agent-key]

- **Key:** [agent-key]
- **Role:** [role from description]
- **Instructions:** [2-3 sentences describing what the agent does, derived from description]
- **Constraints:** [any constraints from Q3, or "none specified"]
- **Tools:** [inferred from description, or "none specified"]
```

Store the blueprint and spec context for use in Step 5.

---

## Step 4: Set Up Output Directory

Derive the agent name from the agent key's domain portion (e.g., `customer-faq-agent` --> directory name `customer-faq`).

Use `OUTPUT_DIR` from Step 0 as the base directory (defaults to `./Agents/`).

**Auto-versioning logic:**
- Use Bash to check if `{OUTPUT_DIR}/[agent-name]/datasets/` already exists
- If it does NOT exist: create `{OUTPUT_DIR}/[agent-name]/datasets/`
- If it DOES exist: scan `{OUTPUT_DIR}/` for directories matching `[agent-name]-v*`, find the highest version number N, and create `{OUTPUT_DIR}/[agent-name]-v[N+1]/datasets/`. If no versioned directories exist, create `{OUTPUT_DIR}/[agent-name]-v2/datasets/`

Create the directories:

```bash
mkdir -p {OUTPUT_DIR}/[agent-name]/datasets/
```

If a blueprint was constructed inline, write it to `{OUTPUT_DIR}/[agent-name]/blueprint.md`.

---

## Step 5: Spawn Dataset Generator

Display the generation banner:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ORQ > GENERATING DATASETS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Spawn the dataset generator subagent using the Task tool:

- **Agent file:** `@orq-agent/agents/dataset-generator.md`
- **Input:** Pass the following:
  1. Blueprint: `{OUTPUT_DIR}/[agent-name]/blueprint.md` (or inline blueprint)
  2. Research brief: "Research unavailable -- generate datasets from spec only"
  3. Agent spec: `SPEC_PATH` (file path) or inline spec context from Step 3
  4. Dataset size preference from Step 2 Q1
  5. Adversarial focus preference from Step 2 Q2
  6. Specific scenarios from Step 2 Q3
  7. Mode: `{MODE}` (one of: two-step | flat | curation | promote-trace) — selects the generation branch per Step 1b
  8. Shape: `{SHAPE}` (one of: single | multi-turn | rag) — governs datapoint shape per Phase 39 DSET-05/06/07
- The dataset generator reads its own references via `<files_to_read>` -- no need to load them here

Output:
- `{OUTPUT_DIR}/[agent-name]/datasets/[agent-key]-dataset.md`
- `{OUTPUT_DIR}/[agent-name]/datasets/[agent-key]-edge-dataset.md`

---

## Step 6: Summary

Display completion:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ORQ > COMPLETE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Datasets:
- Clean:     {OUTPUT_DIR}/[agent-name]/datasets/[agent-key]-dataset.md
- Edge case: {OUTPUT_DIR}/[agent-name]/datasets/[agent-key]-edge-dataset.md

Note: At least 30% of total test cases are adversarial/edge cases.

Next steps:
1. Review both datasets -- check coverage and expected behaviors
2. Use datasets for evaluation in Orq.ai Studio
3. Run /orq-agent for the full pipeline with built-in dataset generation
```

**Mode-conditional summary lines** (append to the completion block based on `MODE`):

- When `MODE == "promote-trace"`, also print:
  ```
  Source trace: {TRACE_ID}
  Datapoint preserved: input, output, intermediate_steps, metadata
  Output: {OUTPUT_DIR}/[agent-name]/datasets/trace-promoted-{TRACE_ID}.md
  ```
- When `MODE == "two-step"`, also print the intermediate artifact paths:
  ```
  Intermediate artifacts:
  - Dimensions: {OUTPUT_DIR}/[agent-name]/datasets/dimensions.md
  - Tuples:     {OUTPUT_DIR}/[agent-name]/datasets/tuples.md
  ```
- When `MODE == "curation"`, also print:
  ```
  Deletions confirmed: N
  ```
  where `N` is the count of `AskUserQuestion` confirmations honored during curation.

</pipeline>

## Anti-Patterns

| Pattern | Do Instead |
|---------|-----------|
| Generating only clean cases ("adversarial slows me down") | 30% adversarial minimum is the floor — not a suggestion |
| Skipping category/dimension tagging to save time | Tags drive slice analysis in the results-analyzer; missing tags means blind aggregates |
| Reusing the same dataset across unrelated agents | Each agent's failure surface is different — generate per-agent |
| Padding the dataset with duplicates to hit the size target | Coverage matters more than size; fewer high-quality cases beat many near-duplicates |

## Open in orq.ai

- **Datasets:** https://my.orq.ai/datasets
- **Annotation Queues:** https://my.orq.ai/annotation-queues <!-- TODO(SKST-10): verified in Phase 37+ -->

## Documentation & Resolution

When skill content conflicts with live API behavior or official docs, trust the source higher in this list:

1. **orq MCP tools** — query live data first (`search_entities`, `get_agent`, `models-list`); API responses are authoritative.
2. **orq.ai documentation MCP** — use `search_orq_ai_documentation` or `get_page_orq_ai_documentation`.
3. **Official docs** — browse https://docs.orq.ai directly.
4. **This skill file** — may lag behind API or docs changes.
