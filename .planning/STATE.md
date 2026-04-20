---
gsd_state_version: 1.0
milestone: v0.3
milestone_name: milestone
status: verifying
stopped_at: "Completed 36-08-PLAN.md — Phase 36 mechanically COMPLETE; full-suite verification sweep captured in 36-08-VERIFICATION.md; ready for /gsd:verify-work 36"
last_updated: "2026-04-20T16:15:02.425Z"
last_activity: "2026-04-20 — Phase 36 Plan 08 complete: full-suite verification sweep executed and 36-08-VERIFICATION.md produced as /gsd:verify-work evidence trail; all gates green, Phase 36 mechanically COMPLETE (third consecutive V3.0 phase to close mechanically)"
progress:
  total_phases: 10
  completed_phases: 3
  total_plans: 18
  completed_plans: 18
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-20)

**Core value:** Any colleague can go from a use case description to deployed, tested agents on Orq.ai -- through an automated pipeline with real-time visibility and HITL approvals -- without needing to understand the underlying AI platform.
**Current focus:** V3.0 Lifecycle Completeness & Eval Science — Phase 36 Lifecycle Slash Commands mechanically COMPLETE (8/8 plans, 7/7 LCMD reqs); next: /gsd:verify-work 36 (3 manual smokes: MCP round-trip, UX flow, POST /v2/trace-automations) then /gsd:plan-phase 37 (Observability Setup, OBSV)
**Previous milestones:** v0.3 shipped 2026-03-01 (11 phases, 28 plans), V2.0 shipped 2026-03-02 (7 phases, 11 plans), V2.1 shipped 2026-03-13 (8 phases, 9 plans)

## Current Position

Phase: 36 - Lifecycle Slash Commands (MECHANICALLY COMPLETE — 8/8 plans closed)
Plan: 08 complete — full verification sweep captured in 36-08-VERIFICATION.md (203 lines) with 7-row LCMD-01..07 traceability + 5-row ROADMAP Phase 36 success-criteria checklist; captured green output: full-suite lint exit 0, protected-pipelines 3/3 SHA-256 matches, 6/6 per-file lints exit 0, 16/16 LCMD phrase anchors PASS; manual smokes deferred to /gsd:verify-work 36 per 36-VALIDATION.md §Manual-Only Verifications (MCP round-trip, UX flow, POST /v2/trace-automations)
Status: Phase 36 mechanically COMPLETE — LCMD-01..07 all grep/lint verified across 6 new command files; protected pipelines still byte-identical (3/3 SHA-256 matches); SKILL.md + help.md cross-wiring verified; ready for /gsd:verify-work 36 (3 manual smokes) and then /gsd:plan-phase 37 (Observability Setup, OBSV)
Last activity: 2026-04-20 — Phase 36 Plan 08 complete: full-suite verification sweep executed and 36-08-VERIFICATION.md produced as /gsd:verify-work evidence trail; all gates green, Phase 36 mechanically COMPLETE (third consecutive V3.0 phase to close mechanically)

Progress: V3.0 Phase 34 COMPLETE (5/5). V3.0 Phase 35 mechanically COMPLETE (5/5). V3.0 Phase 36 mechanically COMPLETE (8/8). Next V3.0 phases (37-43) inherit SKST + MSEL-02 + protected-pipeline invariants.

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

Last session: 2026-04-20T16:11:36.008Z
Stopped at: Completed 36-08-PLAN.md — Phase 36 mechanically COMPLETE; full-suite verification sweep captured in 36-08-VERIFICATION.md; ready for /gsd:verify-work 36
Resume with: `/gsd:verify-work 34` to verify Phase 34 close, then `/gsd:plan-phase 35` for Model Selection Discipline.
Resume file: None
