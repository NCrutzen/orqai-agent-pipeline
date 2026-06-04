# Roadmap: Agent Workforce

## Overview

Browser-based interface for creating, deploying, testing, and iterating AI agent swarms on Orq.ai. v8.0 established the canonical 5-stage funnel architecture (Stage 0 safety → Stage 1 regex+LLM noise → Stage 2 entity → Stage 3 coordinator → Stage 4 handler) across debtor-email and sales-email swarms, with operator-facing Bulk Review, per-stage audit surfaces, and feedback capture wired into Supabase. v8.1 closes input/calibration/visibility gaps so Stage 3 intent distribution reflects reality. From here the roadmap runs **two parallel tracks** (re-sequenced 2026-06-02): the debtor track (v8.2 Stage-2 resolution recall, gated on operator validation) and the sales track (V9.0 sales-email live on Outlook, SugarCRM deprecated) — both converging into V10.0 self-learning (Promotion Recommender + reply-tracing), then V11.0 intent-prioritised handlers.

## Milestones

| Version | Milestone | Status |
|---------|-----------|--------|
| **v0.3** | Core Pipeline + V2.0 Foundation | **Shipped 2026-03-01** |
| **V2.0** | Autonomous Orq.ai Pipeline | **Shipped 2026-03-02** |
| **V2.1** | Experiment Pipeline Restructure | **Shipped 2026-03-13** |
| **V3.0** | Web UI & Dashboard (V3.0/V4.0/V6.0 browser-UI thesis abandoned 2026-03-25) | **Partial / Abandoned** |
| **V6.0** | Executive Dashboard & UI Revamp | **Partially Complete** |
| **V7.0** | Agent OS — cinematic swarm operating view | **Shipped 2026-04-30** |
| **v8.0** | Agentic Platform — canonical 5-stage funnel + debtor-email + sales-email Stage 0-1 | **Shipped 2026-05-20** |
| **v8.1** | Validation + Visibility — body ingestion, Stage 1 noise rules, Stage 3 prompt v3, open-set discovery | **Shipped 2026-06-01** |
| **v8.2** | Stage 2 Resolution Recall — debtor track (SQL-native NXT resolver) · _parallel with V9.0_ | **Defined / next** |
| **V9.0** | Sales-email canonical pipeline — Outlook-driven (Sugar deprecated) · _parallel with v8.2_ | **In progress** _(was V10.0)_ |
| **V10.0** | Promotion Recommender + Learning Inbox + reply-tracing (self-learning) | **Defined** _(was V9.0)_ |
| **V11.0** | Intent-prioritised handlers | **Defined** |

---

<details>
<summary>✅ v0.3 Core Pipeline + V2.0 Foundation (Phases 1-05.2) — SHIPPED 2026-03-01</summary>

11 phases, 28 plans, 50 requirements satisfied.
**Archive:** `milestones/v0.3-ROADMAP.md` · `milestones/v0.3-REQUIREMENTS.md`

</details>

<details>
<summary>✅ V2.0 Autonomous Orq.ai Pipeline (Phases 6-11) — SHIPPED 2026-03-02</summary>

7 phases, 11 plans, 23 requirements satisfied.
**Archive:** `milestones/V2.0-ROADMAP.md` · `milestones/V2.0-REQUIREMENTS.md`

</details>

<details>
<summary>✅ V2.1 Experiment Pipeline Restructure (Phases 26-33) — SHIPPED 2026-03-13</summary>

8 phases, 9 plans, 24 requirements satisfied.
**Archive:** `milestones/V2.1-ROADMAP.md` · `milestones/V2.1-REQUIREMENTS.md`

</details>

<details>
<summary>✅ V7.0 Agent OS (Phases 48-54) — SHIPPED 2026-04-30</summary>

7 phases code-complete. Glassmorphism design system, Supabase Realtime data pipeline, AI narrative briefings, live delegation graphs, Kanban job tracking, Azure AD SSO.
**Archive:** `milestones/v7.0-ROADMAP.md` · `milestones/v7.0-REQUIREMENTS.md`

Note: Phases 55+ (debtor-email pipeline, swarm-registry, classifier, …) added after the original V7 scope and re-scoped into v8.0 platform redesign.

</details>

<details>
<summary>✅ v8.0 Agentic Platform — SHIPPED 2026-05-20</summary>

**31 in-scope phases, 49/49 in-scope requirements satisfied, 7/7 cross-phase flows verified.**
**Archive:** `milestones/v8.0-ROADMAP.md` · `milestones/v8.0-REQUIREMENTS.md` · `milestones/v8.0-MILESTONE-AUDIT.md`

**Headline deliverables:**

- **Canonical 5-stage funnel** (`docs/agentic-pipeline/README.md`) — Stage 0 safety → Stage 1 regex+LLM noise → Stage 2 entity → Stage 3 coordinator → Stage 4 handler — locked across debtor-email and sales-email.
- **Stage 0 input safety + per-run budgets** (Phase 64) — prompt-injection regex + LLM classifier, `injection_suspected` review lane, hard token/cost ceilings (16k token budget after Phase 999.7 strip-quoted-history fix), intent-scoped tool allowlist.
- **Stage 1 LLM 2nd-pass** (Phase 74) — registry-driven `stage-1-category-classifier` on `unknown` regex output; closed list = noise keys + `unknown`. Confidence gate (Phase 999.8) — `high` only auto-archives; `medium`/`low` route to operator review with predictor attribution.
- **Stage 2 closure** (Phase 67) — iController DOM tagging non-blocking for downstream stages; per-row mailbox resolution; resolver+LLM-tiebreaker evidence surfaced in audit panel (Phase 82.9).
- **Stage 3 ranked multi-intent coordinator** (Phase 65) — ordered intent list + confidence scores; orchestrator escalation on low confidence or `requires_orchestration` flag.
- **Pipeline consolidation** (Phase 66) — retired `debtor-email-triage`; canonical `regex → label-resolver → coordinator → handler` flow.
- **Swarm registry** (Phases 56.7, 68, 69) — `swarms` + `swarm_intents` + `swarm_noise_categories` tables; adding a swarm = registry inserts, not code changes. Build-time codegen for literal-union TS types (Phase 69 D-03).
- **Telemetry consolidation** (Phase 70) — `pipeline_events` canonical table; Stage 0 coverage backfilled to ≥99% per debtor mailbox (Phase 82.2).
- **Bulk Review 4-axis redesign** (Phase 71) — per-stage independent override controls; unified stage shell (Phases 82-82.8) with row+detail+chip-strip+mailbox-filter UX.
- **Per-stage audit surface** (Phase 82.3) — verdict + reasoning + key evidence + screenshots in per-stage popup. Stage 2 evidence expansion (Phase 82.9) shipped 2026-05-20.
- **Feedback capture infrastructure** (Phase 82.4) — `email_feedback` table, `StageFeedbackPanel`, confirm/override + prose-notes; data substrate the self-learning milestone (V10.0; re-sequenced 2026-06-02) reads from.
- **Stage 3 → Kanban human-lane wiring** (Phase 76) — zero silent dead-letters.
- **Body ingestion fix** (Phase 83) — `body_full_text` + `body_unique_text` columns, conversation context (2 priors per inbound), 30-day backfill (1344 priors written); Stage 1+3 readers wired.
- **Stage 1 LLM 2nd-pass auto-action promotion track** (Phase 089) — `llm:{category}:{confidence}` synthetic rule_keys threaded through Wilson-CI promotion; 7/7 plans landed across 4 waves, 839 rows backfilled live.
- **Reframes locked 2026-05-12** (slots re-sequenced 2026-06-02)**:** Phase 72 (Promotion Recommender) → full milestone, **now V10.0**; Phase 73 (sales-email validation) → full milestone, **now V9.0, Outlook-driven**; Phase 77 (Stage 2/3 e2e verification) → superseded by Phase 82.3.

**Operator UAT (Phase 999.8):** Stage 1 chip strip + URL round-trip + garbage-drop + `?sub=pending` guard verified live 2026-05-20. Therese regression smoke PASS.

**Tech debt deferred to v8.1 grooming:** lightweight VERIFICATION.md stubs for 10 phases closed via SUMMARY chain only (66, 67, 68, 69, 74, 80.1, 81.1, 82.2, 82.3, 089); codify `PipelineStageContext` TS interface from RFC-02; SC-89-03 operator retro-review of 839 backfilled rows; SC-89-04 mutate-flag flip runbook.

</details>

---

## Phases

### v8.1 Validation + Visibility (Phases 83-89, 88, 88.1, 88.2) — SHIPPED 2026-06-01 · archive: `milestones/v8.1-ROADMAP.md` · audit `passed`

**Milestone goal:** Observe → understand → THEN automate. Fix the input + calibration + visibility layers so that Stage 3 intent distribution reflects reality, not artifacts of upstream parsing bugs or impoverished prompt context.

**Core principle (locked 2026-05-19):** Intent vocabulary emerges from the **LLM's proposals + operator promotion** during dry-run, never from hand-curation. Phase 86 builds the discovery surface; the self-learning milestone (V10.0; re-sequenced 2026-06-02) builds the promotion side.

**Dependency graph:**

```
83 (input fix) ──┬──> 85 (prompt v3 + V3 schema with intent_proposal)
                 │      │
                 │      └──> 86 (proposal capture + cluster UI)
                 │              │
84 (Stage 1 noise) ──> 87 (retro-classify + intent-volume baseline)
                                │
                                └──> V8.2 (handlers picked from baseline)
```

- [x] **Phase 83: Body ingestion** — full thread capture on forwards and replies. SHIPPED 2026-05-19. 1344 priors backfilled; V1/V2 green within noise-floor; V3/V4 PARTIAL pending live traffic.
- [x] **Phase 84: Stage 1 noise rules for AP-automation FYI traffic** — 7 noise categories live in `classify.ts` (Coupa Betaald/Goedgekeurd, ISS PtP auto-reply, M365 quarantine, FrieslandCampina rejects, RSK phishing notices, FarmPlus supplier bank-change, own-domain outbound loopback — Coupa PO dropped per calibration). `swarms.tenant_domains` column + codegen shipped. VERIFICATION **9/11 PASS, KEEP-OPEN-PENDING-SHADOW** — 2 PENDING-OPERATOR items are the 7-day shadow window (Day-0 pre-flight + D-05 gate evaluation per PROMOTION-RUNBOOK.md). Code-side complete 2026-05-20.
  **Plans:** 4 plans
  Plans:

  - [x] 84-01-PLAN.md — Wave 0: RED tests + hard-separation static check + CORPUS-SAMPLES
  - [x] 84-02-PLAN.md — Wave 1: 3 migrations (tenant_domains column + 16 swarm_noise_categories rows + 8 classifier_rules candidates) + gen-tenant-domains.ts codegen + stub retirement
  - [x] 84-03-PLAN.md — Wave 2: 7 classify.ts matchers + own_outbound_invoice_loopback + direction passthrough
  - [x] 84-04-PLAN.md — Wave 3: PROMOTION-RUNBOOK.md + CORPUS-SAMPLES Day-7 columns (operator-driven shadow window still pending)
- [x] **Phase 85: Stage 3 prompt v3** — intent definitions + per-intent few-shot + open-set output schema (`intent_proposal` + `proposal_reason` additive fields; closed-list `intent` enum unchanged). `intent_version='2026-05-19.v3'` live in Orq Studio. V3 schema + tolerant V2|V3 parser + cache-key flip in code. **12-email regression GREEN — 1/12 changed (V3 improvement, not regression).** VERIFICATION **6/7 + 1/1 = passed_with_open_operator_items** (token-observation + V2-retirement TODO outstanding per Plan 04 wall-clock dependencies). Deployed 2026-05-20.
  **Plans:** 4 plans

  - [x] 85-01-PLAN.md — Wave 0: corpus + regression baseline + monthly volume + RED Vitest suite
  - [x] 85-02-PLAN.md — Wave 1: V3 Zod schema + tolerant parser + cache-key flip + telemetry emit
  - [x] 85-03-PLAN.md — Wave 2: V3 prompt + V3 json_schema + Orq PATCH ritual + 3 smokes GREEN
  - [~] 85-04-PLAN.md — Wave 3: operator regression rerun GREEN; 3-day token observation + V2-retirement TODO outstanding (autonomous:false — wall-clock dependencies)
- [x] **Phase 86: Open-set intent discovery** — `intent_proposal` persisted via `intent_proposals_v1` view + `intent_proposal_clusters` nightly Levenshtein refresh + `intent_proposal_views` telemetry. New Bulk Review "Intent proposals" tab (`web/app/(dashboard)/automations/[swarm]/intent-proposals/page.tsx`) with DiscoveryTabStrip peer component + RTL coverage. Read-only — no promotion button (V10.0 owns Learning Inbox; re-sequenced 2026-06-02). Cross-swarm by default. VERIFICATION **7/7 PASS, KEEP-OPEN-PENDING-WINDOW** (4 human_verification items are operator UAT — Day-0 pre-flight per 86-DAY-0-CHECKPOINT.md + first 04:00 Amsterdam cron tick + intent_proposal_views row stamping). Code-side complete 2026-05-20.
  **Plans:** 4 plans

  - [x] 86-01-PLAN.md — Wave 0: data layer (view + clusters table + views telemetry + types + shape-lock tests)
  - [x] 86-02-PLAN.md — Wave 1: Levenshtein cluster algorithm + nightly cron + RED→GREEN tests
  - [x] 86-03-PLAN.md — Wave 2: Intent Proposals RSC page + server actions + client shell + DiscoveryTabStrip + RTL coverage
  - [x] 86-04-PLAN.md — Wave 3: operator runbook + verification log + Day-0 checkpoint (operator-driven shadow window still pending)
- [x] **Phase 87: Retro-classification + intent-volume baseline** (DONE 2026-05-30 — baseline run `dd88887c`/105 emails, report hand-graded SC-3/SC-4 PASS, SC-1 refuted-usefully; loopback false-archive incident found + code-mitigated #58/#59; 27-email recovery = operator follow-up runbook) — re-runs V3 Stage 3 agent against 30-90 days of corpus (read from Supabase, idempotent); `stage_3_retro_runs` + `intent_volume_baselines` tables; v8.2/V9.0/V10.0/V11.0 read this. **Depends on 83+84+85+86 all live.** PLANNED: 5 plans + RESEARCH + VALIDATION on disk; **execution blocked on 7-day live window of Phase 86 cluster data** per R-04 ("Open-set surface still empty at 7 days post-85 deploy — extend live window before running Phase 87"). Trigger Phase 87 execution ≥7 days after this milestone PR merges + Vercel deploy confirms.
- [x] **Phase 88: Review-surface cleanup** — three operator-confusion items on the unified `_shell/`: (D-01) override + note flow consolidation on Stages 0/2/3; (D-02) Stage 1 "Needs review" chip semantics rename + verdict-based "Pending my review" chip; (D-03) Stage 4 layout parity with Stage 1/2/3 chip-strip pattern + detail-pane width regression fix. Pure frontend. **Independent of 83-87.** (completed 2026-05-20)
  **Plans:** 4 plans
  Plans:

  - [x] 88-01-PLAN.md — Wave 0 pre-flight: RPC column shape verify + needs_action deeplink grep + in-browser detail-pane width repro
  - [x] 88-02-PLAN.md — Wave 1: D-01 wire Stage 2 + Stage 3 override widgets (fused note+override + cancel-override) into _shell/detail-pane
  - [x] 88-03-PLAN.md — Wave 1: D-02 verdict-pending RPC + chip semantics rewire + NeedsActionChip + ?needs_action URL deletion
  - [x] 88-04-PLAN.md — Wave 2: D-03 Stage 4 chip-strip swap (4 outcome-state chips) + conditional width-regression fix per Wave 0 Q3
- [x] **Phase 88.1: Stage-named Inngest functions + Stage 2 telemetry alignment** — SHIPPED 2026-05-22. PR #52 squash-merged at 03:43Z; Vercel deploy 03:44:03Z. 4 function ids + 3 event names renamed. Registry data UPDATE oversight detected + fixed at 04:50Z; one stranded email recovered. Real-traffic verified end-to-end via Factuurportal email at 05:58Z (stage=2 emit + stage=3 emit). See `88.1-VERIFICATION.md`.
- [x] **Phase 88.2: Tier-2 CI backlog cleanup** (INSERTED) — clear the multi-developer Tier-2 backlog: workspace gate gets a CI counterpart via `.github/workflows/pr-checks.yml` (shipped PR #34), then phase 88.2 burned down 194 lint errors → 0 + 47 test failures → 0 + 5 disciplined skips with todos. Cold-cache 2m14s, warm-cache 2m19s (vs 8m / 5m budgets). PR #45 + #47 close R-4/R-5 evidence loop. (completed 2026-05-21)
  **Plans:** 5 plans across 4 waves
  Plans:

  - [x] 88.2-01-PLAN.md — Wave 0: ESLint config tune (`globalIgnores(["lib/automations/**"])` + `argsIgnorePattern: "^_"`) → 194 → 86 errors
  - [x] 88.2-02-PLAN.md — Wave 1: test-infra primitives (`web/test-setup.ts` `vi.mock("next/headers")` + `web/test-utils/supabase-mock.ts` Proxy admin mock)
  - [x] 88.2-03-PLAN.md — Wave 1: residual lint burn-down (`lib/inngest/`, `debtor-email-analyzer/`, long-tail) + 12 React Compiler errors fixed at source
  - [x] 88.2-04-PLAN.md — Wave 2: fixture/assertion-drift triage (24 fixed, 5 skipped ≤10 cap with todos) → tests 47 → 0 failures
  - [x] 88.2-05-PLAN.md — Wave 3: local verify + phase PR (#45, cold cache 2m14s) + follow-up doc PR (#47, warm cache 2m19s)
- [ ] `/gsd-audit-milestone v8.1` — formal closure after Phases 87 + 88 (+ 88.1, 88.2 if not slipped) pass.

---

### Phase 88.1: Stage-named Inngest functions + Stage 2 telemetry alignment

**Goal:** Rename three Inngest functions to match the canonical 5-stage pipeline vocabulary, so on-call operators and future contributors can read function names and immediately know which stage they belong to. Phase 80+ collapsed multiple legacy workers into the unified coordinator, but the survivors still carry pre-stage-funnel names (`classifier-*`, `debtor-email-icontroller-*`) that obscure their role. This rename + telemetry alignment is the final naming cleanup before V8.2 handler work begins.

**Scope:**

- Rename `classifier-label-resolver` → `stage-2-customer-resolver` (Stage 2 entity resolution).
- Rename `debtor-email-icontroller-tagger` → `stage-2-icontroller-label-applier` (Stage 2 follow-up action, locked as Stage 2).
- Rename `debtor-email-icontroller-cleanup-worker` → `stage-1-icontroller-noise-cleanup` (Stage 1 noise-side cleanup).
- Update all function-id strings, event-name string references, file paths, import paths, test file paths, and any operator dashboards / runbooks that reference the old names.
- Align Stage 2 telemetry: ensure `pipeline_events.stage = 2` is emitted for the renamed Stage 2 functions (if not already), and that `swarm_type='debtor-email'` is set consistently. No new columns.

**Out of scope:**

- Refactoring function bodies / changing behavior — pure rename + telemetry alignment.
- Renaming live tables (`agent_runs`, `coordinator_runs`, `pipeline_events`) — those are Phase 80+ canonical.
- Adding new stages or merging stages.
- Migrating away from the `classifier_*` prefix in tables (`classifier_rules`, `classifier_rule_evaluations` etc.) — table renames are V9 scope.
- Touching cron schedules or `concurrency` configs.

**Acceptance:**

- All three functions registered on `/api/inngest` under the new ids and respond to events fired under the new names.
- No reference to the three old function ids remains in `web/lib/inngest/functions/`, `web/lib/inngest/events.ts`, `web/app/api/inngest/route.ts`, `web/lib/automations/debtor-email/`, or any test file (grep clean).
- `pipeline_events.stage` distribution shows Stage 2 events from the two renamed Stage 2 functions in production after deploy.
- `npm run test`, `npm run typecheck`, `npm run build`, `npm run lint` all green.
- Vercel production deploy succeeds and the Inngest dashboard shows the three new function ids registered.

**Blast-radius mitigation:**

- This is the LAST phase before V8.2 — own deploy window, not bundled with Phase 87 closure.
- Event-name migration uses dual-emit-then-cutover OR single atomic deploy (decide in discuss-phase).
- Inngest historical runs under old function ids are preserved (Inngest treats function-id changes as new functions; old runs stay queryable under old id).

**Independent of 83–87.** Can ship in parallel with Phase 87's smoke window or after.

**Plans:** 7 plans
Plans:

- [x] 88.1-01-PLAN.md — Wave 1: audit artefact (88.1-AUDIT.md committed)
- [x] 88.1-02-PLAN.md — Wave 2: RED grep-guard Vitest test for the 7 legacy strings + Phase 65 destructure check
- [x] 88.1-03-PLAN.md — Wave 3: rename classifier-label-resolver → stage-2-customer-resolver
- [x] 88.1-04-PLAN.md — Wave 3: rename debtor-email-icontroller-tagger → stage-2-icontroller-label-applier
- [x] 88.1-05-PLAN.md — Wave 3: rename cleanup-worker + cleanup-dispatcher → stage-1-icontroller-noise-cleanup{,-dispatcher}
- [x] 88.1-06-PLAN.md — Wave 4: rewire route.ts + producer call-sites + UI/scripts; grep guard GREEN. **Registry data UPDATEs missed during execution — applied as hotfix in Wave 5; lesson captured in runbook + memory**
- [x] 88.1-07-PLAN.md — Wave 5: operator cutover + smoke + telemetry verified on real production traffic; runbook + memory updated with registry-UPDATE lesson

---

### Phase 88.2: Tier-2 CI backlog cleanup

**Goal:** Make the now-live `pr-checks.yml` gates pass green end-to-end on a clean PR against `main` — burn down 194 ESLint errors to 0 and resolve 47 failing Vitest tests across 14 files (or `.skip()` with tracked todos), so every subsequent PR is mechanically gated by working checks instead of red checks the team learns to ignore.

**Scope:** ESLint config tuning (ignore `lib/automations/**`, fix `argsIgnorePattern`); targeted lint fixes in `lib/inngest/`, `app/(dashboard)/`, `debtor-email-analyzer/src/`, `components/v7/`, `components/automations/`, `tests/`, `lib/zapier/`, `lib/dashboard/`, `components/graph/`, `app/api/`; React Compiler errors fixed at source; Vitest mock for `next/headers#cookies`; Supabase admin mock chain extension; fixture refresh OR `.skip()`+todo; one doc note that Tier-2 CI gate is live and green; phase-PR cycle proving green checks.

**Out of scope:** Refactoring `lib/automations/` away from `any`, rewriting failing tests as new tests, testing-framework migration, Tier-3 governance (CODEOWNERS, signed commits), Playwright e2e in CI, warning cleanup beyond what falls out of `argsIgnorePattern`.

**Acceptance:** all 5 `pr-checks /*` checks green on the phase PR + one follow-up PR; cold-cache run ≤ 8 min, warm-cache ≤ 5 min; lint/test/build/typecheck/codegen all exit 0 on head of phase branch.

**Spec:** `.planning/phases/88.2-tier-2-ci-backlog-cleanup/88.2-SPEC.md` (rev2 — narrow scope to greening the live gates).
**Independent of 83-87, 88.1.**

**Plans:** 5 plans

- [ ] 88.2-01-PLAN.md — ESLint config tune (globalIgnores lib/automations + argsIgnorePattern); foundation wave retires ~108 errors + 163 warnings
- [ ] 88.2-02-PLAN.md — Test infra: global next/headers mock in web/test-setup.ts + new web/test-utils/supabase-mock.ts Proxy mock; retires ~38 test failures
- [ ] 88.2-03-PLAN.md — Lint burn-down (any-narrow in lib/inngest/ + debtor-email-analyzer/src/ + long-tail; require→import; 10 React Compiler errors at source per D-14)
- [ ] 88.2-04-PLAN.md — Fixture drift fix-or-skip per D-07/D-08/D-09 (≤ 10 skips total; each with .planning/todos/pending/ todo)
- [ ] 88.2-05-PLAN.md — Verify + PR cycle + CI timing (R-3/R-4/R-5; cold ≤ 8 min, warm ≤ 5 min on follow-up doc-only PR)

---

### V3.0 / V4.0 / V6.0 — Pre-pivot residual work (deferred indefinitely)

V3.0/V4.0/V6.0 browser-UI swarm-builder thesis abandoned 2026-03-25 in favour of the Orq.ai agentic-pipeline direction that became v8.0. The following phases were planned but not shipped; they remain in the roadmap as "deferred indefinitely" rather than cancelled, in case the executive-dashboard or web-pipeline workstreams reopen.

- [ ] Phase 37.1: Conversational Pipeline (V3.0) — streaming chat, narrator summaries
- [ ] Phase 38: Swarm Activation (V3.0) — webhook endpoints with API key auth
- [ ] Phase 38.1: Full Pipeline Lifecycle (V3.0) — 9-agent deploy/test/iterate/harden stages
- [ ] Phase 41: Script Generation, Testing & MCP Deployment (V4.0)
- [ ] Phase 42: Standalone Automations & Triggers (V4.0)
- [ ] Phase 43: Upstream Sync (orq-agent-pipeline → agent-workforce)
- [ ] Phase 46: Status Monitoring & O365 SSO (V6.0)
- [ ] Phase 47: UI Redesign & Polish (V6.0)

---

### V9.0 Sales-Email Canonical Pipeline — Outlook-driven (Phases 110–115) — ACTIVE (re-sequenced 2026-06-02; was V10.0)

**Milestone goal:** `verkoop@smeba.nl` runs the full canonical 5-stage funnel end-to-end with an operator-usable Bulk Review trace — the actual "second swarm validation" v8.0 promised, and the first cross-swarm reuse of the v8.2 NXT resolver. **NOT "move to Outlook"** (ingest already live, 827 emails/30d, Sugar→Outlook cutover done 2026-05-06): the delta is finish Stage 1 + add Stage 2/3 + Bulk Review + clean up dead Sugar code.

**Verified baseline (do NOT re-build — verified 2026-06-02 against production):** Outlook ingest is the production path; Stage 0 + the swarm-agnostic Stage 1 LLM classifier are live; the `sales-email` `swarms` row exists as a Stage-0/1 shell; feedback forms are swarm-generic. Greenfield: `swarm_intents`=0, sales `orq_agents`=0, no Outlook-archive side-effect, Bulk Review not yet operator-usable.

**Hard constraints (encoded across phases):** registry changes (`swarms` / `swarm_intents` / `swarm_noise_categories` / `zapier_tools`) ship as `supabase/migrations/` + `npm run codegen` committed atomically — never hand-edit `*.generated.ts` (docs/collaboration.md); zero `if swarm==='sales-email'` branches in shared workers — variance lives in registry data (SWARM-02 gate); Stage 4 handlers are OUT (V11.0) — handler-less intents land in the Phase 76 Kanban human-lane.

**Sequencing principle:** observe → understand → THEN automate. Visibility first (110), then Stage 1 noise settled (111) before any Outlook auto-archive side-effect (112), **Stage 2 resolver reuse first (114)**, then Stage 3 intent agent (113), dead-code decommission last (115).

**Re-sequenced 2026-06-04 (operator): 114 executes BEFORE 113.** Corpus analysis of verkoop@ (1,273 inbound) shows customers are unusually resolvable here: 32% of subjects contain "offerte", 27% carry quote/order number references, 75% of attributed senders are business domains (2% freemail), and ≥44% of external-domain mail comes from domains already known as debiteuren@ senders (lower bound — based on only 536 debiteuren-inbound mails; true NXT-match rate likely higher). Runtime order is Stage 2 → Stage 3 anyway (context-shape contract): a customer-resolved corpus gives the Stage 3 intent seeding (STAGE3-02) a materially richer customer-vs-prospect axis. Consequence: the v8.2 RESL-01/02/03 external dep moves ONTO the critical path — 114's discuss/plan must resolve seam status first (the dynamic-dispatch Engine seam is NOT yet landed in this workspace; only the registry columns exist, sales `resolution_config` is an inert placeholder). Known ingest gaps to address as 114 prereqs: `has_attachments` never captured (false on all 1,273) and 28% of rows missing `sender_email` — see todos `2026-06-04-sales-ingest-attachments-gap` / `2026-06-04-sales-ingest-sender-email-gap`.

**Dependency graph:**

```
110 (visibility + swarm-row enrichment + SWARM-02 gate + verify)
  ├──> 111 (Stage 1 noise expand + calibrate)
  │       └──> 112 (Outlook archive side-effect + backfill)   [needs rules settled]
  └──> 114 (Stage 2 resolver reuse)  ──┄ external dep: v8.2 RESL-01/02/03 (NOW on critical path — resolve seam status in discuss)
          └──> 113 (Stage 3 sales intent agent)   [intent seeding consumes customer-resolved corpus]
115 (SugarCRM dead-code decommission)  [independent — last or parallel]
```

- [x] **Phase 110: Visibility Foundation — Bulk Review + swarm-row enrichment + ingest verify** — operator can see and follow sales emails before anything auto-acts; the Stage-0/1 shell `swarms` row is enriched to a full-funnel config via migration + codegen; the architecture gate (no per-swarm branches) is asserted; Outlook ingest health is verified/monitored. (completed 2026-06-03)
- [x] **Phase 111: Stage 1 Noise Expansion + Calibration** — mine the 827+ corpus for new sales-specific noise rules and calibrate/flip the safe core categories behind the shadow→promote gate, all as audit-trailed registry data. (completed 2026-06-03)
- [x] **Phase 112: Outlook Cleanup + Backfill (gated production writes)** — wire the Stage 1 Outlook-archive side-effect for sales and backfill it over the ingested corpus, auto-archiving high-confidence/AP-noise and routing ambiguous matches to operator approval, idempotently. (completed 2026-06-04; mid-phase incident + canary findings: see 112-03-SUMMARY)
- [x] **Phase 112.5: Outlook Behavior Tracking (passive review signals)** (completed 2026-06-04; activatie uitgesteld tot Sugar cut-over — runbook docs/swarm-behavior-tracking.md) — volg gebruikersgedrag in verkoop@smeba.nl via Graph delta-sync (reply / move-to-afgehandeld / self-archive / restore-from-archive / category-edit) en destilleer daaruit approve/reject/correctie-signalen per `pipeline_event`, zodat Outlook de de-facto review-surface wordt voor sales en Bulk Review doorschuift naar operator-console. Eerste deliverable: folder-conventie-analyse (afgehandeld-vs-Archief consistentie) als kalibratie van de signaalkwaliteit.
- [x] **Phase 114: Stage 2 Resolver Reuse — cross-swarm generality proof** *(re-sequenced 2026-06-04: executes BEFORE 113)* — sales Stage 2 resolves customers by reusing the v8.2 NXT resolver via per-swarm config with zero Engine code changes; the debtor-only self-auth tier degrades to a no-op for sales. (completed 2026-06-04)
- [ ] **Phase 113: Stage 3 Sales Intent Agent (greenfield)** *(re-sequenced 2026-06-04: executes AFTER 114 — intent seeding consumes the customer-resolved corpus)* — build a sales-specific Orq intent agent + seed `swarm_intents` from the live corpus so every sales email leaving Stage 1 reaches a Stage 3 verdict, with handler-less intents landing in the Kanban human-lane.
- [ ] **Phase 115: SugarCRM Dead-Code Decommission** — remove the now-dead SugarCRM source code and stale registry notes after confirming no live path depends on it.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 110. Visibility Foundation | 4/4 | Complete   | 2026-06-03 |
| 111. Stage 1 Noise Expansion + Calibration | 5/5 | Complete   | 2026-06-03 |
| 112. Outlook Cleanup + Backfill | 3/3 | Complete   | 2026-06-04 |
| 112.5 Outlook Behavior Tracking | 4/4 | Complete (activatie uitgesteld) | 2026-06-04 |
| 114. Stage 2 Resolver Reuse *(executes before 113)* | 7/7 | Complete    | 2026-06-04 |
| 113. Stage 3 Sales Intent Agent | 0/TBD | Not started | - |
| 115. SugarCRM Dead-Code Decommission | 0/TBD | Not started | - |

---

## Phase Details

### Phase 110: Visibility Foundation — Bulk Review + swarm-row enrichment + ingest verify

**Goal**: The sales operator can actually see and follow `verkoop@smeba.nl` emails end-to-end in Bulk Review before any phase auto-acts, and the `sales-email` `swarms` row is upgraded from a Stage-0/1 shell to a full-funnel registry config — the foundation every later phase reads from.
**Depends on**: Nothing (first V9.0 phase). Baseline: Outlook ingest + Stage 0/1 already live.
**Depends on (external/cross-track)**: none.
**Requirements**: REVIEW-01, SWARM-01, SWARM-02, VERIFY-01
**Success Criteria** (what must be TRUE):

  1. The operator can open a sales-email Bulk Review surface from the sidebar and see rows + detail pane + queue tree + per-stage tabs (0/1/2/3) + the swarm-generic feedback form rendering for `sales-email` (REVIEW-01).
  2. The `sales-email` `swarms` row carries a full-funnel config — `entity_brand=smeba`, `canonical_context_shape`, `stage2_entity_resolver`, `resolution_config`, `stage3_coordinator_agent_key` — shipped as one migration with `npm run codegen` committed atomically and no hand-edited `*.generated.ts` (SWARM-01).
  3. No shared worker (`classify` / classifier / coordinator / dispatcher) contains an `if swarm==='sales-email'` branch — any variance needed is expressed as registry data, asserted by a static check or grep gate (SWARM-02).
  4. Sales ingest is confirmed Outlook-based (not a residual SugarCRM poll), `verkoop@smeba.nl` ~33/day throughput is visible in the pipeline-health monitor, and any stuck/legacy `source='sugarcrm'` rows are dispositioned (VERIFY-01).

**Plans**: 4 plans (3 waves; hard debtor-regression gates isolate the two live-path crossings)
Plans:
**Wave 1**

- [x] 110-01-PLAN.md — Wave 1: Wave-0 regression net — debtor coordinator parity tests + SWARM-02 static guard (coordinator+dispatcher) + RED contracts for the email_id anchor & per-stage dry-run gate (SWARM-02, REVIEW-01)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 110-02-PLAN.md — Wave 2: low-risk generalization — email_id hydrator anchor + per-swarm codegen maps + un-404 route (also un-404s info-routing) + sidebar entry (REVIEW-01, SWARM-01 codegen half, SWARM-02 surface half)
- [x] 110-03-PLAN.md — Wave 2: HIGHEST-RISK — coordinator SWARM_TYPE→payload + wildcard `*/coordinator.requested`; debtor Stage-3 behavior provably unchanged (SWARM-02, D-09)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 110-04-PLAN.md — Wave 3: swarms full-funnel enrichment + per-stage dry_run_config + per-mailbox health migrations + worker gate refactor + [BLOCKING] schema push/codegen/advisor + VERIFY-01 (SWARM-01, VERIFY-01) — **COMPLETE 2026-06-03**: Tasks 1–3 merged earlier; Task 4 unblocked by re-linking Supabase MCP OAuth to the Agent-Workforce org, then 3 migrations applied via `apply_migration`, `entity.generated.ts` regenerated + committed (`c774f989`), RLS advisor green (0 ERROR); live-verified debtor `stage_1_cleanup=false` (LIVE) + sales inert/blocked. Task 5 governance checkpoint **approved by operator 2026-06-03**. (per-mailbox `verkoop@smeba.nl` health row populates on next monitor cron tick — non-blocking.)

**UI hint**: yes

### Phase 111: Stage 1 Noise Expansion + Calibration

**Goal**: The 5 core sales noise categories are calibrated against the live corpus and the safe ones flip to auto-archive behind the shadow→promote gate, and new sales-specific noise rules discovered from the 827+ corpus are added as registry data — so Stage 1 stops over-routing sales noise into manual review.
**Depends on**: Phase 110 (Bulk Review visible so calibration evidence is observable; full-funnel swarm row).
**Depends on (external/cross-track)**: none.
**Requirements**: STAGE1-01, STAGE1-02
**Success Criteria** (what must be TRUE):

  1. The safe core categories (auto-reply, OOO temporary/permanent) move `manual_review` → `categorize_archive` behind the shadow→promote gate, while `payment_admittance` and `unknown` stay in review with a recorded rationale — delivered as a migration with audit trail (STAGE1-01).
  2. New sales-specific Stage 1 noise rules discovered from the multi-week corpus are added as `swarm_noise_categories` rows with an audit trail, data-driven rather than hand-curated (STAGE1-02).
  3. The 8 inherited AP-noise rules are re-validated for sales fit; in particular `own_outbound_invoice_loopback` is gated/disabled for sales unless it holds on the sales corpus (it mis-archived ~40% on debtor and is disabled there) (STAGE1-02).

**Plans**: 5 plans

Plans:

- [x] 111-01-PLAN.md — Close the two CRITICAL gating gaps (verdict-worker isStageBlocked + swarm-agnostic Wilson promotion gate in Step 5) + debtor regression net [Wave 1]
- [x] 111-03-PLAN.md — Stage-1 retro-run harness (new table + selector + aggregator) over both corpora, idempotent + side-channel isolated [Wave 1]
- [x] 111-02-PLAN.md — Audited calibration-flip migration: 3 safe categories → categorize_archive (inert behind 01's gate) [Wave 2]
- [x] 111-04-PLAN.md — Cluster-mining discovery + loopback test-first (D-09) + RFC doc correction (Finding 3) [Wave 2]
- [x] 111-05-PLAN.md — [BLOCKING] Apply both migrations via Supabase MCP + live verify (no codegen drift, RLS 0 ERROR) [Wave 3]

### Phase 112: Outlook Cleanup + Backfill (gated production writes)

**Goal**: Sales gains the Stage 1 Outlook-archive action it currently lacks, and the settled noise rules are retroactively applied over the already-ingested corpus — high-confidence noise auto-archived, ambiguous matches routed to operator approval, safe to re-run.
**Depends on**: Phase 111 (noise rules must be settled before they drive production archive writes), Phase 110 (Bulk Review is the approval surface for ambiguous matches).
**Depends on (external/cross-track)**: none.
**Requirements**: CLEANUP-01, CLEANUP-02
**Success Criteria** (what must be TRUE):

  1. A Stage 1 Outlook-archive side-effect is wired for sales `categorize_archive` categories — a `swarms.side_effects` entry + a cleanup worker that archives matching mail in `verkoop@smeba.nl` via Graph (sales uses Outlook archive where debtor uses iController delete) (CLEANUP-01).
  2. The noise rules are backfilled over the ingested corpus: high-confidence / AP-noise categories auto-archive, ambiguous matches route to Bulk Review for operator approval, and `own_outbound_invoice_loopback` is EXCLUDED from auto per the debtor incident (CLEANUP-02).
  3. The backfill is idempotent — re-running it produces no duplicate archives and no double side-effects (CLEANUP-02).

**Plans**: 3 plans

- [x] 112-01-PLAN.md — Backfill sweeper + disposition + Graph-id selection + RED tests (report mode; inert)
- [x] 112-02-PLAN.md — Go-live flip migration (written, not applied) + verdict-worker gate test
- [x] 112-03-PLAN.md — Report dry-run → canary → [BLOCKING] human-gated flip apply + live verify (completed 2026-06-04)

### Phase 112.5: Outlook Behavior Tracking (passive review signals)

**Goal**: Het dagelijkse review-oordeel voor sales verhuist van Bulk Review naar natuurlijk Outlook-gedrag — wij volgen mail-transities in `verkoop@smeba.nl` (Graph delta-sync, cron) en destilleren daaruit per `pipeline_event` een approve/reject/correctie-signaal dat de Wilson-kalibratie en (V10.0) self-learning voedt. Geen UI, geen gedragsverandering voor het team.
**Depends on**: Phase 112 (Stage-1 archive live — er valt nu gedrag te observeren), Phase 110 (pipeline_events ledger als join-anker).
**Depends on (external/cross-track)**: none. Voorloper van V10.0 reply-tracing (zelfde `conversation_id`-mechaniek, hier gegeneraliseerd naar alle transities).
**Beslissing (operator, 2026-06-04)**: optie "passief volgen" gekozen uit de opties-ladder (passief → categorie-voorstel → review-folder → add-in); Bulk Review blijft bestaan als operator-console (batch-historie, promoties). Debtor blijft Bulk Review (werk gebeurt in iController).
**Success Criteria** (what must be TRUE):

  1. Een cron-based Graph delta-sync legt mail-transities vast (replied / moved-to-afgehandeld / self-archived / restored-from-archive / category-edited / unread-aged) gekoppeld aan `email_id`/`pipeline_event` — idempotent en replay-veilig.
  2. Een signaal-afleiding mapt transities naar review-verdicts (approve/reject/correctie incl. her-classificatie via categorie-wijziging) in een query-bare tabel; restore-from-archive op een door óns gearchiveerde mail telt als false-positive-correctie.
  3. Folder-conventie-analyse beantwoordt de open vraag "hoe consistent is afgehandeld-vs-Archief?" met cijfers over de bestaande corpus, en de signaal-weging is daarop afgestemd.

**Plans**: 4 plans (4 waves; sequentiële executie — waves drukken alleen ordening uit)
Plans:

- [x] 112.5-01-PLAN.md — Wave 1: folder-conventie-analyse (SC-3, eerste deliverable) — pure aggregatie + one-shot read-only report-worker + operator stelt signaal-weging vast
- [x] 112.5-02-PLAN.md — Wave 2: datalaag — migration (4 RLS-tabellen) [orchestrator past toe via MCP] + graphFetch Prefer-header + folder-map registry-reader (SC-1, SC-2)
- [x] 112.5-03-PLAN.md — Wave 3: pure helpers test-first — transition-extract (cross-folder + split-over-ticks) + signal-derive (restore=correctie via ledger) + delta-client (bootstrap/410-suppressie) (SC-1, SC-2)
- [x] 112.5-04-PLAN.md — Wave 4: delta-sync worker (cron+event) — ledger-join, idempotente dubbele-tabel inserts, bootstrap-suppressie, Sugar-skip + [orchestrator] eerste live delta-tick verificatie (SC-1, SC-2)

### Phase 113: Stage 3 Sales Intent Agent (greenfield)

**Goal**: A sales-specific Stage 3 intent agent exists and runs through the existing registry-driven dispatcher, so every sales email leaving Stage 1 reaches a Stage 3 verdict — with no Stage 4 handler yet, unhandled intents land cleanly in the Kanban human-lane.
**Depends on**: Phase 110 (full-funnel swarm row with `stage3_coordinator_agent_key`; Bulk Review to observe verdicts), Phase 111 (Stage 1 flip so the Stage 3 denominator reflects real sales traffic), **Phase 114** (re-sequenced 2026-06-04: intent seeding consumes the customer-resolved corpus — customer-vs-prospect axis from Stage 2 output).
**Depends on (external/cross-track)**: none (the RESL dep is absorbed by Phase 114 running first).
**Requirements**: STAGE3-01, STAGE3-02, STAGE3-03
**Success Criteria** (what must be TRUE):

  1. A new Orq `sales-intent-agent` is registered in `orq_agents`, `swarm_intents` rows are seeded, `swarms.stage3_coordinator_agent_key` is set, and dispatch runs through the existing shared Stage 3 dispatcher with no edits to it (STAGE3-01).
  2. The sales intent vocabulary is seeded from the 827-email live corpus + the Phase 86 open-set discovery surface — emerging from data + operator promotion, never hand-curated (honors the locked 2026-05-19 principle) (STAGE3-02).
  3. After the Stage 1 flip, every sales email leaving Stage 1 reaches a Stage 3 verdict; intents with no Stage 4 handler land in the Kanban human-lane (Phase 76) with a clear reason — zero silent dead-letters (STAGE3-03).

**Plans**: TBD
**UI hint**: yes

### Phase 114: Stage 2 Resolver Reuse — cross-swarm generality proof

**Goal**: Sales-email Stage 2 resolves customers by reusing the v8.2 NXT resolver purely via per-swarm config — the concrete cross-swarm generality claim — with the debtor-only self-auth tier degrading to a no-op and customer-less prospects falling through to Stage 3.
**Depends on**: Phase 110 (`stage2_entity_resolver` + `resolution_config` populated on the swarm row).
**Depends on (external/cross-track)**: v8.2 RESL-01/02/03 (the dynamic-dispatch resolver seam in the parallel debtor workspace). ~~Sequenced to land AS that seam lands; interleaves with — does NOT block — the rest of V9.0.~~ **Re-sequenced 2026-06-04: 114 now executes BEFORE 113, so this dep sits on the critical path. As of 2026-06-04 the seam is NOT landed in this workspace (only registry columns exist; sales `resolution_config` = inert placeholder, `@/lib/automations/sales-email/resolve-customer` does not exist). The 114 discuss/plan must FIRST establish seam status in the debtor workspace and choose: wait / co-land / interim read-only resolution via `nxtRequest` without the Engine seam.** Prereq fixes: sales-ingest attachment + sender_email capture gaps (see pending todos 2026-06-04).
**Requirements**: STAGE2-01, STAGE2-02
**Success Criteria** (what must be TRUE):

  1. Sales Stage 2 resolves customers via `swarms.stage2_entity_resolver` + `resolution_config` (the RESL-03 dynamic-dispatch seam) with **zero Engine code changes** — config-only onboarding, verified by a no-Engine-diff check (STAGE2-01).
  2. The debtor-only self-auth resolution tier degrades to a no-op for sales, verified by a designed acceptance test (STAGE2-02).
  3. Customer-less prospects (no NXT match) fall through to Stage 3 without blocking the pipeline (STAGE2-02).

**Plans**: 7 plans (3 waves + 1 gap-closure wave)

- [x] 114-01-PLAN.md — Cherry-pick the v8.2 RESL-03 seam (dispatch + engine + config + steps + debtor adapter refactor) verbatim; donor suite green (wave 1)
- [x] 114-02-PLAN.md — Generic email_pipeline.resolution_audit table (RLS) + stage_2_resolution dry-run gate key + [BLOCKING] migration apply (wave 1)
- [x] 114-03-PLAN.md — Ingest prereq fixes (has_attachments + sender_email root-cause, D-14) + data-driven identifier-mining script (D-04) (wave 1)
- [x] 114-04-PLAN.md — Sales resolve-customer adapter + offerte/order/Sites lookups (nxtRequest) + one dispatch line + real resolution_config seed + registry-driven worker rewire + [BLOCKING] apply (wave 2)
- [x] 114-05-PLAN.md — STAGE2-02 acceptance tests (self-auth no-op + unresolved fall-through) + STAGE2-01 no-Engine-diff guard + D-02 rebase note (wave 3)
- [x] 114-06-PLAN.md — [gap] Worker fixes: CR-01 generic-path brand_id from config.scope.brand_scope, CR-02 entity_brand type-guard, WR-01 config-sourced nxt_database + worker tests (wave 1)
- [x] 114-07-PLAN.md — [gap] Sales adapter/lookup hardening: WR-02 postcode gating+medium confidence, WR-03 order \b anchor, WR-04 surface attempted identifiers, WR-05 quoted-header sender scope, IN-01 import merge (wave 1)

### Phase 115: SugarCRM Dead-Code Decommission

**Goal**: The dead SugarCRM code surface and stale registry notes are removed now that the live path is fully off Sugar — a clean-up that shrinks the attack/maintenance surface without touching any live behavior.
**Depends on**: Nothing within V9.0 (independent cleanup). Can run last or in parallel. Confirm no live consumer first.
**Depends on (external/cross-track)**: none.
**Requirements**: SUGAR-01
**Success Criteria** (what must be TRUE):

  1. `web/lib/automations/sales-email-analyzer/` (incl. `fetch-sugarcrm-emails.ts`), `web/app/api/automations/smeba/sugarcrm-search`, `…/write-analysis`, and the stale `zapier_tools` Sugar note are removed (SUGAR-01).
  2. A pre-removal check confirms no live path depends on the removed surface; the build / typecheck / tests stay green after removal (SUGAR-01).

**Plans**: TBD

---

### V10.0 Promotion Recommender + Learning Inbox + Reply-Tracing — DEFINED (re-sequenced 2026-06-02; was V9.0)

T2 synthesis on captured `email_feedback`, Learning Inbox tab on Bulk Review, data-driven resolver steps, immediate-apply new intents, granular dry-run gating — **plus reply-tracing**: outbound Outlook replies linked to the inbound `pipeline_event` via `conversation_id` become a no-form ground-truth feedback signal. Reads **two** feedback streams (debtor + V9.0 sales) and folds in multi-operator handling (`operator_id` scoping, vocabulary reconciliation). Depends on v8.0 closure (satisfied), V9.0 sales live, and v8.2 (cleaner Stage-2 signal). See `.planning/MILESTONES.md` for full charter.

### V11.0 Intent-Prioritised Handlers — DEFINED

Intent-coverage dashboard reading `swarm_intents` ∪ `pipeline_events`; handler-scaffolding template; dispatch via `swarm_intents.handler_event` registry. Depends on V9.0 (sales second-swarm intent volume) + V10.0 (operator-promoted intent definitions).

---

</content>

## Backlog

### Phase 999.1: UK/IE mailbox onboarding — apply 60-08 corpus-backfill + spot-check pipeline (BACKLOG)

**Goal:** Extend the debtor-email classifier to UK and Ireland mailboxes using the same corpus-backfill + 50-row hard-case spot-check methodology proven in 60-08. The current `classify.ts` regex set has English keywords as opportunistic first-pass coverage but was tuned on a NL/BE-only 6,114-email corpus — UK/IE traffic needs its own validation pass before any rule can be trusted as `promoted` for those entities.

**Trigger:** When the first UK or IE debtor mailbox is operationally onboarded — env var provisioned, NXT entity registered, or stakeholder ask.

**Scope:**

1. Add UK/IE rows to `debtor.labeling_settings` (e.g. `debiteuren@<entity>.uk`, `debiteuren@<entity>.ie`)
2. Verify Outlook ingest is wired for those mailboxes (Zapier trigger + ingest route)
3. Collect 1-2 weeks of UK/IE traffic in `email_pipeline.emails`
4. Run `debtor.email_analysis` LLM-classifier over the new corpus
5. Fire `classifier/corpus-backfill.run` → surfaces UK/IE-specific n/agree per existing rule
6. Fire `classifier/spotcheck.queue` with `max_per_rule=50` for any rule that hits N≥30 on the UK/IE corpus
7. Manual spot-check 50/rule
8. Likely follow-up regex extensions for UK/IE patterns:
   - BACS payment terminology (`BACS payment`, `Faster Payment`, `CHAPS`)
   - "Annual leave" / "On leave" OoO phrasing
   - British date formats (dd/mm/yyyy as well as Month-name forms)
   - GBP currency markers
   - Irish-specific vendor systems (Bank of Ireland, AIB notifications)
9. Promote per-rule via existing 0.92 gate (60-08)

**Effort:** ~half-day engineering (mostly ops + spot-check time, regex tuning iterative)

**Reference docs:**

- `.planning/phases/60-debtor-email-close-the-whitelist-gate-loop-data-driven-auto-/60-08-PLAN.md` — methodology
- `.planning/phases/60-debtor-email-close-the-whitelist-gate-loop-data-driven-auto-/60-08-RUNBOOK.md` — operator script
- `.planning/phases/60-debtor-email-close-the-whitelist-gate-loop-data-driven-auto-/60-09-PLAN.md` — regex tightening pattern
- `web/lib/debtor-email/classify.ts` — current regex set with English keywords (NL/BE-tuned)

**Plans:** 7/7 plans complete

Plans:

- [ ] TBD (promote with /gsd-review-backlog when first UK/IE mailbox lands)

### Phase 999.2: Unified Email Bulk Review surface — cross-swarm inbox with permission scoping (BACKLOG)

**Goal:** Replace the per-swarm `/automations/[swarm]/review` page with a single cross-swarm "Email Inbox" surface aggregating debtor-email + sales-email (+ future email-source swarms), with per-user mailbox-scoped access and review-level gating. Today every email-source swarm has its own review URL; operators with multi-mailbox responsibility have to context-switch. The unified surface gives one queue, with filters, scoped to what each user is allowed to see.

**Open architectural questions** (resolve at start of /gsd-discuss-phase):

1. **Where does the email/non-email boundary live?** Likely a new `swarms.kind` column (`'email' | 'voice' | 'document'`) so the inbox query becomes `WHERE swarms.kind = 'email'`. Future non-email swarms get their own kind without touching the email surface.
2. **New URL alongside, or replace?** Three options: (A) add `/automations/email/review` and keep `[swarm]/review`; (B) make `[swarm]/review` accept `[swarm]='email'` as a meta-group (one URL pattern, bookmarks survive); (C) full replacement. Recommendation: B for the first ship.
3. **What does "review level" mean concretely?** Stage gates (Stage-0 safety only vs Stage-1..4 full override)? Action depth (read-only viewer vs approver vs rule-promoter)? Risk classes (low-cost-bucket only)? The data model for permissions depends on the answer.
4. **Do user/role/mailbox permission tables already exist?** If yes, extend; if no, this becomes a greenfield auth-schema phase. Big difference in scope.

**Recommended staging** (each step independently shippable + revertible):

1. **Migration only** — add `swarms.kind` and `user_mailboxes` (or equivalent) join table, no UI. Backfill data, verify reads.
2. **Read-only unified inbox** — ship parallel surface (option A above for risk reduction), mailbox filter from `user_mailboxes`, no review-level gating yet, no actions changed.
3. **Add review-level gating** once levels are defined.
4. **Deprecate per-swarm surfaces** (or keep as power-user views).

**Why backlogged:** raised 2026-05-07 mid-perf-tuning of the existing surface; not the right time for a structural rewrite. Yesterday's fixes (timeline preload, automation_run_id threading, parallelization, viewport-sized PAGE_SIZE) make the existing surface workable in the meantime.

**Plans:** 4 plans

Plans:

- [x] 999.4-01-PLAN.md — Wave 0: live Orq Router smoke (gate A1+A2+A3) + RED test scaffolds for client.test, stage-0-safety-worker.test, classifier-screen-worker.test, automation-runs-sweeper.test
- [ ] 999.4-02-PLAN.md — Fix B: OrqClientTimeoutError class + 45s AbortController deadline at the existing invokeOrqAgent fetch boundary; Stage 0 worker try/catch coerces verdict=safe ONLY on OrqClientTimeoutError (D-01..D-04)
- [ ] 999.4-03-PLAN.md — Fix C: invokeOrqModel sibling helper + 60s system-prompt cache; swap stage-0-safety-classifier and stage-1-category-classifier call sites onto POST /v2/router/chat/completions (D-05..D-08)
- [ ] 999.4-04-PLAN.md — D-09 cron sweeper: TZ=Europe/Amsterdam */10 6-19 * * 1-5 marks stuck Stage 0 automation_runs failed with result.llm_reason=inngest_cancelled_stale, per-row JSONB merge, register in app/api/inngest/route.ts

### Phase 999.3: Phase out legacy `source='outlook'` Outlook auto-fetcher for debtor mailboxes (BACKLOG)

**Goal:** Make Zapier the **single, unambiguous trigger** for debtor-email ingest. Today `email_pipeline.emails` has 44k+ rows under `source='outlook'` (the column default), with the most recent debtor-mailbox writes from 2026-04-14 to 04-22 — so the legacy auto-fetcher has been mostly silent for those mailboxes for ~3 weeks but the wiring is still there. Architectural intent (confirmed 2026-05-07): Zapier is the canonical trigger so per-mailbox enable/disable is managed by toggling the Zap, not by code or cron config. The `outlook` ingestion path should be shut down for the 5 debtor mailboxes (smeba, smeba-fire, sicli-noord, sicli-sud, berki) to remove ambiguity.

**Why backlogged:** raised 2026-05-07 while patching the Stage 0 ingest collision (commit `d49b919`). The collision fix unblocks the immediate production issue; this phase removes the latent footgun. Not urgent — the legacy fetcher is already mostly silent — but worth a clean shutdown so the next regression-hunter doesn't lose a day to it.

**Open questions** (resolve at start of /gsd-discuss-phase):

1. Where does the legacy fetcher live? `web/debtor-email-analyzer/src/fetch-emails.ts` is a CLI (not a cron) that writes without `source` (so rows default to `'outlook'`). Are there other writers? Is anything still calling it?
2. Are downstream consumers of `source='outlook'` rows (e.g. `web/lib/automations/email-insights/configs/debtor.json` which filters on `source='outlook'`) impacted by switching to `source='zapier-debtor-ingest'`? If yes, decide: rewrite filters, or backfill/migrate the source label.
3. Sales-email uses `source='sugarcrm'` (34k rows) and is unaffected — confirm scope is debtor-only.

**Recommended staging:**

1. Audit who/what writes `source='outlook'` for debtor mailboxes today (likely: nobody actively, but verify).
2. Disable any active writer (cron job / CLI invocation / Zapier task).
3. Update analyzer filters to read from `source IN ('outlook', 'zapier-debtor-ingest')` for historical continuity, OR backfill old `source='outlook'` debtor rows to a unified label.
4. Remove the now-dead code path.

**Plans:** 4 plans

Plans:

- [ ] TBD (promote with /gsd-review-backlog when ready to scope)

### Phase 999.4: Stage 0 LLM-verdict timeout / Orq fallback-chain hardening (BACKLOG)

**Goal:** Stage 0 safety-worker's `llm-verdict` step intermittently exceeds Inngest's per-step timeout (~90s observed) when Orq.ai's primary model fails and the fallback chain (Bedrock → Anthropic-direct → Gemini → Mistral) takes over. Orq trace data shows Stage 0 latency tail with outliers at **43s, 58s, 64s, 89s, 105s, 190s, 380s, 498s, 761s, 1052s** (17 minutes!) and Stage 1 outliers at **88s, 165s, 209s, 960s** (16 minutes). When the Orq call eventually completes, the Inngest run has long been Cancelled with `state and stack mismatch: <hash> not found in state; the function has probably ended` — observed 5 times in 2h on 2026-05-07. Result: emails get a stale `automation_runs.status='pending'` row and never advance past Stage 0. Vercel `maxDuration=300` is already set, so Vercel function timeout is NOT the limiting factor.

**Why backlogged:** raised 2026-05-07 while validating the Stage 0 + screen-worker structural fixes (commits `d49b919`, `cf8d29f`). The structural blockers are dead; this is a quality-of-service issue with a known graceful-degradation pattern available. Not blocking ingest end-to-end (most calls complete in 1-2s), but tail latency creates intermittent stuck rows that need cleanup.

**Two fix options** (resolve at /gsd-discuss-phase):

1. **Fix B — Tighten Orq client timeout + graceful degradation in code.** ~15-line change in `web/lib/inngest/functions/stage-0-safety-worker.ts`. Set explicit 45s deadline on `llmInjectionVerdict()`. Wrap `step.run("llm-verdict", ...)` in try/catch. On timeout/error, coerce `verdict='safe'` (let email through; assume non-injection). Mirrors the Phase 74 D-11 pattern already in place for `classifier-screen-worker.ts:226-256`. **Pro:** in-tree fix, deterministic, doesn't depend on Orq dashboard work. **Con:** masks underlying Orq performance issue; one less signal to fix root cause.

2. **Fix C — Tune Orq agent fallback chain.** Inspect `stage-0-safety-classifier` (and `stage-1-category-classifier` — same symptom) in Orq dashboard. Identify which primary model is failing and falling through. Options: pin to a faster, more reliable primary; trim fallback list to 2 hops max; remove cross-region hops. **Pro:** addresses root cause. **Con:** requires Orq dashboard access + monitoring; primary failures may be transient (Bedrock cold-start, regional outage).

**Recommendation:** ship Fix B first (immediate stability) then file Fix C as observability work to track Orq tail latency over time. Both could ship in one phase.

**Related signals** (worth correlating):

- Pre-existing 405 OData / ZapierRelayError ReadTimeout errors in Vercel logs (different Inngest function, `categorize` step) likely share root cause: Zapier-relayed external calls timing out under load.
- The 11,758-token Stage 0 outlier suggests body truncation upstream may also be useful.

**Plans:** 4 plans

Plans:

- [ ] TBD (promote with /gsd-review-backlog when ready to scope)

### Phase 999.5: ~~Restore Stage 0/1 cost_cents~~ — CANCELLED 2026-05-07

**Status:** CANCELLED. The phase premise (cost_cents = 0 after Plan 03 Router swap) is no longer applicable — Plan 03 was reverted (see commit `31fc9ce`) after empirical evidence on 2026-05-07 showed the Orq Agents-product queue-stuck issue isn't chronic (50 most recent Stage 0/1 traces all healthy, median ~1.5s, p99 < 8s, zero outliers >10s). Stage 0/1 stays on the Agents path (`/v2/agents/{key}/responses`), which already returns per-call billing on the response — `cost_cents > 0` keeps working without any reconciliation pipeline.

**Findings worth preserving (locked while researching):**

- Cost field path on Orq traces: `attributes.orq.billing.total_cost` (USD float, e.g. `0.003193` for one Stage 0 call). Available for both `product=agents` and `product=router` traces.
- Trace `name` field equals our `agent_key` exactly (`stage-0-safety-classifier`, `stage-1-category-classifier`) — easy correlation if we ever need trace reconciliation.
- Custom `metadata.*` is arbitrary key/value, persisted on the trace — pass `metadata: { agent_run_id }` at invoke for 1:1 correlation back to `agent_runs.id`.
- MCP `list_traces` filters: model, entity_key, time, search — no native name/metadata filter, so reconciliation would need full-text search or time-window scan + client-side join.
- No Orq invoke endpoint (`/v2/deployments/invoke`, `/v3/router/responses`, `/v2/router/chat/completions`) returns per-call cost on the response — only token usage. Cost lives only in traces.
- Two empty deployments remain in Studio from the abandoned exploration (`stage_0_safety_classifier` id `82f5239c-3272-4ea8-8d8e-8ac8a12c9b39`, `stage_1_category_classifier` id `01979a45-c6f2-41da-a22c-4bd65670960a`) — safe to delete; never wired to traffic.

**If reopened in the future:** the trace-reconciliation approach (Inngest cron polls Orq traces API, joins by `metadata.agent_run_id`, writes `agent_runs.result.cost_cents`) is the right shape. The Wave 0 research above is reusable.

**Plans:** 0 (cancelled)

### Phase 999.6: Stage 1 noise rule for Ariba / SAP Business Network notifications (BACKLOG)

**Goal:** Promote a Stage 1 Pass-1 regex rule that classifies SAP Business Network / Ariba onboarding-and-connection emails as terminal noise (`category_key='system_notification'` or similar) so they short-circuit before the LLM Pass-2 + Layer-2/3 NXT lookup tax.

**Why:** Today these emails flow through to `category_key='unknown'`, burn an LLM call, then waste an NXT contact + identifier lookup, and finally surface as "unresolved" at Stage 2 — pure noise the resolver can't help with anyway.

**Concrete sample (2026-05-07):**

- email_id `365cc739-5973-4362-8a47-a7d489a3b0f6`
- Subject: "IKEA would like to connect with you on SAP Business Network"
- Sender: `noreply@us.bn.cloud.ariba.com`
- Hit both `debiteuren@smeba.nl` and `debiteuren@smeba-fire.be` simultaneously
- Discovered during `/gsd-debug stage1-unknown-no-dispatch` deep-dive

**Pattern candidates (to validate before promotion):**

- Sender domain regex: `\.bn\.cloud\.ariba\.com$`
- Subject regex (case-insensitive): `SAP Business Network|would like to connect|ariba network`

**Evidence-scope constraint:** per `feedback_classifier_evidence_scope.md`, all promoted classifier rules must have multi-entity evidence. Today's evidence is `debiteuren@smeba.nl` + `debiteuren@smeba-fire.be` only. Collect 2–3 more samples across berki / iccafe before promoting (Bulk Review search filter `from:ariba.com` over a 30-day window should surface them).

**Requirements:** TBD

**Plans:** 0 plans

Plans:

- [ ] TBD (promote with /gsd-review-backlog when 2-3 cross-entity samples are collected)

### Phase 999.7: Stage 0 budget-breach failures on long emails (BACKLOG)

**Goal:** Stop Stage 0 safety classifier from rejecting (and stranding) emails that exceed its 5000-token budget. Today such emails get rejected outright rather than truncated, so the row never advances past Stage 0 and surfaces downstream as "email row not found" / unresolved.

**Why backlogged:** raised 2026-05-07 — newly identified as a distinct root cause for "email row not found" symptoms, separate from the earlier race-mode failures (12:59 / 13:11). Decide approach next week.

**Concrete samples (2026-05-07 14:46):**

- `budget breach: token_count 12358 > 5000` (smeba-fire, 14:46:45) — 2.5× over budget
- `budget breach: token_count 12362 > 5000` (smeba.nl, 14:46:44) — 2.5× over budget

**Two options to weigh at /gsd-discuss-phase:**

1. **Raise the Stage 0 token budget** — simplest; pick a ceiling that covers the realistic long-email tail (e.g. 16k or 32k) and accept the marginal cost.
2. **Truncate body upstream before Stage 0** — keep budget tight; truncate at ingest (head + tail window, or strip quoted history / signatures). Preserves cost discipline; needs care so injection content isn't smuggled past the safety check via truncation.

Hybrid is plausible (raise budget moderately + add quoted-history strip).

**Open questions:**

- Where exactly is the 5000-token budget configured (Stage 0 worker code vs Orq agent settings)?
- Is the rejection path emitting a clean failure status on `automation_runs`, or is it the source of stale `pending` rows that the 999.4 sweeper would also catch?
- Distribution: how many emails/day breach? If <1/day, raise-budget is fine; if many, truncation pays off.

**Requirements:** [BUDG-EXT-01, BUDG-EXT-02, STRIP-01, STRIP-02, STRIP-03, STRIP-04, INTEG-01, INTEG-02, INTEG-03, INTEG-04, INTEG-05]

**Plans:** 3 plans

Plans:

- [ ] 999.7-01-PLAN.md — Wave 0: install email-reply-parser, seed fixtures, write RED tests for strip helper + bump budget-counter assertion
- [ ] 999.7-02-PLAN.md — Wave 1: ship strip-quoted-history.ts + bump BUDGET_CEILING_TOKENS to 16000 with role-split comment
- [ ] 999.7-03-PLAN.md — Wave 2: wire strip step into Stage 0 worker, extend telemetry dual-write, lock ORIGINAL body forwarding to Stage 1

### Phase 999.8: Stage 1 LLM 2nd-pass confidence gate + predictor attribution in verdict feedback (BACKLOG)

**Depends on:** Phase 81 (fold Stage 1 into stage-keyed shell). The UI filter chips (`predictor`, `confidence`) and predictor chip on row cards plug into the chip-strip + row list + detail pane Phase 81 is building under `web/app/(dashboard)/automations/[swarm]/stage-1/`. Backend gate + attribution (`classifier-screen-worker.ts`, `labeling-flip-cron.ts`, `agent_runs.predictor` migration, `recordVerdict` predictor capture) is independent of Phase 81 and could ship first, but the UI half MUST sequence after Phase 81 lands or the chip-strip API won't exist.

**Goal:** Stop Stage 1 from auto-applying `categorize_archive` on `medium`/`low`-confidence LLM 2nd-pass predictions, and split the human-verdict feedback math by *predictor* (regex vs LLM 2nd-pass) so that LLM mistakes don't pollute the regex's Wilson-CI promotion/demotion gates (and vice versa).

**Why:** today `web/lib/inngest/functions/classifier-screen-worker.ts:287-330` emits `classifier/verdict.recorded` with `decision: "approve"` unconditionally after the LLM returns — `low`/`medium`/`high` all follow the same path into `classifier-verdict-worker.ts` which applies the registry action (`categorize_archive` → Outlook categorize + archive). The numeric `confidence` written to `pipeline_events` is *display-only*: `numericConfidence()` maps `medium→0.7` for dashboards; nothing reads it for routing. The only escape valve is the LLM returning `"unknown"` (action=`reject`).

Compounding this, `labeling-flip-cron.ts:94-122` aggregates `agent_runs.human_verdict` per mailbox into a single Wilson-CI lower bound — predictor-blind. Wrong LLM calls (which arrive *because* the regex abstained) currently get counted into the same accuracy stream as wrong regex calls. Worst case: an LLM that mis-classifies "invoice correction request" → `payment_admittance` at medium confidence drags the per-mailbox CI low enough to demote the regex's `dry_run=false` status, even though the regex rules themselves are unchanged.

**Motivating sample (2026-05-08):**

- email_id `09823c92-f6c4-4bce-bb9c-e7935e508e40` (mailbox `debiteuren@smeba-fire.be`, entity `smeba-fire`)
- Subject: "FW: Invoice 17338747" from `Therese.Hendriks@ago-groep.nl`
- Stage 1 regex: `no_match` → unknown
- Stage 1 LLM 2nd-pass: `payment_admittance` at `medium` (numeric 0.700)
- LLM reasoning: "Email requests corrected invoice and credit note; administrative/accounting correspondence about billing documentation" — i.e. the LLM described a Stage 3 *intent* (invoice correction request) while forced to pick a Stage 1 noise key from the closed list.
- Outcome: Outlook label `Payment Admittance` applied + archived. Reached operator only because a colleague flagged it manually; would otherwise be invisible.
- Full trace: `agent_runs.id=57097576-bb47-419e-934a-41508e2f304c`, `pipeline_events` Stage 1 row at 2026-05-08 13:33:37 UTC. See NOTES.md in this phase folder.

**Scope of the gate (to refine in /gsd-discuss-phase):**

- Hard threshold: `categorize_archive` requires `llm_confidence === "high"`. `medium`/`low` LLM verdicts route to a new review surface (likely a Stage 1 LLM low-confidence lane, distinct from the existing Stage 1 Bulk Review which currently only sees regex-promoted predictions).
- The "unknown" → `action='reject'` (label-only-skip) escape valve stays as today.
- Regex predictions are *not* gated by this phase — their conservatism is structural (specificity ordering + first-match-wins) and their promotion already passes through Wilson-CI on `labeling-flip-cron`. Phase 999.8 only touches the LLM 2nd-pass path.

**Scope of predictor attribution (to refine in /gsd-discuss-phase):**

- Every Stage 1 prediction must carry a `predictor` tag (at minimum: `regex:rule_X` | `llm_2nd_pass`). Today this is reconstructable by joining `pipeline_events.decision_details.regex.matchedRule` and `.llm_invoked`, but it is *not* on the verdict-side `agent_runs` row written by `recordVerdict` (`web/app/(dashboard)/automations/[swarm]/review/actions.ts:131-146`). The phase must thread `predictor` onto the verdict row so the feedback math can group on it without a cross-table join.
- `labeling-flip-cron` (and any successor learning loop) must aggregate Wilson-CI per-predictor, not just per-mailbox. Minimum: regex stream vs LLM-2nd-pass stream. Whether regex splits further per-rule is a discuss-phase open question.

**Open questions for /gsd-discuss-phase:**

1. **UI affordance**: should Bulk Review surface "predicted by: LLM (medium)" as a visible chip, and offer verdict classes like *"LLM was wrong — regex should be extended"* vs *"regex rule X was wrong"* — or keep the UI as-is and only split server-side?
2. **Regex attribution granularity**: LLM-vs-regex (2 streams) or LLM-vs-each-regex-rule (N streams) in the feedback math?
3. **Low-confidence routing target**: new dedicated surface, or reuse the Stage 0 escalate-to-Kanban pattern (`escalateToKanban` in `web/app/(dashboard)/automations/[swarm]/review/actions.ts`)?
4. **Backfill**: do we re-process the existing `pipeline_events` history to backfill `predictor` onto historical `agent_runs` rows for the verdict-feedback math, or do we cut over forward-only and let the LLM-vs-regex CI separately accumulate from cutover?
5. **Threshold scope**: does the `high`-only gate apply uniformly across categories, or are some `swarm_noise_categories` rows (e.g. high-volume safe categories like `out_of_office`) allowed `medium` because the cost of a false positive there is lower?

**Non-goals:**

- Changing the LLM's output contract (still `"low"|"medium"|"high"` enum). A real top-2 + margin signal is a separate, larger phase.
- Changing the regex-pass logic.
- Stage 3 (coordinator / intent classifier) confidence gating — that lives in the Stage 3 RFC and is out of scope.

**Risk if not addressed:** every LLM 2nd-pass mis-classification is silently terminal for the email (auto-archive, no Bulk Review surface, no Stage 3) AND feeds back into the regex's promotion math as if the regex was the one that was wrong. Compounding effect — the better the regex gets, the more it abstains, the more the LLM picks up borderline cases at medium confidence, the more LLM mistakes there are to drag the regex's CI down.

**Requirements:** [REQ-GATE-01, REQ-CALIB-02, REQ-FP-03, REQ-MIG-07, REQ-VERDICT-08, REQ-CRON-09, REQ-CHIP-05, REQ-ROWCHIP-08]

**Plans:** 8 plans

Plans:

- [ ] 999.8-01-PLAN.md — Wave 0: RED test scaffolds for gate, predictor write, cron split, page filter
- [ ] 999.8-02-PLAN.md — Wave 1: agent_runs.predictor migration + denormalize predictor onto pipeline_events + swarm_type reconciliation (cron filter realign to 'debtor-email')
- [ ] 999.8-03-PLAN.md — Wave 2: confidence gate in classifier-screen-worker + classifier/screen.requires_review event (D-01, D-10)
- [ ] 999.8-04-PLAN.md — Wave 2: Orq.ai re-calibration of stage-1-category-classifier so 'high' means ~95%+ (D-02)
- [ ] 999.8-05-PLAN.md — Wave 3: recordVerdict predictor writeback + email_id plumbing fix (D-07, D-08, Pitfall 9)
- [ ] 999.8-06-PLAN.md — Wave 4: labeling-flip-cron per-predictor Wilson-CI + D-03 calibration-drift signal (2% warn / 5% alarm)
- [ ] 999.8-07-PLAN.md — Wave 5: Stage 1 chip-strip filter chips (predictor + confidence) + loadPageData filters (D-05, D-06, D-11) — depends on Phase 81 merged
- [ ] 999.8-08-PLAN.md — Wave 5: Per-row predictor chip on row card (D-08, D-12) — depends on Phase 81 merged

### Phase 999.9: info@smeba.nl info-routing swarm — registry-only onboarding (BACKLOG)

**Goal:** Onboard `info@smeba.nl` as its own swarm (`swarm_type='info-routing'`, `entity_brand='smeba'`) using only registry inserts — proving the cross-swarm thesis on a second swarm type after debtor-email + sales-email. Stage 0→1 noise filter for ~61 inbound emails/day; Stage 3 ships as a shadow placeholder with a single `triage_required` intent. Real router vocabulary (department-routing) emerges through Phase 86's discovery surface — never hand-curated.

**Hard prerequisites (cannot start until ALL four close):**

- Phase 78 (build-time codegen for `swarm_intents` + `swarm_noise_categories` literal-union TS types)
- Phase 84 (`swarms.tenant_domains` column + own-domain loopback rule + codegen)
- Phase 85 (Stage 3 prompt v3 + V3 schema with `intent_proposal` field)
- Phase 86 (`intent_proposals_v1` view + Bulk Review cluster tab, cross-swarm by default)

Earliest practical start = V8.2 cycle, after `/gsd-audit-milestone v8.1` confirms 78/84/85/86 all landed.

**Pre-work already done (Spikes 001-004, 2026-05-19):**

- 5,505 rows of `info@smeba.nl` 90-day corpus persisted in `email_pipeline.emails` (idempotent on `source_id`; re-runs cheap)
- Cross-tenant Graph access via `zapier@moyneroberts.com` connection `56014785` verified
- 7-rule first-match-wins noise classifier proven against corpus: 76.9% noise coverage (~14 emails/day reach Stage 3, ~7/day real business email)
- Cross-swarm rule transferability quantified: 56% of debtor-email's production regex transfers cleanly (`spam`, `payment_admittance`, `auto_reply`, `ooo_temporary`, `ooo_permanent`); +1 new rule (`generic_noreply_notification`, 4.0% volume); `own_domain_loopback` (17.9%) inherits Phase 84

**Reference documents (read before /gsd-discuss-phase 999.9):**

- Full proposal: `docs/designs/2026-05-19-smeba-info-routing-swarm-proposal.md` (5 open plan-time questions kept deliberately unresolved)
- Implementation blueprint: `.claude/skills/spike-findings-agent-workforce/references/info-routing-swarm-phase-88.md` (auto-loads via CLAUDE.md routing line)
- Spike series + verdicts: `.planning/spikes/MANIFEST.md`
- Architecture canon: `docs/agentic-pipeline/README.md` + `stage-1-regex.md`

**Open plan-time questions (deferred to /gsd-discuss-phase 999.9):**

1. Does `generic_noreply_notification` ship info-routing-only or promote cross-swarm to debtor-email?
2. Outlook label vocabulary — share debtor-email labels or info-routing-specific labels?
3. `payment_admittance` archive-vs-forward — debtor-email archives; info-routing might forward to finance since this IS the misroute case (62 of 5,316 emails over 90d are misrouted payment confirmations)
4. Shadow-mode duration before flipping Stage 3 live? (Recommendation: 2 weeks ≈ ~200 router decisions for Phase 86 to cluster against)
5. Block on Phase 64 (Stage 0)? Spike 004 measured ~7% phishing leakage past M365 `[SPAM]` (~1/day) — recommendation: ship without, accept the risk surface

**Why this is NOT a brand variant of debtor-email:** Stage 3 dispatches by department (sales/finance/HR/support), not by debt-collection intent (`payment_dispute`, `credit_request`, `invoice_copy_request`). No useful Stage 3 overlap. The fact that Stage 1 rules are mostly reusable is exactly what the registry-driven architecture is designed for — same regex, different `swarm_type` row.

**Requirements:** TBD (5 plan-time questions above resolve into requirements)
**Plans:** 0 plans

Plans:

- [ ] TBD (run /gsd-discuss-phase 999.9 once v8.1 phases 78/84/85/86 are confirmed live)

### Phase 999.10: Bulk Review queue — per-stage dry-run indicator + condensed action-pill row (BACKLOG)

**Goal:** Two operator-facing queue-overview enhancements to the Bulk Review row strip (captured 2026-06-01; operator owns Bulk Review UX — design decisions are the operator's, this is capture-only).

1. **Per-stage dry-run/live indicator** on the 5 stage pills (Safety / Noise / Customer / Topic / Action) in each queue row, with a hover tooltip explaining what "dry-run" means for that stage (the pipeline computes the verdict but does not apply it — no Outlook/iController side-effect yet). So the operator sees at a glance which stages are still shadow vs live.
2. **Condensed row:** move the row-level action pill ("Check this one" / "Review the AI's calls"), today rendered below the subject in the middle column, onto the **same line as the stage pills** (right column) for a denser, single-line-per-email overview.

**Design nuance to resolve at planning:** today `dry_run` is per-**mailbox** (`debtor.labeling_settings.dry_run`), not per-stage — a true per-stage indicator should read the per-stage promotion/live state (the graduated-automation direction), not just the mailbox flag.

**Why it matters:** directly supports the v8.2 "auto-flip only after the full-population dry-run clears ≥99% (Wilson-CI)" gate — the operator needs to SEE which stages have been flipped live per that gate. Relates to v8.2 Stage 2 Resolution Recall.

**Components:** `web/app/(dashboard)/automations/[swarm]/_shell/chip-strip.tsx` (stage pills) + `web/app/(dashboard)/automations/[swarm]/_shell/components/row-strip.tsx` (action pill placement + dry_run).

**Requirements:** TBD
**Plans:** 0 plans

Plans:

- [ ] TBD (promote with /gsd-review-backlog when ready)
