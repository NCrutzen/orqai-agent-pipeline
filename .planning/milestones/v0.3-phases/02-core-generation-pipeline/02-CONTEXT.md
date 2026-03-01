# Phase 2: Core Generation Pipeline - Context

**Gathered:** 2026-02-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Build all generation subagents — domain researcher, spec generator, orchestration generator, tool schema generator, and dataset generator — so the pipeline can produce complete, quality-gated Orq.ai agent specs, orchestration docs, tool schemas, and datasets from an architect blueprint. Phase 2 subagents accept input and generate output; they do not manage pipeline flow or user review (that's Phase 3's orchestrator).

</domain>

<decisions>
## Implementation Decisions

### Spec generation depth
- Generate full production-ready system prompts per agent — complete role definition, output format, constraints, edge case handling, examples — ready to paste directly into Orq.ai Studio
- Model selection: top pick with brief justification + 2-3 alternatives with trade-off notes (cost, speed, capability) — alternatives serve double duty as experimentation options and fallback model configuration
- Tool schemas inline in agent .md files (not separate files) — everything in one place for copy-paste. Note: when Orq.ai MCP becomes available, tool configuration will be set through MCP
- Per-swarm README uses technical-but-clear tone — assumes user knows Orq.ai Studio basics, numbered setup steps without hand-holding

### Research triggers & scope
- Domain researcher always runs — even when input is detailed, research adds value for model selection, prompt patterns, guardrails
- Claude's Discretion: whether to spawn one researcher per agent role (parallel, deeper) or one researcher for the whole swarm (simpler, cross-agent patterns) — decide based on swarm size
- Web search enabled for researchers — can look up current domain best practices, API docs, industry patterns
- Research output: structured markdown brief per agent with sections for recommended model + rationale, prompt strategy, tool recommendations, guardrail suggestions, context needs

### Dataset design
- 15-25 test cases per agent covering happy path, variations, and edge cases
- Eval pairs include both: full reference response (shows intent) + pass/fail criteria list (enables automated eval)
- Multi-model comparison matrix covers all major providers: Anthropic, OpenAI, Google, Meta (Llama), Mistral, Cohere
- Two separate datasets per agent:
  - **Clean dataset**: standard input/output pairs for normal evaluation
  - **Edge case dataset**: adversarial/messy cases for experimentation — includes ambiguous inputs, malformed data, prompt injection attempts, and edge case volumes (empty, extremely long, rapid-fire)

### Subagent boundaries
- Spec generator and orchestration generator are separate subagents — clear separation of concerns
- Spec generator produces one agent spec at a time (not all at once) — focused output, can reference previously generated specs
- Each subagent receives full architect blueprint + research brief as input — full context for cross-referencing
- Validation gate after spec generation checks completeness (all Orq.ai fields present, valid model names, schema validity) before dataset generation runs
- Dataset generator produces per-agent datasets (not swarm-level)
- Orchestration generator includes Mermaid flowchart diagram showing agent relationships and data flow
- README generation is a separate final step after all subagents complete — reads all outputs to produce the setup guide

### Claude's Discretion
- Tool schema generator: whether it's a standalone subagent or part of the spec generator — decide based on tool complexity patterns
- Exact validation gate implementation (separate subagent vs validation pass within pipeline)
- Research parallelization strategy (one per agent vs one for all) based on swarm size

</decisions>

<specifics>
## Specific Ideas

- User wants model alternatives not just for fallback but explicitly for experimentation — the spec should make it easy to try different models
- Edge case datasets are specifically for experiments, separate from the clean eval dataset
- User review of architect design happens in Phase 3 orchestrator (pause before generation) — Phase 2 subagents are input-agnostic and just generate from whatever they receive
- MCP-awareness: tool schemas are inline now but designed with future MCP integration in mind

</specifics>

<deferred>
## Deferred Ideas

- User review/approval pause point in pipeline flow — Phase 3 (orchestrator)
- Swarm-level end-to-end test scenarios — could be added later if per-agent testing proves insufficient

</deferred>

---

*Phase: 02-core-generation-pipeline*
*Context gathered: 2026-02-24*
