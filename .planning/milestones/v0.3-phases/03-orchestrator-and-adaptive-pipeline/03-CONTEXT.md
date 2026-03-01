# Phase 3: Orchestrator and Adaptive Pipeline - Context

**Gathered:** 2026-02-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Wire all subagents (architect, researchers, spec generator, orchestration generator, dataset generator, README generator) into a single orchestrator workflow invoked via `/orq-agent`. The orchestrator accepts any input from a 1-sentence brief to a multi-paragraph detailed spec, classifies it, adapts which pipeline stages run, and produces a complete agent swarm specification in the output directory. No new subagents are created — this phase connects what exists.

</domain>

<decisions>
## Implementation Decisions

### Input classification
- LLM-based analysis scores the input on completeness
- Per-stage skip/run decisions — classifier evaluates input against each subagent's responsibilities and outputs skip/run for each stage independently
- Classification result shown to user for confirmation before pipeline proceeds — user can override stage decisions
- Dimensions are dynamically matched to what each subagent needs as input — if the user already provided sufficient context for a subagent, that subagent's research stage is skipped

### Invocation & progress
- Both invocation modes: inline args (`/orq-agent "Build a support triage system"`) and prompt mode (just `/orq-agent` triggers a prompt for input)
- Auto-detect based on whether args are provided
- GSD-style banners per stage with spawning indicators during execution
- Pause after architect blueprint for user review before generation begins
- Output directory: `./Agents/[swarm-name]/` in current working directory

### Stage sequencing
- Wave 1: All researchers run in parallel (for agents that need research)
- Wave 2: All spec generators run in parallel (using research + blueprint)
- Wave 3: Orchestration doc, datasets, and README run after all agent specs complete
- If a subagent fails: mark that agent's output as incomplete, continue generating the rest, report failures at end with option to retry
- Skipped stages leave a metadata file (`pipeline-run.json` or similar) capturing what ran, what was skipped, and timing — useful for debugging

### Output handling
- Final summary: directory tree view + stats (agent count, stages run/skipped, one-liner per agent)
- Existing output directory: auto-version (swarm-name-v2, swarm-name-v3, etc.) — never overwrite
- After completion: suggest review priorities and Orq.ai Studio deploy steps

### Claude's Discretion
- Partial output handling on pipeline failure (keep with marker vs clean up)
- Exact metadata file format and content
- Prompt wording for the interactive prompt mode
- Specific banner content and timing

</decisions>

<specifics>
## Specific Ideas

- Classification confirmation UI should clearly show which stages will run vs skip, with brief reasoning per decision
- The architect blueprint pause is the main quality gate — after that, generation runs autonomously
- Metadata file serves double duty: debugging failed runs and documenting what the pipeline did for reproducibility

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 03-orchestrator-and-adaptive-pipeline*
*Context gathered: 2026-02-24*
