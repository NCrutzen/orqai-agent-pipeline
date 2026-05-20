---
gsd_state_version: 1.0
milestone: v8.0
milestone_name: Agentic Platform
status: Ready to execute
stopped_at: Phase 82.9 context gathered
last_updated: "2026-05-20T05:48:42.171Z"
progress:
  total_phases: 21
  completed_phases: 12
  total_plans: 63
  completed_plans: 63
  percent: 57
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-12)

**Core value:** Production AI automations on Orq.ai serving Moyne Roberts operators — debtor-email today, sales-email and beyond after v8.0 closure. (V3.0/V4.0/V6.0 browser-UI swarm-builder thesis abandoned 2026-03-25.)
**Current focus:** Phase 82.9 CLOSED 2026-05-20 (code-side). All 4 plans landed: Zod extension (01), resolver+writer discriminated `inputs` (02), audit-types+mapper (03), Stage2EvidencePanel UI rewrite (04). Two human-action checkpoints documented: Zap edit + prod migration apply (01-T3) and panel visual UAT (04-T3). v8.0 closure now waits only on 999.8 operator UAT, then `/gsd-audit-milestone v8.0`.
**Previous milestones:** v0.3 (2026-03-01), V2.0 (2026-03-02), V2.1 (2026-03-13), V7.0 (2026-04-30). V3.0/V4.0/V5.0/V6.0 abandoned per 2026-03-25 pivot.

## Current Position

Phase: 82.9 (Stage 2 audit-panel evidence expansion) — COMPLETE (code-side); operator checkpoints pending
Plan: 4 of 4 + VERIFICATION.md
Next phase: `/gsd-audit-milestone v8.0` (gated on 82.9 closure + 999.8 UAT)
Milestone: v8.0 Agentic Platform (Phases 63-82.8, 83)
Last shipped: Phase 83 (2026-05-19) — body_full_text + body_unique_text columns; conversation_context table; ingest writers + Stage 1/3 readers wired; 30-day backfill ran (1344 priors written); verify-phase83 harness shipped; V1 PASS, V2 PASS-with-noise-floor, V3/V4 PARTIAL pending live traffic. Pre-this: Phase 82.8 (2026-05-18) Stage 4 three-section overview + Stage 1 before/after screenshot strip.

**v8.0 closure punch list (gates before /gsd-audit-milestone v8.0):**

- [x] Phase 82.2: Stage 0 telemetry coverage fix — SHIPPED (verified via git log)
- [x] Phase 82.3: Per-stage audit surface — SHIPPED
- [x] Phase 82.4: Feedback capture form — SHIPPED
- [x] Phase 82.8: Stage 4 handled overview + Stage 1 before/after screenshots — SHIPPED
- [x] Phase 83: Body ingestion — capture full thread on forwards and replies — SHIPPED 2026-05-19 (1344 priors backfilled; V1/V2 green within noise-floor; V3/V4 PARTIAL pending live traffic — see 83-07-VERIFICATION.md)
- [x] Phase 82.9: Stage 2 audit-panel evidence expansion — SHIPPED 2026-05-20 (4/4 plans, 50/50 tests green; 2 human-action checkpoints documented: Zap UI edit + prod migration apply, panel visual UAT)
- [ ] Phase 999.8: 2 outstanding browser smokes — operator UAT pending

**v8.0 reframes (locked 2026-05-12):**

- Phase 72 (Promotion Recommender) → **V9.0** full milestone (prose-feedback synthesis)
- Phase 73 (sales-email validation) → **V10.0** full milestone (Phase 78 never executed)
- Phase 77 (Stage 2/3 e2e verification) → **superseded by Phase 82.3** + debtor-person operator onboarding

**Next milestones defined (see `.planning/MILESTONES.md`):**

- V9.0 Promotion Recommender + Learning Inbox (depends on v8.0 closure)
- V10.0 Sales-email canonical pipeline (depends on V9.0 capture surface live)
- V11.0 Intent-prioritised handlers (depends on V10.0 multi-swarm signal)

**Next action:** `/gsd-audit-milestone v8.0` — punch list reconciled, ready for milestone close.

## Performance Metrics

**Velocity:**

- Total plans completed: 18
- Average duration: --
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 59 | 3 | - | - |
| Phase 63 P01 | 3m 25s | 3 tasks | 3 files |
| Phase 63 P02 | 5m | 5 tasks | 5 files |
| Phase 63 P03 | 2m | 4 tasks | 3 files |
| Phase 65 P02 | 927s | 5 tasks | 8 files |
| Phase 65 P03 | 482s | 2 tasks | 9 files |
| Phase 66 P02 | 7m | 2 tasks | 10 files |
| Phase 66 P04 | 3 minutes | 3 tasks | 1 files |
| Phase 67 P03 | 10m | 3 tasks | 3 files |
| Phase 67 P06 | 18 | 3 tasks | 6 files |
| Phase 70 P05 | 12m | 2 tasks | 2 files |
| Phase 70 P06 | 6 | 2 tasks | 3 files |
| Phase 74 P02 | 10min | 3 tasks | 5 files |
| Phase 74 P05 | 20m | 3 tasks | 2 files |
| Phase 76 P03 | 12m | 3 tasks | 4 files |
| Phase 76 P05 | 25m | 3 tasks | 8 files |
| Phase 76 P06 | 25m | 4 tasks | 13 files |
| Phase 76 P07 | 8m | 3 tasks | 7 files |
| Phase 76 P08 | 30m | 2 tasks | 5 files |
| 76 | 8 | - | - |
| Phase 999.7 P01 | 3m | 3 tasks | 11 files |
| Phase 999.7 P02 | 2 | 2 tasks | 3 files |
| Phase 999.7 P03 | 4 | 2 tasks | 2 files |
| Phase 80 P01 | 12m | 3 tasks | 4 files |
| Phase 80 P02 | 4m | 2 tasks | 5 files |
| Phase 80 P03 | 10m | 2 tasks | 4 files |
| Phase Phase 80 PP04 | 4m | 1 task tasks | 1 file files |
| Phase 80 P05 | 10m | 1 tasks | 1 files |
| Phase 80 P06 | 8m | 1 tasks | 1 files |
| Phase 81 P01 | 8m | 2 tasks | 30 files |
| Phase 81 P02 | 5min | 3 tasks | 4 files |
| Phase 81 P02 | 4m | 3 tasks | 4 files |
| Phase 81 P03 | 12m | 3 tasks tasks | 7 files files |
| Phase 81 P03 | 8m | 3 tasks | 9 files |
| Phase 81 P04 | 4m | 3 tasks | 5 files |
| Phase 81 P04 | 8m | 3 tasks | 4 files |
| Phase 82 P01 | 12m | 3 tasks tasks | 15 files files |
| Phase 82 P02 | 4m | 1 task tasks | 2 files files |
| Phase 82 P03 | 10min | 1 tasks | 2 files |
| Phase 82 P04 | 8m | 2 tasks | 8 files |
| Phase 82 P05 | 12 | 1 tasks | 11 files |
| Phase 82 P06 | 25m | 2 tasks | 14 files |
| Phase 82.1 P01 | 2min | 1 tasks | 1 files |
| Phase 82.1 P02 | 10min | 2 tasks | 2 files |
| Phase 82.1 P03 | 3m | 2 tasks | 2 files |
| Phase 82.1 P04 | 12 | 3 tasks | 8 files |
| Phase 82.3 P01 | 3min | 1 tasks | 1 files |
| Phase 82.3 P05 | 8 | 2 tasks | 4 files |
| Phase 82.3 P06 | 4min | 1 tasks | 2 files |
| Phase 82.3 P07 | 6m | 2 tasks | 4 files |
| Phase 82.3 P08 | 8min | 1 tasks | 2 files |
| Phase 82.3 P09 | 105 | 2 tasks | 6 files |
| Phase 82.4 P01 | 5m | 2 tasks tasks | 1 file files |
| Phase 82.4 P02 | 8m | 2 tasks tasks | 2 files files |
| Phase Phase 82.4 P07 P07 | 6m | 3 tasks tasks | 3 files files |
| Phase 82.4 P05 | 8m | 2 tasks tasks | 2 files files |
| Phase Phase 82.4 PP03 | 12m | 2 tasks tasks | 6 files files |
| Phase 82.4 P06 | 25min | 2 tasks | 5 files |
| Phase 82.4 P04 | 12m | 2 tasks | 5 files |
| 82.4 | 7 | - | - |
| Phase 82.5 P02 | 4m | 2 tasks | 4 files |
| Phase 82.5 P04 | 3m | 1 tasks | 1 files |
| Phase 82.5 P03 | 5min | 3 tasks | 2 files |
| Phase 82.5 P05 | PT15M | 3 tasks | 3 files |
| Phase 82.5 P07 | 84 | 2 tasks | 2 files |
| Phase 82.7.1 P02 | 4m | 1 tasks | 1 files |
| Phase 82.7.1 P05 | 5m | 2 tasks | 1 files |

## Accumulated Context

| Phase 48 P01 | 3min | 2 tasks | 9 files |

### Roadmap Evolution

- Phase 60 added: Debtor email — close the whitelist-gate loop (data-driven AUTO_ACTION_RULES with Wilson-CI auto-promotion cron + queue-driven Bulk Review UI reading automation_runs status=predicted directly)
- Phase 61 added: Restore lost bulk-review UX (60-05 regression fix) — horizontal overflow, email-body expander, per-row notes, rule-hint dropdown / per-item override on top of the new tree-driven shell
- Phase 62 added: classifier-rules-readability — group dashboard rules per category, sectioneer no_match as system row, show human-readable labels + code-permalinks to classify.ts, add overlap-lint warning when seeding new candidates. Cosmetic + ergonomic; promotion-machinerie (Wilson CI per rule_key) blijft ongemoeid.
- Phase 74 added: Stage 1 LLM Category Classifier (swarm-agnostic) — fills the missing Stage 0 → Stage 1 LLM seam exposed during Phase 71 UAT. New Orq agent stage-1-category-classifier (Haiku-class, registry-driven via swarm_categories) + new classifier-screen-worker Inngest function listening on classifier/screen.requested, emits classifier/verdict.recorded with Phase 70 dual-write so verdict-worker dispatches per swarm_categories.action. Cross-swarm reusable for sales-email and future swarms.
- Phase 76 added: Stage 3 → Kanban human-lane wiring (unhandled-intent triage surface). Wires the existing Stage 3 intent coordinator output into a "needs human" Kanban lane when (a) no Stage 4 handler is registered for the picked intent, (b) Stage 3 returns low confidence, or (c) a Stage 4 handler errored. Lane reuses existing automation_runs status='pending'. Two operator actions: Close (resolved manually) and Replay through Stage 4 (re-emit handler_event after operator picks/edits the intent). Depends on Phase 75 noise-vs-intent registry split (shipped 2026-05-07 via 66c0379). Output: every email that leaves Stage 1 either reaches a registered Stage 4 handler OR lands in the Kanban human lane with a clear reason — zero silent dead-letters.
- Phase 77 added: Stage 2 / Stage 3 end-to-end verification (debtor-email). No new handlers. Confirm label-resolver maps customers correctly to iController (≥90% on non-noise); confirm Stage 3 produces sensible ranked intents on a manually-graded 50-email sample. Bugs surfaced fixed in this phase, no carryover. Depends on Phase 76 (Kanban visibility prereq).
- Phase 78 added: Sales-email Stage 0→3 onboarding (verkoop@smeba.nl, ~15-25 emails/day). Registry-insert-only — if any cross-swarm worker needs swarm-specific branches, that's an architecture bug to fix here. Subsumes Phase 73. Runs in PARALLEL with Phase 77, depends on Phase 76 only.
- Phase 79 added: Learning loop — intent surfacing dashboard. Cross-swarm view of intent volumes, top-N picks, Stage 3 confidence distributions, operator override rates, Kanban-lane stuck-row counts by reason. Output is the input to v8.2's data-driven handler prioritization. Depends on 76+77+78.
- Milestone framing: Phases 76-79 form milestone v8.1 "Validation + Visibility" — observe → understand → THEN automate. v8.2 "Selective handler automation" follows, with phases picked from v8.1 data, not pre-planned.
- Phase 83 added (2026-05-19) to v8.1: Body ingestion — capture full thread on forwards and replies. Root cause for Stage 3's `general_inquiry` + `other` overcounts and most `payment_dispute` "empty body" rows: `web/lib/outlook/client.ts:207` prefers Graph `uniqueBody` (strips quoted history) over `body`. Evidence: `FW: Nieuwe opmerking…` row has `body_text=∅, body_html=∅, raw_json=[]`; Elger Re:Re: chains store only his reply, never the originating debtor message. Phase fixes the fetch priority, persists body_html + raw_json, adds body_full_text/body_unique_text columns, adds conversationId-aware fallback, backfills 90d. CONTEXT at `.planning/phases/83-body-ingestion-capture-full-thread-on-forwards-and-replies/83-CONTEXT.md`. Needs `/gsd-discuss-phase 83`.
- Phase 84 added (2026-05-19) to v8.1: Stage 1 noise rules for AP-automation FYI traffic. 9 deterministic FYI sender patterns reaching Stage 3 (Coupa PO/Betaald/Goedgekeurd, ISS PtP auto-reply, M365 quarantine, FrieslandCampina portal reject, FarmPlus bank-change, sender-side phishing notices, own-domain outbound loopback). Adds rows to `swarm_noise_categories`, introduces `swarms.tenant_domains` jsonb + codegen. Wilson-CI shadow gate before `auto_active`. Can run in parallel with 83. CONTEXT at `.planning/phases/84-stage-1-noise-rules-for-ap-automation-fyi-traffic/84-CONTEXT.md`. Needs `/gsd-discuss-phase 84`.
- Phase 85 added (2026-05-19) to v8.1: Stage 3 prompt v3 — intent definitions + per-intent few-shot + open-set output schema. Live `debtor-intent-agent` (`01KQECK191GE21CH8D8KEMTM9J`) has no per-intent descriptions and only 3 few-shot examples for 8 intents. Ships prompt v3 with `<intent_definitions>` block (6 boundary-pair rules: payment_dispute vs credit_request etc.), ≥8 corpus-sourced few-shot examples, and JSON-schema V3 adding `intent_proposal: string|null` + `proposal_reason: string|null`. `intent_version=2026-05-19.v3`. Closed-list `intent` enum unchanged; Stage 4 dispatch unaffected. Backward-compat parser in coordinator-orchestrator for V2/V3 dual-read. CONTEXT at `.planning/phases/85-stage-3-prompt-v3-intent-definitions-and-open-set-schema/85-CONTEXT.md`. Depends on 83. Needs `/gsd-discuss-phase 85`.
- Phase 86 added (2026-05-19) to v8.1: Open-set intent discovery — capture and cluster surface. Persists Phase 85's proposal fields in `coordinator_runs.ranked_intents` JSONB (no new column), new `intent_proposals_v1` view, new Bulk Review "Intent proposals" tab with Levenshtein-cluster centroid + sample emails per cluster + the closed-list intent the agent picked instead. **Read-only — no promotion button** (promotion is V9.0 Learning Inbox). Locks the principle: intent vocabulary emerges from LLM proposals + operator promotion, not hand-curation by Claude or engineer (memory `feedback-intent-vocab-emerges-from-data`). Cross-swarm by default. CONTEXT at `.planning/phases/86-open-set-intent-discovery-capture-and-cluster-surface/86-CONTEXT.md`. Depends on 85. Needs `/gsd-discuss-phase 86`.
- Phase 87 added (2026-05-19) to v8.1: Retro-classification + intent-volume baseline. Closes v8.1. Re-runs V3 Stage 3 agent against 30-90d of corpus emails (read from Supabase, not Graph — idempotent), produces falsifiable comparison report: pre-v8.1 vs post-v8.1 distribution. New `stage_3_retro_runs` table + `intent_volume_baselines` snapshot table read by V8.2/V9.0/V11.0. Hand-graded 20-row diff precision check. Acceptance carries Phase 83 D-07 forward (≥50% catch-all rows reclassify) plus Phase 84 verification (Coupa-PO/auto-reply/own-domain absent from Stage 3) plus Phase 86 (≥5 proposal clusters captured). CONTEXT at `.planning/phases/87-retro-classification-and-intent-volume-baseline/87-CONTEXT.md`. Depends on 83+84+85+86 all live. Needs `/gsd-discuss-phase 87`.
- v8.1 dependency graph: 83 ──> 85 ──> 86 ──> 87. 84 ──> 87 in parallel. v8.1 closes with `/gsd-audit-milestone v8.1` after 87 passes; output feeds V8.2 (handler picks) + V9.0 (Learning Inbox synthesis) + V11.0 (intent-prioritisation dashboard).
- Phase 81 added: Fold Stage 1 (Bulk Review) into the stage-keyed shell — closes the loop on Sketch 005 / Phase 76 D-04/D-05 (REVISED). Phase 76-08 explicitly chose option (A) "minimum churn" (re-export /review/page.tsx) over option (B) (wrap in _shell + StageTabStrip), so /stage-1 still renders the legacy "Bulk Review" chrome with no stage-tab strip and Pending Promotion sub-view never wires (?sub=pending pushed by QueueTree, but loadPageData reads ?tab=pending which the redirect rewrites away). Output: Stage 1 sits under the same shell as 0/3/4, "Bulk Review" stops being a UI noun, Pending Promotion sub-view actually renders, and a thin Stage 2 placeholder lets the registry-driven tab strip resolve.

### Decisions

- V7.0 uses parallel CSS namespace (--v7-*) to coexist with existing shadcn tokens
- Azure AD must use OAuth (not SAML) to auto-link existing email/password accounts
- Single Supabase Realtime subscription per swarm view, not per component
- Orq.ai data flows through Inngest cron to Supabase, never client-to-Orq.ai
- Ring buffers from day one for terminal stream and delegation graph (max 500 events)
- Design reference: docs/designs/agent-dashboard-v2.html
- V7 foundation tables use single migration file (logically coupled)
- Supabase Management API for migrations (proven reliable, no CLI dependency)
- [Phase 48]: V7 tokens in existing globals.css with --v7-* prefix, @custom-variant uses [data-theme='dark']
- Phase 63 RFC contract docs use verified migration line refs (agent_runs.corrected_category, email_labels.corrected_customer_account_id, draft_quality, feedback_reason); axes 2/3 forward-referenced to Phase 71
- 63-02: Stage 2 omitted Anthropic citation per plan permission (pre-LLM enrichment, not an Anthropic pattern)
- 63-02: Stage 3.5 escalation rendered as ASCII decision diamond + one-line spawn placeholder; full design deferred to Phase 65 per CONTEXT discretion
- 63-03: PROJECT.md verified clean of speculative brand names — D-09 preventive check passed without mutation
- 63-03: docs/agentic-pipeline/README.md is the canonical RFC entry point; CLAUDE.md updated to point at it primary, debtor-email doc demoted to swarm-specific implementation map
- Phase 65-02: Inline model.parameters.response_format on Orq REST API replaces Studio Tools UI ritual (verified end-to-end on 3 agents 2026-05-03)
- Phase 65-02: fallback_models lives at AGENT ROOT level on Orq PATCH; nested-form silently no-ops
- Phase 65 Plan 03 — coordinator V2 rewritten in-place; SwarmCategoryRow.requires_orchestration optional in TS to keep legacy fixtures assignable; debtor/email.received payload extended with optional run_id/automation_run_id/budget_run_id (back-compat)
- 66-04: CONS-03 invariant locked via audit-as-artifact (no source-code changes; allowlist captured in summary)
- Plan 70-06 (Wave 3): Bulk Review loadPageData rewired to pipeline_events for predicted-row feed (sub-queries 2 + 6); cost-outlier RPC stays on automation_runs in v1; D-16 atomic replacement honored.
- Phase 74-05: sales-email source IS SugarCRM (not Outlook); production zap 'MR || Sales email analyzer' replaces step 3 (Orq direct call) with POST to /api/automations/sales-email/ingest
- Phase 76-06: registry-driven stage-keyed shell — Phase 78 onboards sales-email by INSERT only, zero UI code
- Phase 76-07: action-stack parameterized via actions prop — enables Stage 4 reuse without component duplication
- Phase 76-08: re-export pattern for /stage-1 (minimum churn over wrapper duplication)
- Phase 76-08: middleware redirect runs before Supabase auth check (no auth dep)
- Phase 80-01: 3-task split (types-only / dispatcher-test / classifier+backfill-tests) per checker feedback — one-concern commits
- Phase 80-02: caller-side swap to loadSwarmIntents applied in Wave 1 (transient swap) — keeps tsc clean between waves with no live behavior change
- Race-guard via compound .eq() match in classifier flip-status-predicted; Supabase mock updated to support thenable chain (Phase 80 Plan 03)
- Live-traffic switch via single Inngest serve registration of stage3Dispatcher; wildcard */predicted activates routing for all swarms (Phase 80 Plan 03)
- Phase 80-04: agent_runs.status='predicted' maps to Kanban 'progress' lane attributed to 'Stage 3 Dispatcher'; Bulk Review automation_runs.status='predicted' → 'review' path preserved (different table, different feature)
- Phase 80-06: RFC doc lock — stage-3-coordinator.md restructured around the new state machine; State Machine + Transition Table + Stuck-Status Meaning + Cross-Swarm Dispatcher Contract sections added; hard-separation lock restated twice (positive in Cross-Swarm Contract, negative in Registry Tables) for highest-cost violation surface
- Phase 81-02: Stage 2 placeholder route + head-count loader; debtor-only ↗ link, em-dash fallback for other swarms
- Phase 81-02: head-count loader pattern (.select(id,{count:exact,head:true})) for placeholder card counts — no row data pulled
- Phase 81-02: established RSC-page RTL test pattern in this tree (await async component → render → mock loaders at module boundary)
- Phase 81-03: Stage 1 shell-wrapped surface complete — chip strip (swarm_noise_categories only, hard-separation lock), 2-col grid, ?sub=pending Pending Promotion sub-view; Filters popover deferred (URL params still work)
- Phase 81-03: noise-category chip strip mirrors recipient-chip-strip styling; no generic ChipStrip abstraction (RFC Anti-Pattern)
- Phase 81-03: Pending Promotion server actions plumbed fresh in stage-1/actions.ts (Wave 0 grep found no existing UI under /swarm/[swarmId]/(components))
- Phase 81-03: Filters popover (D-07) deferred — URL params remain functional via direct URL editing; regression test guards the loader-side path
- Phase 81-04: queue-tree.tsx file deletion was already in Plan 03's docs commit; Plan 04 confirms + extends middleware redirect tests (+4 cases for ?sub=pending) + .schema(name) shim in stage-1 admin mocks (22 -> 3 failures, 19 fixed)
- Phase 81-04: queue-tree.tsx confirmed deleted, Bulk Review purged from user-visible copy (audit trail in comments preserved per D-18/D-19); middleware redirect tests extended to 15 cases; .schema() shim + scoped safety-list lookup fix 19/22 inherited test failures, 3 carry-forward to Phase 82
- Phase 82-01: Wave 1 _shell/ extraction — 6 presentation primitives + 1 helper + 1 Stage0Widget + 5 RTL test files (40 tests). Hard-separation enforced at prop boundary (categories ⊥ intents); per-stage page.tsx consumption deferred to Plans 02-06
- Phase 82-01: Stage 2/Stage 4 widgets rendered as placeholders in Wave 1 — real signatures (CustomerSelection async search, Stage4Quality+reason) wired in Plan 06 when migrating Stage 1
- Phase 82-01: PipelineTimelineEvent declared as structural alias in _shell/detail-pane.tsx to keep _shell/ decoupled from stage-1/page.tsx; Plan 06 lifts central type to _shell/_lib/
- Phase 82-02: Stage 0 migrated to unified _shell/; categories=[]+intents=[] (hard-sep lock); no realtime provider; D-18 banner copy purge
- Phase 82-04: kanban-loader.ts extended with email_pipeline.emails JOIN (resolves OQ-1); .schema(name) shim in tests; cross-schema query via admin.schema()
- Phase 82-04: Stage 4 migrated to unified _shell/; client-shell.tsx bridges RSC→shell with mailbox_id thread-through; error-detail-section.tsx inlined as Stage4HandlerErrorWidget and surfaced via UnifiedDetailPane.taggingFailuresSection slot
- Phase 82-06: Stage 1 migrated to unified _shell/ via slot-prop pattern — full 4-axis bulk-review override flow preserved as Stage1OverridePane (renamed from detail-pane.tsx) and slotted into UnifiedDetailPane.taggingFailuresSection. Same approach as Stage 4. Cleanup gate D-20 green (zero stage-{1,2,3,4}/{row-list,detail-pane}.tsx files). Multi-mailbox loader (.in) landed (CONTEXT D-12).
- D-01: STAGE_TITLES values are bare labels; 'Stage N — ' prefix owned by stage-step.tsx
- 82.1-02 (D-02/D-03): MailboxFilter mounted at page level next to NoiseCategoryChipStrip; component itself unchanged
- D-04: sender column 120-200px
- D-05: Stage 1 grid minmax(540px, 720px) 1fr
- 82.3-09: RawJsonToggle preserves data-testid='stage{n}-raw-json-slot' wrappers (places toggle inside, not as replacement) to keep existing panel render tests passing
- Phase 82.4-02: direct INSERT via createAdminClient (no Inngest hop) for feedback capture — pure data write, no replay risk, ≤200ms p95 target
- Phase 82.4-02: zod schema OMITS operator_id (not just .strip) so spread cannot smuggle a client-supplied value; mirrors override route D-13
- 82.4-07: 26h read window with upsert:true daily key — replay + clock-skew idempotent without dedupe logic
- Plan 06: Stage 1 + Stage 3 Option Z lists landed as additive sections; Stage 0 + Stage 2 as primary.
- 82.4-04: fireFeedback is fire-and-forget — never blocks the Phase 71/82 Inngest override dispatch (cascade-failure mitigation)
- Plan 04: mount RowVerdictDot as absolute overlay; gridTemplateColumns untouched per CONTEXT D-2
- 82.5-03: Pure controlled-component contract — panel never seeds prose from initialReadBack; Plan 05 parent owns textarea seeding via useEffect on stage-step.tsx.
- 82.5-03: Save no longer disabled-when-empty (R5 'come back later' bookmark contract); empty Confirm uses window.confirm soft dialog per CONTEXT Discretion.
- Plan 82.5-05: Footer override branch is dispatch-only (no double-write); approve branch is canonical Promise.all writer for verdict=confirm
- OptionZDetailPane forwards feedbackMap (Stage 0/2 parity) via shared UnifiedDetailPane pass-through; hard-separation preserved
- R8 covered by runnable Playwright spec — no .md fallback

### Blockers/Concerns

- Azure AD tenant setup has organizational dependencies (IT admin access)
- Supabase Management API token expired -- Phase 50 migration apply blocked (seed update also needs this or Studio access)
- Supabase Realtime plan limits need verification (carry forward from Phase 49)

### Outstanding Verification (Deferred)

- **Phase 48-03 Azure AD SSO end-to-end** -- Code is in place (SSO button, access-pending page, project_members gate, middleware exemption) but human verification blocked on Azure AD tenant provisioning + Supabase Azure provider config. Full 8-step verification protocol in `.planning/phases/48-foundation/48-03-SUMMARY.md` under "Deferred: Human Verification (Task 3)". Resume signal: "SSO verified".
- **Phase 50 Data Pipeline migration apply + end-to-end** -- Migration file written and committed (`supabase/migrations/20260416_trace_sync.sql`) but Supabase Management API token in repo is expired. User must apply via Studio SQL editor OR provide a current `sbp_*` token so the next session can run it. Then seed one `projects.orqai_project_id` on a real swarm to kick off the cron. Full protocol in `.planning/phases/50-data-pipeline/50-VERIFICATION.md` under "Deferred: Human Verification". Resume signal: "Phase 50 sync verified".

### Pending Todos

5 pending (see `.planning/todos/pending/`):

- Plan V3 milestones for Playwright and next project phase (planning)
- Build Zapier analytics browser automation (automation)
- Resolve PostgREST exposed-schemas for email_insights (database)

**Debtor-email sub-project — 4 todos, clearly separated:**

- **Intent agent for unknown-bucket debtor mails** (swarm design → `/orq-agent`) — LLM on top of regex classifier's `unknown` fall-through
- **fetchDocument tool** (engineering) — Vercel API route using Zapier SDK for NXT SQL + S3. No swarm involvement.
- **createIcontrollerDraft tool** (engineering) — Vercel API route using Browserless+Playwright. Selectors captured from 2026-04-22 probe.
- **Copy-document sub-agent** (swarm design → `/orq-agent`) — consumes the two tool contracts above. Blocked on both tools existing.

**Tomorrow's first pickup:** build the two engineering tools in parallel (fetcher + drafter). Once both HTTP endpoints are live + registered as Orq.ai tool-calls, fill the swarm brief with data samples and invoke `/orq-agent` for the swarm spec.

## Session Continuity

Last session: 2026-05-19T16:22:22.158Z
Stopped at: Phase 82.9 context gathered
Resume with: `/gsd-execute-phase 65`
Resume file: .planning/phases/82.9-stage-2-audit-panel-evidence-expansion/82.9-CONTEXT.md

## Deferred Items

Items acknowledged at v7.0 close on 2026-04-30 — known-deferred, not gating milestone close:

| Category | Count | Action |
|----------|-------|--------|
| Quick tasks (orphaned/stale) | 10 | Review during V8.0 cleanup; most predate current automation focus |
| Pending todos | 2 | zapier-analytics-browser-automation + postgrest-exposed-schemas-for-email-insights — re-prioritize in V8.0 backlog |
| UAT gaps (Phase 61) | 1 | Bulk-review UX regression UAT — to revalidate during V8.0 phase 7 (Bulk Review redesign) |
| Verification gaps (Phase 59, 61) | 2 | Realtime fan-out + bulk-review UX — passed in practice, formal verification deferred |

See .planning/milestones/v7.0-* archive files for full milestone state.

**Planned Phase:** 82.8 (stage-4-handled-overview-and-stage-1-screenshots) — 8 plans — 2026-05-18T08:46:59.106Z
