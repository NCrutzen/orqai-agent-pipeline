# Phase 38: Trace Failure Analysis Skill - Context

**Gathered:** 2026-04-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Ship a single new skill `orq-agent/commands/trace-failure-analysis.md` (invoked as `/orq-agent:trace-failure-analysis`) that walks a user through turning a pile of production traces into a 4–8 mode failure taxonomy using grounded-theory methodology. Tier: deploy+ (reads traces via MCP; needs authenticated workspace).

Requirements addressed:
- TFAIL-01: Mixed sampling strategy (50% random + 30% failure-driven + 20% outlier, target ~100)
- TFAIL-02: Open-coding then axial-coding (4–8 non-overlapping modes)
- TFAIL-03: First-upstream-failure rule; never label cascading effects
- TFAIL-04: Transition failure matrix for multi-step pipelines (rows = last success, columns = first failure)
- TFAIL-05: Classify each mode as specification / generalization-code-checkable / generalization-subjective / trivial-bug
- TFAIL-06: Error-analysis report with taxonomy + rates + example trace IDs + recommended next-skill handoff

</domain>

<decisions>
## Implementation Decisions

### File structure
- Primary: `orq-agent/commands/trace-failure-analysis.md`.
- Per-skill resources: `orq-agent/commands/trace-failure-analysis/resources/`:
  - `grounded-theory-methodology.md` — open vs axial coding, first-upstream-failure rule, saturation criteria
  - `failure-mode-classification.md` — the 4 classification categories with decision rules
  - `handoff-matrix.md` — mapping from classification → next skill (`specification` → `/orq-agent:prompt` or `optimize-prompt`; `generalization-code-checkable` → `build-evaluator`; `generalization-subjective` → `build-evaluator` + human review; `trivial-bug` → developer fix, no skill)

### Data flow (LLM-driven, no runtime code)
- Step 1: **Sampling** — query MCP `list_traces` with total count; compute target 100; split 50/30/20. Fetch and inline trace IDs + metadata.
- Step 2: **Open coding** — present trace IDs in batches to the user via AskUserQuestion-backed annotation loop. For brief triage, allow skill-LLM to draft annotations then have user confirm/edit.
- Step 3: **Axial coding** — cluster annotations into 4–8 non-overlapping candidate modes. Show clustering table, user approves / merges / splits.
- Step 4: **First-upstream labeling** — for multi-step traces (span hierarchy), tag ONLY the first upstream failure; cascading downstream effects get `cascade-of: <parent_mode>`.
- Step 5: **Transition matrix** — build rows = last success span, columns = first failure mode. Skip for single-step pipelines.
- Step 6: **Mode classification** — each of 4–8 modes gets one of 4 class tags. Decision table embedded in skill.
- Step 7: **Report generation** — write `error-analysis-<YYYYMMDD-HHMM>.md` to user's `./Agents/` or `cwd`; include taxonomy, rates (%), 3 example trace IDs per mode, recommended handoff.

### Companion Skill handoffs
- Upstream: `/orq-agent:traces` (user discovers their trace volume first) + `/orq-agent:observability` (traces must have useful metadata for coding).
- Downstream: `/orq-agent:harden` (for `build-evaluator`-style work, Phase 42 will wire formally), `/orq-agent:prompt` (for prompt-refinement handoff), `/orq-agent:iterate` (for autonomous iteration if eval exists).

### MCP tool dependencies
- `mcp__orqai-mcp__list_traces` (filter by status, time-window; supports large result sets)
- `mcp__orqai-mcp__get_span` (drill into individual trace for span hierarchy)
- `mcp__orqai-mcp__list_spans` (build transition matrix from span sequences)
- REST fallback: `GET /v2/traces` + `GET /v2/traces/{id}/spans` via `curl` with `$ORQ_API_KEY`.

### Tier gating
- deploy+ (documented in skill banner). Core-tier users get a message: "Trace failure analysis requires traces — run `/orq-agent:observability` first and ensure your workspace has ≥50 traces."

### Claude's Discretion
- Exact size of axial-coding batch (proposed: 10 traces per AskUserQuestion round for manageable review).
- Whether to emit the error-analysis report as `.md` or `.json`. Lean `.md` for human legibility; users can post-process.
- Saturation heuristic: proposed "stop axial coding when two consecutive batches produce no new modes." User can override.
- Output filename pattern: `error-analysis-YYYYMMDD-HHMM.md` in cwd or `./Agents/<swarm-name>/` if invoked from a swarm directory.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- Phase 36 `traces.md` — grounds the trace query surface this skill will delegate to.
- Phase 37 `observability.md` — provides the instrumentation foundation; this skill explicitly lists it as a prerequisite.
- `orq-agent/agents/failure-diagnoser.md` (V2.1) — diagnoses individual test failures; DIFFERENT scope (synthetic test cases) from TFAIL (production traces). This skill complements but does not replace it.
- Phase 37 resources/ pattern — reuse for this phase's grounded-theory docs.

### Established Patterns
- Banner: `ORQ ► TRACE FAILURE ANALYSIS`.
- MCP-first with REST fallback + "MCP tools used:" footer.
- 9 SKST sections mandatory (Phase 34 lint).
- Dated-snapshot model refs if any shown (Phase 35 rule — this skill does not emit specs, unlikely to show model IDs).

### Integration Points
- `SKILL.md` index: add `trace-failure-analysis.md` + resources subdir.
- `help.md` pipeline-order: slot between `/orq-agent:observability` and `/orq-agent:harden` (diagnose-before-fix ordering).
- Companion back-reference from `traces.md` → `trace-failure-analysis` (add in Plan 04).

</code_context>

<specifics>
## Specific Ideas

### 4 classification categories (TFAIL-05)
Seed text (Claude refines wording):
- **specification**: Agent was asked to do something it shouldn't / format/tone wrong / instruction ambiguous → fix the prompt.
- **generalization-code-checkable**: Output is wrong in a way verifiable by code (schema invalid, wrong API called, typed field mismatch) → build an evaluator, optionally a guardrail.
- **generalization-subjective**: Output is wrong in a way requiring human judgement (tone off, incomplete reasoning, misinterpreted intent) → build LLM-judge evaluator; collect human labels.
- **trivial-bug**: Plumbing failure, not model-related (auth error, env var missing, network timeout) → developer fix, no skill.

### Handoff matrix seed
| Classification | Next skill | Rationale |
|----------------|-----------|-----------|
| specification | `/orq-agent:prompt` or optimization phase | Prompt engineering fix |
| generalization-code-checkable | `/orq-agent:harden` (evaluator + guardrail) | Automatable check |
| generalization-subjective | `/orq-agent:harden` + human annotation queue | Human-in-the-loop |
| trivial-bug | No skill; log bug ticket | Out of AI-platform scope |

### Sampling query shape (TFAIL-01)
```bash
# 50 random — last 7d, any status
mcp__orqai-mcp__list_traces --last 7d --limit 50 --sort random
# 30 failure-driven — status=error
mcp__orqai-mcp__list_traces --last 7d --limit 30 --status error
# 20 outliers — latency or cost top 10%
mcp__orqai-mcp__list_traces --last 7d --limit 20 --sort latency-desc
```
Skill documents the sampling plan and inlines actual trace IDs fetched.

</specifics>

<deferred>
## Deferred Ideas

- Auto-annotation via a secondary LLM — Phase 42 may wire this. For now, human-in-the-loop annotation is the core loop.
- Storing the taxonomy as Orq.ai dataset for regression — user can feed into `/orq-agent:datasets` manually; full integration deferred to Phase 39 (DSET-08 promote-trace-to-dataset).
- Live dashboard of failure-mode rates over time — `/orq-agent:analytics` covers volume; per-mode trends are a future phase.
- Trace-Automation rule to auto-kick-off failure analysis — Phase 36 `/orq-agent:automations` covers auto-experiments; auto-analysis is out of scope.

</deferred>
