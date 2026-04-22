# Phase 41: Prompt Optimization & Cross-Framework Comparison - Context

**Gathered:** 2026-04-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Ship 2 new skills:
1. `orq-agent/commands/prompt-optimization.md` (POPT-01..04) — analyze a prompt against 11 guidelines, propose up to 5 suggestions, rewrite on approval, create new version on orq.ai.
2. `orq-agent/commands/compare-frameworks.md` (XFRM-01..03) — generate `evaluatorq` comparison script across orq.ai/LangGraph/CrewAI/OpenAI Agents SDK/Vercel AI SDK.

Tier: deploy+. Preserve Phase 34 SKST + Phase 35 snapshot-pin + Phase 36 protected-pipeline.

</domain>

<decisions>
## Implementation Decisions

### Prompt Optimization (POPT)
- 11 guideline categories (exact lint-anchor names):
  1. role
  2. task
  3. stress
  4. guidelines
  5. output-format
  6. tool-calling
  7. reasoning
  8. examples
  9. unnecessary-content
  10. variable-usage
  11. recap
- Max 5 suggestions per run.
- `{{variable}}` placeholders preserved literally; skill scans for them before any rewrite.
- Diff presentation via side-by-side markdown; approval via AskUserQuestion.
- On approval: MCP `create_prompt_version` (or REST `POST /v2/prompts/{key}/versions`) — preserves original.
- Recommends `/orq-agent:test` for experimental A/B validation after new version.

### Cross-Framework Comparison (XFRM)
- Supported frameworks: orq.ai, LangGraph, CrewAI, OpenAI Agents SDK, Vercel AI SDK.
- Emits `evaluatorq` script in Python OR TypeScript (user chooses via `--lang python|ts`).
- Each framework = one `evaluatorq` job block.
- Fairness checks (fail-fast before full run):
  - Same dataset ID across jobs
  - Same evaluator set
  - Same model UNLESS `--isolate-model` flag
  - Each agent smoke-invokable (skill runs one test call per framework agent before full experiment)
- Results viewable in orq.ai Experiment UI (same experiment_id shared across jobs).

### File structure
- Resources under `orq-agent/commands/prompt-optimization/resources/`:
  - `11-guidelines.md` — detailed rubric per category
  - `rewrite-examples.md` — before/after examples
- Resources under `orq-agent/commands/compare-frameworks/resources/`:
  - `evaluatorq-script-templates.md` — Python + TS scaffolds
  - `framework-adapters.md` — how to wrap each framework for evaluatorq

### Tier
- deploy+ for both (use MCP + REST against live workspace).

### Claude's Discretion
- Whether to combine into one skill with `--mode optimize|compare` — lean separate commands for discoverability.
- Exact 11-guideline rubric wording (Claude authors from prompt engineering canon).
- Script template precision — must be runnable out of the box with placeholders replaced.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- Phase 35 `spec-generator.md` pattern — emits prompts with pinned snapshots (XFRM must respect this).
- Phase 36 `/orq-agent:analytics` — post-run comparison reporting.
- `@orq-ai/evaluatorq@^1.1.0` SDK pin (PROJECT.md constraints) — use this for XFRM scripts.
- Phase 37 observability provides traces needed to debug cross-framework diffs.

### Established Patterns
- Banner `ORQ ► PROMPT OPTIMIZATION` / `ORQ ► COMPARE FRAMEWORKS`.
- MCP-first with REST fallback.
- 9 SKST sections.
- AskUserQuestion for destructive / approval actions.

### Integration Points
- `SKILL.md` + `help.md` — 2 new commands + 2 resources subdirs.
- `/orq-agent:test` cross-reference for A/B validation.

</code_context>

<specifics>
## Specific Ideas

### 11-guideline suggestion format
```
### Suggestion N: [guideline-category]
**Problem:** …
**Proposed change:** …
**Guideline anchor:** role / task / stress / ... / recap
```

### evaluatorq TypeScript sketch
```ts
import { experiment } from '@orq-ai/evaluatorq';

await experiment({
  name: 'cross-framework-v1',
  dataset: 'shared-test-set-20260421',
  evaluators: ['tone-fail-pass', 'refund-accuracy'],
  jobs: [
    { key: 'orq-ai', fn: async (input) => invokeOrqAgent(input) },
    { key: 'langgraph', fn: async (input) => invokeLangGraph(input) },
    // ...
  ],
  // same model unless --isolate-model
  model: 'anthropic/claude-sonnet-4-5-20250929',
});
```

</specifics>

<deferred>
## Deferred Ideas

- Automated guideline compliance scoring — Phase 42 evaluator framework handles objective scoring; POPT stays advisory.
- Framework auto-detection — Phase 37 observability detects these; XFRM assumes user names them.
- Rollback automation — orq.ai platform supports version rollback via UI; skill just recommends.

</deferred>
