---
gsd_state_version: 1.0
milestone: v0.3
milestone_name: milestone
status: completed
stopped_at: Completed 42-09-PLAN.md — Phase 42 mechanically COMPLETE
last_updated: "2026-04-21T06:13:59.610Z"
last_activity: "2026-04-21 — Phase 42 Plan 07 complete: resources scaffold for iterator/hardener/evaluator-validator; commits 641b1ef / 46a603a / 5b62f0b"
progress:
  total_phases: 10
  completed_phases: 9
  total_plans: 52
  completed_plans: 52
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-20)

**Core value:** Any colleague can go from a use case description to deployed, tested agents on Orq.ai -- through an automated pipeline with real-time visibility and HITL approvals -- without needing to understand the underlying AI platform.
**Current focus:** V3.0 Lifecycle Completeness & Eval Science — Phase 36 Lifecycle Slash Commands mechanically COMPLETE (8/8 plans, 7/7 LCMD reqs); next: /gsd:verify-work 36 (3 manual smokes: MCP round-trip, UX flow, POST /v2/trace-automations) then /gsd:plan-phase 37 (Observability Setup, OBSV)
**Previous milestones:** v0.3 shipped 2026-03-01 (11 phases, 28 plans), V2.0 shipped 2026-03-02 (7 phases, 11 plans), V2.1 shipped 2026-03-13 (8 phases, 9 plans)

## Current Position

Phase: 42 - Evaluator Validation & Iterator Enrichments (Plan 7 of 9 complete) — IN PROGRESS
Plan: 07 complete — 7 resource files created across 3 new per-subagent resources/ subdirs (iterator, hardener, evaluator-validator) carrying action-plan template, decision trees, sample-rate tiers, prevalence correction, TPR/TNR methodology, annotation-queue setup, 4-component judge template; lint-skills.sh exit 0 and protected-pipeline 3/3 match; commits 641b1ef, 46a603a, 5b62f0b
Status: Ready for `/gsd:execute-phase 42` to continue with next incomplete plan (42-02 through 42-06, 42-08, 42-09)
Last activity: 2026-04-21 — Phase 42 Plan 07 complete: resources scaffold for iterator/hardener/evaluator-validator; commits 641b1ef / 46a603a / 5b62f0b

Progress: V3.0 Phase 34 COMPLETE (5/5). V3.0 Phase 35 mechanically COMPLETE (5/5). V3.0 Phase 36 mechanically COMPLETE (8/8). V3.0 Phase 37 mechanically COMPLETE (5/5). V3.0 Phase 38 mechanically COMPLETE (4/4). V3.0 Phase 41 mechanically COMPLETE (5/5). 7-in-a-row V3.0 phases closed under canonical VERIFICATION.md pattern (34/35/36/37/38/40/41). Next V3.0 phases (42-43) inherit SKST + MSEL-02 + protected-pipeline invariants.

## Performance Metrics

| Phase | Plan | Duration | Tasks | Files |
|-------|------|----------|-------|-------|
| 34-skill-structure-format-foundation | 01 | 3 min | 3 | 6 |
| 34-skill-structure-format-foundation | 02 | 13 min | 3 | 15 |
| 34-skill-structure-format-foundation | 03 | 13 min | 3 | 17 |
| 34-skill-structure-format-foundation | 04 | 2 min | 1 | 1 |
| 34-skill-structure-format-foundation | 05 | 3 min | 1 | 1 |
| Phase 34-skill-structure-format-foundation P05 | 3 min | 1 tasks | 1 files |
| Phase 35-model-selection-discipline P01 | 2 min | 2 tasks | 3 files |
| Phase 35-model-selection-discipline P03 | 2 min | 1 tasks | 1 files |
| Phase 35-model-selection-discipline P02 | 2 min | 1 tasks | 1 files |
| Phase 35-model-selection-discipline P04 | 1 min | 1 tasks | 1 files |
| Phase 35-model-selection-discipline P05 | 2 min | 1 tasks | 1 files |
| Phase 36-lifecycle-slash-commands P02 | 1 min | 1 tasks | 1 files |
| Phase 36-lifecycle-slash-commands P03 | 1 min | 1 tasks | 1 files |
| Phase 36-lifecycle-slash-commands P06 | 2 min | 1 tasks | 1 files |
| Phase 36-lifecycle-slash-commands P04 | 2 min | 1 tasks | 1 files |
| Phase 36-lifecycle-slash-commands P05 | 3 min | 1 tasks | 1 files |
| Phase 36-lifecycle-slash-commands P01 | 3 min | 1 tasks | 1 files |
| Phase 36-lifecycle-slash-commands P07 | 1 min | 1 tasks | 2 files |
| Phase 36-lifecycle-slash-commands P08 | 2 min | 1 tasks | 1 files |
| Phase 37-observability-setup-skill P02 | 4 min | 1 tasks | 5 files |
| Phase 37-observability-setup-skill P01 | 4 min | 1 tasks | 1 files |
| Phase 37-observability-setup-skill P03 | 2 min | 1 tasks | 1 files |
| Phase 37-observability-setup-skill P04 | 2 min | 1 tasks | 2 files |
| Phase 37-observability-setup-skill P05 | 2 min | 1 tasks | 1 files |
| Phase 38-trace-failure-analysis-skill P02 | 1 min | 1 tasks | 3 files |
| Phase 38-trace-failure-analysis-skill P01 | 2 min | 1 tasks | 1 files |
| Phase 38-trace-failure-analysis-skill P03 | 3 min | 1 tasks | 3 files |
| Phase 38-trace-failure-analysis-skill P04 | 4 min | 1 tasks | 1 files |
| Phase 39-dataset-generator-enhancements P01 | 1 min | 1 tasks | 1 files |
| Phase 39-dataset-generator-enhancements P02 | 2 min | 1 tasks | 1 files |
| Phase 39-dataset-generator-enhancements P03 | 2 min | 1 tasks | 3 files |
| Phase 39-dataset-generator-enhancements P04 | 1 min | 1 tasks | 2 files |
| Phase 39-dataset-generator-enhancements P05 | 3 min | 1 tasks | 1 files |
| Phase 40-kb-memory-lifecycle P02 | 2min | 1 tasks | 1 files |
| Phase 40-kb-memory-lifecycle P04 | 2 min | 1 tasks | 3 files |
| Phase 40-kb-memory-lifecycle P03 | single-task | 1 tasks | 1 files |
| Phase 40-kb-memory-lifecycle P05 | 1 min | 1 tasks | 2 files |
| Phase 40-kb-memory-lifecycle P06 | 3min | 1 tasks | 1 files |
| Phase 41 P02 | 6min | 1 tasks | 1 files |
| Phase 41-prompt-optimization-cross-framework-comparison P01 | 8 min | 1 tasks | 1 files |
| Phase 41-prompt-optimization-cross-framework-comparison P03 | 5 min | 2 tasks | 4 files |
| Phase 41-prompt-optimization-cross-framework-comparison P04 | 3 min | 2 tasks | 2 files |
| Phase 41-prompt-optimization-cross-framework-comparison P05 | 1 min | 1 tasks | 1 files |
| Phase 42 P01 | 2 min | 1 tasks | 1 files |
| Phase 42 P02 | 2 min | 1 tasks | 1 files |
| Phase 42-evaluator-validation-iterator-enrichments P03 | 2 min | 1 tasks | 1 files |
| Phase 42-evaluator-validation-iterator-enrichments P04 | 2 min | 1 tasks | 1 files |
| Phase 42 P05 | 2 min | 1 tasks | 1 files |
| Phase 42 P06 | 9 min | 1 tasks | 1 files |
| Phase 42 P07 | 5 min | 3 tasks | 7 files |
| Phase 42 P08 | 5min | 1 tasks | 1 files |
| Phase 42-evaluator-validation-iterator-enrichments P09 | 2 min | 1 tasks | 1 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- V3.0 before V4.0/V5.0 -- lifecycle gaps (observability, eval science, optimization) matter before cross-swarm work and browser automation (2026-04-20)
- Tier-gate human-label dependencies -- TPR/TNR evaluator validation placed under 'full' tier so core/deploy/test users never hit it (2026-04-20)
- Preserve generator loop through V3.0 -- `/orq-agent`, `/orq-agent:prompt`, `/orq-agent:architect` remain byte-identical (2026-04-20)
- Binary Pass/Fail default for LLM evaluators -- Likert scales require explicit justification (2026-04-20)
- V3.0 phase ordering optimized for autonomous execution -- SKST format foundation first, human-label-dependent EVLD work last, DIST manifests late (2026-04-20)
- systems.md uses markdown format (not JSON) for maximum user editability -- user-configurable IT systems registry (2026-03-23)
- Browser automation installer default is "none" to keep setup frictionless for users who don't need it (2026-03-23)
- REVISED: workflow-discovery agent (NEW) sits after discussion, before architect -- conversational system identification replaces architect-embedded detection (2026-03-23)
- REVISED: workflow-builder replaces SOP-dependent approach -- conversation is primary input, screenshots secondary, SOP optional (2026-03-23)
- REVISED: architect priority MEDIUM (not HIGH) -- receives workflow-discovery output, no longer performs detection (2026-03-23)
- 3 new subagents for browser automation: workflow-discovery, workflow-builder, script-generator (2026-03-23)
- MCP tool as integration surface for browser automation -- test/iterate/harden pipeline unchanged (2026-03-23)
- Direct Claude messages.create() over Agent SDK -- pipeline stages are predetermined, not agent-decided
- GitHub raw URL for .md file fetching with PIPELINE_REPO_RAW_URL env var -- runtime fetching per user decision
- Vitest for test framework -- ESM-native, fast, TypeScript out of the box
- [Phase quick-260326-ann]: evaluatorq is NOT legacy -- use with caution for local custom scoring; REST is primary experiment path
- [Phase 34-skill-structure-format-foundation]: Golden baselines hash <pipeline> block only (not whole file) — operationalizes ROADMAP #5 'byte-identical in behavior' (2026-04-20)
- [Phase 34-skill-structure-format-foundation]: POSIX bash + grep/awk/shasum only for Wave-0 validation scripts — zero runtime deps, CI-ready by default for Phase 43 (2026-04-20)
- [Phase 34-skill-structure-format-foundation]: For XML-tagged command files, SKST pre-body sections go between </files_to_read> and <pipeline>; footer sections after </pipeline> — keeps pipeline SHA-256 byte-identical (2026-04-20)
- [Phase 34-skill-structure-format-foundation]: Local-config commands (systems, set-profile, update, help) use "- **N/A** — this skill manages local configuration only" for Open in orq.ai; lint accepts N/A per SKST-10 exception (2026-04-20)
- [Phase 34-skill-structure-format-foundation]: help.md Destructive Actions uses "- **None** — this command is read-only" — read-only commands pass SKST-08 with this explicit shape (2026-04-20)
- [Phase 34-skill-structure-format-foundation]: SKST-01 satisfied for subagents by existing tools: frontmatter — allowed-tools: is a no-op on subagents per Claude Code schema (RESEARCH.md Pitfall 2); zero frontmatter edits made on 17 subagent files
- [Phase 34-skill-structure-format-foundation]: Non-destructive subagents use explicit Non-destructive wording in Destructive Actions; failure-diagnoser documents downstream AskUserQuestion HITL gate (it collects approval but does not mutate itself)
- [Phase 34-skill-structure-format-foundation]: Forward-link graph to future-phase requirement IDs established across subagents (TFAIL-03, ITRX-01/05/07/08, EVLD-08, KBM-01-04, ESCI-01/08, DSET-02-05, MSEL-01/02); Phases 35/38/39/40/42 can grep for these IDs to find entry points
- [Phase 34-skill-structure-format-foundation]: SKILL.md receives full 9-section SKST superset with meta-framing per RESEARCH.md Open Question #2 — suite-level Destructive Actions explicitly N/A (index file makes no mutations); allowed-tools: union of tools across 15 commands
- [Phase 34-skill-structure-format-foundation]: Resources Policy pinned to a lint rule (references-multi-consumer) instead of a migration action — zero files moved because zero files qualified (all 8 refs have >=2 consumers, verified 2026-04-20)
- [Phase 34-skill-structure-format-foundation]: Phase-close VERIFICATION.md pattern established — structured evidence document (captured output + 10-row traceability table + 5-row ROADMAP criteria checklist + inventory + deferred items) sits next to SUMMARY.md and feeds /gsd:verify-work (2026-04-20)
- [Phase 34-skill-structure-format-foundation]: TODO(SKST-10) inferred-URL marker count is 2 (datasets.md + dataset-generator.md Annotation Queues URL) — resolution deferred to Phase 37+ when live MCP surfaces canonical my.orq.ai/annotation-queues path (2026-04-20)
- [Phase 34-skill-structure-format-foundation]: Lateral lint enforcement for downstream phases — each V3.0 phase (36-43) must call bash orq-agent/scripts/lint-skills.sh on its new skill files before marking plans complete; CI wiring owned by Phase 43 DIST (2026-04-20)
- [Phase 35-model-selection-discipline]: MSEL-02 enforcement via extending lint-skills.sh (not new script) — one CI entry point, reuses extensible-rule pattern from 34-01
- [Phase 35-model-selection-discipline]: Fixtures live outside default_file_set() under tests/fixtures/ so full-suite green baseline stays stable; rule tested via explicit --file invocation
- [Phase 35-model-selection-discipline]: YAGNI on embedding/speech alias allow-list — no such model currently in skill set; documented inline as bash comment with the # alias-only -- pinning unavailable <date> convention spec-generator will use in Plan 03
- [Phase 35-model-selection-discipline]: Spec-generator embeds the lint regex verbatim rather than paraphrasing — same floating-suffix alternation (-latest|:latest|-beta) in subagent self-check AND in lint-skills.sh, giving emission-time + review-time double guard against MSEL-02 violations
- [Phase 35-model-selection-discipline]: Snapshot Pinning + Cascade Emission land as H4 subsections under the existing ### Model H3 (not as new H3 sections and not in Constraints) — positions pinning adjacent to model format guidance so the LLM reads them as extensions of the Model rule
- [Phase 35-model-selection-discipline]: Cascade block template uses literal `DATED-SNAPSHOT` placeholder — substituted at generation time; the placeholder string itself does NOT carry any of the three rejected suffixes so it stays lint-clean while instructing the LLM to replace with real dated IDs
- [Phase 35-model-selection-discipline]: Researcher Model Selection Policy: capable-first primary, budget alternatives tagged 'after quality baseline run', cascade-candidate flag emitted only on explicit cost-optimization requests, quality-equivalence experiment mandatory with approved: false default until Phase 42 runtime
- [Phase 35-model-selection-discipline]: Default quality-equivalence tolerance is 5 percentage points Pass-rate delta — concrete default prevents vague downstream spec-generator instructions; user-overridable during discussion
- [Phase 35-model-selection-discipline]: Separation of concerns across MSEL-01/02/03: researcher owns recommendation ORDERING + CASCADE DISCIPLINE, spec-generator owns SNAPSHOT PINNING — each skill enforces exactly one layer
- [Phase 35-model-selection-discipline]: Capable Tier Lookup seeded in orqai-model-catalog.md (MSEL-01) with static 4-row table + MCP models-list live-validation gate; WARNING preserved verbatim
- [Phase 35-model-selection-discipline]: Phase 35 mechanically verified COMPLETE: full-suite lint green across 5 rules × 33 skill files, snapshot-pinned-models rule differentiates positive/negative fixtures, protected-pipeline SHA-256 check 3/3 matches, 16/16 MSEL policy-text phrase anchors present, 35-05-VERIFICATION.md captures full evidence trail with 3-row MSEL traceability + 4-row ROADMAP criteria checklist
- [Phase 35-model-selection-discipline]: Phase-close VERIFICATION.md pattern (from 34-05) reused: captured silent-on-success lint output + negative-fixture intentional FAIL captured verbatim + ROADMAP success-criteria checklist marks LLM-behavior criteria (1+3) as 'file-level ✓ with manual LLM smoke deferred to /gsd:verify-work' rather than overstating mechanical proof
- [Phase 36-lifecycle-slash-commands]: [Phase 36 Plan 02]: LCMD thin-command template locked — banner + SKST-9 + MCP-first with REST fallback + --identity stub pattern (parse-only + TODO(OBSV-07) warning, no filtering) — carries to plans 03-06
- [Phase 36-lifecycle-slash-commands]: [Phase 36 Plan 02]: Full trace IDs never truncated — contract reinforced as NEVER constraint + Anti-Pattern row; errors-first stable sort (status error before ok, then started_at desc) is non-negotiable per LCMD-02
- [Phase 36-lifecycle-slash-commands]: [Phase 36 Plan 02]: MCP-first, REST fallback, never-fabricate — on MCP error surface raw error + attempt curl GET /v2/traces with ORQ_API_KEY; STOP if REST also fails, never synthesize trace rows
- [Phase 36-lifecycle-slash-commands]: analytics.md defaults --last to 24h and requires --group-by to be explicit (no default) — flat total is safest/cheapest output, breakdown requires user intent
- [Phase 36-lifecycle-slash-commands]: MCP-first with verbatim REST curl fallback on error — never fabricate an analytics table when MCP fails; surface the fallback command inline so the user can retry out-of-band
- [Phase 36-lifecycle-slash-commands]: Cost output always prefixed with USD $ symbol and 2-decimal precision; error rate always suffixed with % and 1-decimal precision — prevents unit confusion on operator-facing metrics
- [Phase 36-lifecycle-slash-commands]: [Phase 36-lifecycle-slash-commands P06] automations.md two-mode split: list (read-only) + --create (AskUserQuestion 4-field collect → yes/no confirm → MCP-first-with-REST-fallback POST). Pattern reusable for any future list+mutate slash command.
- [Phase 36-lifecycle-slash-commands]: [Phase 36-lifecycle-slash-commands]: Stateless quickstart — no .quickstart-progress sidecar file; users own their progress so there is no drift risk between repo state and tour state (confirms 36-CONTEXT.md Claude's Discretion)
- [Phase 36-lifecycle-slash-commands]: [Phase 36-lifecycle-slash-commands]: 12 Step sections rendered as H2 with exact prefix '## Step N:' so VALIDATION grep anchor passes structurally without a custom lint rule
- [Phase 36-lifecycle-slash-commands]: [Phase 36-lifecycle-slash-commands]: LCMD-05 + LCMD-07 consolidated into a single quickstart.md (not two files) — overlapping deliverables (onboarding + 12-step tour) share one first-impression surface
- [Phase 36-lifecycle-slash-commands]: [Phase 36-lifecycle-slash-commands]: LCMD-04 /orq-agent:models renders types in fixed order (chat > embedding > image > rerank > speech > completion > Other); rare/future types bucket under single 'Other' H4 rather than spawning sparse subsections
- [Phase 36-lifecycle-slash-commands]: [Phase 36-lifecycle-slash-commands]: LCMD-04 keeps Activated column rendered even when payload lacks activation state (shows '?'); prevents silent 'yes' assumption when MCP list_models response omits the field
- [Phase 36-lifecycle-slash-commands]: [Phase 36-lifecycle-slash-commands]: LCMD read-only lookup commands (models) use single positional [search-term] with no flags; dynamic 'MCP tools used:' footer reflects actual path(s) taken (list_models / search_entities / REST fallback) for debuggability
- [Phase 36-lifecycle-slash-commands]: [Phase 36-lifecycle-slash-commands]: MSEL-02 snapshot-pinning discipline extended from YAML model: lines (lint-enforced) to prose table examples (consistency-only); LCMD-04 models.md emits dated snapshots like claude-sonnet-4-5-20250929 and gpt-4o-2024-11-20 in illustrative tables even though lint regex does not fire on prose
- [Phase 36-lifecycle-slash-commands]: [Phase 36-lifecycle-slash-commands]: /orq-agent:workspace analytics window is fixed at 24h — drill-down (7d/30d, group-by) deferred to /orq-agent:analytics command
- [Phase 36-lifecycle-slash-commands]: [Phase 36-lifecycle-slash-commands]: Read-only MCP commands use no subagent — inline execution matches help.md pattern (MCP calls + deterministic table rendering, no multi-step reasoning to isolate)
- [Phase 36-lifecycle-slash-commands]: [Phase 36-lifecycle-slash-commands]: Zero-entities render rule — empty section prints H3 with (0) and single em-dash row | — | — | — | — |, so "empty" is visually distinct from "filter-omitted"
- [Phase 36-lifecycle-slash-commands]: Phase 36 commands grouped under a new H3 '### Phase 36 (Lifecycle Slash Commands)' placed AFTER the existing V2.0 Commands table — keeps historical phase grouping pattern and avoids reshuffling legacy rows
- [Phase 36-lifecycle-slash-commands]: help.md pipeline-order = discovery/monitoring first (workspace/traces/analytics/models) then onboarding (quickstart) then governance (automations), with /orq-agent:help terminal — alphabetical ordering would lose the mental-model signal
- [Phase 36-lifecycle-slash-commands]: Index-wiring recipe locked: when adding N new commands, touch exactly two files (SKILL.md + help.md) and never the 3 protected entry points (orq-agent.md/prompt.md/architect.md) — reusable for every future V3.0 phase that adds commands
- [Phase 36-lifecycle-slash-commands]: Phase 36 mechanically COMPLETE: 8/8 plans closed, 7/7 LCMD-01..07 requirements file-level verified via SKST lint + protected-pipeline SHA-256 + 16 phrase anchors; 36-08-VERIFICATION.md captures full evidence trail with LCMD traceability and ROADMAP criteria checklist; ready for /gsd:verify-work 36 (3 manual smokes: MCP round-trip, UX flow, POST /v2/trace-automations)
- [Phase 36-lifecycle-slash-commands]: Phase-close VERIFICATION.md pattern (from 34-05 and 35-05) reused verbatim for 36-08 — captured green output + requirement traceability + ROADMAP criteria checklist + inventory + deferred items + sign-off; third consecutive V3.0 phase to close mechanically, establishing the pattern as canonical for phases 37-43
- [Phase 37-observability-setup-skill]: Per-skill resources/ subdirectory for observability uses single-level commands/*.md glob in lint-skills.sh — no exclusion rule needed, resources/ auto-excluded (OBSV-03, SKST-02)
- [Phase 37-observability-setup-skill]: Every framework snippet enforces instrumentors-BEFORE-SDK ordering via CRITICAL code comment — grep anchor 'BEFORE' becomes the OBSV-03 verification surface
- [Phase 37-observability-setup-skill]: observability.md ships as single-file skill (242 lines, under 400-line threshold); no subagent extraction needed for OBSV-01/02/04/05/06 + OBSV-07 forward-reference
- [Phase 37-observability-setup-skill]: OBSV-07 retrieval surface closed: --identity wired as MCP pass-through + client-side fallback over trace.metadata/attributes/customer_id; zero-match hint links back to /orq-agent:observability Step 7
- [Phase 37-observability-setup-skill]: Plan 04 index-wiring: grep -c line-count anchor satisfied via inline 7-bullet OBSV-01..07 coverage block below Phase 37 table (line-count 4->8), not via row-splitting — adds genuine reader value at suite-index layer
- [Phase 37-observability-setup-skill]: V3.0 index-wiring recipe reused verbatim in Phase 37 — edit exactly SKILL.md + help.md, add new Phase N (Subsystem) H3 after prior block, never touch orq-agent.md/prompt.md/architect.md; SHA-256 3/3 guard holds
- [Phase 37-observability-setup-skill]: Phase 37 mechanically COMPLETE: 5/5 plans closed, 7/7 OBSV-01..07 requirements file-level verified via SKST lint + MSEL-02 + protected-pipeline SHA-256 (3/3) + 7 grep anchors + TODO(OBSV-07) eradicated; 37-05-VERIFICATION.md captures full evidence trail; ready for /gsd:verify-work 37 (3 manual smokes: end-to-end trace, --identity filter, PII scan)
- [Phase 37-observability-setup-skill]: 4th consecutive V3.0 phase (34/35/36/37) closed under canonical phase-close VERIFICATION.md pattern — captured green output + requirement traceability + ROADMAP criteria checklist + inventory + deferred items + sign-off; pattern now proven reusable for phases 38-43
- [Phase 37-observability-setup-skill]: Forward-reference resolution pattern established: when a prior phase parks TODO(XXXX-NN) markers, the consuming phase's phase-close VERIFICATION.md elevates eradication to an explicit named gate (Gate 8 here) rather than an implicit grep — makes the forward-reference audit trail reproducible
- [Phase 38-trace-failure-analysis-skill]: Phase 38 resources land under commands/trace-failure-analysis/resources/ per Phase 34 Resources Policy; content is freeform prose because lint default glob (commands/*.md single-level) auto-excludes resources/
- [Phase 38-trace-failure-analysis-skill]: First-upstream-failure rule (TFAIL-03) framed with explicit 3-span cascade example in grounded-theory-methodology.md — prevents rate-inflation anti-pattern visceral
- [Phase 38-trace-failure-analysis-skill]: Classification mutual-exclusivity tiebreaker = upstream-fix-first (prefer specification over generalization-* when both fit); multi-mode handoff ordering trivial-bug then specification then code-checkable then subjective
- [Phase 38-trace-failure-analysis-skill]: Per-skill resources (grounded-theory-methodology.md, failure-mode-classification.md, handoff-matrix.md) referenced by path in Plan 01 skill body; actual creation deferred to Plan 02 per phase parallel_safety invariant
- [Phase 38-trace-failure-analysis-skill]: trace-failure-analysis.md emits zero model: YAML lines (it operates on queried traces, not authored specs) — MSEL-02 clean by construction; prose snapshot examples like claude-sonnet-4-5-20250929 are fine because the MSEL-02 regex only fires on model: YAML lines
- [Phase 38-trace-failure-analysis-skill]: Phase 38 index-wiring recipe applied verbatim (SKILL.md + help.md + traces.md only; protected pipelines 3/3 SHA-256 intact) — 4th V3.0 phase to reuse the recipe without modification
- [Phase 38-trace-failure-analysis-skill]: help.md pipeline-order for Phase 38: /orq-agent:trace-failure-analysis slotted between /orq-agent:observability and /orq-agent:automations — diagnose-before-fix (instrument → analyze → automate)
- [Phase 38-trace-failure-analysis-skill]: TODO(TFAIL) eradication scoped to traces.md only in Plan 03; observability.md marker remains for Phase 37 surface owner to resolve — prevents cross-phase scope creep
- [Phase 38-trace-failure-analysis-skill]: Phase 38 closed under canonical VERIFICATION.md pattern — 5th consecutive V3.0 phase (34/35/36/37/38); 8/8 mechanical gates green, 6/6 TFAIL requirements file-level verified, 4 manual smokes deferred to /gsd:verify-work 38
- [Phase 39-dataset-generator-enhancements]: DSET-01..08 sections inserted between Self-Validation Checklist and <examples> block in dataset-generator.md — keeps checklist adjacent to generation body; Constraints block append-only (DSET-01 + DSET-08); resources/ creation deferred to downstream plan
- [Phase 39-dataset-generator-enhancements]: datasets.md Step 1b Mode Dispatch pattern: when a slash command grows from 1 to N modes, insert a dispatch step between input-capture and clarification so each mode's skip/add semantics are declared in one grep-anchorable place — avoids scattering conditionals across Steps 2-5
- [Phase 39-dataset-generator-enhancements]: DSET-08 --trace-id precondition double-guarded: enforced at Step 0 parse-time AND re-stated in Step 1b promote-trace branch + Constraints ALWAYS rule — aligns with no-MCP-call-without-trace-id invariant
- [Phase 39-dataset-generator-enhancements]: datasets.md <pipeline> block is editable (NOT in 3-file protected list — only orq-agent.md/prompt.md/architect.md are SHA-256 guarded per Phase 34); Step 1b added INSIDE <pipeline> preserving natural Step-numbered reading flow while leaving 3/3 golden hashes untouched
- [Phase 39-dataset-generator-enhancements]: Dataset-generator single-consumer resources/ subdir created with 8-vector catalog + coverage-rules (verbatim 'Coverage check failed:' phrase) + single/multi-turn/rag shape templates; all 15 grep anchors green, lint + protected-pipelines 3/3 SHA-256 clean
- [Phase 39-dataset-generator-enhancements]: help.md datasets flag summary split onto continuation line to preserve banner column alignment
- [Phase 40-kb-memory-lifecycle]: KB manifest.json pattern: per-file JSON describing chunking_strategy, chunk_size, overlap, reason — consumed by kb.md Step 7.1.5/7.6
- [Phase 40-kb-memory-lifecycle]: Chunking classification heuristic: H2/H3 density per 1000 lines, threshold 5 → structured (recursive), else prose (sentence)
- [Phase 40-kb-memory-lifecycle]: Embedded KB-vs-Memory Decision Rule verbatim in memory-store-generator subagent as lint anchor (KBM-04) rather than cross-referencing
- [Phase 40-kb-memory-lifecycle]: kb/resources/ single-consumer subdir parks 3 long-form policy docs (chunking, KB-vs-Memory, retrieval test) per Phase 34 Resources Policy — freeform prose, auto-excluded from SKST lint by commands/*.md single-level glob
- [Phase 40-kb-memory-lifecycle]: Applied V3.0 index-wiring recipe for Phase 40 — only SKILL.md + help.md touched, protected pipelines 3/3 intact, subagent count 17 -> 18, 4th per-skill resources dir registered under kb skill umbrella
- [Phase 40-kb-memory-lifecycle]: Phase 40 closed with 6th consecutive canonical-phase-close VERIFICATION.md; 4 manual smokes deferred to /gsd:verify-work 40
- [Phase 41-prompt-optimization-cross-framework-comparison]: Fixed lowercase kebab-case lint-anchor slugs (role..recap) verbatim in 11-guidelines.md so skill output + /orq-agent:analytics can join on exact strings.
- [Phase 41-prompt-optimization-cross-framework-comparison]: Included both baseline and --isolate-model evaluatorq variants in TS + Python templates to document fairness-check relaxation in-template.
- [Phase 41-prompt-optimization-cross-framework-comparison]: Captured verbatim gate stdout in 41-05-VERIFICATION.md (not summarized) to preserve audit-diffable trail
- [Phase 41-prompt-optimization-cross-framework-comparison]: Deferred POPT-04 live version creation and XFRM-03 end-to-end cross-framework run to /gsd:verify-work 41 manual-smoke batch
- [Phase 42]: Phase 42 Plan 02: failure-diagnoser classifies every failure into specification/generalization/dataset/evaluator BEFORE diagnosis; enforces outcome-based grading (no path grading); splits iteration-proposals.json into changes[] + dataset_quality_issues[] + evaluator_quality_issues[] — Closes ESCI-01/02/08; layer-separated action arrays route fixes to correct consumer (prompt-editor vs dataset-generator vs evaluator-validator)
- [Phase 42]: Tester.md gains isolated graders (tool selection / argument quality / output interpretation), capability-to-regression graduation after 2 green runs, overfitting guard at ≥98% on <100 datapoints, and per-iteration run-comparison table
- [Phase 42-evaluator-validation-iterator-enrichments]: Hardener TPR/TNR gate reads evaluator-validator JSON; unvalidated custom evaluators downgraded to settings.evaluators (monitoring-only) instead of hard-fail — Preserves visibility without blocking production on unvalidated judges; concerns separated between data collection (evaluator-validator) and enforcement (hardener)
- [Phase 42-evaluator-validation-iterator-enrichments]: sample_rate derived from 7-day median volume at harden time (100%/30%/10%); safety evaluators override to 100%; no-data fallback = 100% — Volume-driven tradeoff balances LLM-judge cost vs coverage; safety is non-negotiable at every tier
- [Phase 42-evaluator-validation-iterator-enrichments]: Prevalence correction (theta_hat) guarded by TPR+TNR>1; below threshold report raw with warning instead of misleading corrected number — Formula is mathematically unsafe when judge is worse than random; explicit warning preserves trust
- [Phase 42]: Evaluator-validator records measured TPR/TNR; hardener Phase 2.0 enforces 0.90 floor — separation of measurement from policy
- [Phase 42]: 50/50 Annotation Queue polling floor (EVLD-09) — Exceeds EVLD-06 30/30 statistical minimum to absorb IAA filtering loss without stalling TPR/TNR validation
- [Phase 42]: Prevalence-correction refuses to render when Youden index <= 0 (EVLD-07) — Judge with TPR+TNR <= 1 is worse than random; applying formula yields negative/undefined theta_hat; show N/A and re-calibrate link instead of misleading number
- [Phase 42]: 4-component judge template enforces reasoning-before-verdict in JSON contract (EVLD-03) — Autoregressive decoders commit to first token; forcing reasoning to precede verdict locks in CoT analysis before pass/fail commitment
- [Phase 42]: 42-08: V3.0 index-wiring recipe reused — edited only SKILL.md (help.md untouched since Phase 42 adds no new user-facing command); protected pipelines 3/3 SHA-256 intact
- [Phase 42-evaluator-validation-iterator-enrichments]: Phase 42 mechanically COMPLETE (9/9) — 28/28 anchors file-level verified; 4 behaviors deferred to /gsd:verify-work 42 manual-smoke batch (EVLD-06/09, ITRX-04/08)
- [Phase 42-evaluator-validation-iterator-enrichments]: Phase-close VERIFICATION.md pattern canonicalized — 8th consecutive V3.0 application (34/35/36/37/38/40/41/42); template reusable verbatim for Phase 43 DIST

### Blockers/Concerns

None.

### Quick Tasks Completed

| # | Description | Date | Commit | Status | Directory |
|---|-------------|------|--------|--------|-----------|
| 260319-cbi | Strip dropped code directories and update planning docs for CLI-only focus | 2026-03-19 | 7cfa1d4 | | [260319-cbi-strip-web-interface-supabase-and-vercel-](./quick/260319-cbi-strip-web-interface-supabase-and-vercel-/) |
| 260323-c2b | Remove dropped web pipeline artifacts from planning docs | 2026-03-23 | fd8b91b | Verified | [260323-c2b-remove-web-pipeline-keep-only-claude-cod](./quick/260323-c2b-remove-web-pipeline-keep-only-claude-cod/) |
| 260323-bzl | Assess all 17 pipeline agents for browser automation relevance (V4.0 Browserless.io) | 2026-03-23 | 497f85c | Superseded by ep2 | [260323-bzl-beoordeel-pipeline-agents-met-browserles](./quick/260323-bzl-beoordeel-pipeline-agents-met-browserles/) |
| 260323-ep2 | Rewrite assessment with workflow-discovery + workflow-builder model (replaces SOP-dependent approach) | 2026-03-23 | 260ac19 | Verified | [260323-ep2-herschrijf-browser-automation-assessment](./quick/260323-ep2-herschrijf-browser-automation-assessment/) |
| 260323-ey0 | Neutralize skill set for public repo: systems.md registry, browser automation installer prompt, zero IT-specific refs | 2026-03-23 | 5e944d6 | Verified | [260323-ey0-neutralize-skill-set-for-public-repo-ext](./quick/260323-ey0-neutralize-skill-set-for-public-repo-ext/) |
| 260323-gex | Create /orq-agent:systems command for managing IT systems registry (list/add/remove) | 2026-03-23 | 5946bae | Verified | [260323-gex-create-orq-agent-systems-command-for-man](./quick/260323-gex-create-orq-agent-systems-command-for-man/) |
| 260325-r2j | Apply 6 experiment learnings to agent specs and reference files (json_schema, two-evaluator, portionOptimizer, KB heuristic, API pitfalls) | 2026-03-25 | b528587 | | [260325-r2j-apply-orq-ai-experiment-learnings-to-age](./quick/260325-r2j-apply-orq-ai-experiment-learnings-to-age/) |
| 260326-ann | Apply all 21 pipeline optimizations (evaluators, deploy, testing, specs, architecture) | 2026-03-26 | 17b7d4e | Verified | [260326-ann-apply-all-21-pipeline-optimizations-eval](./quick/260326-ann-apply-all-21-pipeline-optimizations-eval/) |

### Pending Todos

None yet.

## Session Continuity

Last session: 2026-04-21T06:07:50.886Z
Stopped at: Completed 42-09-PLAN.md — Phase 42 mechanically COMPLETE
Resume with: `/gsd:verify-work 34` to verify Phase 34 close, then `/gsd:plan-phase 35` for Model Selection Discipline.
Resume file: None
