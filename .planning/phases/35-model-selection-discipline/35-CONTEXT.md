# Phase 35: Model Selection Discipline - Context

**Gathered:** 2026-04-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Update `orq-agent/agents/researcher.md` and `orq-agent/agents/spec-generator.md` to apply a **capable-first, snapshot-pinned, cascade-aware** model selection policy. Touch `orq-agent/references/orqai-model-catalog.md` only to document the policy at the top (not to pick models — live selection is MCP `models-list`). Apply the same discipline to any template/reference that emits a model ID (e.g., `spec-generator` output templates) and the three protected entry points must remain byte-identical (Phase 34's golden check still applies).

</domain>

<decisions>
## Implementation Decisions

### Capable-first policy (MSEL-01)
- **Primary recommendation** comes from "capable tier" per task category (chat-heavy, tool-calling, code/RAG).
- **Budget-profile downgrades** appear only as an ALTERNATIVE labelled `"after quality baseline run"`.
- Researcher never silently downgrades to cheap models even when `budget_profile=cost-first`; it always shows the capable recommendation first.

### Snapshot pinning (MSEL-02)
- All emitted model IDs are dated snapshots (e.g., `anthropic/claude-sonnet-4-5-20250929`, not `claude-sonnet-4-5-latest`).
- Rule enforcement lives in spec-generator: regex reject `(-latest|:latest|-beta)$` in any emitted `model:` field.
- Exception: embedding/speech models that Orq.ai only exposes as aliases — spec-generator emits the alias with a comment `# alias-only — pinning unavailable 2026-04-20`.

### Cascade-aware pattern (MSEL-03)
- When the user asks for cost optimization during discussion, researcher proposes a **two-tier cascade**: cheap-first primary, capable-tier escalation on confidence threshold miss.
- The cascade proposal ALWAYS includes a "quality-equivalence experiment" step that runs the test suite on both tiers and compares Pass rates; the cascade is marked `approved: false` until that experiment completes.
- Researcher output clearly tags the recommendation as `cascade-candidate` so spec-generator knows to emit the quality-equivalence test instructions.

### Byte-identical protected entry points
- Changes stay OUTSIDE the `<pipeline>…</pipeline>` blocks of `orq-agent/commands/{orq-agent,prompt,architect}.md`.
- New policy surfaces through `orq-agent/agents/researcher.md` + `orq-agent/agents/spec-generator.md` which the pipelines call — pipeline calling convention unchanged.
- Run `bash orq-agent/scripts/check-protected-pipelines.sh` after edits.

### Claude's Discretion
- Exact wording of the `after quality baseline run` alternative tag.
- Shape of the quality-equivalence experiment section in researcher output (one section vs embedded in cascade block).
- Which task categories map to which capable-tier model (lookup table lives in `orq-agent/references/orqai-model-catalog.md` §Capable Tier — Claude authors the initial table; users can override via `--model` flag or discussion).
- Placement of the snapshot-pinning lint rule: extend `orq-agent/scripts/lint-skills.sh` with a new rule `snapshot-pinned-models`, OR add a new script `orq-agent/scripts/lint-model-pins.sh`. Pick whichever is simpler.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `orq-agent/agents/researcher.md` — already handles model recommendations; updated in Phase 34 with 9 SKST sections. Changes are additive inside the role/prompt body.
- `orq-agent/agents/spec-generator.md` — emits the final agent spec with `model: provider/model-name`. Rule enforcement attaches here.
- `orq-agent/references/orqai-model-catalog.md` — explicit "format reference only" with a WARNING that live data comes from MCP `models-list`. Adding a Capable Tier lookup table respects this constraint.
- `orq-agent/scripts/lint-skills.sh` — extensible; add snapshot-pinning rule here.

### Established Patterns
- Researcher receives a discussion transcript + domain + task category, returns XML-tagged recommendations.
- Spec-generator reads researcher output + architect blueprint, emits a per-agent YAML/Markdown spec.
- Model discipline lives in **text rules** inside subagent markdown — no runtime code change required for the policy itself.

### Integration Points
- Protected pipeline hash guard (Phase 34) — new sections MUST sit outside `<pipeline>`.
- Phase 34 SKST lint suite — any new skill sections must pass `lint-skills.sh`.
- Phase 42 (Evaluator Validation & Iterator Enrichments) — quality-equivalence experiment uses the evaluator infra built there; Phase 35 writes the instructions, Phase 42 wires the runtime.

</code_context>

<specifics>
## Specific Ideas

- Capable Tier lookup table seed (Claude authors, subject to Orq.ai workspace availability):
  - Chat-heavy / conversational: `anthropic/claude-sonnet-4-5-20250929` or `openai/gpt-4o-2024-11-20`
  - Tool-calling / agentic: `anthropic/claude-sonnet-4-5-20250929`
  - Code / RAG synthesis: `anthropic/claude-opus-4-20250514` or `openai/gpt-4o-2024-11-20`
  - Fast triage (NOT a default — only for explicit cost-cascade cheap tier): `anthropic/claude-haiku-4-5-20251001` or `google-ai/gemini-2-5-flash`
- All IDs above are illustrative — spec-generator's final output must be validated by `models-list` before deployment (Orq.ai's existing guardrail).

</specifics>

<deferred>
## Deferred Ideas

- Model-cascade runtime implementation (actual fallback on low confidence) — that's a downstream Orq.ai Agent feature, not in scope here. Phase 35 ships the **policy and spec template**; runtime wiring happens in the Orq.ai platform.
- Quality-equivalence experiment execution harness — relies on Phase 42 (Evaluator Validation) infra. Phase 35 emits instructions, Phase 42 executes.

</deferred>
