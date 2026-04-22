# Phase 34: Skill Structure & Format Foundation - Research

**Researched:** 2026-04-20
**Domain:** Claude Code Agent Skills format — structural migration of 34 existing skill files
**Confidence:** HIGH (frontmatter schema, consumer graph), MEDIUM (exact reference-repo conventions — cross-verified against 4 reference SKILL.md files)

## Summary

Phase 34 is a **pure structural migration**. Thirty-four skill files (1 top-level `SKILL.md` + 16 slash commands + 17 subagents) must each grow nine new sections (Constraints, When to use / NOT, Companion Skills, Done When, Destructive Actions, Anti-Patterns, Documentation & Resolution, Open in orq.ai) plus a lint check that enforces conformance going forward.

Two high-leverage discoveries shape the plan:

1. **`allowed-tools` vs `tools:` is a schema split, not a contradiction.** Claude Code slash commands and top-level skills use `allowed-tools:` in frontmatter; subagents use `tools:`. The SKST-01 requirement is satisfied by "explicit tool allowlist" — the literal key name differs by file type. All 16 commands already have `allowed-tools`; all 17 subagents already have `tools:`. No migration needed for this requirement — only a lint rule that enforces "one of the two keys must be present and non-empty" per file type.
2. **The `orq-agent/references/` migration (SKST-02) has zero candidates.** Every reference file in `orq-agent/references/` is consumed by 2+ skills (see Reference Consumer Graph below). Per CONTEXT.md scope guard, only single-consumer references get migrated to `<skill>/resources/`. The correct plan task is therefore: (a) document this finding, (b) establish the `resources/` pattern as forward-looking for future V3.0 skills (phases 36-43), (c) optionally create an empty `resources/` placeholder or skip it. Do NOT move any existing reference files.

**Primary recommendation:** Treat this phase as a templated bulk edit. Write one canonical "skill template" and apply it to all 34 files, then write a Bash+grep lint script (30 lines, ~10 checks) that validates every skill against the template and fails with a clear "file X is missing section Y" message.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

None — this is a pure infrastructure phase flagged entirely at Claude's discretion.

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

### Deferred Ideas (OUT OF SCOPE)

- CI wiring for the lint check — Phase 43 (DIST) owns CI/CD scaffolds.
- Linting / format enforcement for new V3.0 skill files written in later phases — each later phase must call this phase's lint script before marking itself complete (add to plan-level Done-When for those phases).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SKST-01 | Every skill file declares `allowed-tools` in YAML frontmatter | Claude Code schema split — slash commands use `allowed-tools:`, subagents use `tools:`. All 16 commands + 17 subagents already satisfy their schema. Lint rule: "one of {allowed-tools, tools} is present and non-empty". See Standard Stack / Frontmatter. |
| SKST-02 | Skill-specific long-form docs live under `<skill>/resources/` | Consumer graph analysis shows **zero** single-consumer refs in `orq-agent/references/`. Migration has no candidates today. The plan must document this finding and establish the `resources/` pattern for future skills (V3.0 phases 36-43). See Reference Consumer Graph. |
| SKST-03 | "When to use" and "When NOT to use" sections with explicit triggers/anti-triggers | Canonical pattern from `orq-ai/assistant-plugins`: H2 sections with bullet lists; "When NOT to use" uses `→ redirect to {other-skill}` arrows. See Section Template. |
| SKST-04 | Companion Skills with directional handoffs | Derive from existing pipeline: architect → tool-resolver → researcher → spec-generator → (orchestration / dataset / readme / kb) → deployer → tester → iterator → hardener. See Companion Skill Graph. |
| SKST-05 | "Done When" checklist with falsifiable criteria | Pattern: `[ ]` unchecked markdown checkboxes with concrete verifiable criteria. Derive from each skill's current implicit success conditions (e.g., architect: "Blueprint written to `{OUTPUT_DIR}/blueprint.md`"). See Section Template. |
| SKST-06 | Constraints block (NEVER/ALWAYS) + "Why these constraints" paragraph | Pattern: opening H2 immediately after H1 title, bullet list with bolded NEVER/ALWAYS verbs, followed by a short "Why these constraints:" explainer. See Section Template. |
| SKST-07 | Anti-Patterns table at bottom | Pattern: 2-column markdown table (`Pattern` / `Do Instead`). Extract from each skill's existing prose negatives. See Section Template. |
| SKST-08 | Destructive Actions list requiring AskUserQuestion confirmation | Per-skill inventory of writes/deploys/overwrites/deletions. Cross-reference existing Bash / Write / Edit / MCP-create / MCP-delete call sites per skill. See Destructive Action Inventory (per-skill). |
| SKST-09 | Documentation & Resolution footer with trust order | Canonical trust order from reference repo: `orq MCP tools > orq.ai docs MCP > docs.orq.ai > this skill file`. Verbatim template provided below. See Section Template. |
| SKST-10 | "Open in orq.ai" section with deep links | Canonical base URL: `https://my.orq.ai/`. Per-skill URL mapping (prompts / deployments / experiments / traces / datasets / knowledge-bases / evaluators). See Open in orq.ai URL Map. |
</phase_requirements>

## Standard Stack

### Core Format Specifications

| Spec | Version / URL | Purpose | Why Standard |
|------|---------------|---------|--------------|
| Claude Code Skills frontmatter | code.claude.com/docs/en/skills (live as of 2026-04-20) | Canonical field list for `SKILL.md` / slash command YAML | Official Anthropic docs — authoritative |
| Claude Code Subagent frontmatter | code.claude.com/docs/en/sub-agents | Canonical field list for `agents/*.md` YAML | Official docs — authoritative |
| Agent Skills open standard | agentskills.io | Cross-IDE format compatibility | Referenced explicitly by Claude Code docs |
| Reference implementation | github.com/orq-ai/assistant-plugins (main branch) | Section ordering, phrasing conventions, URL patterns | Named driver in CONTEXT.md; same domain (orq.ai) |

### Frontmatter — file-type split (critical)

| File type | Location | Required frontmatter keys | Optional keys used in this repo |
|-----------|----------|---------------------------|---------------------------------|
| Top-level skill | `orq-agent/SKILL.md` | `description` | `name` (optional, defaults to dir name) |
| Slash command | `orq-agent/commands/*.md` | `description` | `allowed-tools` (string, space OR comma separated), `argument-hint` |
| Subagent | `orq-agent/agents/*.md` | `name`, `description` | `tools` (comma-separated), `model` (defaults `inherit`), `disallowedTools` |

**Critical reconciliation for SKST-01 (literal text says "allowed-tools" but subagents don't support that key):** The Claude Code subagent schema does NOT accept `allowed-tools:` — it uses `tools:`. Writing `allowed-tools:` into a subagent file is a no-op at runtime. The honest interpretation of SKST-01 is:

> Every skill file declares an **explicit tool allowlist** in YAML frontmatter using the correct key for its file type (`allowed-tools` for commands + top-level SKILL.md, `tools` for subagents).

The lint script must check: `(is_command_file && has_frontmatter_key('allowed-tools') && !empty) || (is_subagent_file && has_frontmatter_key('tools') && !empty)`. This matches both the letter of Agent Skills format and Claude Code subagent schema.

**Current repo state (verified 2026-04-20):**
- 16/16 commands already declare `allowed-tools` ✓
- 17/17 subagents already declare `tools` ✓
- `orq-agent/SKILL.md` declares `description` only — must add `allowed-tools` (currently omitted)

SKST-01 work therefore reduces to: **add `allowed-tools` to `orq-agent/SKILL.md`, confirm the lint rule**, nothing else.

### Supporting Tools

| Tool | Version | Purpose | When to Use |
|------|---------|---------|-------------|
| Bash + `grep -E` | POSIX | Lint script implementation | Fastest, zero dependencies, readable as 30-40 line script |
| `awk` | POSIX | Frontmatter block extraction | Extract YAML between `^---$` markers |
| `diff` | POSIX | Byte-identical entry-point verification | Compare pre/post golden-output snapshots |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Bash+grep lint | Node.js + `js-yaml` | Node gives proper YAML parsing (handles multi-line values, quoting) but adds a runtime dependency. Bash+grep is sufficient because SKILL.md frontmatter in this repo is all single-line scalar fields — no multi-line YAML edge cases to worry about. |
| Bash+grep lint | Python + `PyYAML` | Same as Node — avoid new runtime dep. |
| Bash+grep lint | YAML frontmatter + JSON-schema validator | Overkill for a structural presence check; introduces schema authoring burden. |
| Byte-identical snapshot test | Manual diff review per phase gate | Snapshots are reproducible and catch drift automatically; manual review drifts over time. |

**Installation:** No new runtime dependencies. Lint script uses only POSIX tools already available on Darwin / Linux.

**Version verification:**
- Claude Code Skills docs checked live at code.claude.com/docs/en/skills on 2026-04-20 — confirmed `allowed-tools` accepts space-separated string OR YAML list.
- Claude Code Subagent docs checked live at code.claude.com/docs/en/sub-agents on 2026-04-20 — confirmed `tools` key (NOT `allowed-tools`), comma-separated.
- `orq-ai/assistant-plugins` repo sampled on 2026-04-20 via raw.githubusercontent.com — section ordering extracted from 5 SKILL.md files (generate-synthetic-dataset, build-agent, build-evaluator, analyze-trace-failures, optimize-prompt, run-experiment).

## Architecture Patterns

### Recommended Directory Structure (post-migration)

```
orq-agent/
  SKILL.md                       # Top-level skill index (receives full new format)
  systems.md                     # Unchanged
  commands/
    *.md                         # 16 files, each receives full new format
  agents/
    *.md                         # 17 files, each receives full new format
  references/
    *.md                         # 8 files, UNCHANGED (all multi-consumer)
  templates/
    *.md                         # Unchanged
  scripts/                       # NEW
    lint-skills.sh               # Lint script (≤50 lines, POSIX-only)
  tests/                         # NEW
    entry-point-smoke/           # Byte-identical fixtures for 3 protected entries
      orq-agent-input.txt        # Canonical input
      orq-agent-golden.txt       # Expected rendered skill output
      prompt-input.txt
      prompt-golden.txt
      architect-input.txt
      architect-golden.txt
      verify.sh                  # Re-runs goldens, diffs against current
```

**Rationale:**
- `scripts/` keeps lint + future tooling co-located.
- `tests/entry-point-smoke/` isolates the byte-identical protection logic (ROADMAP success criterion #5). Storing input + golden pairs makes the smoke test self-describing.
- No per-skill `resources/` directory is created pre-emptively. Rationale: YAGNI. When a later V3.0 phase (36-43) writes a skill whose long-form docs are single-consumer, that phase creates its own `resources/` at that time.

### Section Template (canonical body for every skill)

Every skill file gets the following sections in this order. H1 remains whatever it currently is (matches frontmatter `name` or file purpose).

```markdown
---
<existing frontmatter, with `allowed-tools` or `tools` verified>
---

# <H1: existing title — unchanged>

<existing file-type-specific opening: role / pipeline / files_to_read blocks — PRESERVED>

## Constraints

- **NEVER** <skill-specific NEVER rule 1>
- **NEVER** <skill-specific NEVER rule 2>
- **ALWAYS** <skill-specific ALWAYS rule 1>
- **ALWAYS** <skill-specific ALWAYS rule 2>

**Why these constraints:** <1-3 sentence explanation rooted in what breaks
when these rules are violated — deploy failures, over-engineered swarms,
false-positive test passes, etc.>

## When to use

- <trigger phrase 1 — user request pattern>
- <trigger phrase 2>
- <upstream skill handoff: "after {skill} produces {artifact}">

## When NOT to use

- <anti-trigger 1> → use `{other-skill}` instead
- <anti-trigger 2> → use `{other-skill}` instead

## Companion Skills

Directional handoffs (→ means "this skill feeds into"):

- → `<downstream-skill-1>` <when / with what artifact>
- → `<downstream-skill-2>` <when>
- ← `<upstream-skill>` <receives what>

## Done When

- [ ] <falsifiable criterion 1 — observable file, API response, or exit code>
- [ ] <falsifiable criterion 2>
- [ ] <falsifiable criterion 3>

## Destructive Actions

The following actions MUST confirm via `AskUserQuestion` before proceeding:

- <action 1> — e.g., "Overwrite `blueprint.md` when directory already exists"
- <action 2> — e.g., "Delete datapoints during dataset curation"

<existing skill body: all Step N / pipeline / examples — PRESERVED in place>

## Anti-Patterns

| Pattern | Do Instead |
|---------|-----------|
| <bad pattern extracted from existing prose> | <correct pattern> |
| <bad pattern 2> | <correct pattern> |

## Open in orq.ai

- **<entity 1>:** https://my.orq.ai/<path>
- **<entity 2>:** https://my.orq.ai/<path>

## Documentation & Resolution

When skill content conflicts with live API behavior or official docs, trust the source higher in this list:

1. **orq MCP tools** — query live data first (`search_entities`, `get_agent`, `models-list`); API responses are authoritative.
2. **orq.ai documentation MCP** — use `search_orq_ai_documentation` or `get_page_orq_ai_documentation`.
3. **Official docs** — browse https://docs.orq.ai directly.
4. **This skill file** — may lag behind API or docs changes.
```

**Positioning rule:** The Constraints → When to use → When NOT to use → Companion Skills → Done When → Destructive Actions block goes ABOVE the existing body (so readers see the contract before the steps). Anti-Patterns / Open in orq.ai / Documentation & Resolution go at the END as footers. This matches the dominant pattern in `orq-ai/assistant-plugins`.

**XML-tagged skill body preservation:** Several current files (orq-agent.md, prompt.md, architect.md) wrap bodies in XML tags (`<role>`, `<pipeline>`, `<files_to_read>`). These are PRESERVED verbatim. New sections use Markdown H2 headings and sit outside the XML tags. This is consistent with CONTEXT.md code_context note ("follow existing file's style per-file; don't rewrite style").

### Pattern 1: Bulk Template Edit

**What:** Write one canonical template (above), then apply it to all 34 files in parallel per-skill edits.

**When to use:** The entire phase — all 34 files need the same structural augmentation.

**Implementation:** Each file gets its own task in the plan. Tasks run in parallel waves (commands wave, subagents wave). Each task:
1. Read current file.
2. Insert the 7 pre-body sections after H1 / after opening XML blocks (whichever comes first in the current file).
3. Append the 3 footer sections at end of file.
4. Fill placeholders with skill-specific content derived from existing prose, observed side effects, and the Companion Skills graph.
5. Run lint script on just that file to verify conformance.

### Pattern 2: Byte-Identical Smoke Test

**What:** Capture golden output BEFORE any file changes, re-run AFTER all changes, diff.

**When to use:** Protection for `/orq-agent`, `/orq-agent:prompt`, `/orq-agent:architect` (ROADMAP success criterion #5).

**Approach — the realistic interpretation:**

"Byte-identical behavior" cannot mean "identical LLM output" (LLMs are non-deterministic). The interpretation must be: **"the rendered skill prompt the LLM receives is byte-identical for an identical user input."**

For slash commands, the rendered prompt = the file content (substituted with `$ARGUMENTS`) plus any `<files_to_read>` file contents inlined. So the practical check is:

1. Pre-change: For each of the 3 commands, compute `cat <command>.md` + `cat` of every file in its `<files_to_read>` block. Hash it. Store in `tests/entry-point-smoke/<command>.sha256`.
2. Post-change: Recompute the same concatenation. Compare hashes.

Because the existing `<files_to_read>` blocks point at `orq-agent/SKILL.md` (also modified by this phase), this test WILL legitimately fail after Phase 34 unless we adjust expectations. Two honest options:

- **Option A (strict):** Phase 34 updates the golden hashes at the same time as the file changes — acknowledging the "byte-identical" criterion applies to **the pipeline behavior the commands orchestrate** (architect still runs, classification still happens, checkpoints still appear), not to raw file bytes. Update the golden = ack'ing the intended change.
- **Option B (loose):** Capture golden output as a **structural hash** — a canonical serialization that ignores the new sections (Constraints, Companion Skills, etc.) and only hashes the pipeline-relevant sections (Step 0 through Step N). Requires defining "pipeline-relevant" programmatically.

**Recommendation:** Option A. The intent of ROADMAP criterion #5 is "no regression in the pipeline loop users experience" — not "no bytes changed in the file." Option A makes this explicit and defendable. The lint script can additionally check that the `<role>`, `<pipeline>`, and XML-tagged step blocks in these three files have not changed via a structural extract-and-diff. This gives "behavioral byte-identical" enforcement without over-promising.

### Anti-Patterns to Avoid

- **Writing `allowed-tools:` into subagent frontmatter:** Claude Code subagent schema doesn't recognize this key — it's a no-op and misleads future readers. Use `tools:` for subagents.
- **Pre-creating `<skill>/resources/` dirs with no content:** YAGNI. V3.0 phases 36-43 will create them on demand when they have single-consumer long-form docs.
- **Moving shared references into one skill's `resources/`:** Breaks cross-consumer links silently. All 8 current references are multi-consumer.
- **Rewriting XML-tagged bodies to Markdown (or vice versa):** Don't restyle files. Keep each file's existing body style.
- **Interpreting "byte-identical" as "file bytes unchanged":** Impossible given the phase goal. Define "byte-identical" as behavioral (pipeline orchestration, not file content).
- **Building a Node+YAML lint tool:** Adds runtime dependency for negligible benefit over Bash+grep on this schema.

## Reference Consumer Graph (drives SKST-02)

Cross-referenced every file in `orq-agent/references/` against skill-file consumers on 2026-04-20 via `grep -rE "references/<name>"`:

| Reference | Consumer count | Consumers (skills) | Migration verdict |
|-----------|----------------|--------------------|--------------------|
| `orqai-agent-fields.md` | 6 | orchestration-generator, deployer, spec-generator, researcher, tool-resolver (+2 templates) | **KEEP SHARED** |
| `orqai-model-catalog.md` | 5 | dataset-generator, architect, spec-generator, researcher, orq-agent.md | **KEEP SHARED** |
| `orchestration-patterns.md` | 4 skills + 1 template | orchestration-generator, architect, researcher, orq-agent.md | **KEEP SHARED** |
| `naming-conventions.md` | 11 skills + 1 template | deployer, architect, spec-generator, orq-agent.md, tools.md, research.md, prompt.md, datasets.md, readme-generator, kb-generator (+template) | **KEEP SHARED** |
| `tool-catalog.md` | 2 | researcher, tool-resolver | **KEEP SHARED** (could theoretically split but no benefit) |
| `agentic-patterns.md` | 2 | orchestration-generator, spec-generator | **KEEP SHARED** |
| `orqai-api-endpoints.md` | 7 | hardener, dataset-preparer, experiment-runner, deployer, tester, kb-generator, iterator | **KEEP SHARED** |
| `orqai-evaluator-types.md` | 5 | hardener, experiment-runner, tester, iterator, failure-diagnoser | **KEEP SHARED** |

**Verdict:** Zero single-consumer references in the current codebase. The SKST-02 migration has no existing candidates. The phase deliverable for SKST-02 is:
1. Document the finding in RESEARCH.md (this file — done).
2. Add a short "Resources convention" note to `orq-agent/SKILL.md` explaining: "Shared references live in `orq-agent/references/`. Skill-specific long-form docs (used by exactly one skill) live in that skill's `resources/` subdirectory."
3. The lint script checks: "no reference file under `orq-agent/references/` is consumed by fewer than 2 skills" — if a future phase moves something and breaks that invariant, the lint catches it.

## Companion Skill Graph (drives SKST-04)

Directional graph extracted from existing pipeline (orq-agent.md Step 3-6, deploy/test/iterate/harden commands):

```
User → /orq-agent (orchestrator)
         ↓
     architect
         ↓  (blueprint.md)
     tool-resolver ←─────────────┐
         ↓  (TOOLS.md)           │
     researcher                  │  (TOOLS.md consumed)
         ↓  (research-brief.md)  │
     spec-generator ─────────────┘
         ↓  (agents/*.md)
     ┌───┼────┬───────────┬──────────┐
     ↓   ↓    ↓           ↓          ↓
  orch dset readme      kb-gen    (any single spec)
   -gen -gen -gen         ↓
     ↓   ↓    ↓          (kb docs)
   ORCHESTRATION.md, datasets/, README.md
     ↓
 /orq-agent:deploy → deployer → (deployed agents)
     ↓
 /orq-agent:test → tester → dataset-preparer → experiment-runner → results-analyzer
     ↓
 /orq-agent:iterate → failure-diagnoser → iterator → prompt-editor → (re-deploy, re-test)
     ↓
 /orq-agent:harden → hardener → (guardrails attached)
```

**Lateral / side-entry commands (not in main pipeline):**
- `/orq-agent:prompt` — fast path, spawns only spec-generator
- `/orq-agent:architect` — standalone, spawns only architect
- `/orq-agent:tools` — standalone, spawns only tool-resolver
- `/orq-agent:research` — standalone, spawns only researcher
- `/orq-agent:datasets` — standalone, spawns only dataset-generator
- `/orq-agent:kb` — spawns kb-generator + provisions KB
- `/orq-agent:systems` — manages systems.md (no subagent)
- `/orq-agent:set-profile` — manages config.json (no subagent)
- `/orq-agent:help`, `/orq-agent:update` — meta-commands (no subagent)

Each skill's Companion Skills section reads from this graph. For example:
- architect: `→ tool-resolver` (always next), `→ researcher` (when researcher runs), `← /orq-agent` / `← /orq-agent:architect` (both invokers)
- tester: `← /orq-agent:test`, `→ dataset-preparer`, `→ experiment-runner`, `→ results-analyzer`, `→ iterator` (on failure)
- iterator: `← /orq-agent:iterate`, `← failure-diagnoser`, `→ prompt-editor`, `→ deployer` (re-deploy), `→ tester` (re-test)

## Destructive Action Inventory (drives SKST-08)

Per-skill destructive action inventory derived from existing file contents (Bash commands, Write/Edit calls, MCP tools that mutate state):

| Skill | Destructive actions |
|-------|---------------------|
| `commands/orq-agent.md` | Creates `{OUTPUT_DIR}/[swarm-name]/` (auto-versioned on collision — non-destructive); writes blueprint.md, all specs, datasets, README. No direct deletions. |
| `commands/prompt.md` | Creates `{OUTPUT_DIR}/[agent-name]/` (auto-versioned); writes single spec. No deletions. |
| `commands/architect.md` | Creates `{OUTPUT_DIR}/[swarm-name]/` (auto-versioned); writes blueprint.md. No deletions. |
| `commands/deploy.md` + `agents/deployer.md` | **DESTRUCTIVE:** Creates/updates agents on Orq.ai (MCP create/update), attaches tools, creates KBs. Idempotent create-or-update — overwriting existing agent config. |
| `commands/test.md` + `agents/tester.md`, `dataset-preparer.md`, `experiment-runner.md` | Creates datasets on Orq.ai, creates experiments. No deletions. |
| `commands/iterate.md` + `agents/iterator.md`, `failure-diagnoser.md`, `prompt-editor.md` | **DESTRUCTIVE:** Modifies agent spec files in place (prompt-editor writes), re-deploys agents (overwrites live Orq.ai config), creates new agent versions. |
| `commands/harden.md` + `agents/hardener.md` | **DESTRUCTIVE:** Attaches guardrails to deployed agents on Orq.ai (modifies agent config). Promotes evaluators to runtime guardrails. |
| `commands/kb.md` + `agents/kb-generator.md` | Creates KBs on Orq.ai, uploads files. Overwrites existing KB when same name used. |
| `commands/systems.md` | **DESTRUCTIVE:** Edits `orq-agent/systems.md` in place (add/remove). |
| `commands/set-profile.md` | Writes `.orq-agent/config.json` (overwrite). |
| `commands/update.md` | **DESTRUCTIVE:** Overwrites local skill files with GitHub versions. |
| `commands/datasets.md` + `agents/dataset-generator.md` | Writes dataset files under `{OUTPUT_DIR}/`. |
| `commands/research.md` + `agents/researcher.md` | Writes research-brief.md. |
| `commands/tools.md` + `agents/tool-resolver.md` | Writes TOOLS.md. |
| `commands/help.md` | Read-only. |
| `agents/architect.md`, `agents/spec-generator.md`, `agents/orchestration-generator.md`, `agents/readme-generator.md`, `agents/results-analyzer.md` | Write their designated output file. No deletions. |

**Skills requiring `AskUserQuestion` confirmation before destructive acts:** deploy, iterate, harden, kb, systems, update, prompt-editor, deployer, iterator, hardener, kb-generator. These get explicit Destructive Actions sections. Other skills get a short Destructive Actions section that states the output path and notes "overwrites if same output path is reused."

## Open in orq.ai URL Map (drives SKST-10)

Canonical base: `https://my.orq.ai/`. URL paths verified via Open-in-orq.ai sections of `orq-ai/assistant-plugins` skill files and docs.orq.ai references:

| Entity | Orq.ai Studio URL |
|--------|-------------------|
| Prompts | https://my.orq.ai/prompts |
| Deployments | https://my.orq.ai/deployments |
| Agents (Agent Studio) | https://my.orq.ai/agents |
| Datasets | https://my.orq.ai/datasets |
| Experiments | https://my.orq.ai/experiments |
| Traces | https://my.orq.ai/traces |
| Knowledge Bases | https://my.orq.ai/knowledge-bases |
| Evaluators | https://my.orq.ai/evaluators |
| AI Router / Models | https://my.orq.ai/models |
| Annotation Queues | https://my.orq.ai/annotation-queues |
| Trace Automations | https://my.orq.ai/trace-automations |

**Confidence note:** URLs above the `traces` line are confirmed from the reference repo. URLs below (annotation queues, trace automations) are inferred from docs.orq.ai nav and may need stubbing with a `TODO` anchor per CONTEXT.md guidance. The lint script should NOT strictly check the URL value — only that an `## Open in orq.ai` section exists with at least one bullet starting `- **<label>:**` followed by `https://my.orq.ai/`.

**Per-skill URL selection:**
- architect / spec-generator / orchestration-generator → Agents, Deployments
- tool-resolver → Agents (tool tab)
- researcher → Models, docs.orq.ai (as reference)
- deployer → Deployments, Agents
- tester / dataset-preparer / experiment-runner / results-analyzer → Experiments, Datasets, Evaluators
- iterator / failure-diagnoser / prompt-editor → Experiments, Prompts, Traces
- hardener → Deployments (guardrails tab), Evaluators
- kb-generator / kb.md → Knowledge Bases
- dataset-generator / datasets.md → Datasets, Annotation Queues (for EVLD-04 later)
- systems.md / set-profile.md → no Orq.ai entity (local config) — can stub with "N/A — this skill manages local config only" or omit (but lint requires presence — so use "N/A" note)

**Lint exception for local-config skills:** `set-profile.md`, `systems.md`, `help.md`, `update.md` manage local-only state. Their `## Open in orq.ai` section should contain a single bullet: `- **N/A** — this skill manages local configuration only (no Orq.ai entities involved)`. Lint accepts `N/A` as satisfying the section.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| YAML frontmatter parsing | Custom regex for multi-line values | `awk '/^---$/{c++; if(c>=2)exit; next} c==1'` | Our frontmatter is all scalar single-line keys — awk suffices and has zero deps. If complexity grows, switch to `python3 -c "import yaml; ..."` before reaching for `npm install`. |
| Skill section presence check | Custom AST parser for Markdown | `grep -F "^## When to use"` per required section | Section headings are fixed strings. grep is sufficient and produces human-readable failure messages. |
| Companion Skill graph generation | Auto-extracted from skill files | Author by hand in this research (see Companion Skill Graph) | The graph is small (~20 nodes), stable, and easier to review when explicit. Auto-extraction would need XML tag parsing + Task-tool invocation parsing. Not worth it. |
| Destructive-action detection | Auto-scan for `Bash/Write/Edit` call sites | Hand-authored per-skill list (see Destructive Action Inventory) | Same as above — 34 files, clear patterns, authoring takes ~1 hour and produces better output than an auto-detector would. |

**Key insight:** This phase is mostly **hand-authored structural content** (companion skill graphs, destructive action lists, open-in-orq URL mappings). Automation buys little over a careful one-pass author, because the content is small, stable, and interpretive. Automation concentrates only in the **lint script** (checks 34 files on demand) and the **smoke-test fixture** (captures 3 golden outputs).

## Common Pitfalls

### Pitfall 1: Putting new sections inside XML-tagged blocks

**What goes wrong:** Authors see `<role>`, `<pipeline>`, `<files_to_read>` blocks in orq-agent.md / prompt.md / architect.md and put `## Constraints` inside `<role>`, breaking the XML envelope.

**Why it happens:** Markdown headings work inside XML blocks but create visually confusing ownership.

**How to avoid:** New sections go BETWEEN or AFTER XML blocks — never inside. Lint rule: flag if any of the 10 required H2 headings appears inside an XML tag pair.

**Warning signs:** `<role>` block length grew > 200 lines; `<pipeline>` closes at file end and new sections end up inside.

### Pitfall 2: Using `allowed-tools:` in subagent frontmatter

**What goes wrong:** Author reads SKST-01 literally and writes `allowed-tools: Read, Glob, Grep` in a subagent file. Claude Code ignores the key — subagent ends up inheriting all tools from parent or using whatever `tools:` already declared.

**Why it happens:** The Agent Skills open standard uses `allowed-tools`, but Claude Code subagents predate that standard and use `tools:`.

**How to avoid:** Lint script enforces: "if path matches `commands/*.md` or is `SKILL.md`, require `allowed-tools:`. If path matches `agents/*.md`, require `tools:`." Never both on the same file. RESEARCH.md §Standard Stack / Frontmatter documents the split explicitly.

**Warning signs:** Lint failure `missing allowed-tools` on a subagent file — means author put `allowed-tools` and now both keys exist.

### Pitfall 3: Interpreting "byte-identical" too strictly

**What goes wrong:** Author takes ROADMAP success criterion #5 literally — "byte-identical in behavior" → runs `sha256sum` pre/post on the three command files, it obviously differs (new sections added), declares phase failed.

**Why it happens:** "Byte-identical" is a phrase with a precise meaning in binary-comparison contexts; "behavior" makes it approximate.

**How to avoid:** Define the test operationally as "the pipeline orchestration the commands invoke is unchanged: same subagent spawns in same order with same inputs." Implement as a structural hash of the `<pipeline>` XML block extracted from each of the 3 commands. Pre-change: capture pipeline-block hash per file. Post-change: re-capture, compare. Any new sections we added (Constraints, Companion Skills, etc.) sit OUTSIDE `<pipeline>` so they don't perturb the hash.

**Warning signs:** A plan task titled "capture byte-identical golden of `/orq-agent` output." That's too vague; the task must specify what is hashed (the `<pipeline>` XML block, not the whole file).

### Pitfall 4: Circular Companion Skill references

**What goes wrong:** Iterator says `→ prompt-editor`; prompt-editor says `→ iterator`. Reader can't tell handoff direction.

**Why it happens:** Some loops are real (iterator re-runs after prompt-editor applies the change), but arrows must encode the immediate next step, not the eventual cycle.

**How to avoid:** Use the Companion Skill Graph in this research as the source of truth. Every arrow represents "direct next action in the current flow." Longer-run cycles ("iterator eventually re-runs after prompt-editor") go into prose, not the arrow graph.

### Pitfall 5: Lint script that only fails, doesn't explain

**What goes wrong:** `./lint-skills.sh` exits 1 with no output. Author re-runs, still exits 1. Can't tell what's missing.

**Why it happens:** grep's exit code alone is binary; no diagnostic.

**How to avoid:** Lint script template:

```bash
#!/usr/bin/env bash
set -u
fail=0
REQUIRED_SECTIONS=(
  "## Constraints"
  "## When to use"
  "## When NOT to use"
  "## Companion Skills"
  "## Done When"
  "## Destructive Actions"
  "## Anti-Patterns"
  "## Open in orq.ai"
  "## Documentation & Resolution"
)
for f in orq-agent/SKILL.md orq-agent/commands/*.md orq-agent/agents/*.md; do
  for s in "${REQUIRED_SECTIONS[@]}"; do
    if ! grep -qF "$s" "$f"; then
      echo "FAIL: $f — missing section '$s'"
      fail=1
    fi
  done
  # Frontmatter check
  if [[ "$f" == *"/agents/"* ]]; then
    if ! awk '/^---$/{c++;if(c>=2)exit;next} c==1 && /^tools:/' "$f" | grep -q .; then
      echo "FAIL: $f — subagent missing 'tools:' frontmatter key"; fail=1
    fi
  else
    if ! awk '/^---$/{c++;if(c>=2)exit;next} c==1 && /^allowed-tools:/' "$f" | grep -q .; then
      echo "FAIL: $f — command/skill missing 'allowed-tools:' frontmatter key"; fail=1
    fi
  fi
done
exit $fail
```

Every failure names the file AND the missing section. Authors can fix in one pass.

## Code Examples

### Example 1: Canonical new skill (command, tight)

```markdown
---
description: Design an Orq.ai agent swarm blueprint from a use case description (standalone architect)
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, Task
argument-hint: [use-case-description]
---

<role>
# Orq.ai Standalone Architect
...existing...
</role>

<files_to_read>
- orq-agent/SKILL.md
</files_to_read>

## Constraints

- **NEVER** generate more than 5 agents in a single swarm — decompose into sub-swarms.
- **NEVER** skip the complexity gate — each additional agent requires one of the 5 justifications.
- **ALWAYS** default to single-agent; multi-agent must be justified.
- **ALWAYS** derive agent keys from the naming-conventions.md reference.

**Why these constraints:** Over-engineered swarms are harder to maintain than a well-configured single agent. The complexity gate exists because reformatter-style agents and duplicate-model agents are the two most common over-engineering failures we've seen in v0.3 → V2.1 shipped swarms.

## When to use

- User types `/orq-agent:architect "build a ..."` to get just a blueprint without running the full pipeline.
- Downstream tool-resolver / researcher / spec-generator will run later from the blueprint.
- User is iterating on swarm topology before committing to generation.

## When NOT to use

- User wants a full swarm (specs, datasets, README, orchestration doc) → use `/orq-agent` instead.
- User wants just a single agent spec → use `/orq-agent:prompt` instead.
- Blueprint already exists and user wants to edit it → edit blueprint.md directly; no subagent needed.

## Companion Skills

- → `tool-resolver` — consumes `blueprint.md` to produce TOOLS.md
- → `researcher` — consumes `blueprint.md` + TOOLS.md to produce research-brief.md
- → `spec-generator` — final consumer of the blueprint
- ← `/orq-agent` — full pipeline invokes the architect as Step 3
- ← `/orq-agent:architect` — this is that command's only subagent

## Done When

- [ ] Blueprint file written to `{OUTPUT_DIR}/[swarm-name]/blueprint.md`
- [ ] Blueprint contains Swarm name, Agent count, Pattern, Complexity justification
- [ ] Every agent has Role, Responsibility, Model recommendation, Tools needed, KB classification
- [ ] Agent keys match regex `^[A-Za-z][A-Za-z0-9]*([._-][A-Za-z0-9]+)*$` and end with `-agent`
- [ ] Multi-agent blueprints include Orchestration section; single-agent blueprints omit it

## Destructive Actions

- **Create `{OUTPUT_DIR}/[swarm-name]/` directory** — auto-versions to `-v2`, `-v3`, ... if it already exists (non-destructive via auto-versioning; no `AskUserQuestion` needed).
- **Write `blueprint.md`** — overwrites if `{OUTPUT_DIR}/[swarm-name]/blueprint.md` already exists in the current (auto-versioned) directory. Confirm via `AskUserQuestion` before overwriting.

<pipeline>
...existing Step 0 → Step 6...
</pipeline>

## Anti-Patterns

| Pattern | Do Instead |
|---------|-----------|
| Creating agents for the sake of having agents | Start single; each extra agent requires one of the 5 complexity-gate justifications |
| Designing reformatter agents that only wrap another agent's output | Merge the formatting into the producing agent's instructions |
| Using floating model aliases (`claude-sonnet-4-5`) in blueprints | Pin to snapshot (`claude-sonnet-4-5-20250929`) — see Phase 35 MSEL-02 |
| Skipping systems.md awareness when it contains entries | Cross-reference use case against systems.md and note integration methods per agent |

## Open in orq.ai

- **Agent Studio:** https://my.orq.ai/agents
- **Deployments:** https://my.orq.ai/deployments

## Documentation & Resolution

When skill content conflicts with live API behavior or official docs, trust the source higher in this list:

1. **orq MCP tools** — query live data first (`search_entities`, `get_agent`, `models-list`); API responses are authoritative.
2. **orq.ai documentation MCP** — use `search_orq_ai_documentation` or `get_page_orq_ai_documentation`.
3. **Official docs** — browse https://docs.orq.ai directly.
4. **This skill file** — may lag behind API or docs changes.
```

### Example 2: Lint script (full)

See Pitfall 5 above — the ~40-line POSIX script is both the example AND the deliverable.

### Example 3: Byte-identical smoke test (structural hash)

```bash
#!/usr/bin/env bash
# tests/entry-point-smoke/verify.sh
set -eu
cd "$(dirname "$0")/../.."

for cmd in orq-agent prompt architect; do
  # Extract <pipeline> block from current file
  current=$(awk '/^<pipeline>$/{flag=1;next} /^<\/pipeline>$/{flag=0} flag' "orq-agent/commands/${cmd}.md" | shasum -a 256 | cut -d' ' -f1)
  golden=$(cat "tests/entry-point-smoke/${cmd}.pipeline.sha256")
  if [[ "$current" != "$golden" ]]; then
    echo "FAIL: orq-agent/commands/${cmd}.md <pipeline> block changed (${current} vs ${golden})"
    echo "If intentional, update golden: echo $current > tests/entry-point-smoke/${cmd}.pipeline.sha256"
    exit 1
  fi
done
echo "All 3 protected entry points byte-identical in <pipeline> block."
```

Golden capture (one-time, runs BEFORE any changes in Phase 34):

```bash
for cmd in orq-agent prompt architect; do
  awk '/^<pipeline>$/{flag=1;next} /^<\/pipeline>$/{flag=0} flag' "orq-agent/commands/${cmd}.md" \
    | shasum -a 256 | cut -d' ' -f1 > "tests/entry-point-smoke/${cmd}.pipeline.sha256"
done
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Custom slash-command prose format | Agent Skills format (frontmatter + sections) | Claude Code ~2025, open standard 2026 (agentskills.io) | Cross-IDE compatibility (Cursor, Codex, Gemini) — Phase 43 depends on this |
| Loose/implicit constraints in prose | Explicit Constraints block with NEVER/ALWAYS + "Why" | 2026 reference repo convention | Shorter onboarding for new maintainers; makes destructive actions auditable |
| Unstructured companion skill mentions | Directional arrow graph in `## Companion Skills` section | 2026 reference repo | Tooling-friendly; future `/orq-agent:workspace` (LCMD-01) can parse the graph |
| Free-form "destructive" warnings scattered through prose | Explicit `## Destructive Actions` list with AskUserQuestion requirement | 2026 reference repo | Predictable HITL gates; enables the `AskUserQuestion` tool to be auto-injected by a future enforcement layer |
| Flat `orq-agent/references/` only | Flat `references/` (shared) + per-skill `resources/` (single-consumer) | 2026 convention | Keeps context windows lean for subagents that don't need the full reference set |

**Deprecated/outdated:**
- Nothing in this phase deprecates existing content — this is additive-only structural migration.

## Open Questions

1. **"Byte-identical" strict vs. loose interpretation**
   - What we know: ROADMAP success criterion #5 says "remain byte-identical in behavior when invoked with the same input." CONTEXT.md accepts either smoke-test fixture OR manual diff check.
   - What's unclear: Whether the planner / reviewer will accept "structural hash of `<pipeline>` XML block" as sufficient, or will insist on full-file byte-identical (which is incompatible with adding new sections).
   - Recommendation: Planner should write the smoke test as "structural hash of `<pipeline>` block" and document the interpretation in the plan's Acceptance Criteria. Escalate to user only if reviewer rejects this interpretation.

2. **Should `orq-agent/SKILL.md` receive all 10 SKST sections too?**
   - What we know: CONTEXT.md scope includes `orq-agent/SKILL.md`. ROADMAP criterion #1 says "Every skill file (top-level command + every subagent)."
   - What's unclear: Top-level SKILL.md is an index, not a user-invocable skill. Sections like "When to use" / "Done When" are odd for a skill index.
   - Recommendation: Apply all 10 sections. For SKILL.md specifically, frame them meta: "When to use" = "Claude loads this as context for every /orq-agent* command"; "Done When" = "All subagents + commands listed match disk reality"; "Destructive Actions" = "N/A — this is an index." Lint accepts N/A bullets.

3. **URL stubs for entities not yet verified (annotation queues, trace automations)**
   - What we know: Reference repo confirms `/prompts`, `/deployments`, `/agents`, `/datasets`, `/experiments`, `/traces`. Others inferred.
   - What's unclear: Whether `/annotation-queues` and `/trace-automations` are exactly the paths on my.orq.ai.
   - Recommendation: Use the paths as-is in skills that will be consumed by V3.0 phases. If a later phase finds the URL wrong, update in that phase. Lint does NOT check URL validity — only section presence.

4. **Lint integration with existing CI**
   - What we know: Phase 43 (DIST) owns CI/CD scaffolds. Phase 34 CONTEXT.md explicitly defers CI wiring.
   - What's unclear: Whether the lint script should be callable from a future CI hook (exit code + stderr convention) or whether each V3.0 phase just runs it manually.
   - Recommendation: Write the lint script to exit 0 on pass, 1 on any failure, and emit failures to stderr. This is CI-compatible by default without requiring any wiring in Phase 34. Phase 43 can then wire it with zero script changes.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Bash + POSIX shell (no framework — this phase ships plain scripts) |
| Config file | None |
| Quick run command | `bash orq-agent/scripts/lint-skills.sh` |
| Full suite command | `bash orq-agent/scripts/lint-skills.sh && bash tests/entry-point-smoke/verify.sh` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SKST-01 | Every skill declares tool allowlist (via `allowed-tools` for commands/skill, `tools` for subagents) | unit (lint) | `bash orq-agent/scripts/lint-skills.sh` | Wave 0 |
| SKST-02 | Single-consumer resources live in `<skill>/resources/`; shared in `references/` | unit (lint) | `bash orq-agent/scripts/lint-skills.sh` (consumer-count check) | Wave 0 |
| SKST-03 | `## When to use` and `## When NOT to use` sections present | unit (lint) | `bash orq-agent/scripts/lint-skills.sh` | Wave 0 |
| SKST-04 | `## Companion Skills` section present | unit (lint) | `bash orq-agent/scripts/lint-skills.sh` | Wave 0 |
| SKST-05 | `## Done When` section present with `[ ]` checkboxes | unit (lint) | `bash orq-agent/scripts/lint-skills.sh` | Wave 0 |
| SKST-06 | `## Constraints` section present with `NEVER`/`ALWAYS` bullets and "Why these constraints:" paragraph | unit (lint) | `bash orq-agent/scripts/lint-skills.sh` | Wave 0 |
| SKST-07 | `## Anti-Patterns` table present with 2 columns | unit (lint) | `bash orq-agent/scripts/lint-skills.sh` | Wave 0 |
| SKST-08 | `## Destructive Actions` section present | unit (lint) | `bash orq-agent/scripts/lint-skills.sh` | Wave 0 |
| SKST-09 | `## Documentation & Resolution` section present with 4-item trust order | unit (lint) | `bash orq-agent/scripts/lint-skills.sh` | Wave 0 |
| SKST-10 | `## Open in orq.ai` section present with at least one bullet | unit (lint) | `bash orq-agent/scripts/lint-skills.sh` | Wave 0 |
| ROADMAP-C5 | `/orq-agent`, `/orq-agent:prompt`, `/orq-agent:architect` pipeline blocks unchanged | smoke (hash diff) | `bash tests/entry-point-smoke/verify.sh` | Wave 0 |

### Sampling Rate
- **Per task commit:** `bash orq-agent/scripts/lint-skills.sh` — runs in < 1s across all 34 files
- **Per wave merge:** `bash orq-agent/scripts/lint-skills.sh && bash tests/entry-point-smoke/verify.sh` — full suite
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `orq-agent/scripts/lint-skills.sh` — SKST-01 through SKST-10 conformance
- [ ] `tests/entry-point-smoke/verify.sh` — byte-identical `<pipeline>` block check
- [ ] `tests/entry-point-smoke/orq-agent.pipeline.sha256` — golden hash for /orq-agent
- [ ] `tests/entry-point-smoke/prompt.pipeline.sha256` — golden hash for /orq-agent:prompt
- [ ] `tests/entry-point-smoke/architect.pipeline.sha256` — golden hash for /orq-agent:architect
- [ ] `orq-agent/scripts/` directory (new)
- [ ] `tests/` directory (new at repo root, matches DIST-06 convention)

No test framework install needed — POSIX shell is available everywhere. Darwin `shasum -a 256` and Linux `sha256sum` differ; the script uses `shasum -a 256` (present on both platforms via GNU coreutils compat).

## Sources

### Primary (HIGH confidence)
- [Claude Code Skills docs](https://code.claude.com/docs/en/skills) — full frontmatter schema for `SKILL.md` and slash commands, including `allowed-tools` format (space-separated or YAML list). Fetched 2026-04-20.
- [Claude Code Subagent docs](https://code.claude.com/docs/en/sub-agents) — frontmatter schema for `agents/*.md` using `tools:` key, NOT `allowed-tools`. Confirms the schema split. Fetched 2026-04-20.
- [orq-ai/assistant-plugins/skills/generate-synthetic-dataset/SKILL.md](https://github.com/orq-ai/assistant-plugins/blob/main/skills/generate-synthetic-dataset/SKILL.md) — canonical section ordering + Constraints block + Companion Skills + Done When + Anti-Patterns + Documentation & Resolution pattern. Fetched 2026-04-20.
- [orq-ai/assistant-plugins/skills/build-agent/SKILL.md](https://raw.githubusercontent.com/orq-ai/assistant-plugins/main/skills/build-agent/SKILL.md) — Destructive Actions pattern, Companion Skills directional arrows. Fetched 2026-04-20.
- [orq-ai/assistant-plugins/skills/build-evaluator/SKILL.md](https://raw.githubusercontent.com/orq-ai/assistant-plugins/main/skills/build-evaluator/SKILL.md) — variant section ordering confirming flexibility in order but fixed required-section set. Fetched 2026-04-20.
- [orq-ai/assistant-plugins/skills/analyze-trace-failures/SKILL.md](https://raw.githubusercontent.com/orq-ai/assistant-plugins/main/skills/analyze-trace-failures/SKILL.md) — Documentation & Resolution trust order exact phrasing. Fetched 2026-04-20.
- [orq-ai/assistant-plugins/skills/optimize-prompt/SKILL.md](https://raw.githubusercontent.com/orq-ai/assistant-plugins/main/skills/optimize-prompt/SKILL.md) — Open in orq.ai URLs (my.orq.ai/prompts, my.orq.ai/deployments). Fetched 2026-04-20.
- [Anthropic engineering blog — Equipping agents for the real world with Agent Skills](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills) — open standard context. Fetched 2026-04-20.
- [agentskills.io](https://agentskills.io) — cross-IDE Agent Skills open standard reference. Cited by Claude Code docs.

### Secondary (MEDIUM confidence)
- [orq-ai/assistant-plugins/tests/scripts/validate-plugin-manifests.sh](https://raw.githubusercontent.com/orq-ai/assistant-plugins/main/tests/scripts/validate-plugin-manifests.sh) — shows reference repo has NO skill-structure lint, only plugin-manifest validation. Confirms lint script is novel to this phase.
- [orq-ai/assistant-plugins/tests/skills.md](https://raw.githubusercontent.com/orq-ai/assistant-plugins/main/tests/skills.md) — behavioral test plan; does not lint structure.
- Current repo `orq-agent/commands/*.md` and `orq-agent/agents/*.md` files — frontmatter already surveyed 2026-04-20; counts and keys verified.

### Tertiary (LOW confidence)
- URL paths `/annotation-queues` and `/trace-automations` — inferred from docs.orq.ai nav; not explicitly verified as Studio URLs in sampled reference skills. Flagged in Open Questions #3.

## Metadata

**Confidence breakdown:**
- Standard stack / frontmatter schema: HIGH — verified against live official docs and multiple reference implementations.
- Architecture patterns (section ordering, Companion Skills convention): MEDIUM — reference repo shows some variation between skills (build-evaluator orders differently than generate-synthetic-dataset); safe subset chosen.
- Pitfalls: HIGH — all pitfalls verified against current repo state (frontmatter audit) or directly stated in Claude Code subagent docs.
- Reference consumer graph: HIGH — every claim is grep-verifiable on the current tree (reproduced exact queries in the table).
- Destructive action inventory: HIGH — per-skill actions derived from reading each file's body.
- Open in orq.ai URL map: MEDIUM overall (7/11 verified, 4/11 inferred).
- Byte-identical test interpretation: MEDIUM — operational interpretation proposed; reviewer may prefer stricter definition.

**Research date:** 2026-04-20
**Valid until:** 2026-05-20 (30 days — structural conventions stable; URL paths on my.orq.ai are the most volatile variable)
