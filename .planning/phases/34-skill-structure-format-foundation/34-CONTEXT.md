# Phase 34: Skill Structure & Format Foundation - Context

**Gathered:** 2026-04-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Apply the Agent Skills format to every skill file in `orq-agent/` (top-level command + all subagents + SKILL.md) so downstream V3.0 skills build on a consistent structural substrate. Migrate skill-specific long-form docs from flat `orq-agent/references/` into per-skill `<skill>/resources/` directories without breaking consumer links. Add a lint/validation check. Keep `/orq-agent`, `/orq-agent:prompt`, `/orq-agent:architect` byte-identical in behavior (Key Decision: "Preserve generator loop through V3.0").

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion

Pure infrastructure phase — all implementation choices at Claude's discretion:
- Exact ordering of new sections within each skill file (target: readable top-to-bottom flow, frontmatter → intent → constraints → usage → handoffs → done-when → anti-patterns → destructive → docs/resolution → open-in-orq.ai).
- Phrasing of NEVER/ALWAYS rules, Why-these-constraints paragraphs, and per-skill Destructive Actions lists — drive from each skill's actual observed side effects (file writes, deploys, overwrites, deletions).
- Companion Skills directional handoffs — derive from existing pipeline relationships (e.g., architect → spec-generator → deployer → tester → iterator → hardener).
- Done When checklist phrasing — translate each skill's current success implicitly into falsifiable bullets.
- Anti-Patterns table content — extract the "don't"s already scattered through each skill's prose.
- "Open in orq.ai" deep-link URLs — use the documented Studio paths (Experiments/Traces/Agent Studio); stub with placeholders where the exact URL is unknown, with a TODO anchor.
- `resources/` migration pattern — move only files used solely by one skill; keep shared references under `orq-agent/references/` and document which is which.
- Lint/validation check shape — a shell script or Node script that scans each skill for the required sections and fails with a clear diff when any section is missing. Ran on-demand (no CI wiring in this phase — DIST phase owns CI).
- Protection of the three entry points — implement as a smoke-test fixture that captures pre-change canonical output for a representative input and re-runs post-change to assert byte-identical behavior, or a documented manual diff check. Either is acceptable if success criterion #5 is demonstrably enforced.

### Scope Guards

- **In scope:** `orq-agent/commands/*.md`, `orq-agent/agents/*.md`, `orq-agent/SKILL.md`.
- **Out of scope:** New skill files for V3.0 capabilities (LCMD, OBSV, TFAIL, etc.) — those phases add new skills that must already conform to this format. The lint check enforces conformance across both existing and new.
- **Out of scope:** Moving reference files that are consumed by multiple skills (e.g., `orqai-model-catalog.md`) — only migrate single-consumer resources.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets

- `orq-agent/SKILL.md` already indexes the directory layout — update with new `resources/` structure.
- `orq-agent/commands/orq-agent.md` already declares `allowed-tools` in frontmatter (template for the rest).
- `orq-agent/agents/*.md` use `tools:` key in frontmatter (per Agent SDK subagent convention) — reconcile with `allowed-tools` requirement; likely keep both or clarify that the subagent `tools:` is the canonical form for subagents.
- `orq-agent/references/` contains 8 long-form docs; candidates for per-skill migration based on consumer analysis.

### Established Patterns

- Frontmatter: `---` YAML block at top of every skill and subagent file.
- XML-tagged sections inside skill bodies (`<role>`, `<pipeline>`, `<files_to_read>`, etc.) — add new sections using the same style where it improves skim-ability, or use Markdown headers — follow the existing file's style per-file (don't rewrite style).
- Subagents use `model: inherit` and list tools inline.
- Consumer pattern: skills `<files_to_read>` block references relative paths like `orq-agent/references/foo.md`.

### Integration Points

- `.planning/phases/34-skill-structure-format-foundation/` holds the plan and summary for this phase.
- Lint script location: propose `orq-agent/scripts/lint-skills.sh` (new dir if needed).
- Smoke-test fixture for entry-point byte-identical check: propose `orq-agent/tests/entry-point-smoke.md` (fixture input + expected output outline).

</code_context>

<specifics>
## Specific Ideas

Success criteria from ROADMAP phase 34 cover all 10 SKST requirements. No user-specified references beyond the Agent Skills format itself and the gap-analysis reference (`orq-ai/assistant-plugins`).

</specifics>

<deferred>
## Deferred Ideas

- CI wiring for the lint check — Phase 43 (DIST) owns CI/CD scaffolds.
- Linting / format enforcement for new V3.0 skill files written in later phases — each later phase must call this phase's lint script before marking itself complete (add to plan-level Done-When for those phases).

</deferred>
