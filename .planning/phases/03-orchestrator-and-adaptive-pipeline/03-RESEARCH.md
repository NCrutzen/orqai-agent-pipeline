# Phase 3: Orchestrator and Adaptive Pipeline - Research

**Researched:** 2026-02-24
**Domain:** Claude Code skill orchestration, LLM-based input classification, adaptive pipeline routing, wave-based subagent coordination
**Confidence:** HIGH

## Summary

Phase 3 wires the six existing subagents (architect, researcher, spec generator, orchestration generator, dataset generator, README generator) into a single orchestrator workflow invoked via `/orq-agent`. The orchestrator accepts any input from a 1-sentence brief to a multi-paragraph detailed spec, classifies it using LLM-based analysis, adapts which pipeline stages run (per-stage skip/run), and produces a complete agent swarm specification in the output directory. No new subagents are created -- this phase connects what exists.

The core technical challenge is the **input classifier**: it must evaluate user input against each subagent's responsibilities and determine which stages to run vs skip. The user confirmed this should be an LLM-based analysis (not regex/heuristics), with per-stage decisions shown to the user for confirmation before the pipeline proceeds. The secondary challenge is **pipeline orchestration**: coordinating subagents in waves (researchers parallel, then spec generators parallel, then post-generation stages) with error handling, progress display, and metadata tracking.

The foundation is solid. Phase 1 produced the architect subagent with structured blueprint output. Phase 2 produced five generation subagents, each with well-defined input contracts (architect blueprint + research brief + previously generated specs). Every subagent uses the same Claude Code `.md` agent pattern with YAML frontmatter, `<files_to_read>` blocks, and structured output formats. The orchestrator's job is to invoke them in the right order, pass the right context, and handle the adaptive classification logic.

**Primary recommendation:** Build the orchestrator as a Claude Code slash command `.md` file at `orq-agent/commands/orq-agent.md` that acts as the pipeline controller. The input classifier should be embedded in the orchestrator prompt as a classification step (not a separate subagent) that evaluates input completeness per-stage and presents skip/run decisions to the user. Subagent invocation follows the established GSD pattern: pass file paths to subagents, let them read their own context with fresh context windows.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

- LLM-based analysis scores the input on completeness
- Per-stage skip/run decisions -- classifier evaluates input against each subagent's responsibilities and outputs skip/run for each stage independently
- Classification result shown to user for confirmation before pipeline proceeds -- user can override stage decisions
- Dimensions are dynamically matched to what each subagent needs as input -- if the user already provided sufficient context for a subagent, that subagent's research stage is skipped
- Both invocation modes: inline args (`/orq-agent "Build a support triage system"`) and prompt mode (just `/orq-agent` triggers a prompt for input)
- Auto-detect based on whether args are provided
- GSD-style banners per stage with spawning indicators during execution
- Pause after architect blueprint for user review before generation begins
- Output directory: `./Agents/[swarm-name]/` in current working directory
- Wave 1: All researchers run in parallel (for agents that need research)
- Wave 2: All spec generators run in parallel (using research + blueprint)
- Wave 3: Orchestration doc, datasets, and README run after all agent specs complete
- If a subagent fails: mark that agent's output as incomplete, continue generating the rest, report failures at end with option to retry
- Skipped stages leave a metadata file (`pipeline-run.json` or similar) capturing what ran, what was skipped, and timing -- useful for debugging
- Final summary: directory tree view + stats (agent count, stages run/skipped, one-liner per agent)
- Existing output directory: auto-version (swarm-name-v2, swarm-name-v3, etc.) -- never overwrite
- After completion: suggest review priorities and Orq.ai Studio deploy steps

### Claude's Discretion

- Partial output handling on pipeline failure (keep with marker vs clean up)
- Exact metadata file format and content
- Prompt wording for the interactive prompt mode
- Specific banner content and timing

### Deferred Ideas (OUT OF SCOPE)

None -- discussion stayed within phase scope

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| INPT-01 | User can provide a brief use case description (1-3 sentences) and receive a complete agent swarm spec | Orchestrator accepts inline args or prompts for input, passes to architect, runs full pipeline with all stages |
| INPT-02 | User can provide a detailed multi-paragraph brief and receive a complete agent swarm spec without unnecessary research stages running | Input classifier evaluates detail level per-stage, skips researcher when user provides sufficient domain context |
| INPT-03 | Pipeline adapts its depth based on input detail level -- skips research subagents when input provides sufficient context | Per-stage LLM classification with skip/run decisions, user confirmation, metadata tracking of what ran/skipped |

</phase_requirements>

## Standard Stack

### Core

| Component | Type | Purpose | Why Standard |
|-----------|------|---------|--------------|
| Claude Code slash command | `.md` command file | Orchestrator entry point (`/orq-agent`) | Native Claude Code invocation pattern -- `.md` files in commands/ directory are auto-discovered as slash commands |
| Claude Code agents | `.md` agent files | Subagent definitions (existing Phase 1+2 agents) | Already established pattern -- all six subagents use this format |
| Task/SubAgent spawning | Claude Code native | Parallel subagent execution within waves | Same pattern used by GSD `execute-phase` workflow for wave-based parallelism |

### Supporting

| Component | Type | Purpose | When to Use |
|-----------|------|---------|-------------|
| `$ARGUMENTS` variable | Command dynamic args | Capture inline input from `/orq-agent "..."` | Always -- provides inline invocation mode |
| JSON metadata file | `pipeline-run.json` | Pipeline run metadata (stages, timing, skip/run decisions) | Every run -- written to output directory for debugging and reproducibility |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Embedded classifier in orchestrator prompt | Separate classifier subagent | Separate subagent adds invocation overhead and context handoff; embedded is simpler for a classification step that produces structured output. Embedded is recommended. |
| Wave-based sequential orchestration | Fully sequential (one subagent at a time) | Sequential is simpler but slower. Wave-based parallelism is user-confirmed and matches the established GSD pattern. |

## Architecture Patterns

### Recommended Project Structure

```
orq-agent/
  commands/
    orq-agent.md              # Main orchestrator command (Phase 3)
  agents/
    architect.md              # Phase 1 (existing)
    researcher.md             # Phase 2 (existing)
    spec-generator.md         # Phase 2 (existing)
    orchestration-generator.md # Phase 2 (existing)
    dataset-generator.md      # Phase 2 (existing)
    readme-generator.md       # Phase 2 (existing)
  templates/                  # Phase 1 (existing)
  references/                 # Phase 1 (existing)
  SKILL.md                    # Updated with Phase 3 additions
```

Output per run:
```
./Agents/[swarm-name]/
  ORCHESTRATION.md            # From orchestration-generator (multi-agent only)
  agents/
    [agent-name].md           # From spec-generator (one per agent)
  datasets/
    [agent-name]-dataset.md   # From dataset-generator (one per agent)
    [agent-name]-edge-cases.md # From dataset-generator (one per agent)
  README.md                   # From readme-generator
  pipeline-run.json           # Metadata: stages, timing, decisions
```

### Pattern 1: Slash Command as Pipeline Controller

**What:** The orchestrator is a Claude Code slash command (`.md` file in `commands/` directory) that acts as the pipeline controller. It contains the full orchestration logic: input classification, stage routing, subagent spawning, progress display, and error handling.

**When to use:** When the orchestrator needs to be user-invocable via `/orq-agent` and must coordinate multiple subagents.

**Structure:**

```markdown
---
description: Generate complete Orq.ai agent swarm specifications from use case descriptions
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, WebSearch, WebFetch
argument-hint: [use-case-description]
---

# Orq.ai Agent Designer

[Orchestrator instructions here]

## Step 1: Capture Input
[Handle $ARGUMENTS or prompt for input]

## Step 2: Classify Input
[LLM-based per-stage classification]

## Step 3: Confirm Classification
[Show user the skip/run table, allow overrides]

## Step 4: Run Architect
[Spawn architect subagent]

## Step 5: Review Blueprint
[Pause for user review]

## Step 6: Execute Pipeline
[Wave-based subagent execution]

## Step 7: Produce Output
[Final summary, metadata, next steps]
```

**Confidence:** HIGH -- this follows the exact pattern used by GSD workflows and Claude Code plugin commands.

### Pattern 2: Input Classification as Embedded Step

**What:** The input classifier is a structured analysis step within the orchestrator prompt, not a separate subagent. The orchestrator evaluates the user's input against each stage's requirements and produces a skip/run decision table.

**When to use:** Always -- the classifier is lightweight enough to embed, and separating it would add unnecessary invocation overhead.

**Classification dimensions per stage:**

| Stage | Skip Condition | Run Condition |
|-------|---------------|---------------|
| Researcher | User input specifies: models, tools, guardrails, prompt strategy, domain context per agent | User input is brief or lacks domain-specific details for any agent |
| Spec Generator | Never skipped | Always runs (transforms blueprint + research into specs) |
| Orchestration Generator | Never skipped (for multi-agent) / Not applicable (for single-agent) | Always runs when multi-agent pattern is selected |
| Dataset Generator | Never skipped | Always runs |
| README Generator | Never skipped | Always runs |

**Key insight:** Only the researcher stage is skippable based on input detail. The other stages produce outputs that cannot be inferred from input alone. The classifier should focus on evaluating whether the user's input contains sufficient domain context to replace research findings.

**Classification output format:**

```markdown
## Pipeline Classification

| Stage | Decision | Reasoning |
|-------|----------|-----------|
| Architect | RUN | Always runs -- determines swarm topology |
| Researcher | SKIP | User provided model selections, tool needs, and guardrail requirements for all agents |
| Spec Generator | RUN | Always runs -- fills templates with research/input |
| Orchestration Generator | RUN | Multi-agent pattern detected |
| Dataset Generator | RUN | Always runs -- generates test data |
| README Generator | RUN | Always runs -- produces setup guide |

Confirm or override? [proceed / change: stage=decision]
```

**Confidence:** HIGH -- this aligns with the CONTEXT.md decision that classification evaluates per-stage independently, and the STATE.md note that "researcher always runs -- skip logic deferred to Phase 3 orchestrator."

### Pattern 3: Wave-Based Parallel Execution

**What:** Subagents execute in three waves, with parallelism within each wave. This matches the GSD `execute-phase` pattern.

**Wave structure:**

```
Wave 1: Architect (always sequential -- single invocation)
         ↓ User reviews blueprint ↓
Wave 2: Researchers (parallel per agent, if not skipped)
         ↓
Wave 3: Spec Generators (parallel per agent)
         ↓
Wave 4: Orchestration Generator + Dataset Generators + README Generator (parallel)
```

Note: The user's CONTEXT.md describes three waves for the generation stages (after architect). The architect runs first as a prerequisite, then:
- Wave 1 (user's numbering): Researchers in parallel
- Wave 2: Spec generators in parallel
- Wave 3: Orchestration doc, datasets, README in parallel

**Subagent invocation pattern (following GSD convention):**

```
Task(
  subagent_type="orq-researcher",
  prompt="
    <objective>
    Research domain best practices for [agent-key] in [swarm-name] swarm.
    </objective>

    <execution_context>
    @orq-agent/agents/researcher.md
    </execution_context>

    <input>
    Blueprint: [path to blueprint or inline]
    Agent to research: [agent-key]
    User input: [original use case description]
    </input>
  "
)
```

**Confidence:** HIGH -- directly follows the GSD execute-phase wave pattern.

### Pattern 4: Error Handling with Graceful Degradation

**What:** When a subagent fails, the pipeline marks that agent's output as incomplete and continues. Failures are collected and reported at the end with a retry option.

**Implementation:**

```markdown
## Error Handling

For each subagent invocation:
1. If subagent completes successfully: mark output as complete, continue
2. If subagent fails or times out:
   a. Write a marker file: `[agent-name].md.incomplete` with error details
   b. Log failure in pipeline-run.json
   c. Continue with remaining subagents in current wave
   d. Skip dependent stages for the failed agent only

At pipeline end:
- Report all failures with error details
- Offer retry: "Retry failed stages? [yes / no]"
- If retry: re-run only failed subagents with same inputs
```

**Confidence:** HIGH -- this is the user's confirmed decision from CONTEXT.md.

### Pattern 5: Output Directory Versioning

**What:** If the target output directory already exists, auto-version it instead of overwriting.

**Implementation:**

```
./Agents/customer-support/          # First run
./Agents/customer-support-v2/       # Second run (directory exists)
./Agents/customer-support-v3/       # Third run
```

**Detection logic:**
1. Compute target directory: `./Agents/[swarm-name]/`
2. If exists: scan for `[swarm-name]-v{N}/` directories, find highest N, create `[swarm-name]-v{N+1}/`
3. If not exists: create `./Agents/[swarm-name]/`

**Confidence:** HIGH -- straightforward directory logic, user-confirmed from CONTEXT.md.

### Anti-Patterns to Avoid

- **Do NOT create a separate classifier subagent.** The classification step is lightweight LLM analysis embedded in the orchestrator prompt. Spawning a separate subagent adds invocation overhead for a simple structured output task.
- **Do NOT skip non-researcher stages based on input detail.** Only the researcher is skippable. Spec generation, orchestration docs, datasets, and READMEs always require generation regardless of input detail.
- **Do NOT pass large context between subagents through the orchestrator.** Pass file paths; let subagents read files themselves with fresh context windows. This follows the GSD pattern of keeping the orchestrator lean.
- **Do NOT run all subagents sequentially.** The wave structure enables parallelism for independent subagents (e.g., all spec generators for different agents can run simultaneously).
- **Do NOT overwrite existing output directories.** Auto-version per the user's decision.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Slash command registration | Custom invocation mechanism | Claude Code native `commands/` directory auto-discovery | Commands in `commands/` are automatically available as `/command-name` |
| Subagent parallelism | Custom task scheduler | Claude Code native Task() spawning with multiple concurrent calls | Claude Code handles agent lifecycle, context isolation, and result collection natively |
| Input argument handling | Custom arg parser | `$ARGUMENTS` built-in variable in slash commands | Native variable that captures everything after the command name |
| Progress display | Custom UI framework | GSD-style text banners and spawning indicators | Proven pattern that works within Claude Code's text output constraints |

**Key insight:** The orchestrator is a prompt file, not runtime code. All coordination logic lives in the `.md` command's instructions to Claude. There is no custom code to write -- the orchestrator is a carefully structured prompt that tells Claude how to sequence subagent invocations.

## Common Pitfalls

### Pitfall 1: Context Window Bloat in Orchestrator

**What goes wrong:** The orchestrator loads all subagent outputs into its own context as the pipeline progresses, eventually hitting context limits for large swarms.
**Why it happens:** Temptation to have the orchestrator validate or inspect subagent outputs inline.
**How to avoid:** Keep the orchestrator lean. Pass file paths to downstream subagents; let them read files with fresh context windows. The orchestrator should only read enough to confirm success/failure (check file existence, scan for expected markers), not load full outputs.
**Warning signs:** Orchestrator prompt growing beyond 5000 words; orchestrator reading full agent spec files instead of just checking file paths.

### Pitfall 2: Classification Over-Engineering

**What goes wrong:** The classifier tries to evaluate dozens of dimensions, producing unreliable or contradictory skip/run decisions.
**Why it happens:** Trying to be too granular in what constitutes "sufficient detail" for each stage.
**How to avoid:** Keep classification simple. The only skippable stage is the researcher. The classification question is: "Did the user provide enough domain-specific context (model selections, tool needs, guardrails, prompt strategy) to replace what the researcher would produce?" If yes for ALL agents, skip research. If uncertain for any agent, run research.
**Warning signs:** More than one stage being classified as skippable; classification taking multiple paragraphs of reasoning per stage.

### Pitfall 3: Subagent Input Contract Mismatch

**What goes wrong:** Orchestrator passes data to subagents in a format they don't expect, causing generation failures.
**Why it happens:** Subagents have specific input contracts (architect blueprint format, research brief format) that the orchestrator must match.
**How to avoid:** The orchestrator passes file paths, not reformatted data. Each subagent reads its own inputs. The architect outputs in a specific format; the researcher reads that format; the spec generator reads both. The orchestrator does not transform data between stages.
**Warning signs:** Orchestrator rewriting subagent outputs before passing them downstream; subagents receiving inline text instead of file paths.

### Pitfall 4: Missing User Confirmation Points

**What goes wrong:** Pipeline runs to completion without giving the user a chance to review or course-correct, producing a full swarm spec that doesn't match their intent.
**Why it happens:** Skipping the two critical pause points (classification confirmation and blueprint review).
**How to avoid:** The pipeline has exactly two mandatory pause points: (1) after classification, before pipeline starts, and (2) after architect blueprint, before generation begins. Both require explicit user confirmation to proceed.
**Warning signs:** Pipeline producing output without any user interaction after initial input.

### Pitfall 5: Research Skipping When Input Seems Detailed But Lacks Key Dimensions

**What goes wrong:** Classifier skips research because input is long/detailed, but the detail is about the business problem, not about agent configuration specifics (models, tools, guardrails).
**Why it happens:** Conflating input length with input completeness for agent configuration.
**How to avoid:** Classification evaluates specific dimensions that map to researcher output sections: model recommendations, tool recommendations, guardrail suggestions, prompt strategy, context needs. A 500-word business description that doesn't mention models or tools is NOT sufficient to skip research. Only skip when the user explicitly provides agent configuration details.
**Warning signs:** Research skipped for inputs that are long but don't mention specific models, tools, or guardrails.

## Code Examples

### Example 1: Orchestrator Command Structure

```markdown
---
description: Generate complete Orq.ai agent swarm specifications from use case descriptions
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, WebSearch, WebFetch
argument-hint: [use-case-description]
---

# Orq.ai Agent Designer

You are the Orq.ai Agent Designer orchestrator. You transform use case descriptions
into complete, copy-paste-ready Orq.ai agent swarm specifications.

## Step 1: Capture Input

If $ARGUMENTS is provided, use it as the use case description.
If $ARGUMENTS is empty, prompt the user:

"Describe the use case you want to build agents for. This can be anything
from a brief sentence to a detailed multi-paragraph specification."

## Step 2: Classify Input Depth

Evaluate the user's input against each pipeline stage's requirements...
[classification logic with per-stage skip/run output table]

## Step 3: Confirm with User

Display the classification table and ask for confirmation or overrides...

## Step 4: Run Architect

Spawn the architect subagent with the use case description...
[architect invocation with @orq-agent/agents/architect.md]

## Step 5: Blueprint Review Pause

Display the architect's blueprint and pause for user review...

## Step 6: Execute Generation Pipeline

### Wave 1: Research (if not skipped)
[Parallel researcher spawning per agent]

### Wave 2: Spec Generation
[Parallel spec generator spawning per agent]

### Wave 3: Post-Generation
[Orchestration doc + datasets + README in parallel]

## Step 7: Final Summary

Display directory tree, stats, and next steps...
Write pipeline-run.json metadata...
```

### Example 2: Input Classification Logic

```markdown
## Classification Dimensions

For each dimension, evaluate whether the user's input provides sufficient detail:

1. **Agent topology** (for architect): Does input specify number of agents, roles, relationships?
   - Always RUN architect regardless -- topology is the architect's job

2. **Domain research** (for researcher): Does input specify ALL of these per agent?
   - Model selection with rationale
   - Tool requirements (specific Orq.ai tool types)
   - Guardrail requirements (domain-specific, not generic)
   - Prompt strategy (role definition, constraints, edge cases)
   - Context needs (knowledge bases, variables, memory)

   If ANY dimension is missing for ANY agent: RUN researcher
   If ALL dimensions are covered for ALL agents: SKIP researcher

3. **Spec generation** (for spec generator): Always RUN
4. **Orchestration** (for orchestration generator): RUN if multi-agent, SKIP if single-agent
5. **Datasets** (for dataset generator): Always RUN
6. **README** (for readme generator): Always RUN
```

### Example 3: Pipeline Metadata File

```json
{
  "pipeline_version": "1.0",
  "swarm_name": "customer-support-swarm",
  "output_directory": "./Agents/customer-support/",
  "started_at": "2026-02-24T14:30:00Z",
  "completed_at": "2026-02-24T14:35:00Z",
  "duration_seconds": 300,
  "input_classification": {
    "input_length_words": 45,
    "detail_level": "brief",
    "stages": {
      "architect": { "decision": "run", "reason": "Always runs" },
      "researcher": { "decision": "run", "reason": "Input lacks model and tool specifics" },
      "spec_generator": { "decision": "run", "reason": "Always runs" },
      "orchestration_generator": { "decision": "run", "reason": "Multi-agent pattern" },
      "dataset_generator": { "decision": "run", "reason": "Always runs" },
      "readme_generator": { "decision": "run", "reason": "Always runs" }
    },
    "user_overrides": []
  },
  "agents_generated": [
    { "key": "customer-support-triage-agent", "status": "complete" },
    { "key": "customer-support-resolver-agent", "status": "complete" }
  ],
  "stages_completed": [
    { "stage": "architect", "duration_seconds": 30, "status": "success" },
    { "stage": "researcher", "duration_seconds": 60, "agents": 2, "status": "success" },
    { "stage": "spec_generator", "duration_seconds": 90, "agents": 2, "status": "success" },
    { "stage": "orchestration_generator", "duration_seconds": 30, "status": "success" },
    { "stage": "dataset_generator", "duration_seconds": 60, "agents": 2, "status": "success" },
    { "stage": "readme_generator", "duration_seconds": 30, "status": "success" }
  ],
  "failures": []
}
```

### Example 4: GSD-Style Progress Display

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ORQ ► CLASSIFYING INPUT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

| Stage | Decision | Reasoning |
|-------|----------|-----------|
| Architect | RUN | Always runs |
| Researcher | RUN | Input lacks model/tool specifics |
| Spec Generator | RUN | Always runs |
| Orchestration Generator | RUN | Multi-agent pattern |
| Dataset Generator | RUN | Always runs |
| README Generator | RUN | Always runs |

╔══════════════════════════════════════════════════════════════╗
║  CHECKPOINT: Confirmation Required                           ║
╚══════════════════════════════════════════════════════════════╝

Review the pipeline stages above. All stages will run.

──────────────────────────────────────────────────────────────
→ Type "proceed" to start, or "change: researcher=skip" to override
──────────────────────────────────────────────────────────────

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ORQ ► ARCHITECT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

◆ Spawning architect...
✓ Architect complete: 2 agents, parallel-with-orchestrator pattern

╔══════════════════════════════════════════════════════════════╗
║  CHECKPOINT: Blueprint Review                                ║
╚══════════════════════════════════════════════════════════════╝

[Blueprint displayed here]

──────────────────────────────────────────────────────────────
→ Type "approved" to continue generation, or describe changes
──────────────────────────────────────────────────────────────

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ORQ ► RESEARCH (Wave 1)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

◆ Spawning 2 researchers in parallel...
  → customer-support-triage-agent
  → customer-support-resolver-agent
✓ Research complete: 2/2 agents researched

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ORQ ► SPEC GENERATION (Wave 2)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

◆ Spawning 2 spec generators in parallel...
  → customer-support-triage-agent
  → customer-support-resolver-agent
✓ Specs complete: 2/2 agents generated

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ORQ ► POST-GENERATION (Wave 3)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

◆ Spawning 4 generators in parallel...
  → ORCHESTRATION.md
  → customer-support-triage-agent dataset
  → customer-support-resolver-agent dataset
  → README.md
✓ All outputs complete

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ORQ ► COMPLETE ✓
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Separate CLI scripts for orchestration | Claude Code `.md` agent/command files | Claude Code 1.0+ (2025) | No runtime code needed -- orchestration is prompt-driven |
| Sequential subagent execution | Wave-based parallel Task() spawning | Claude Code parallel agent support | Significant speed improvement for multi-agent swarms |
| Hardcoded input classification | LLM-based adaptive classification | Current practice for adaptive AI pipelines | More robust than regex/heuristic classification |

**Deprecated/outdated:**
- None relevant -- the project uses current Claude Code patterns throughout.

## Open Questions

1. **Researcher parallelization granularity**
   - What we know: The researcher subagent currently processes the entire swarm in a single pass (one invocation, per-agent sections in output). The CONTEXT.md says "Wave 1: All researchers run in parallel (for agents that need research)."
   - What's unclear: Whether "researchers in parallel" means one researcher invocation per agent (each researching one agent) or one researcher invocation for the whole swarm (as currently designed).
   - Recommendation: For swarms with 1-3 agents, invoke one researcher for the entire swarm (current design). For swarms with 4+ agents, the researcher prompt already notes Phase 3 may parallelize by spawning multiple instances. The orchestrator should implement both strategies based on agent count from the architect blueprint.

2. **Spec generator cross-referencing**
   - What we know: The spec generator processes one agent at a time and "optionally, previously generated specs for other agents in the same swarm (for cross-referencing consistency)."
   - What's unclear: In Wave 2 (parallel spec generation), agents generated simultaneously cannot cross-reference each other.
   - Recommendation: Accept this limitation for parallel execution. The architect blueprint provides enough structural context (roles, relationships) that cross-referencing is a nice-to-have, not a requirement. For swarms where agent consistency is critical, the user can re-run failed agents after the initial pass.

3. **Blueprint review revision loop**
   - What we know: The pipeline pauses after architect blueprint for user review.
   - What's unclear: If the user requests changes, does the architect re-run entirely, or does the orchestrator apply edits manually?
   - Recommendation: If user says "approved", continue. If user describes changes, re-run the architect with the original input plus the user's feedback appended. This keeps the architect as the single source of truth for blueprints.

## Sources

### Primary (HIGH confidence)
- Claude Code plugin-dev skill development documentation -- skill structure, command structure, YAML frontmatter, `$ARGUMENTS` variable, progressive disclosure patterns
- Claude Code GSD `execute-phase` workflow -- wave-based parallel execution pattern, Task() spawning, subagent invocation, orchestrator leanness principle
- Claude Code GSD UI brand reference -- banner format, checkpoint boxes, spawning indicators, status symbols
- Existing Phase 1+2 subagent files -- input contracts, output formats, `<files_to_read>` patterns

### Secondary (MEDIUM confidence)
- GSD skill-creator skill -- subagent coordination patterns, building block composition, inline vs spawned execution strategies
- Claude Code command-development skill -- command frontmatter fields, `allowed-tools`, `argument-hint`, `model` specification

### Tertiary (LOW confidence)
- None -- all findings are based on primary or secondary sources within the project and Claude Code documentation.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all components are native Claude Code features already in use by the project
- Architecture: HIGH -- orchestration pattern directly follows established GSD workflow conventions
- Pitfalls: HIGH -- pitfalls derived from analysis of existing subagent contracts and common LLM pipeline failure modes

**Research date:** 2026-02-24
**Valid until:** 2026-03-24 (30 days -- stable domain, no fast-moving dependencies)
