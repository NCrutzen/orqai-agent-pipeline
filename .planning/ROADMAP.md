# Roadmap: Agent Workforce

## Overview

Browser-based interface for creating, deploying, testing, and iterating AI agent swarms on Orq.ai. Non-technical colleagues describe a use case and watch agents get designed, deployed, and tested -- with a real-time dashboard, node graph visualization, and HITL approval workflows. V4.0 adds a browser automation builder so that agents can interact with no-API systems (NXT, iController, Intelly) -- users upload SOPs and screenshots, AI generates and tests Playwright scripts on Browserless.io, and verified scripts deploy as MCP tools attached to agents. V6.0 adds an executive-facing management dashboard with 360-degree data integration (Agent Workforce + Zapier + Orq.ai), full UI redesign for CEO/CTO/CFO audience, and O365 SSO. V7.0 transforms the app into a cinematic swarm operating system with real-time delegation graphs, AI briefings, Kanban job tracking, and a new glassmorphism design system. CLI skills for technical users are available separately in the orqai-agent-pipeline repo.

## Milestones

| Version | Milestone | Status |
|---------|-----------|--------|
| **v0.3** | Core Pipeline + V2.0 Foundation -- V1.0 spec generation + V2.0 install infrastructure | **Shipped 2026-03-01** |
| **V2.0** | Autonomous Orq.ai Pipeline -- deploy, test, iterate, and harden agent swarms via MCP/API | **Shipped 2026-03-02** |
| **V2.1** | Experiment Pipeline Restructure -- rewrite test/iterate with native MCP, smaller subagents | **Shipped 2026-03-13** |
| **V3.0** | Web UI & Dashboard -- browser-based pipeline with authentication, real-time visibility, node graph, HITL approvals | **In Progress** |
| **V4.0** | Browser Automation Builder -- SOP + screenshots to MCP tools for no-API systems via Browserless.io | **Defined** |
| **V5.0** | Cross-Swarm Intelligence -- ecosystem mapping, drift detection, overlap analysis, and fix proposals | **Defined** |
| **V6.0** | Executive Dashboard & UI Revamp -- 360-degree management dashboard, UI redesign, O365 SSO | **Partially Complete** |
| **V7.0** | Agent OS -- cinematic swarm operating view with new design system, real-time data, AI briefings, delegation graphs | **Shipped 2026-04-30** |
| **v8.0** | Agentic Platform -- 4-stage funnel canonical architecture (input safety, regex, entity enrichment, intent coordinator, handler) + per-run budgets, 4-axis Bulk Review, promotion ladder, sales-email validation | **Defining** |

---

<details>
<summary>v0.3 Core Pipeline + V2.0 Foundation (Phases 1-05.2) -- SHIPPED 2026-03-01</summary>

**11 phases, 28 plans, 50 requirements satisfied**
**Full archive:** `milestones/v0.3-ROADMAP.md` | `milestones/v0.3-REQUIREMENTS.md`

- [x] Phase 1: Foundation -- References, templates, architect subagent (completed 2026-02-24)
- [x] Phase 2: Core Generation Pipeline -- 5 subagents: researcher, spec-gen, orch-gen, dataset-gen, readme-gen (completed 2026-02-24)
- [x] Phase 3: Orchestrator and Adaptive Pipeline -- Orchestrator wiring with adaptive depth (completed 2026-02-24)
- [x] Phase 4: Distribution -- Install script, update command, GSD integration (completed 2026-02-24)
- [x] Phase 04.1: Discussion Step -- Structured gray area surfacing (completed 2026-02-24)
- [x] Phase 04.2: Tool Selection & MCP Servers -- Tool resolver + unified catalog (completed 2026-02-24)
- [x] Phase 04.3: Prompt Strategy -- XML-tagged, context-engineered instructions (completed 2026-02-24)
- [x] Phase 04.4: KB-Aware Pipeline -- End-to-end knowledge base support (completed 2026-02-26)
- [x] Phase 5: References, Install, Capability Infrastructure -- V2.0 references + modular install (completed 2026-03-01)
- [x] Phase 05.1: Fix Distribution Placeholders -- OWNER/REPO to NCrutzen/orqai-agent-pipeline (completed 2026-03-01)
- [x] Phase 05.2: Fix Tool Catalog & Pipeline Wiring -- Memory tool identifiers + research brief wiring (completed 2026-03-01)

</details>

<details>
<summary>V2.0 Autonomous Orq.ai Pipeline (Phases 6-11) -- SHIPPED 2026-03-02</summary>

**7 phases, 11 plans, 23 requirements satisfied**
**Full archive:** `milestones/V2.0-ROADMAP.md` | `milestones/V2.0-REQUIREMENTS.md`

- [x] Phase 6: Orq.ai Deployment -- Deployer subagent, MCP/REST adapter, idempotent deploy (completed 2026-03-01)
- [x] Phase 7: Automated Testing -- Tester subagent, dataset pipeline, evaluator selection, 3x experiments (completed 2026-03-01)
- [x] Phase 7.1: Test Pipeline Tech Debt -- SDK-to-REST mapping, package declaration, template cleanup (completed 2026-03-01)
- [x] Phase 8: Prompt Iteration Loop -- Iterator subagent, diagnosis, proposals, HITL approval, audit trail (completed 2026-03-01)
- [x] Phase 9: Guardrails and Hardening -- Hardener subagent, guardrail promotion, quality gates, --agent flags (completed 2026-03-01)
- [x] Phase 10: Fix Holdout Dataset Path -- Holdout dataset ID alignment, step label fixes (completed 2026-03-02)
- [x] Phase 11: Flag Conventions + Tech Debt -- Flag alignment, step renumbering, files_to_read fixes (completed 2026-03-02)

</details>

<details>
<summary>V2.1 Experiment Pipeline Restructure (Phases 26-33) -- SHIPPED 2026-03-13</summary>

**8 phases, 9 plans, 24 requirements satisfied**
**Full archive:** `milestones/V2.1-ROADMAP.md` | `milestones/V2.1-REQUIREMENTS.md`

- [x] Phase 26: Dataset Preparer -- MCP/REST upload, smoke test, stratified splits, JSON contract (completed 2026-03-11)
- [x] Phase 27: Experiment Runner -- REST-only execution, adaptive polling, holdout mode (completed 2026-03-11)
- [x] Phase 28: Results Analyzer -- Student's t statistics, category slicing, hardener compatibility (completed 2026-03-12)
- [x] Phase 29: Test Command Rewrite -- 3-subagent orchestration with validation gates (completed 2026-03-12)
- [x] Phase 30: Failure Diagnoser -- Evaluator-to-section mapping, diff proposals, HITL approval (completed 2026-03-12)
- [x] Phase 31: Prompt Editor -- Section-level changes, re-deploy delegation, score comparison (completed 2026-03-12)
- [x] Phase 32: Iterate Command Rewrite -- 2-subagent loop with 5 stop conditions (completed 2026-03-13)
- [x] Phase 33: Fix Iteration Pipeline Wiring -- Holdout schema path + mcp_available forwarding (completed 2026-03-13)

</details>

### Phase 38.1: Full Pipeline Lifecycle
**Goal**: Users can deploy designed agent swarms to Orq.ai, run automated tests, iterate on prompt quality based on test results, and harden agents with production guardrails — all from the web UI
**Depends on**: Phase 37.1 (uses conversational pipeline, chat UI, streaming narrator)
**Requirements**: DEPLOY-WEB-01 through DEPLOY-WEB-04, TEST-WEB-01 through TEST-WEB-04, ITER-WEB-01 through ITER-WEB-03, HARD-WEB-01
**Success Criteria** (what must be TRUE):
  1. After specs are generated, the pipeline deploys agents to Orq.ai via MCP/REST and shows deployment status in the chat
  2. User can trigger automated testing — datasets are prepared, experiments run 3x, results analyzed with statistical summaries
  3. When tests reveal failures, the pipeline diagnoses issues, proposes prompt fixes, and asks user for approval before applying
  4. User can apply guardrails (promoted from test evaluators) to harden production agents
  5. The iterate loop (diagnose → fix → re-deploy → re-test) runs up to 5 times or until the user is satisfied
**Plans**: 3 plans

Plans:
- [ ] TBD (run /gsd:plan-phase 38.1 to break down)

**Pipeline stages to add (9 agents from orqai-agent-pipeline repo):**
| Stage | Agent File | Purpose |
|-------|-----------|---------|
| deployer | deployer.md | Deploy agents, tools, KBs to Orq.ai via MCP/REST |
| dataset-preparer | dataset-preparer.md | Prepare, augment, and upload test datasets |
| experiment-runner | experiment-runner.md | Run 3x experiments with evaluator selection |
| results-analyzer | results-analyzer.md | Statistical analysis of experiment results |
| tester | tester.md | Orchestrate the full test pipeline (dataset → experiment → analysis) |
| failure-diagnoser | failure-diagnoser.md | Map test failures to specific prompt sections |
| prompt-editor | prompt-editor.md | Apply approved prompt changes and re-deploy |
| iterator | iterator.md | Orchestrate diagnose → fix → re-test loop |
| hardener | hardener.md | Promote test evaluators to production guardrails |

### Phase 43: Upstream Sync: orq-agent-pipeline -> agent-workforce

**Goal:** Implement a formal sync workflow so that future changes to agent prompts, new agents, or structural changes in the orqai-agent-pipeline GitHub repo are automatically detected and propagated to the web pipeline — no manual discovery needed
**Requirements**: (1) Pipeline manifest tracking expected file paths, input context tags, and output format contracts (2) Change detection that classifies upstream diffs by impact tier (transparent / monitor / review / code-change) (3) Auto-update PIPELINE_STAGES + STAGE_CONTEXT_MAP when agents are added/removed/renamed (4) GitHub webhook or scheduled check that creates issues/PRs for breaking changes (5) Dashboard UI showing sync status and pending upstream changes
**Depends on:** Phase 38.1 (all agents must be in the pipeline before sync can track them)
**Plans:** 3 plans

Plans:
- [ ] 43-01-PLAN.md -- Manifest JSON + types, refactor stages.ts and pipeline.ts to be manifest-driven
- [ ] 43-02-PLAN.md -- Upstream sync detection (Vercel Cron, GitHub Trees API, tier classification, issue/PR creation), health dashboard Pipeline Sync UI
- [ ] 43-03-PLAN.md -- Systems context passthrough (serialize DB systems to markdown, inject into architect stage)

### Phase 55: Debtor-email pipeline hardening

**Goal:** Production-harden de debtor-email pipeline zodat het intent + copy-document swarm veilig alle 6 debtor-mailboxen kan bedienen. Scope: (a) vervang hardcoded `ICONTROLLER_COMPANY` in cleanup-worker / catchup / review-actions door per-row `mailbox_id` uit `debtor.labeling_settings`; (b) createIcontrollerDraft idempotency + HTML-comment operator marker + cleanup (swarm launch blocker); (c) review-lane provenance chips + Zapier whitelist intra-company forwards + `skipped_not_whitelisted → status=skipped` hygiene + generieke verdict-route `/automations/review/[runId]`; (d) `public.agent_runs` schema met `swarm_type` discriminator + `body_version`/`intent_version` + minimale 👍/👎 verdict-UI (self-training Phase 1 hooks).
**Requirements**: See `.planning/phases/55-debtor-email-pipeline-hardening/55-CONTEXT.md` and source todos: `2026-04-23-cleanup-worker-multi-mailbox.md`, `2026-04-23-create-draft-idempotency-and-cleanup.md`, `2026-04-23-debtor-review-pipeline-provenance-and-scoping.md`, `2026-04-23-self-training-loop-debtor-email-swarm.md` §Phase 1
**Depends on:** Phase 54
**Blocker for:** copy-document swarm production launch (alle mailboxen behalve Smeba)
**Plans:** 5 plans

Plans:
- [ ] 55-01-PLAN.md — Wave 0: public.agent_runs migration + icontroller_drafts sentinel + labeling_settings.icontroller_mailbox_id + vitest scaffolding + 10 test stubs
- [ ] 55-02-PLAN.md — Multi-mailbox resolver: per-row mailbox_id in cleanup-worker / catchup / review-actions; EmailIdentifiers contract swap; ingest route writes icontroller_mailbox_id
- [ ] 55-03-PLAN.md — createIcontrollerDraft idempotency (sentinel row) + HTML-comment operator marker + orphan reconcile in cleanup-worker
- [ ] 55-04-PLAN.md — Review-lane provenance chips (7 triggers) + skipped_not_whitelisted hygiene + generic /automations/review/[runId] route + POST /api/automations/debtor/verdict
- [ ] 55-05-PLAN.md — agent_runs writers → public.agent_runs with swarm_type discriminator + git-sha versioning + context jsonb migration

### Phase 56: iController auto-labeling van accounts aan emails

**Goal:** Inbound debtor-emails in iController automatisch labelen aan het juiste debiteur-account na de cleanup-stap. Per mailbox aan/uit via Zapier; onbekende mails blijven onaangeroerd. Scope: Supabase migratie uitvoeren, NXT invoice→debtor lookup via Zapier (whitelisted IP), sender→debtor fallback, LLM tiebreaker voor ambigue matches, iController label-DOM probe, Browserless label-module, Zapier Zaps per mailbox (6 entities: smeba=4, smeba-fire=5, firecontrol=12, sicli-noord=15, sicli-sud=16, berki=171), dry-run review + flip naar live.
**Requirements**: See todo `2026-04-23-debtor-email-auto-labeling-in-icontroller.md`
**Depends on:** Phase 54 (independent van 55 — eigen code-pad)
**Plans:** 9 plans

Plans:
- [ ] 56-00-PLAN.md — Wave 0: additive migration + 9 vitest scaffolds + probe-script source + NXT-Zap client + LLM tiebreaker + resolve-debtor + label-module skeleton + flip-cron skeleton
- [ ] 56-01-PLAN.md — [BLOCKING] Apply Phase 56 additive migration to live Supabase (mirror of 60-01)
- [ ] 56-02-PLAN.md — [BLOCKING] Confirm NXT contactperson schema + deploy generic NXT-lookup Zap + set Vercel env vars + 5-brand smoke test
- [ ] 56-03-PLAN.md — [BLOCKING] Run probe-label-ui.ts on production iController + curate SELECTORS.md
- [ ] 56-04-PLAN.md — Refactor route.ts to sender-first 4-layer pipeline + always-write email_labels + agent_runs telemetry + broadcast
- [ ] 56-05-PLAN.md — Implement label-email-in-icontroller.ts with probe-confirmed selectors + wire route dispatch
- [ ] 56-06-PLAN.md — Dashboard /automations/debtor-email-labeling: page + counts hook + row list + drawer + approve/reject server actions
- [ ] 56-07-PLAN.md — Implement labeling-flip-cron evaluateMailbox + pickAction + register in Inngest manifest (shadow-mode default)
- [ ] 56-08-PLAN.md — [calendar-soft] Smeba canary review + flip LABELING_CRON_MUTATE=true; per-mailbox rollout checklist

### Phase 61: Pattern-mining + LLM tiebreaker for unknown / no_match emails

**Goal:** Close the loop on the unknown-bucket. Today's data (2026-04-29 telemetry) shows operators heavily override `predicted.category='unknown'` with the right answer, and the regex `no_match` rule has 25% agreement (5/20) — both signals say the classifier is missing structure that humans easily detect. Two coupled deliverables:
1. **Pattern-mining UI** — surface clusters of `unknown`/`no_match` emails grouped by similarity (sender, subject pattern, body keyword) with the operator's recent overrides; let operator promote a cluster to a candidate `classifier_rules` row (kind=`regex` if pattern is hand-extracted, kind=`agent_intent` if LLM-described).
2. **LLM tiebreaker on unknown-bucket inbound** — at ingest time, when classifier returns `no_match`, route via Orq.ai intent agent (kind=`agent_intent`) instead of dropping to human queue. Telemetry feeds back via `agent_runs.human_verdict` like any other rule. Consumes the `nxt.candidate_details` registry tool when ambiguity needs NXT context.

Also: align category-key naming across the 3 surfaces (UI override dropdown, ingest classifier output, worker label map) so `payment` vs `payment_admittance` doesn't bite again. This phase touches all three.

**Requirements**: D-25 (hand-labels stored), Phase 56-02 telemetry maturity (≥ 100 verdicts on unknown-bucket needed before pattern-mining UI is useful)
**Depends on:** Phase 56 ships + 14-day shadow window completes (telemetry depth)
**Plans:** TBD
**Defer trigger:** start when EITHER (a) unknown-bucket overrides exceed N=100 with stable taxonomy, OR (b) regex `no_match` agreement stays under 50% over 14 days — both signal that adding rules manually doesn't scale.

### Phase 56.5: Generic /api/zapier-tools/[tool_id] bridge route

**Goal:** Promote the Phase 56 zapier_tools registry from "URL lookup table" to a real bridge layer. One Vercel route handles every Zapier-bound tool: reads tool definition from `public.zapier_tools`, validates input against `input_schema`, formats auth per `auth_method`, forwards to `target_url`, returns response (sync) or kicks off async-callback chain. Migrate the existing invoice-fetch automation (`/api/automations/debtor/fetch-document`) into this generic bridge as the first async-callback consumer, then deprecate the dedicated route. Document tool registry as the canonical Orq.ai agent-tool surface — agents call `POST /api/zapier-tools/<tool_id>` uniformly across automations.
**Requirements**: D-32, D-33, D-35 from Phase 56 CONTEXT; consolidate sync + async patterns
**Depends on:** Phase 56 (registry table + 3 seed rows must be live; resolver code patterns proven in production first)
**Plans:** TBD
**Defer trigger:** start when EITHER (a) we add a 4th Zapier-bound tool to any automation, OR (b) we want Orq.ai agents to consume the registry, OR (c) invoice-fetch needs a non-trivial change. Don't pre-plan — open with `/gsd-discuss-phase 56.5` when one of those triggers.

### Phase 56.7: Swarm registry — generic queue-review surface for any swarm

**Goal:** Promote the queue-review pattern from "debtor-email-specific" to a swarm-agnostic registry-driven system so any new automation/agent-swarm (Sales email next, then Planning, Order Entry, …) plugs in via DB rows instead of new code/routes. Two new tables (`public.swarms`, `public.swarm_categories`) drive a generic `/automations/[swarm]/review` page, generic verdict-worker dispatch via switch on `swarm_categories.action` (`categorize_archive` / `reject` / `manual_review` / `swarm_dispatch`), and self-onboarding into the existing `/automations/classifier-rules` dashboard. Adding a new swarm becomes: INSERT one `swarms` row + INSERT category rows + (optionally) one Inngest dispatch worker. No new route, no new component, no Vercel deploy for routing. Phase 56.7 ships ONE seeded swarm (`debtor-email`) with the 6 existing categories + `payment_admittance` alias.
**Requirements**: D-00..D-17 from `.planning/phases/56.7-swarm-registry/56.7-CONTEXT.md`
**Depends on:** Phase 60 (cross-swarm `swarm_type` keying); ships BEFORE 60-05 queue UI rewrite consumes it (per D-15).
**Plans:** 3/3 plans complete

Plans:
- [x] 56.7-01-PLAN.md — Wave 1: Supabase migration (`swarms` + `swarm_categories` tables, CHECK enum, RLS, seeds) + `web/lib/swarms/registry.ts` loader/cache (60s TTL mirror of classifier_rules cache)
- [x] 56.7-02-PLAN.md — Wave 2: Verdict-worker generalization — switch on `category.action`, null-safe `outlook_label` (D-11), Zod input schema swap (z.string + post-validate)
- [x] 56.7-03-PLAN.md — Wave 3: Generic `[swarm]/review` route + `next.config.ts` redirects + 60-05 amendment (Depends on: 56.7) + test-import sweep

### Phase 57: v7 review dashboard polish

**Goal:** Job-detail drawer bouwen voor v7 kanban cards en screenshot-rendering fixen. Scope: (a) `kanban-job-card.tsx` click → `JobDrawerContext` drawer (header, timeline van log-entries, linked automation_runs, screenshots); (b) `extractScreenshots` in `web/lib/automations/types.ts` fixen — data is `{url, path}`-shape, niet `string`; public-bucket OR on-demand signed-URL refresh. Wacht op Phase 55 (backend stabiel) voordat UI-polish zin heeft.
**Requirements**: See todos `2026-04-23-v7-review-dashboard-card-popout-missing.md`, `2026-04-23-v7-review-screenshots-not-rendering.md`
**Depends on:** Phase 55
**Plans:** 4 plans

Plans:
- [ ] TBD (run /gsd:plan-phase 57 to break down)

### Phase 59: Supabase realtime fan-out reduction

**Goal:** Get Supabase realtime messages back under cap (currently 6.5M / 5.5M; grace until 2026-05-26). Phase 58 attacked the upstream writes; Phase 59 attacks the subscription architecture so we don't grow back into the cap as automation volume scales.

**Depends on:** Phase 58 (cron windowing — completed).
**Plans:** 3/3 plans complete

Plans:
- [x] 59-01-PLAN.md — agent_events postgres_changes → batched broadcast + refetch (decision #1)
- [x] 59-02-PLAN.md — automation_runs unfiltered subscription → broadcast-driven refetch (decision #2)
- [x] 59-03-PLAN.md — Pipeline broadcast coalescing → 500ms debounce in broadcast.ts (decision #3)

### Phase 58: Inngest cron cost optimization (Shipped 2026-04-26)

**Goal:** Bring Inngest free-tier usage back under 50k runs/mo after dual billing alerts (Inngest 42k/50k mid-month, Supabase 6.5M/5.5M realtime messages). Window high-frequency crons to business hours (06:00–19:58 Europe/Amsterdam, Mon–Fri) and pause `orqai-trace-sync` entirely while Executive Dashboard work is on hold.

**Outcome:** Cron-only baseline cut from ~97,600/mo → ~25,000/mo (74% reduction). Bridge cadence 1 min → 2 min within window. orqai-trace-sync converted to event-trigger (`analytics/orqai-trace-sync.run`) so it can be invoked manually when dashboard work resumes.

**Plans:** 58-01 (single atomic edit across 4 Inngest functions).

### Phase 60: Debtor email — close the whitelist-gate loop: data-driven AUTO_ACTION_RULES with Wilson-CI auto-promotion cron + queue-driven Bulk Review UI reading automation_runs status=predicted directly

**Goal:** Replace the 6-rule hardcoded AUTO_ACTION_RULES Set with a cross-swarm data-driven classifier-rules engine: `public.classifier_rules` table + 60s in-memory cache, daily Inngest cron computing Wilson 95% CI-lo per rule and (post-flip) auto-promoting/demoting with hysteresis, plus a queue-driven Bulk Review UI that reads `automation_runs WHERE status=predicted` directly via topic→entity→mailbox tree-nav with cursor pagination and a race-cohort bulk-clear affordance.
**Requirements**: D-00..D-29 from `60-CONTEXT.md` (locked decisions; cross-referenced in each plan's `requirements` field)
**Depends on:** Phase 59
**Plans:** 8 plans

Plans:
- [x] 60-00-PLAN.md — Wave 0 scaffold: 7 SQL migrations (public.agent_runs rename absorbing 55-05 + 4 classifier tables + RPC + view), classifier library (types/wilson/cache/read), 10 vitest stub files
- [x] 60-01-PLAN.md — [BLOCKING] Schema push of all 7 Wave 0 migrations to live Supabase (autonomous: false — Management API token may be expired)
- [x] 60-02-PLAN.md — classifier-backfill Inngest one-shot + ingest-route refactor (readWhitelist cache + typed columns on every automation_runs insert + classify.ts UNCHANGED)
- [x] 60-03-PLAN.md — classifier-promotion-cron daily at TZ=Europe/Amsterdam 0 6 * * 1-5 with shadow-mode flag (CLASSIFIER_CRON_MUTATE) + manual_block exception
- [x] 60-04-PLAN.md — /automations/classifier-rules cross-swarm dashboard (page + 5 components + Block/Unblock server actions, shadow banner, ci_lo sparkline)
- [x] 60-05-PLAN.md — Queue UI rewrite: page.tsx (RPC counts + cursor pagination) + queue-tree (3-level URL-driven) + predicted-row-list/item + race-cohort-banner
- [x] 60-06-PLAN.md — actions.ts rewrite (verdict-write only) + classifier-verdict-worker (event-trigger, split step.run for categorize/archive/iController-delete-via-cleanup-queue)
- [x] 60-07-PLAN.md — Post-shadow cleanup: drop FALLBACK_WHITELIST after 1-day clean run + flip CLASSIFIER_CRON_MUTATE=true after 14-day shadow review (autonomous: false)

### Phase 61: Restore lost bulk-review UX (60-05 regression fix): horizontal overflow, missing email-body expander, missing per-row notes, missing rule-hint dropdown / per-item override. Reintroduce these on top of the new tree-driven shell — don't revert 60-05's data-driven architecture.

**Goal:** Restore the four UX features lost in the Phase 60-05 rewrite (email-body expander, override dropdown, per-row notes, page-scoped keyboard shortcuts) and fix horizontal overflow with a 3-column max-w-[1600px] layout — without reverting 60-05'''s data-driven tree architecture.
**Requirements**: See `61-CONTEXT.md` (D-LAYOUT-3COL, D-DETAIL-PANE, D-DETAIL-BODY-LAZY, D-DETAIL-OVERRIDE, D-DETAIL-NOTES, D-KEYBOARD-SHORTCUTS, D-AUTO-ADVANCE, D-TREE-PENDING-SIBLING, D-PERSIST-OVERRIDE, D-PERSIST-NOTES, D-FETCH-EMAIL-BODY, D-LABEL-ONLY-SKIP, plus 4 polish requirements)
**Depends on:** Phase 60
**Plans:** 3 plans

Plans:
- [x] 61-01-PLAN.md — Extend recordVerdict (override+notes, zod) + re-add fetchReviewEmailBody + 2 vitest files
- [x] 61-02-PLAN.md — 3-col layout + page.tsx ?selected loader + rename row-list/row-strip (no buttons) + new detail-pane + new keyboard-shortcuts + queue-tree summary header + Pending sibling node
- [x] 61-03-PLAN.md — Visual polish (Lucide audit, min-w-0 sweep, kbd styling) + 33-item manual UAT checkpoint

### Phase 62: classifier-rules-readability — Maak het classifier-rules dashboard begrijpelijker voor operators: groepeer rules per category, sectioneer no_match als system-row, toon human-readable label en link naar regex-implementatie in classify.ts, en introduceer overlap-lint waarschuwing bij seeden van nieuwe candidates. Doel: operator kan zonder code-toegang begrijpen wat elke rule doet en waarom, zonder de promotion-machinerie (Wilson CI per rule_key) te raken.

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 61
**Plans:** 4 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 62 to break down)

### Phase 74: Stage 1 LLM Category Classifier (swarm-agnostic) — fills the missing Stage 0 to Stage 1 LLM seam: new Orq agent stage-1-category-classifier (Haiku-class, registry-driven via swarm_categories) + new classifier-screen-worker Inngest function listening on classifier/screen.requested, emits classifier/verdict.recorded with Phase 70 dual-write so verdict-worker dispatches per swarm_categories.action. Cross-swarm reusable for sales-email and future swarms. ✓ closed 2026-05-11

**Goal:** When the existing regex Stage 1 returns category_key=unknown, a swarm-agnostic LLM agent re-classifies into one of the swarms enabled swarm_categories (or defers back to unknown); the verdict flows through classifier/verdict.recorded and existing registry-driven dispatch so cheap-noise rows skip the entity→coordinator chain and sales-email (no regex rules yet) gets day-1 classification on the same agent. Production rollout Friday 2026-05-08 on firecontrol@, SMEBA fire@, and one sales mailbox.
**Requirements**: SPEC-REQ-1, SPEC-REQ-2, SPEC-REQ-3, SPEC-REQ-4, SPEC-REQ-5, SPEC-REQ-6, SPEC-REQ-7 (locked in 74-SPEC.md)
**Depends on:** Phase 73
**Plans:** 5 plans
**Production smoke (2026-05-11, 5-day window):** REQ-7 verified — Stage-1 rows fired for all three mailboxes (administratie@fire-control.nl=82, debiteuren@smeba-fire.be=118, verkoop@smeba.nl=147); zero new-worker-caused failures; 146 sales-email agent_runs with `inngest_run_id`; zero `swarm_type` literals in classifier-screen-worker. Spot-check on verkoop@ shows clean `predictor=llm_2nd_pass`, coherent reasoning. **Open follow-up (NOT a Phase 74 defect):** debtor-email `automation_runs.status='pending'` backlog — pipeline_events for Stage 0/1/3 all written but bridge never advances status; tracked separately.

Plans:
- [x] 74-01-PLAN.md — Wave 1: DB foundation (agent_runs.entity nullable + sales-email registry seed + orq_agents row + ICONTROLLER_MAILBOXES)
- [x] 74-02-PLAN.md — Wave 1: Event swarm_type threading (events.ts schema + stage-0-safety-worker de-hardcode + debtor ingest emit)
- [x] 74-03-PLAN.md — Wave 2: Orq agent provisioning ritual (list_models → create → Studio JSON Schema → update → get_agent verify; activation migration)
- [x] 74-04-PLAN.md — Wave 3: classifier-screen-worker implementation + RED tests + Inngest registration
- [x] 74-05-PLAN.md — Wave 4: Sales-email ingest route + zapier_tools registry + 24h production rollout verification

---

### Phase 75: Sugar resolve dispatch + verdict-worker side_effects refactor — sales-email noise emails (auto_reply, ooo_*, payment_admittance) classified by Phase 74's LLM but currently sit in `manual_review` because `classifier-verdict-worker.ts` hardcodes `categorize_archive` to Outlook. Phase 75 ships: (1) registry-driven refactor of verdict-worker to evaluate `swarms.side_effects[]` per-swarm instead of hardcoding Outlook; (2) new `/api/automations/sales-email/resolve` route + `zapier_tools` row for "Sugar Update Record → status=archived"; (3) re-flip the 4 noise sales-email categories from `manual_review` back to `categorize_archive` so the LLM verdict auto-archives in Sugar.

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 74
**Plans:** 4 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 75 to break down)

### Phase 76: Stage 3 → Kanban human-lane wiring (unhandled-intent triage surface)

**Goal:** Wire the existing Stage 3 intent coordinator output into a "needs human" Kanban lane so every email that leaves Stage 1 either (i) reaches a registered Stage 4 handler and completes, or (ii) lands in the Kanban human lane with a clear reason — never silently disappears.

**Three Kanban-trigger conditions** (rolled into a single lane with a `reason` field):
1. **`no_handler`** — Stage 3 picked an intent but no Inngest worker is registered for the `swarm_intents.handler_event`. Today this hits 8 of 9 debtor-email intents (only `invoice_copy_request` has `classifierInvoiceCopyHandler`).
2. **`low_confidence`** — Stage 3 returned ranked intents but top confidence is below the (Phase 71-deferred) Wilson-CI threshold, OR the top-1 / top-2 gap is too tight.
3. **`handler_error`** — A Stage 4 handler ran but threw / hit a deadlock / was rejected by a downstream system.

**Lane mechanics:**
- Reuses existing `automation_runs status='pending'` surface (the existing Kanban backend).
- Each Kanban row carries `result.kanban_reason ∈ {no_handler, low_confidence, handler_error}` plus `result.intent`, `result.confidence`, `result.error_detail`, plus the source `email_id` so the operator can inspect.
- Two operator actions per row:
  - **Close (resolved manually)** — operator handled it outside the system, mark resolved.
  - **Replay through Stage 4** — re-emit `handler_event` after operator picks/edits the intent (typically used after a new handler ships and the operator wants to drain backlog).

**Depends on:** Phase 75 noise-vs-intent registry split (shipped 2026-05-07 via 66c0379 — data migration + table rename `swarm_categories → swarm_noise_categories` + atomic code refactor + agentic-pipeline doc updates locking the hard separation rule).

**Out of scope (separate phases):** building the 8 missing Stage 4 handlers themselves (address_change, contract_inquiry, copy_document_request, credit_request, general_inquiry, peppol_request, payment_dispute, other). Each of these handlers ships in its own dedicated phase as the business priority and integration shape becomes clear; this Phase 76 just ensures none of them are silent dead-letters in the meantime.

**Verification:** After this phase ships, the per-stage `pipeline_events` query that today shows "100% of emails halt at Stage 1" should show every non-noise email progressing past Stage 2 and either completing through Stage 4 OR landing in the Kanban human lane with a reason. Zero silent dead-letters.

**Plans:** 8 plans

Plans:
- [ ] 76-01-PLAN.md — handler_status migration + types + test scaffolds
- [ ] 76-02-PLAN.md — [BLOCKING] supabase db push schema apply
- [ ] 76-03-PLAN.md — Pipeline runtime: no_handler + low_confidence (escalation-gate repurpose)
- [ ] 76-04-PLAN.md — handler_error onFailure on classifier-invoice-copy-handler
- [ ] 76-05-PLAN.md — Server Actions: Close, Replay (D-01), Reclassify-as-noise (D-03)
- [ ] 76-06-PLAN.md — Stage-keyed shell + Stage 3 tab UI
- [ ] 76-07-PLAN.md — Stage 4 handler-error tab UI
- [ ] 76-08-PLAN.md — Backwards-compat redirects + end-to-end verification

### Phase 77: Stage 2 / Stage 3 end-to-end verification (debtor-email) — SUPERSEDED 2026-05-12

**Status:** Superseded by **Phase 82.3** (per-stage audit surface, v8.0 closure) + the debtor-person operator onboarding cycle starting 2026-05-18. Do not plan.

**Why superseded:**
- The "real Stage 2/3 review surface" Phase 77 promised is now Phase 82.3's per-stage audit popup (verdict + reasoning + key evidence + screenshots).
- The "manually-graded 50-email sample" verification work is folded into the debtor-person operator onboarding — the operator IS the verification, with prose-feedback capture via Phase 82.4.
- Phase 76 (Kanban surfacing) is unaffected; the dispatcher work for placeholder-intent rows still belongs to its own scope.

**Original goal (kept for traceability):** Confirm the debtor-email pipeline reaches Stage 3 in production with sensible output, before any Stage 4 handler work. Deliverables (a) Stage 2 ≥90% mapping accuracy, (b) Stage 3 ranked-intent top-pick agreement with operator judgement on 50-email sample, (c) bugs fixed in-phase.

**Why superseded was the right call:** Phase 77's goal was "verify Stage 2/3 reach Stage 3 with sensible output" — that's now visible via Phase 82.3's audit surface and gets continuous, live confirmation through the operator workflow rather than a one-off graded sample. Building the audit surface gives Phase 77's verification a permanent home instead of a one-time gate.

**Reference docs:** `.planning/MILESTONES.md` V9.0 charter; `.planning/notes/2026-05-12-v8-pipeline-status-and-v9-framing.md`.

### Phase 78: Sales-email Stage 0 to Stage 3 onboarding (verkoop@smeba.nl)

**Goal:** Onboard the sales-email swarm (verkoop@smeba.nl, ~15-25 emails/day) through Stages 0→1→2→3 using only registry inserts + the existing cross-swarm architecture. No new code paths in `classifier-screen-worker`, `classifier-verdict-worker`, or `coordinator-orchestrator` — if any of those need swarm-specific branches, that's a cross-swarm architecture bug to fix here.

**Deliverable order matters here. Codegen comes BEFORE the registry inserts so 78 actually proves the cross-swarm thesis instead of silently violating it:**

1. **Build-time codegen for `swarm_intents` literal-union types** (foundational — must ship first). Today the intent enum is hand-maintained in three places: `web/lib/automations/debtor-email/coordinator/types.ts` (TS const), `swarm_intents` table, and the Orq agent's JSON schema. Onboarding sales-email by adding a parallel TS const would *double* the drift. Replicate the existing Phase 69 D-03 pattern: a `tsx` script reads `swarm_intents` and emits `web/lib/swarms/intents.generated.ts` with `as const` array + literal-union type. CI gate: `npm run codegen && git diff --exit-code`. Same pattern applied to `swarm_noise_categories` so the Stage 1 LLM closed list also stays auto-generated. After this lands, adding any new intent to any swarm is a registry INSERT — no TypeScript edit, no Orq prompt edit. *(Architectural prerequisite, not a side-task.)*
2. **Sales-email rows in `swarms`, `swarm_noise_categories`, `swarm_intents`** — registry inserts only.
3. **Stage 2 entity resolver wired** — SugarCRM customer lookup module (distinct from iController), plugged into `swarms.stage2_entity_resolver`.
4. **Stage 3 coordinator agent prompted for sales-email intents** — uses the now-generated enum so the prompt stays in sync automatically.
5. **verkoop@smeba.nl traffic visibly progressing past Stage 1** with sensible intent picks within 7 days of cutover.

**Why parallel with Phase 77:** The whole point of cross-swarm architecture is that adding a swarm is a registry insert. Validating that claim while still validating debtor-email catches architectural drift early. If sales-email reveals an edge case the architecture can't accommodate, far better to learn it now than after debtor-email is "done."

**Why deliverable #1 is non-negotiable:** Without the codegen, deliverable #2's "registry inserts only" claim is a lie — we'd silently be hand-editing TS consts and Orq prompts to match. The whole milestone v8.1 thesis ("validate cross-swarm before automating") depends on this being honest.

**Subsumes:** Phase 73 (Sales-email swarm validation) from the existing roadmap. Either close 73 as merged-into-78 or repurpose it.

**Depends on:** Phase 76 only (Kanban visibility). Runs in parallel with Phase 77, NOT after it.

**Plans:** 4 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 78 to break down)

### Phase 79: Learning loop — intent surfacing dashboard + open-set discovery

**Goal:** Make Stage 4 handler prioritization data-driven AND make the intent registry self-extending. Today's Stage 3 is closed-set: the LLM is forced to pick from 8 hardcoded intents and bucket every novel email as `other` or `general_inquiry`, hiding real new intents from the learning loop. Phase 79 adds open-set discovery on top of the closed-set runtime, plus the dashboard that turns both signals into a prioritization tool.

**Deliverables:**

1. **Two-tier intent capture (open-set discovery without breaking runtime).** Bump the Stage 3 LLM output schema from V2 to V3:
   - `intent: enum(...)` — closed list, drives Stage 4 dispatch (deterministic, unchanged).
   - `intent_proposal: string | null` — free-text snake_case label the LLM fills *only* when the email doesn't fit any existing intent cleanly.
   - `proposal_reason: string | null` — one-sentence justification. Drives the dashboard cluster summary.
   The closed-list `enum` itself comes from the codegen pattern shipped in Phase 78 — so adding a new approved intent to `swarm_intents` automatically widens the LLM's allowed values on next deploy. No manual prompt edit.
2. **Intent surfacing dashboard.** Per-swarm cross-cuts:
   - intent volume per week (top-N by frequency)
   - Stage 3 confidence distributions per intent
   - operator override rates per intent (Bulk Review axis-3 corrections)
   - Kanban-lane stuck-row counts by `kanban_reason`
   - **NEW: clustered intent_proposal feed** — group similar proposals (string-similarity + per-cluster sample emails), counted weekly. This is the discovery surface.
3. **Promote-to-registry action.** When a clustered proposal hits a threshold (e.g. ≥10 occurrences in 7 days), the dashboard offers a one-click "promote this to a real intent" button that INSERTs a `swarm_intents` row with a stub `handler_event` placeholder (lands as Kanban `no_handler` until Stage 4 ships, but at least it's named and counted distinctly going forward). Stage 3 picks it up on next deploy via the codegen.
4. **Operator workflow doc.** Half-page runbook in `docs/agentic-pipeline/learning-loop.md` describing the weekly cycle: review proposals → promote what's real → mark noise as suppressed → handler-priority readout.

**Why this is the milestone closer:** Once 76, 77, 78 ship we have data flowing but no synthesis surface AND no discovery for novel intents. Without 79, picking which Stage 4 handler to build first remains a stakeholder-pain guess, AND the system can never see beyond its 8 pre-defined buckets. With 79, the system can say "credit_request shows up 40 times/week with average Stage 3 confidence 0.78 and operator override rate 12% — that's the highest-value automation target right now" AND "we've also seen 14 emails clustered as `direct_debit_setup` over the past two weeks — should that be promoted to a real intent?"

**Out of scope:** Building any Stage 4 handler. The dashboard ranks existing handlers and surfaces new candidates; v8.2 builds them.

**Depends on:** Phase 76, 77, AND 78 (needs both swarms' data for cross-swarm comparisons; also needs 78's codegen pattern in place so the closed enum auto-grows when proposals are promoted).

**Plans:** 4 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 79 to break down)

---

### Phase 80: Swarm-agnostic Stage 3 classifier/dispatcher split — `predicted` as first-class state ✓ closed 2026-05-12

**Goal:** Split the current monolithic `debtor-email-coordinator` Inngest function into two clean responsibilities so Stage 3 has an unambiguous terminal state, the no-handler human-lane path is leak-free, and the same dispatcher serves both `debtor-email` and the upcoming `sales-email` swarm without hardcoded swarm logic.

**Problem this fixes:** Today's coordinator does both the LLM intent classification AND the downstream dispatch in one function. Phase 76 added a no-handler short-circuit that writes a Kanban row + marks `coordinator_runs.completed_at` but **never updates `agent_runs.status`**, leaving the originating row stranded in `classifying`. Live count: 407 stuck rows backlogged, growing every time a placeholder-intent email arrives. Symptoms look like "the classifier is broken" but the classifier did its job — the state machine is missing a transition.

**State machine after this phase:**
- `classifying` → Stage 3 LLM in flight. Stuck >N min = classifier bug.
- `predicted` → Stage 3 LLM done, ranked intents persisted. **First-class state**, written by the classifier and read by the dispatcher. Stuck >N min = dispatcher bug.
- `routed_human_queue` → dispatcher determined no Stage 4 handler exists (`swarm_intents.handler_status='placeholder'`); Kanban row written; awaiting human. **Terminal.**
- handler-owned statuses (`fetching_document`, `done`, etc.) → dispatcher emitted `handler_event`; Stage 4 worker owns the row.

**Deliverables:**

1. **Stage 3 classifier (refactored coordinator).** `debtor-email-coordinator.ts` shrinks to: invoke Intent Agent → write `tool_outputs.intent_first_pass` → persist `ranked_intents` on `coordinator_runs` → flip `agent_runs.status='predicted'` → emit `<swarm>/predicted` event → return. Removes inline single-shot dispatch + Phase 76 no-handler Kanban write.
2. **Stage 3.5 dispatcher (new, swarm-agnostic).** New Inngest function (e.g. `stage-3-dispatcher.ts`) listening on `*/predicted` events. Reads `agent_runs` row, looks up `swarm_intents.handler_status` for `(swarm_type, intent_key)`, and routes:
   - `placeholder` → write Kanban `automation_runs` row → flip `agent_runs.status='routed_human_queue'` → mark `coordinator_runs` complete (atomic in one `step.run`).
   - `registered` → emit `swarm_intents.handler_event` for Stage 4 → mark coordinator complete (handler owns subsequent status transitions).
   - **Future hook:** dormant escalation branch for Stage 3.5 orchestrator-worker fan-out (Phase 76 D-07 deferred). Dispatcher reserves the branch but does not implement it.
3. **Cross-swarm contract.** Dispatcher reads `swarm_type` from the event payload; both `debtor-email` and `sales-email` (Phase 78) share the function. Event names follow `<swarm>/predicted` so per-swarm fan-out works without code branches.
4. **State-machine doc lock.** Update `docs/agentic-pipeline/stage-3-coordinator.md` with the new state diagram, transition table, and "stuck-status meaning" table. RFC-locked, code follows doc.
5. **UI semantics confirmation.** Audit `web/lib/automations/swarm-bridge/sync.ts` — confirm `predicted` and `routed_human_queue` map to the correct Bulk Review / Kanban surfaces. Adjust if `predicted` is now transient (~milliseconds) vs. previously a terminal-ish state.
6. **Backfill script.** One-shot `web/scripts/backfill-stuck-classifying-stage3.ts` for the 407 rows: for each, look up corresponding `automation_runs` Kanban row by `email_id`; if found → flip to `routed_human_queue`; if not found → flag for manual triage. Idempotent. Acceptance/test creds default per CLAUDE.md.
7. **Monitoring reframe.** Update any health queries / dashboards that previously alerted on "rows in `classifying`" — split into two distinct signals: classifying-stuck = classifier bug; predicted-stuck = dispatcher bug; routed_human_queue = expected human lane (no alert).

**Why this is high-value cross-swarm work:** Phase 78 (sales-email Stage 0→3 onboarding) is about to land. Without the dispatcher split, Phase 78 will copy the same buggy "monolithic coordinator" pattern into a second swarm, doubling the silent-stuck-row failure mode. Splitting now makes Phase 78 a thin classifier + a registered handler, no dispatch logic to duplicate. Same dispatcher serves both swarms.

**Out of scope:**
- Stage 3.5 orchestrator-worker fan-out for multi-intent emails (still dormant per Phase 76 D-07; this phase only reserves a clean re-enable hook).
- The separate `intent=null + multiple Kanban rows` duplicate-write bug observed in the live data — diagnose-and-fix in a follow-up phase.
- Building any new Stage 4 handler.

**Depends on:** Phase 76 (no-handler Kanban surface), Phase 77 (Stage 2/3 verification — confirms current contract before refactor). Strongly suggested before Phase 78.

**Plans:** 6 plans

Plans:
- [x] 80-01-test-scaffolds-red-PLAN.md — Wave 0 RED test scaffolds + STATUS literal-union update
- [x] 80-02-stage-3-dispatcher-PLAN.md — New cross-swarm Stage 3.5 dispatcher + escalation-gate registry-bug fix
- [x] 80-03-classifier-refactor-and-register-PLAN.md — Refactor coordinator to thin classifier + register dispatcher (live-traffic switch)
- [x] 80-04-ui-sync-predicted-PLAN.md — Add predicted case to triageStageFromStatus in swarm-bridge/sync.ts
- [x] 80-05-backfill-stuck-classifying-PLAN.md — One-shot backfill script for the 407 stranded rows (acceptance + production checkpoint)
- [x] 80-06-rfc-doc-lock-PLAN.md — Update stage-3-coordinator.md RFC with new state machine + cross-swarm contract

### Phase 81: Fold Stage 1 (Bulk Review) into the stage-keyed shell — close the loop on Sketch 005 / Phase 76 D-04/D-05 (REVISED). Today /stage-1 re-exports the legacy /review page with no _shell wrapper; this phase wraps it in PageHeader + StageTabStrip so Stage 1 sits under the same shell as 0/3/4, drops 'Bulk Review' as a UI noun, wires the Pending Promotion sub-view (?sub=pending), and lands a Stage 2 placeholder. ✓ closed 2026-05-12

**Goal:** /stage-1 sits under the same _shell as /stage-0 / /stage-3 / /stage-4 (PageHeader + StageTabStrip), the legacy 3-col QueueTree layout is replaced by a horizontal noise-category chip-strip, the Pending Promotion sub-view at ?sub=pending actually renders end-to-end, a thin /stage-2 placeholder lands with a live tagging-failures count, and 'Bulk Review' is gone as a user-visible UI noun.
**Requirements**: TBD (Phase 81 tracks coverage via D-codes D-01..D-19 in 81-CONTEXT.md)
**Depends on:** Phase 80
**Plans:** 4 plans
**Verification:** All 4 SUMMARYs exist on disk; superseded structurally by Phase 82 (unified `_shell/`). ROADMAP ticks below backfilled 2026-05-12.

Plans:
- [x] 81-01-PLAN.md — Mechanical move review/ → stage-1/, inline page.tsx, rewrite all external importers, no behaviour change (Wave 1)
- [x] 81-02-PLAN.md — Stage 2 placeholder route + thin head-count loader for last-7-day failed tags (Wave 2)
- [x] 81-03-PLAN.md — Shell-wrap stage-1/page.tsx with PageHeader + StageTabStrip + noise-category chip-strip + ?sub=pending loader branch + extracted candidate-rule-list / pending-promotion-detail-pane (Wave 3)
- [x] 81-04-PLAN.md — Cleanup: delete queue-tree.tsx, purge 'Bulk Review' user-visible copy, extend middleware redirect tests for ?sub=pending, regression smoke on /stage-3 + /stage-4, time-boxed safety-review-loader fixture fix (Wave 4)

### Phase 82: Unified stage shell — converge Stage 0/1/2/3/4 onto one Outlook-style row+detail+chip-strip+mailbox-filter UX ✓ closed 2026-05-11

**Goal:** Extract a shared `_shell/` UI component library and converge all five stage routes (`/stage-0` through `/stage-4`) onto one Outlook-style row+detail+chip-strip+mailbox-filter UX. Stage 3 duplicate intent-code bug fixed structurally. No DDL, no Inngest, no agent rewrites — pure UI + one Stage 3/4 loader JOIN for email metadata.
**Requirements**: 20 D-codes (D-01..D-20) from Phase 82 CONTEXT + 10 goal-backward verification checks (V1..V10)
**Depends on:** Phase 81
**Plans:** 6 plans
**Verification:** 10/10 goal-backward checks passed (commit `6c934af`). Polish follow-up tracked as Phase 82.1.

Plans:
- [x] 82-01-PLAN.md — Wave 1: Extract `_shell/{row-list,detail-pane,chip-strip,mailbox-filter,selection-context,keyboard-shortcuts}.tsx` + `_shell/_lib/get-swarm-mailboxes.ts` + `_shell/components/stage-0-widget.tsx` + 5 RTL test files. No stage pages touched.
- [x] 82-02-PLAN.md — Wave 2: Migrate Stage 0 page to unified shell. Preserve existing Stage 0 info banner above empty row list (D-16).
- [x] 82-03-PLAN.md — Wave 3: Migrate Stage 2 page to unified shell. Preserve Phase 81-02 tagging-failures count banner above row list (D-17, OQ-3 = banner-above).
- [x] 82-04-PLAN.md — Wave 4: Extend `_lib/kanban-loader.ts` with `email_pipeline.emails` JOIN (OQ-1). Migrate Stage 4 page to unified shell. Delete `stage-4/{row-list,detail-pane,selection-context,filter-chips}.tsx`.
- [x] 82-05-PLAN.md — Wave 5: Migrate Stage 3 page to unified shell. Fix duplicate intent-code label bug structurally (D-18 / V9). Delete `stage-3/{row-list,detail-pane,selection-context,filter-chips,reason-pill,conf-bar,inline-editor}.tsx` (move action-stack to `_shell/components/` if shared with Stage 4).
- [x] 82-06-PLAN.md — Wave 6: Migrate Stage 1 page to unified shell + multi-mailbox loader extension (`.eq` → `.in`). Preserve Phase 81-03 `?sub=pending` sub-view. Delete `stage-1/{row-list,row-strip,detail-pane,selection-context,keyboard-shortcuts,recipient-chip-strip}.tsx`. Final cleanup gate: zero `stage-{1,2,3,4}/{row-list,detail-pane}.tsx` files remain.

---

## Phases

### V3.0 Web UI & Dashboard (Phases 34-38)

**Milestone Goal:** Build a browser-based interface so non-technical colleagues can create, deploy, test, and iterate agent swarms on Orq.ai -- with authentication, real-time dashboard, node graph visualization, and HITL approval workflows.

- [x] **Phase 34: Foundation & Auth** - Next.js app shell, Supabase DB schema with RLS, Supabase auth (email/password, M365 SSO), project CRUD (completed 2026-03-20)
- [x] **Phase 35: Pipeline Engine** - Prompt adapter, Inngest durable functions, pipeline state machine, use case input form, run list (completed 2026-03-22)
- [x] **Phase 36: Dashboard & Graph** - Real-time progress timeline, log stream, run list updates, interactive node graph with execution overlay (completed 2026-03-23)
- [ ] **Phase 37: HITL Approval** - Pipeline pause/resume, diff viewer, approve/reject flow, email notifications, audit trail
- [ ] **Phase 37.1: Conversational Pipeline** - Streaming chat interface, discussion phase, architect/spec review with user interaction, narrator summaries, chat UI with user input
- [ ] **Phase 38: Swarm Activation** - Webhook endpoints for external pipeline triggering with API key auth and status polling
- [ ] **Phase 38.1: Full Pipeline Lifecycle** - Add deploy, test, iterate, and harden stages to web pipeline (9 agents: deployer, dataset-preparer, experiment-runner, results-analyzer, tester, failure-diagnoser, prompt-editor, iterator, hardener)

### V4.0 Browser Automation Builder (Phases 39-42)

**Milestone Goal:** Add a browser automation builder to the pipeline so agents can interact with no-API systems (NXT, iController, Intelly) -- users upload SOPs and screenshots, AI analyzes and generates Playwright scripts, scripts are tested on Browserless.io, and verified automations deploy as MCP tools attached to agents. Standalone automations and scheduling extend the capability beyond the agent pipeline.

- [ ] **Phase 39: Infrastructure & Credential Foundation** - Browserless.io connectivity, Supabase Storage for uploads, MCP adapter route, credential vault with encrypted storage
- [ ] **Phase 40: Detection, SOP Upload & Vision Analysis** - No-API system detection, SOP/screenshot upload wizard, AI vision analysis via Orq.ai, annotated step confirmation with user
- [ ] **Phase 41: Script Generation, Testing & MCP Deployment** - Playwright script generation, Browserless.io execution with Session Replay, iterative test-fix loop, MCP tool deployment and agent attachment
- [ ] **Phase 42: Standalone Automations & Triggers** - Standalone automation creation (conversational and SOP-based), dashboard management, scheduling, webhooks, Zapier integration

### V6.0 Executive Dashboard & UI Revamp (Phases 44-47)

**Milestone Goal:** Transform the Agent Workforce app into an executive-worthy platform with a 360-degree management dashboard showing ROI, activity, and health metrics across all automation types -- pulling data from Agent Workforce, Zapier (browser scraper), and Orq.ai analytics (API). Full UI redesign for CEO/CTO/CFO audience. O365 SSO for Microsoft 365 login.

- [x] **Phase 44: Project Model & Data Collection** - Extended project model (status lifecycle, automation type), Zapier browser scraper, Orq.ai analytics collector, snapshot tables, status badges on project cards (completed 2026-03-28)
- [x] **Phase 45: Executive Dashboard** - KPI summary cards, activity trend charts, project status breakdown, ROI estimates, health indicators, dashboard aggregator, sub-100ms from pre-computed snapshots (completed 2026-03-30)
- [ ] **Phase 46: Status Monitoring & O365 SSO** - Automated forward status transitions, suggest-only backward transitions, status history audit trail, Azure AD OAuth login alongside email/password
- [ ] **Phase 47: UI Redesign & Polish** - Brand colors and typography from moyneroberts.com, consistent design system, sidebar polish, grid layout, dark mode toggle, responsive tablet/desktop

<details>
<summary>V7.0 Agent OS (Phases 48-54) — SHIPPED 2026-04-30</summary>

**7 phases code-complete (48-54) + post-V7 platform/debtor-email work absorbed under V7 umbrella.**
**Full archive:** `milestones/v7.0-ROADMAP.md` | `milestones/v7.0-REQUIREMENTS.md`

**Milestone Goal:** Transform the Agent Workforce app into a cinematic swarm operating system where management sees every swarm, agent, and job in action -- powered by a new glassmorphism design system, Supabase Realtime data pipeline, AI narrative briefings, live delegation graphs, and Kanban job tracking. O365 SSO for frictionless executive access.

**Note:** Phases 55+ (debtor-email pipeline, swarm-registry, classifier, etc.) were added after the original V7 scope. Out-of-scope drift (55, 57, 58, 62, 999.1) re-scoped into V8.0 platform redesign. See `milestones/v7.0-ROADMAP.md` for full V7 detail.

- [x] **Phase 48: Foundation** - Design system (Satoshi + Cabinet Grotesk, glassmorphism tokens, dark/light toggle), new Supabase tables (agent_events, swarm_jobs, swarm_agents), Azure AD OAuth SSO with account linking (code-complete 2026-04-16; SSO human-verify deferred pending Azure AD tenant)
- [x] **Phase 49: Navigation & Realtime** - Sidebar with dynamic swarm list, /swarm/[swarmId] routing, single Realtime subscription per swarm view, useRealtimeTable hook (code-complete 2026-04-16; browser-based navigation + channel teardown verification deferred)
- [x] **Phase 50: Data Pipeline** - Inngest orqai-trace-sync cron, Orq.ai trace-to-agent_events mapping, Supabase caching layer, rate limit handling (code-complete 2026-04-16; migration apply + end-to-end verify deferred pending Management API token)
- [x] **Phase 51: Hero Components** - Subagent fleet cards with state badges and metrics, AI narrative briefing panel with Orq.ai Briefing Agent, agent detail drawer with communication timeline (code-complete 2026-04-16; browser verification deferred pending fixture apply + ORQ_API_KEY runtime)
- [x] **Phase 52: Live Interactivity** - Claude-style terminal event stream with ring buffer, 5-column Kanban board with dnd-kit drag-and-drop, smart sidebar filters (code-complete 2026-04-16; 10-row swarm_jobs fixture APPLIED via Management API; browser walkthrough deferred)
- [x] **Phase 53: Advanced Observability** - Live delegation graph with CSS-animated particles, Gantt-style swimlane timeline per agent (code-complete 2026-04-16; cross-agent fixture APPLIED via Management API; browser walkthrough deferred)
- [x] **Phase 54: Polish** - Migrate executive dashboard, projects page, and settings page to V7 design tokens

</details>

### v8.0 Agentic Platform (Phases 63-82.4)

**Milestone Goal:** Establish a standardized 4-stage funnel architecture (Stage 0 input safety, Stage 1 regex filter, Stage 2 entity enrichment, Stage 3 intent coordinator, Stage 4 handler) for every automation swarm at Moyne Roberts. v8.0 supersedes the parallel debtor-email-triage path with a single canonical flow, adds production guardrails (per-run budgets, capability/regression evals), and proves the platform standard by onboarding a second swarm (sales-email/SugarCRM) in under a day.

**Status (2026-05-12):** v8.0 shipped substantively. Closure gated on the 82.x stabilisation sequence (telemetry + audit + feedback capture) and Phase 999.8 operator UAT. Original Phase 72 (Promotion Recommender) was reframed into a full **V9.0** milestone; Phase 73 (sales-email validation) was reframed into **V10.0** because Phase 78 was never executed. See `.planning/MILESTONES.md` and `.planning/notes/2026-05-12-v8-pipeline-status-and-v9-framing.md`.

**Core canonical phases:**
- [ ] **Phase 63: Architecture RFC** - Doc-only canonical 4-stage funnel RFC (`docs/agentic-pipeline-architecture.md`); supersedes `debtor-email-pipeline-architecture.md`; locks Stage 2->Stage 3 context-shape contract, 4-axis override model, graduated automation hooks
- [ ] **Phase 64: Stage 0 input safety + per-run budgets** - Prompt-injection guard (regex + lightweight LLM), `injection_suspected` review lane, hard token/cost ceiling per Inngest run, intent-scoped tool allowlist via `zapier_tools.allowed_for_intents`
- [ ] **Phase 65: Stage 3 ranked multi-intent coordinator + orchestrator escalation** - Ranked intent list with confidence scores; Stage 3.5 orchestrator-worker spawned on low confidence / high intent count / `requires_orchestration` flag; default single-shot path remains for ~80% of inbound
- [x] **Phase 66: Pipeline consolidation (retire triage path)** ✓ closed 2026-05-04
- [x] **Phase 67: Stage 2 closure (iController DOM tagging)** ✓ closed 2026-05-04
- [ ] **Phase 68: swarm_registry generalisation + canonical context shape** - Extend `public.swarms` with stage*-* keys + `side_effects[]`; new `swarm_intents` table replaces hardcoded intent->handler maps
- [x] **Phase 69: Handler-agent canonicalisation (cross-swarm reuse)** ✓ closed 2026-05-04
- [ ] **Phase 70: Telemetry consolidation (pipeline_events)** - Single canonical `pipeline_events` table records every stage decision
- [ ] **Phase 71: Bulk Review 4-axis redesign + capability/regression eval split** - Stage 1/2/3/4 independent override controls; per-row aggregated decision view + per-run cost + tool calls
- [~] **Phase 72: Promotion recommender + Learning Inbox** — **REFRAMED → V9.0 (full milestone)**, prose-feedback approach replaces original Wilson-CI extension
- [~] **Phase 73: Sales-email swarm (SugarCRM) - validation** — **REFRAMED → V10.0 (full milestone)** after Phase 78 was never executed; partial cross-swarm proof landed incidentally via Phase 74 (sales-email Stages 0+1 are live)
- [x] **Phase 74: Stage 1 LLM Category Classifier (swarm-agnostic)** ✓ closed 2026-05-11 (REQ-7 verified, 5-day prod smoke green)
- [ ] **Phase 75: Sugar resolve dispatch + verdict-worker side_effects refactor** — partially obsoleted by V10.0 reframe; check before planning
- [ ] **Phase 76: Stage 3 → Kanban human-lane wiring** - Every email leaving Stage 1 either reaches a Stage 4 handler or lands in the Kanban human lane with a reason
- [~] **Phase 77: Stage 2/3 e2e verification** — **SUPERSEDED** — the real Stage 2/3 review surface is delivered by Phase 82.3 (per-stage audit popup) inside v8.0 closure
- [ ] **Phase 78: Sales-email Stage 0→3 onboarding** — never executed; folded into V10.0 charter
- [ ] **Phase 79: Learning loop — intent surfacing dashboard + open-set discovery** — partially obsoleted by V9.0 reframe; check before planning
- [ ] **Phase 80: Swarm-agnostic Stage 3 classifier/dispatcher split** - 4/6 plans done (`80-01..04`); plans `80-05` (407-row backfill) and `80-06` (RFC doc lock) outstanding
- [x] **Phase 81: Fold Stage 1 (Bulk Review) into stage-keyed shell** — code-complete (all 4 plans summarized), ROADMAP plan checkboxes pending tick
- [x] **Phase 81.1: v7 token gap fix** ✓ executed inline `4ce8455` (no plan pipeline)
- [x] **Phase 82: Unified stage shell** ✓ closed 2026-05-11 (10/10 verification)
- [x] **Phase 82.1: stage shell polish** ✓ closed 2026-05-11 (7/7 verification)

**v8.0 closure punch list (must ship before debtor-person operator onboarding 2026-05-18):**
- [ ] **Phase 82.2: Stage 0 telemetry coverage fix** — bring debtor mailboxes from 26-45% → ≥99% Stage 0 pipeline_events coverage; backfill ≤30d historical rows. Blocker for V9.0 per-email trace. CONTEXT exists; needs `/gsd-discuss-phase 82.2`.
- [ ] **Phase 82.3: Per-stage audit surface** — verdict + reasoning summary + key evidence + screenshots in a per-stage popup on Bulk Review (replaces Phase 77's original "real Stage 2 surface" intent). CONTEXT exists; needs `/gsd-discuss-phase 82.3`.
- [ ] **Phase 82.4: Feedback capture form** — `email_feedback` table + capture form mounted inside Phase 82.3's popup. Provides the data substrate that V9.0 synthesis reads from. CONTEXT exists; needs `/gsd-discuss-phase 82.4`. Sequenced after 82.3.
- [x] **Phase 82.6: Footer Approve → recordVerdict wiring** — wired 2026-05-15, deployed 2026-05-16 (Vercel `dyvfktamb`). 7/7 structural must-haves PASS; operator UAT surfaced 4 follow-up UX polish items → Phase 82.7.
- [x] **Phase 82.7: Detail-pane post-approve polish** — D-01..D-04 all closed 2026-05-16 (4/4 plans). UAT 2026-05-16 confirmed all 4 D-IDs work; surfaced 5 follow-up items → Phase 82.7.1.
- [x] **Phase 82.7.1: Detail-pane UAT follow-ups** — E-01..E-05 closed 2026-05-18 (5/5 plans). UAT 2026-05-18 surfaced 4 follow-ups → Phase 82.7.2.
- [x] **Phase 82.7.2: Override form rework + tooltip fix + brand-color audit** — 3/3 plans complete 2026-05-18. F-02 + F-03 fully verified; F-01 component-verified but `predicted-row.tsx` not in active rendering tree (operator UAT required); F-04 closed as no-op (G-10). UAT 2026-05-18 surfaced 6 follow-ups → Phase 82.7.3.
  - [x] 82.7.2-01-PLAN.md — F-03 override form rework in stage-step.tsx (G-05..G-09)
  - [x] 82.7.2-02-PLAN.md — F-02 entity coverage audit + conditional mapper fix in stage-1/page.tsx (G-02..G-04)
  - [x] 82.7.2-03-PLAN.md — F-01 brand-swatch tooltip hit-target fix in predicted-row.tsx (G-01)
  - F-04 — no plan (G-10: leave the em-dash safety guard untouched)
- [x] **Phase 82.7.3: Detail-pane + stage-1 list UAT follow-ups (round 2)** — G-01..G-06 closed 2026-05-18 (3/3 plans, UAT-confirmed). G-01 footer-only Submit/Cancel surface, G-02 plain-English eval-type cards, G-03 540px detail pane (Reject fits), G-04 mono mailbox chip per row, G-05 "Needs review · N" predicate (skip excluded), G-06 predictor/confidence chip rows collapsed by default with URL auto-expand.
  - [x] 82.7.3-01-PLAN.md — Single Submit/Cancel surface + plain-English eval-type cards (G-01, G-02)
  - [x] 82.7.3-02-PLAN.md — "Needs review · N" predicate + predictor/confidence chip collapse (G-05, G-06)
  - [x] 82.7.3-03-PLAN.md — Widen detail pane to 540px + per-row mailbox chip (G-03, G-04)
  - [x] 82.7.1-01-PLAN.md — Per-stage Submit override button on Stage 0/2/3/4 (E-01)
  - [x] 82.7.1-02-PLAN.md — 150ms opacity fade-out on pendingRemoval rows (E-02)
  - [x] 82.7.1-03-PLAN.md — Brand-color swatch hover tooltip + brandDisplayName helper (E-03)
  - [x] 82.7.1-04-PLAN.md — Override form button polish: lime Submit + ghost Discard + var(--space-4) padding (E-04)
  - [x] 82.7.1-05-PLAN.md — Em-dash placeholder for empty StageBadge + D-13 mapper investigation (E-05)
- [ ] **Phase 999.8: Stage 1 LLM 2nd-pass** — 4/4 must-haves green; 2 outstanding browser smokes (operator UAT pending).
- [ ] `/gsd-audit-milestone v8.0` — formal closure after all four above ship.

<details>
<summary>V5.0 Cross-Swarm Intelligence -- DEFINED</summary>

Phase numbers TBD (after V4.0 phases are finalized).

- [ ] Ecosystem Foundation -- Unified inventory of all swarms from local specs and live Orq.ai state
- [ ] Drift Detection -- Field-by-field comparison between spec and deployed state
- [ ] Overlap & Gap Analysis -- Semantic role overlap, tool duplication, blind spot identification
- [ ] Fix Proposals -- Structured fix proposals with diff previews, risk classification, HITL approval

</details>

## Phase Details

### Phase 82.1: stage shell polish — fix label prefix, MailboxFilter row placement, row column widths, port Stage 1 override picker into Stage1Widget (INSERTED) ✓ closed 2026-05-11

**Goal:** Four targeted polish fixes to the unified `_shell/` library from Phase 82: drop `Stage N — ` double-prefix in STAGE_TITLES; hoist MailboxFilter onto the chip-strip row at the page level; widen row-list pane + tighten sender column; port Stage1OverridePane logic into Stage1Widget cell and delete the slot.
**Requirements**: none — inserted polish phase; references D-IDs (D-01..D-12) from 82.1-CONTEXT.md
**Depends on:** Phase 82
**Plans:** 4 plans
**Verification:** 7/7 goal-backward checks passed. Follow-up commit `8ee2cce` shrank detail-pane to 460px and switched row strip to a fixed CSS grid across all 5 stages.

Plans:
- [x] 82.1-01-PLAN.md — Fix 1: STAGE_TITLES bare labels (D-01)
- [x] 82.1-02-PLAN.md — Fix 2: MailboxFilter on chip-strip row (D-02, D-03)
- [x] 82.1-03-PLAN.md — Fix 3: row-list pane + sender column widths (D-04, D-05, D-06)
- [x] 82.1-04-PLAN.md — Fix 4: port Stage 1 override picker into Stage1Widget; delete override pane (D-07..D-12)

### Phase 82.2: Stage 0 telemetry coverage fix (v8.0 stabilisation) (INSERTED)

**Goal:** Re-scoped 2026-05-12 after research. Make Stage 0 the unconditional first step of the canonical pipeline for every inbound email on every active swarm (D-A thin ingest, D-B Stage 1 fired by worker on safe verdict, D-C hard cutover). Plus original telemetry hygiene: single-emit refactor in Stage 0 worker (D-01/D-02), ≤30d historical backfill (D-03/D-04/D-05), synthetic injection regression test (D-06), daily coverage probe (D-07/D-08). Closes 26-45% debtor mailbox gap structurally — not via worker patching alone.
**Requirements**: SAFE-01, SAFE-02, SAFE-03, CONS-01, TELE-COV-01..05 (implied requirement IDs derived from CONTEXT.md must_haves; mapped per-plan)
**Depends on:** Phase 82.1
**Plans:** 12
**Blocks:** V9.0 Learning Inbox per-email trace
**Closure target:** before 2026-05-18 (debtor-person onboarding)

Plans:
- [ ] 82.2-01-PLAN.md — Partial UNIQUE index on pipeline_events(email_id, swarm_type, stage)
- [ ] 82.2-02-PLAN.md — Diagnostic SQL: confirm gap composition (D-A vs D-01 attribution)
- [ ] 82.2-03-PLAN.md — pipeline_health table + RPC helpers (D-07/D-08 surface, D-04 candidates)
- [ ] 82.2-04-PLAN.md — Single-emit refactor in stage-0-safety-worker (D-01/D-02)
- [ ] 82.2-05-PLAN.md — D-06 synthetic injection regression test
- [ ] 82.2-06-PLAN.md — Migrate category dispatch into classifier-screen-worker (D-A part 1)
- [ ] 82.2-07-PLAN.md — Thin debtor-email ingest route to Stage 0 first (D-A/D-B/D-C)
- [ ] 82.2-08-PLAN.md — End-to-end smoke per active mailbox (operator gate)
- [ ] 82.2-09-PLAN.md — stage-0-backfill Inngest function (D-03/D-04/D-05)
- [ ] 82.2-10-PLAN.md — stage-0-coverage-probe daily cron (D-07/D-08)
- [ ] 82.2-11-PLAN.md — Manual backfill trigger + verification
- [ ] 82.2-12-PLAN.md — 24h post-deploy coverage verification (go/no-go)

### Phase 82.3: Per-stage audit surface (v8.0 stabilisation) (INSERTED)

**Goal:** Add read-only detail panes to each stage entry in the existing Bulk Review detail-pane sidebar so the operator can see *why* a stage produced its verdict — regex match, LLM reasoning JSON, resolver candidates, Browserless screenshots — before deciding whether to override. Override controls themselves stay untouched. Replaces Phase 77's original "real Stage 2/3 review surface" intent. 80/20 cut: verdict + reasoning summary + key evidence + screenshots in default view; full transcript behind expander.
**Requirements**: TBD (see `82.3-CONTEXT.md`)
**Depends on:** Phase 82.1
**Plans:** 11 plans
**Blocks:** Phase 82.4 (prose-notes capture mounts inside the popup 82.3 ships)
**Closure target:** before 2026-05-18 (debtor-person onboarding)
**Supersedes:** Phase 77 (Stage 2/3 e2e verification)

Plans:
- [ ] 82.3-01-PLAN.md — Install shadcn Collapsible primitive
- [ ] 82.3-02-PLAN.md — Extend StageData + UnifiedDetailPaneProps with audit slot + audit-types.ts
- [ ] 82.3-03-PLAN.md — Stage0EvidencePanel (regex + LLM injection + budget headroom)
- [ ] 82.3-04-PLAN.md — Stage1EvidencePanel (noise registry, Pass-1/Pass-2, hard-sep lock)
- [ ] 82.3-05-PLAN.md — Stage2EvidencePanel + ScreenshotThumb (signed-URL thumbnails)
- [ ] 82.3-06-PLAN.md — Stage3EvidencePanel (ranked intents, hard-sep lock)
- [ ] 82.3-07-PLAN.md — StageDetailExpander wired into stage-step.tsx (Stage 0–3 only)
- [ ] 82.3-08-PLAN.md — Signed-URL API route (/api/automations/audit/signed-url)
- [ ] 82.3-09-PLAN.md — RawJsonToggle sub-component + panel placeholder swaps
- [ ] 82.3-10-PLAN.md — displaySender/displaySubject fix ("Planning"/"(no subject)")
- [ ] 82.3-11-PLAN.md — buildStageAuditMap + per-page wiring + operator UAT checkpoint

### Phase 82.4: Feedback capture infrastructure (v8.0 stabilisation) (INSERTED)

**Goal:** Capture prose-notes context alongside the existing override controls per stage and re-scope the stage-tab lists to show every email with a verdict at each stage (Option Z). Two surfaces: (1) prose-notes textarea next to override controls on Stages 0-3 inside Phase 82.3's audit popup; (2) re-scope stage-tab lists to show every-row-with-verdict + a "needs action" filter chip (defaults OFF). `email_feedback` table seeded so V9.0 synthesis (clusterer + drafter + Learning Inbox) has captured data to read from. Synthesis itself stays V9.0.
**Requirements**: FB-01, FB-02, FB-03, FB-04, FB-05, FB-06, FB-07, FB-08, FB-09, FB-10, FB-11
**Depends on:** Phase 82.3 (prose-notes UI mounts inside 82.3's audit panes)
**Plans:** 7/7 plans complete
**Closure target:** before 2026-05-18 (debtor-person onboarding)

Plans:
- [x] 82.4-01-PLAN.md — email_feedback migration + [BLOCKING] schema push (FB-01) ✓ 2026-05-13
- [x] 82.4-02-PLAN.md — POST /api/automations/debtor-email/feedback route + zod + tests (FB-02, FB-03)
- [x] 82.4-03-PLAN.md — StageFeedbackPanel (prose textarea + ✓ Confirm chip) mounted in stage-step.tsx with auto-collapse (FB-04, FB-05)
- [x] 82.4-04-PLAN.md — fireFeedback helper + override-surface wiring (writes verdict='override' rows alongside Inngest dispatch) (FB-06)
- [x] 82.4-05-PLAN.md — loadStageFeedbackList loader: Option Z + cursor pagination + bucket sort (FB-07, FB-08)
- [x] 82.4-06-PLAN.md — NeedsActionChip + MineOnlyChip URL-param toggles wired into stage-0/1/2/3 page.tsx (FB-09, FB-10)
- [x] 82.4-07-PLAN.md — Inngest nightly snapshot cron to Supabase Storage (FB-11)

### Phase 82.5: Feedback UX deepdive (v8.0 stabilisation) (INSERTED)

**Goal:** Polish the Phase 82.4 feedback capture surface — controlled-component textarea contract, parent-owned seeding, override-branch dispatch hygiene, Option Z list forwarding through OptionZDetailPane, RowVerdictDot overlay, R8 1280×800 layout — so the debtor-person operator onboarding (2026-05-18) lands on a feedback UI that doesn't fight the operator.
**Requirements**: R1, R2, R3, R4, R5, R6, R7, R8, W4 (see `82.5-SPEC.md`)
**Depends on:** Phase 82.4
**Plans:** 7/7 plans complete
**Verification:** 8/8 SPEC requirements PASS (see `82.5-VERIFICATION.md`). Operator UAT + Playwright 1280×800 snapshot pending before `/gsd-ship`.

Plans:
- [x] 82.5-01-PLAN.md — SPEC + scope intake
- [x] 82.5-02-PLAN.md — RowVerdictDot overlay (R4)
- [x] 82.5-03-PLAN.md — StageFeedbackPanel controlled-component contract (R3, R5)
- [x] 82.5-04-PLAN.md — Save/Confirm dispatch hygiene (R1, R2)
- [x] 82.5-05-PLAN.md — Footer override branch dispatch-only; parent seeding via stage-step.tsx (R6)
- [x] 82.5-06-PLAN.md — feedbackMap forwarded through OptionZDetailPane (R7)
- [x] 82.5-07-PLAN.md — Playwright 1280×800 snapshot spec + UAT script (R8, W4)

### Phase 82.6: Footer Approve → recordVerdict wiring (v8.0 stabilisation) (INSERTED)

**Goal:** Wire the Phase 82.5 footer "✓ Approve (Stages X+Y)" button on Stage 1 to call `recordVerdict` (Phase 56.7-03) in addition to the existing email_feedback POST, so that clicking Approve actually advances the row out of the Stage 1 queue (status flip predicted→feedback, agent_runs telemetry, Inngest dispatch, broadcast → row vanishes). Hide the footer Approve button on Stages 0/2/3/4 (D-02b). Optimistic row removal via `pendingRemovalIds` (D-04). Non-fatal failure UX per override-flow precedent (D-03).
**Requirements**: D-01..D-04 + D-02b/D-02c (see `82.6-CONTEXT.md`)
**Depends on:** Phase 82.5
**Plans:** 2 plans

Plans:
- [x] 82.6-01-PLAN.md — Add `approvePrediction` server-action wrapper to `stage-1/actions.ts` (D-01) ✓ shipped commit `07be50f`
- [x] 82.6-02-PLAN.md — Wire wrapper into `_shell/detail-pane.tsx` handlePrimary + hide footer Approve on Stages 0/2/3/4 (D-02b, D-03, D-04) ✓ shipped commits `a45fe21`, `65e820c`

**Verification:** 7/7 structural must-haves PASS (`82.6-VERIFICATION.md`). Deployed to production 2026-05-16 (Vercel `dyvfktamb`). Operator UAT confirmed approve flow works end-to-end; surfaced 4 follow-up UX defects → Phase 82.7.

### Phase 82.7: Detail-pane post-approve polish (v8.0 stabilisation) (INSERTED)

**Goal:** Polish the post-Approve UX surfaced by operator UAT on the deployed Phase 82.6 wiring. Four defects, all in `_shell/detail-pane.tsx` + `StageFeedbackPanel.tsx`: (D-01) auto-advance detail pane to next row after Approve; (D-02) drop duplicate ✓ glyph from primary button label; (D-03) cancel-override escape hatch (per-stage + footer-level) for accidental "override stage" clicks; (D-04) StageFeedbackPanel button + container visual polish (hierarchy, alignment, container rhythm). Pure frontend; no pipeline / server-action / DB changes.
**Requirements**: D-01..D-04 (see `82.7-CONTEXT.md`)
**Depends on:** Phase 82.6
**Plans:** 4 plans

Plans:
- [x] 82.7-01-PLAN.md — D-04 StageFeedbackPanel polish (single-line buttons + bordered card container)
- [x] 82.7-02-PLAN.md — D-02 label de-duplication + D-03 footer Cancel override button + onCancelDirty callback wiring (detail-pane.tsx batched edit)
- [x] 82.7-03-PLAN.md — D-03 per-stage cancel-override link (pipeline-flow + stage-step prop thread)
- [x] 82.7-04-PLAN.md — D-01 auto-advance to next visible row after Approve (selection-context + detail-pane)

### Phase 82.8: Stage 4 handled overview + Stage 1 before/after screenshots (v8.0 stabilisation) (INSERTED)

**Goal:** Close three operator-flow gaps surfaced 2026-05-18. (D-01) Stage 1 success path emits Stage 4 `auto_archived_noise` telemetry; (D-02) Stage 4 tab renders three collapsible sections (Handler error / Needs review / Auto-archived) with badge counts and English labels; (D-03) Stage 1 + Stage 4 detail-panes render before/after iController screenshots via a path-based StageScreenshotStrip + signed-URL-on-demand reads (replacing the 1h-expired URL writes). Includes 30d backfill of Stage 4 auto-archived rows + path-extract from existing signed URLs. File-disjoint from parallel Phase 82.7.1 except the explicit detail-pane mount-point (gated).
**Requirements**: D-01..D-07 (see `82.8-CONTEXT.md`)
**Depends on:** Phase 82.4 (feedback infra shipped), Phase 82.7.1 (only for Plan 07 detail-pane mount gate)
**Plans:** 8 plans

Plans:
- [ ] 82.8-01-PLAN.md — additive screenshot_*_path columns migration on debtor.email_labels (D-04)
- [ ] 82.8-02-PLAN.md — classifier-verdict-worker emits Stage 4 auto_archived_noise after categorize_archive (D-01)
- [ ] 82.8-03-PLAN.md — label-email-in-icontroller + tagger persist screenshot_*_path columns (D-04)
- [ ] 82.8-04-PLAN.md — 30d backfill: Stage 4 auto_archived_noise rows + URL-to-path extract (D-07)
- [ ] 82.8-05-PLAN.md — Stage 4 page: three collapsible sections + loadAutoArchivedNoiseRows loader (D-02)
- [ ] 82.8-06-PLAN.md — StageScreenshotStrip component (file-disjoint, Vitest, D-03 read-side)
- [ ] 82.8-07-PLAN.md — mount StageScreenshotStrip in detail-pane + thread paths from stage-1/stage-4 pages (D-03, gated on 82.7.1 ship)
- [ ] 82.8-08-PLAN.md — STATE.md punch-list reconcile (mark 82.2/82.3/82.4/82.8 complete)

### Phase 81.1: v7 token gap fix — add missing --space-N scale + v7-text-muted/v7-border aliases (INSERTED) ✓ closed 2026-05-11

**Goal:** Add missing `--space-1..7` scale + `--v7-text-muted` / `--v7-border` aliases to `web/app/globals.css` so `_shell/StageTabStrip`, `_shell/PageHeader`, and Phase 76 Stage 3 surfaces resolve their `var(--space-N)` references correctly.
**Requirements**: D-01..D-04 in `81.1-CONTEXT.md` (no separate REQUIREMENTS.md tracking — inline polish phase)
**Depends on:** Phase 81
**Plans:** 0 plans (executed inline — bypassed plan pipeline)
**Verification:** Inline fix landed via commit `4ce8455` (`fix(81.1): add missing --space-N scale + v7-text-muted/v7-border aliases`). No follow-up.

Plans:
- [x] N/A — executed inline (CSS-only token additions; no plan pipeline needed per CONTEXT.md `Status: Ready for execution (inline fix — bypassing plan pipeline)`)

### Phase 34: Foundation & Auth
**Goal**: Users can securely sign in and organize pipeline work into projects with colleague access
**Depends on**: Nothing (first V3.0 phase)
**Requirements**: FOUND-01, FOUND-02, PROJ-01, PROJ-02, PROJ-03, PROJ-04
**Success Criteria** (what must be TRUE):
  1. User can sign in with email/password and reach the app dashboard
  2. User can create a named project and invite colleagues to it
  3. User only sees projects they belong to -- no cross-project data leakage
**Deferred**: M365 SSO (FOUND-01, FOUND-02) moved to future phase -- Azure AD integration removed during development
**Plans**: 3 plans

Plans:
- [x] 34-01-PLAN.md -- App scaffold, Supabase auth (email/password, M365 SSO future), proxy.ts, DB schema with RLS
- [x] 34-02-PLAN.md -- Project list home page, create project modal, invite flow (AD + email), project detail
- [x] 34-03-PLAN.md -- Checkpoint: verify auth flow, tenant restriction, project CRUD, invitation

### Phase 35: Pipeline Engine
**Goal**: Users can submit a use case description and watch it execute as a durable pipeline that survives server restarts and recovers from failures
**Depends on**: Phase 34
**Requirements**: FOUND-03, FOUND-04, FOUND-05, PIPE-01, PIPE-02, PIPE-03, PIPE-04, PIPE-05
**Success Criteria** (what must be TRUE):
  1. User can type a use case description and click one button to start the pipeline
  2. Pipeline executes via Inngest durable functions (not API routes) and completes end-to-end
  3. User can see a list of their pipeline runs with current status and timestamps
  4. User can retry a failed pipeline from the exact step that failed (not from scratch)
  5. Pipeline errors display plain-English messages (not stack traces) with a retry button
**Plans**: 4 plans

Plans:
- [x] 35-01-PLAN.md -- Database schema (pipeline_runs/steps/files), Inngest setup, prompt adapter, stage definitions, error mapper
- [x] 35-02-PLAN.md -- Pipeline durable function (Inngest step-per-stage), server action to trigger runs, retry-from-failed-step
- [x] 35-03-PLAN.md -- New run form (use case textarea, file upload), run detail page (step timeline, expandable logs, retry)
- [x] 35-04-PLAN.md -- Run list UI (project tabs, global runs page, run cards), end-to-end verification checkpoint

### Phase 36: Dashboard & Graph
**Goal**: Users have real-time visibility into pipeline execution through a live timeline, log stream, and interactive agent swarm graph
**Depends on**: Phase 35
**Requirements**: DASH-01, DASH-02, DASH-03, DASH-04, GRAPH-01, GRAPH-02, GRAPH-03, GRAPH-04
**Success Criteria** (what must be TRUE):
  1. User sees pipeline steps complete in real time without refreshing the page (via Supabase Broadcast)
  2. User sees a vertical timeline of pipeline steps with human-readable descriptions and state indicators
  3. Run list page updates automatically when any pipeline run changes status
  4. User sees an interactive node graph showing agents, their roles, and tool connections
  5. Graph nodes light up during execution and display performance scores after completion
**Plans**: 4 plans

Plans:
- [x] 36-00-PLAN.md -- Wave 0: test infrastructure (vitest jsdom config, 5 test stub files for Nyquist compliance)
- [x] 36-01-PLAN.md -- Broadcast infrastructure, graph-mapper utility, pipeline Broadcast emissions, npm deps install
- [x] 36-02-PLAN.md -- React Flow graph components (AgentNode, AnimatedEdge, dagre layout, AgentDetailPanel, SwarmGraph wrapper with celebration)
- [x] 36-03-PLAN.md -- Page integration (graph-primary run detail, Sheet timeline drawer, live run list, Swarm Graph tab), verification checkpoint

### Phase 37: HITL Approval
**Goal**: Users can review, approve, or reject proposed prompt changes from the pipeline with full context and audit trail
**Depends on**: Phase 36
**Requirements**: HITL-01, HITL-02, HITL-03, HITL-04, HITL-05, HITL-06
**Success Criteria** (what must be TRUE):
  1. Pipeline pauses automatically when prompt changes are proposed and user sees a pending approval
  2. User sees a diff view with plain-English explanation of what changed and why
  3. User can approve or reject with an optional comment, and the pipeline resumes automatically
  4. User receives an email notification when an approval is waiting for them
  5. All approval decisions are logged with timestamp, user identity, and comment (audit trail)
**Plans**: 4 plans

Plans:
- [ ] 37-00-PLAN.md -- Wave 0: test stubs (6 test files), npm install (react-diff-viewer-continued, resend)
- [ ] 37-01-PLAN.md -- DB schema (approval_requests), Inngest events, Broadcast extension, approval helpers, pipeline waitForEvent integration
- [ ] 37-02-PLAN.md -- Approval UI (DiffViewer, ApprovalPanel, ApprovalBadge), StepStatusBadge + StepLogPanel waiting state, RunDetailClient wiring
- [ ] 37-03-PLAN.md -- Email notifications (Resend), audit trail UI (ApprovalHistory), graph node waiting state, end-to-end verification

### Phase 37.1: Conversational Pipeline
**Goal**: The pipeline is a streaming conversation -- an AI narrator asks clarifying questions, explains what it's designing, shows results, and gets user feedback at key decision points, mirroring the CLI skill experience
**Depends on**: Phase 37 (uses HITL approval infrastructure, terminal panel, broadcast)
**Requirements**: UAT-DIALOGUE, UAT-DISCUSSION, UAT-STREAMING
**Success Criteria** (what must be TRUE):
  1. User sees a streaming chat conversation in the run detail page, not just status cards
  2. Before the pipeline runs, a discussion phase asks clarifying questions about the use case (multi-turn)
  3. After the architect stage, user sees a conversational summary of the designed swarm and can confirm or give feedback
  4. After the spec-generator stage, user sees spec highlights and can approve or request changes
  5. Silent stages (tool-resolver, researcher, etc.) show brief status messages in the chat without extra API calls
  6. User has a text input field to respond at interaction points, and the pipeline resumes based on their response
**Plans**: 4 plans

Plans:
- [ ] 37.1-01-PLAN.md -- DB schema (pipeline_chat_messages), types, Inngest event, broadcast chat-token helpers, discussion server action
- [ ] 37.1-02-PLAN.md -- Streaming narrator module, discussion agent module, pipeline.ts modifications (discussion loop, narrator interjections, template messages)
- [ ] 37.1-03-PLAN.md -- Chat UI components (ChatMessageBubble, ChatInput, ChatPanel with RAF token accumulation, StageProgressBar)
- [ ] 37.1-04-PLAN.md -- RunDetailClient wiring (ChatPanel replaces TerminalPanel, server page hydration, server action dispatch), end-to-end verification

### Phase 38: Swarm Activation
**Goal**: External systems can trigger pipeline runs and check status via authenticated webhook endpoints
**Depends on**: Phase 35
**Requirements**: ACTV-01, ACTV-02, ACTV-03, ACTV-04
**Success Criteria** (what must be TRUE):
  1. Each deployed swarm has a unique webhook URL that external systems can call
  2. Webhook requests without a valid API key are rejected
  3. A webhook call starts the full pipeline and returns a run ID for tracking
  4. External systems can poll the run ID to check pipeline status and completion
**Plans**: 3 plans

Plans:
- [ ] 38-01: TBD

### Phase 39: Infrastructure & Credential Foundation
**Goal**: The platform has verified connectivity to Browserless.io, secure credential storage, file upload infrastructure, and an MCP tool hosting route -- all validated before any automation features are built
**Depends on**: Phase 35 (uses Inngest pipeline, Supabase DB, Next.js API routes)
**Requirements**: CRED-01, CRED-02, CRED-03, CRED-04
**Success Criteria** (what must be TRUE):
  1. User can store credentials for a target system and see them listed (names only, values hidden) in the web app
  2. Stored credentials can be injected into a Browserless.io script execution without exposing them in logs or client-side code
  3. User receives a reminder notification when stored credentials are approaching their rotation date
  4. Different target systems can use different authentication methods (username/password, SSO token, certificate) via per-system auth profiles
  5. Browserless.io connectivity, Supabase Storage uploads, and MCP adapter route all respond successfully from an Inngest step (infrastructure smoke test)
**Plans**: 3 plans

Plans:
- [ ] 39-00-PLAN.md -- Wave 0: npm install (mcp-handler, @modelcontextprotocol/sdk, playwright-core), TypeScript types, DB schema, test stubs
- [ ] 39-01-PLAN.md -- Credential encryption (AES-256-GCM), proxy, failure detection, API routes, Inngest health check, MCP adapter route, email notification
- [ ] 39-02-PLAN.md -- Full UI layer: settings page with tabs, credential CRUD (list/create/replace/delete), auth type selector, health dashboard with Broadcast, project credential linking, sidebar navigation

### Phase 40: Detection, SOP Upload & Vision Analysis
**Goal**: The pipeline detects when agents need browser automation, guides users through SOP and screenshot upload, and uses AI vision to build a confirmed step-by-step understanding of the target process
**Depends on**: Phase 39
**Requirements**: DETECT-01, DETECT-02, DETECT-03, DETECT-04, DETECT-05, VISION-01, VISION-02, VISION-03, VISION-04, VISION-05
**Success Criteria** (what must be TRUE):
  1. Pipeline automatically identifies when a designed agent targets a no-API system and activates the automation builder -- and skips it when the target system has an API
  2. User can upload an SOP document (Word or PDF) and screenshots of the target system through a guided wizard that validates completeness
  3. AI analyzes uploaded screenshots via Orq.ai (Agent or AI Routing) and presents annotated screenshots with highlighted UI elements back to the user
  4. AI parses the SOP document and correlates each step with specific elements identified in the screenshots
  5. User can confirm or correct the AI's interpretation of each step, and the AI incorporates corrections into its updated understanding
**Plans**: 5 plans

Plans:
- [ ] 40-00-PLAN.md -- Wave 0: test stub files (4 test files for Nyquist compliance: automation-detector, vision-adapter, annotation-highlight, upload)
- [ ] 40-01-PLAN.md -- DB schema (systems, system_project_links, automation_tasks), TypeScript types, npm install (react-markdown, remark-gfm), pipeline constants, events, systems registry UI
- [ ] 40-02-PLAN.md -- Terminal interaction panel (replaces Sheet drawer), card-based entry rendering, approval migration, extended status badge, RunDetailClient rewrite
- [ ] 40-03-PLAN.md -- Automation detector Inngest step, vision adapter (Orq.ai multimodal), pipeline branch, SOP upload/paste UI, screenshot upload with signed URLs
- [ ] 40-04-PLAN.md -- Annotation review overlay (full-width Dialog), side-by-side SOP + screenshots, per-step confirm/edit, CSS overlay highlights, re-analysis with corrections

### Phase 41: Script Generation, Testing & MCP Deployment
**Goal**: AI generates Playwright scripts from confirmed automation steps, tests them on Browserless.io with user-visible Session Replay, iterates until stable, and deploys verified scripts as MCP tools attached to the target Orq.ai agent
**Depends on**: Phase 40
**Requirements**: SCRIPT-01, SCRIPT-02, SCRIPT-03, SCRIPT-04, SCRIPT-05, SCRIPT-06, SCRIPT-07, SCRIPT-08, MCPTL-01, MCPTL-02, MCPTL-03
**Success Criteria** (what must be TRUE):
  1. AI generates a Playwright script using getByRole/getByText locators from the confirmed automation steps and executes it on Browserless.io
  2. User can watch a Session Replay recording of the test execution to see exactly what happened in the browser
  3. When a script fails, AI diagnoses the failure using DOM accessibility tree context and proposes fixes -- iterating up to 5 times or until the script stabilizes
  4. Auth state persists across test iterations via cookies/localStorage so the user does not need to re-authenticate the target system repeatedly
  5. Verified script deploys as an MCP tool on the Vercel deployment, automatically attaches to the Orq.ai agent, and the agent can successfully call the tool during execution
**Plans**: 3 plans

Plans:
- [ ] 41-01: TBD
- [ ] 41-02: TBD
- [ ] 41-03: TBD

### Phase 42: Standalone Automations & Triggers
**Goal**: Users can create and manage browser automations independently of the agent pipeline, with scheduling and external trigger capabilities for recurring execution
**Depends on**: Phase 41 (reuses script generation, testing, and deployment infrastructure)
**Requirements**: AUTO-01, AUTO-02, AUTO-03, AUTO-04, TRIG-01, TRIG-02, TRIG-03, TRIG-04
**Success Criteria** (what must be TRUE):
  1. User can create a browser automation directly from the dashboard without starting an agent pipeline run
  2. Simple automations can be described conversationally (no SOP or screenshots needed), while complex automations use the full SOP + screenshot flow
  3. User can view, edit, and delete their automations from a management dashboard
  4. User can schedule an automation to run on a recurring basis (daily, weekly, or custom cron) and trigger it via webhook
  5. Automation results are returned to the caller -- webhook response for direct triggers, callback URL for Zapier integration
**Plans**: 3 plans

Plans:
- [ ] 42-01: TBD
- [ ] 42-02: TBD

### Phase 44: Project Model & Data Collection
**Goal**: Every project has a status lifecycle and automation type classification, and data from Zapier (browser scraper) and Orq.ai (analytics API) accumulates in Supabase -- so the executive dashboard has real data to display from day one
**Depends on**: Phase 35 (uses Inngest, Supabase DB, Next.js API routes; also uses Browserless.io patterns from Phase 39)
**Requirements**: PEXT-01, PEXT-02, PEXT-03, DINT-01, DINT-02, DINT-03, DINT-04, DINT-05
**Success Criteria** (what must be TRUE):
  1. User can see status (idea/building/testing/live) and automation type (zapier-only/hybrid/standalone-app/orqai-agent) badges on project cards throughout the app
  2. Zapier analytics data (active zaps, task counts, success rates) is scraped via Browserless.io and stored in Supabase snapshots multiple times per day
  3. Zapier scraper includes validation that detects broken selectors or stale data and flags the issue instead of silently storing bad data
  4. Orq.ai analytics (usage, cost, latency, errors, agent performance) is collected via MCP analytics API and stored in Supabase snapshots on a schedule
  5. Both collectors run as Inngest cron functions and accumulate data independently of whether the dashboard UI exists yet
**Plans**: 3 plans

Plans:
- [x] 44-01-PLAN.md -- DB migration (project model extension + snapshot tables), TypeScript types, ProjectStatusBadge + AutomationTypeTag components, ProjectCard update
- [x] 44-02-PLAN.md -- Orq.ai analytics collector (Inngest hourly cron, MCP API, Zod validation, orqai_snapshots)
- [x] 44-03-PLAN.md -- Zapier analytics browser scraper (Inngest twice-daily cron, Browserless.io, multi-fallback selectors, validation layer, zapier_snapshots)

### Phase 45: Executive Dashboard
**Goal**: Executives (CEO/CTO/CFO) can open a single dashboard page and see a 360-degree overview of all automation activity, project health, ROI estimates, and trends -- loaded from pre-computed snapshots in under 100ms
**Depends on**: Phase 44 (data from all three sources must be accumulating)
**Requirements**: EDASH-01, EDASH-02, EDASH-03, EDASH-04, EDASH-05, EDASH-06, DINT-06
**Success Criteria** (what must be TRUE):
  1. Dashboard shows KPI summary cards with real data (total runs, success rate, active automations, estimated time saved)
  2. Dashboard shows activity trend charts (runs over time, broken down by source) using Recharts via shadcn chart components
  3. Dashboard shows project status breakdown by lifecycle stage (idea/building/testing/live) as a visual distribution
  4. ROI metrics are clearly labeled as "estimates" with distinct visual treatment separating measured from estimated data
  5. Health indicators show error rates and reliability trends per project with traffic-light status (green/yellow/red)
  6. Dashboard page loads in under 100ms by reading only from pre-computed `dashboard_snapshots` table, never querying external services directly
**Plans**: 3 plans

Plans:
- [x] 45-01-PLAN.md -- DB migration (dashboard_snapshots + ROI baselines), types, Zod schemas, health score, format utils, aggregator logic, Inngest cron, test stubs
- [ ] 45-02-PLAN.md -- npm install (recharts, date-fns), shadcn chart/select/table, KPI card components, dashboard page shell, sidebar nav, loading/empty states
- [ ] 45-03-PLAN.md -- Chart and table components (8 total), wire into page tab content, visual verification checkpoint

### Phase 46: Status Monitoring & O365 SSO
**Goal**: Project statuses stay accurate through automated monitoring that auto-applies forward transitions and suggests backward transitions, and users can sign in with their Microsoft 365 work account alongside existing email/password auth
**Depends on**: Phase 45 (needs dashboard infrastructure and accumulated signal data); O365 is independent but grouped here for coarse granularity
**Requirements**: PEXT-04, PEXT-05, O365-01, O365-02, O365-03
**Success Criteria** (what must be TRUE):
  1. Status monitor auto-transitions projects forward (idea->building->testing->live) based on observed activity signals without user intervention
  2. Backward status transitions are suggested via notification only -- user must confirm before the status changes
  3. User can sign in with "Sign in with Microsoft" button using their Moyne Roberts M365 account (Azure AD OAuth)
  4. Existing email/password users are pre-linked to their Azure AD identity so SSO login connects to their existing account and project data (no duplicate accounts)
**Plans**: 3 plans

Plans:
- [ ] 46-01: TBD
- [ ] 46-02: TBD

### Phase 47: UI Redesign & Polish
**Goal**: The entire application looks executive-worthy with consistent branding, professional typography, and dark mode -- covering all existing pages plus the new executive dashboard
**Depends on**: Phase 46 (all pages must exist before full-surface redesign)
**Requirements**: UIDX-01, UIDX-02, UIDX-03, UIDX-04, UIDX-05, UIDX-06
**Success Criteria** (what must be TRUE):
  1. App uses Moyne Roberts brand colors and typography derived from moyneroberts.com across all pages
  2. All UI components (cards, buttons, inputs, badges, navigation) follow a consistent design system with no visual inconsistencies between pages
  3. Sidebar navigation is polished with active state indicators, branding, and professional visual hierarchy
  4. Dark mode toggle persists user preference and all pages render correctly in both light and dark themes
  5. Layout is responsive and usable on both tablet and desktop screens
**Plans**: 3 plans

Plans:
- [ ] 47-01: TBD
- [ ] 47-02: TBD

### Phase 48: Foundation
**Goal**: The new design system, database schema, and Azure AD SSO are in place so all V7 visual and data-driven features can build on a stable foundation
**Depends on**: Phase 45 (V6.0 executive dashboard complete; V7 extends it)
**Requirements**: DS-01, DS-02, DS-03, DS-04, AUTH-01, AUTH-02, AUTH-03, RT-02, RT-03, RT-04
**Success Criteria** (what must be TRUE):
  1. App renders with Satoshi Variable (body) and Cabinet Grotesk Variable (headings) fonts with no CLS flash on load
  2. User can toggle between dark and light theme and their preference persists across sessions with no flash of unstyled content
  3. V7 glassmorphism components (backdrop-blur, semi-transparent panels) render correctly without breaking any existing V6 pages
  4. User can sign in with "Sign in with Microsoft" button and existing email/password accounts link automatically to M365 identity
  5. User without project_members association sees "access pending" page after SSO login (not a blank screen or error)
**Plans**: 3 plans

Plans:
- [x] 48-01-PLAN.md — V7 design system (fonts, theme toggle, tokens, GlassCard)
- [x] 48-02-PLAN.md — Database migrations (agent_events, swarm_jobs, swarm_agents, swarm_briefings)
- [ ] 48-03-PLAN.md — Azure AD OAuth SSO with access-pending gate

### Phase 49: Navigation & Realtime
**Goal**: Users can browse swarms via a sidebar and each swarm view shares a single Realtime connection that all child components consume
**Depends on**: Phase 48
**Requirements**: NAV-01, NAV-02, NAV-03, RT-01
**Success Criteria** (what must be TRUE):
  1. Sidebar displays swarm list dynamically loaded from the projects table with live mini-stats (active jobs, agent count)
  2. User can click a swarm in the sidebar to navigate to /swarm/[swarmId] and see the swarm-specific view
  3. A single Supabase Realtime subscription per swarm view distributes events to all child components (no per-component subscriptions)
  4. Navigating between swarms cleanly tears down the previous subscription and creates a new one (no stale data, no channel leaks)
**Plans**: TBD

Plans:
- [ ] 49-01: TBD
- [ ] 49-02: TBD

### Phase 50: Data Pipeline
**Goal**: Orq.ai trace and span data flows into Supabase automatically so all live UI components have real agent execution events to display
**Depends on**: Phase 49 (Realtime subscription infrastructure must exist)
**Requirements**: DATA-01, DATA-02, DATA-03
**Success Criteria** (what must be TRUE):
  1. Inngest orqai-trace-sync cron function polls Orq.ai for trace/span data and writes structured events to the agent_events table
  2. New agent_events rows propagate to connected UI clients via Supabase Realtime postgres_changes within seconds
  3. Orq.ai API rate limits are respected through server-side caching -- no client ever calls Orq.ai directly
**Plans**: 2 plans

Plans:
- [x] 50-01: Migration + shared Orq.ai MCP helper + pure trace mapper + vitest tests
- [x] 50-02: Inngest cron function wiring + serve route registration

### Phase 51: Hero Components
**Goal**: Management sees at a glance what each agent is doing (fleet cards), gets a plain-English health narrative (briefing), and can drill into any agent for details (drawer)
**Depends on**: Phase 49 (uses swarm routing and Realtime infrastructure); Phase 50 for drawer communication timeline
**Requirements**: FLEET-01, FLEET-02, FLEET-03, FLEET-04, BRIEF-01, BRIEF-02, BRIEF-03, DRAW-01, DRAW-02, DRAW-03, DRAW-04
**Success Criteria** (what must be TRUE):
  1. Subagent fleet section shows a card per agent with name, role, state badge, color indicator, 3 metrics (active jobs, queue depth, error count), and skill pill tags
  2. AI briefing panel displays a plain-English swarm health narrative with KPI grid (active jobs, human review, blocked, done today)
  3. Briefing refreshes automatically every 30 minutes and on-demand via a UI button
  4. User can click a fleet card to open a slide-out drawer showing agent name, role, active count, average cycle time, behavior description, recent communication timeline (last 5 events), and workflow stage tags
**Plans**: TBD

Plans:
- [x] 51-01: Fleet cards (SubagentFleet + SubagentFleetCard + AgentStateBadge)
- [x] 51-02: AI briefing panel (Orq.ai Briefing Agent + server action + panel + 30-min cron)
- [x] 51-03: Agent detail drawer (DrawerContext + AgentDetailDrawer via shadcn Sheet + timeline/cycle utils)

### Phase 52: Live Interactivity
**Goal**: Users have a live scrolling event stream for real-time monitoring and a Kanban board for tracking where jobs stand in the business process, with smart filters to surface exceptions
**Depends on**: Phase 50 (terminal needs agent_events data flowing); Phase 49 (Kanban uses Realtime for multi-user sync)
**Requirements**: OBS-03, OBS-04, OBS-05, KAN-01, KAN-02, KAN-03, KAN-04, NAV-04
**Success Criteria** (what must be TRUE):
  1. Claude-style terminal displays scrolling event stream with timestamp, event type badge, and payload text -- receiving events via Supabase Realtime in real-time
  2. Terminal uses a ring buffer (max 500 events) with virtualized rendering and never causes memory leaks on always-on monitoring screens
  3. 5-column Kanban board displays jobs across business stages (backlog, ready, in progress, human review, done) with title, description, and colored tag pills
  4. User can drag and drop jobs between Kanban columns with keyboard accessibility, and moves persist to swarm_jobs with optimistic UI and snapshot rollback on failure
  5. Smart filter buttons in the sidebar filter the swarm view to show only blocked, needs review, or high SLA risk items
**Plans**: 3 plans

Plans:
- [x] 52-01: Terminal event stream with ring buffer (useSyncExternalStore + module store) + auto-scroll + pause + clear + missed-events pill
- [x] 52-02: Kanban board with dnd-kit (5 columns, multi-column sortable, optimistic moveJob server action with sonner-revert, Realtime sync) + 10-row fixture
- [x] 52-03: Sidebar smart filter chips with shareable URL ?filter= state (Only blocked / Needs review / High SLA risk)

### Phase 53: Advanced Observability
**Goal**: Users can see real-time agent-to-agent delegation as an animated graph and parallel agent activity as a Gantt-style timeline -- the primary differentiators from competing agent platforms
**Depends on**: Phase 50 (needs proven agent_events data with parent_span_id relationships)
**Requirements**: GRAPH-01, GRAPH-02, GRAPH-03, GRAPH-04, OBS-01, OBS-02
**Success Criteria** (what must be TRUE):
  1. Live delegation graph shows orchestrator and sub-agent nodes with animated connection paths that update in real-time as delegation events arrive
  2. Animated particles travel along graph paths using CSS offset-path (not React state) for 60fps performance
  3. Graph layout is auto-computed from agent hierarchy (parent_span_id relationships) -- no manual positioning needed
  4. Gantt-style swimlane timeline shows parallel agent activity with colored bars (thinking, tool_call, waiting, done) time-bucketed from agent_events spans per agent
**Plans**: TBD

Plans:
- [ ] 53-01: TBD
- [ ] 53-02: TBD

### Phase 54: Polish
**Goal**: All existing pages share the V7 visual identity so the app feels cohesive from end to end
**Depends on**: Phase 53 (all new features complete before full-surface migration)
**Requirements**: POL-01, POL-02, POL-03
**Success Criteria** (what must be TRUE):
  1. Executive dashboard page renders with V7 design tokens (Satoshi/Cabinet Grotesk fonts, glassmorphism panels, V7 color palette)
  2. Projects page renders with V7 design tokens and all project cards use the new visual style
  3. Settings page renders with V7 design tokens with no visual inconsistencies against V7 pages
**Plans**: TBD

Plans:
- [x] 54-01: V7 migration across dashboard, executive, projects, settings

### Phase 63: Architecture RFC
**Goal**: Operator can read a single canonical RFC document that defines the 4-stage funnel shape and supersedes the existing debtor-email pipeline architecture, locking the cross-swarm context contract before any code is touched
**Depends on**: Nothing (RFC-only foundation phase; locks shape for 64+)
**Requirements**: RFC-01, RFC-02, RFC-03, RFC-04
**Success Criteria** (what must be TRUE):
  1. `docs/agentic-pipeline-architecture.md` exists, defines all 5 stages (Stage 0..4), and is linked from `CLAUDE.md` as the canonical doc
  2. The Stage 2 -> Stage 3 context-shape contract (customer_id, customer_name, language, entity_brand, recent_documents[]) is documented and lookup-backend-agnostic
  3. The 4-axis override model (Stage 1 category, Stage 2 customer, Stage 3 intent, Stage 4 handler output) is documented with per-axis learning signal
  4. Graduated automation hooks per stage (regex promotion, sender mapping, prompt-tune triggers) are documented
  5. Existing `docs/debtor-email-pipeline-architecture.md` is annotated as superseded with a forward-pointer to the new RFC
**Plans**: 3 plans
- [ ] 63-01-PLAN.md — Wave 1 contracts (context-shape-contract, override-model, graduated-automation)
- [ ] 63-02-PLAN.md — Wave 2 per-stage docs (stage-0..4)
- [ ] 63-03-PLAN.md — Wave 3 README, CLAUDE.md update, SUPERSEDED banner, D-09 verification

### Phase 64: Stage 0 input safety + per-run budgets
**Goal**: Every inbound email passes through prompt-injection screening before any LLM sees it, and every pipeline run is bounded by hard token/cost ceilings with intent-scoped tool allowlists
**Depends on**: Phase 63 (RFC must lock the canonical shape first; orchestrator-worker spawning in Phase 65 is unsafe without per-run budgets)
**Requirements**: SAFE-01, SAFE-02, SAFE-03, SAFE-04, BUDG-01, BUDG-02, BUDG-03
**Success Criteria** (what must be TRUE):
  1. Emails containing prompt-injection patterns are flagged `injection_suspected` and routed to a human-only review lane, never to coordinator or handler
  2. Operator can audit injection-flagged emails in Bulk Review with the trigger pattern (regex hit or LLM verdict) surfaced
  3. Any pipeline run exceeding the configured token or cost ceiling halts deterministically and lands in the human queue with the budget breach reason
  4. A copy-document handler attempting to invoke a payment-update tool is rejected by the `zapier_tools.allowed_for_intents` allowlist (no successful side-effect)
  5. Operator sees per-email token cost in Bulk Review; cost outliers (>3x median) appear as their own override axis
**Plans**: 5 plans
Plans:
- [x] 64-01-PLAN.md — Wave 0 scaffolding: RED tests, probes (Haiku + ceiling), migration (allowed_for_intents), RFC update (D-02)
- [x] 64-02-PLAN.md — Stage 0 pure libs: regex-screen, regex-patterns, budget-counter, llm-verdict + extend invokeOrqAgent to expose usage+cost
- [x] 64-03-PLAN.md — Tool allowlist enforcement in nxt-zap-client (BUDG-02 default-deny) + caller updates
- [x] 64-04-PLAN.md — Inngest events + workers (stage-0-safety-worker, budget-breach-handler) + ingest route handoff
- [x] 64-05-PLAN.md — Safety Review tab UI: data loader, queue tree node, cost cell, detail pane, 3 server actions + outlier RPC


### Phase 65: Stage 3 ranked multi-intent coordinator + orchestrator escalation
**Goal**: The Stage 3 coordinator emits a ranked intent list and escalates to a Stage 3.5 orchestrator-worker only when the request genuinely needs decomposition, while the default fast path stays a single-shot router
**Depends on**: Phase 64 (orchestrator-worker spawning multiple Stage 4 handlers requires per-run budgets and tool allowlists to be safe)
**Requirements**: CORD-01, CORD-02, CORD-03, CORD-04
**Success Criteria** (what must be TRUE):
  1. Coordinator output is an ordered list of intents (primary + secondaries) with confidence scores, replacing the single-label output
  2. Coordinator escalates to Stage 3.5 orchestrator-worker when `confidence < threshold` OR `intent_count >= 3` OR an intent is registry-tagged `requires_orchestration`
  3. Orchestrator-worker spawns multiple Stage 4 handlers in parallel and synthesises their outputs into a single iController draft visible in Bulk Review
  4. On a representative sample, ~80% of inbound stays on the single-shot path with no orchestrator overhead added
**Plans**: 5 plans
Plans:
- [ ] 65-01-PLAN.md — DB schema + canonical types: 3 migrations (coordinator_runs, swarm_categories.requires_orchestration + 8 intent seed rows, coordinator_complete_handler RPC) + HandlerOutput + intentAgentOutputSchemaV2 + Wave 0 test scaffolds
- [ ] 65-02-PLAN.md — Orq agent registry: list_models pre-flight + PATCH debtor-intent-agent v2 + create debtor-orchestrator-agent + create synthesis-agent (Studio JSON Schema tools + create-then-PATCH ritual)
- [ ] 65-03-PLAN.md — Coordinator rewrite (single-shot fast path, CORD-01/02/04): rewrite invoke-intent for ranked output, pure escalation gate, in-place rewrite of debtor-email-triage Inngest function
- [ ] 65-04-PLAN.md — Orchestrator + synthesis fan-out (CORD-03): orchestrator-planner + synthesis Inngest functions, RPC fan-in helper, output-adapter, wire classifier-invoice-copy-handler to call coordinator-complete RPC
- [ ] 65-05-PLAN.md — Regression backfill + Bulk Review badge + verification: one-off regression script, partial_synthesis badge component, end-to-end smoke verification of CORD-01..04

### Phase 66: Pipeline consolidation (retire triage path)
**Goal**: There is exactly one canonical inbound flow (regex -> label-resolver -> coordinator -> handler) and the parallel `debtor-email-triage` path is retired
**Depends on**: Phase 65 (cannot retire the triage path until the canonical coordinator handles ranked multi-intent)
**Requirements**: CONS-01, CONS-02, CONS-03
**Success Criteria** (what must be TRUE):
  1. Every inbound debtor email passes through `regex -> label-resolver -> coordinator -> handler` with no parallel triage execution observed in telemetry
  2. The `debtor-email-triage` Inngest function is removed (or hard-disabled with a deprecation marker) and its intent-agent role lives only in `classifier-label-resolver`
  3. Every Stage 4 handler (copy-document body agent and any future handlers) is invoked via canonical `debtor-email/<intent>.requested` events; no direct cross-handler invocation remains
**Plans**: 5 plans
  - [ ] 66-01-PLAN.md — Function rename (file + function id + exported const + route.ts + test rename)
  - [ ] 66-02-PLAN.md — triage/ → coordinator/ directory move + 8 import-site rewrites + delete 2 dead helpers
  - [ ] 66-03-PLAN.md — D-03 trigger retarget (new event in events.ts, coordinator subscription, label-resolver emit, delete debtor/email.received)
  - [ ] 66-04-PLAN.md — CONS-03 cross-handler-import audit + doc reconciliation (debtor-email-pipeline-architecture.md, stage-3-coordinator.md)
  - [ ] 66-05-PLAN.md — Static-audit grep block + Vercel-preview synthetic-emit live smoke (fills 66-regression-report.md)

### Phase 67: Stage 2 closure (iController DOM tagging)
**Goal**: When the resolver returns a matched customer in live mode, the email is automatically tagged under that customer account in iController, with the tagging step non-blocking for downstream coordinator + handler work
**Depends on**: Phase 66 (canonical flow must be the only path before adding a side-effect to it)
**Requirements**: TAG-01, TAG-02, TAG-03
**Success Criteria** (what must be TRUE):
  1. In live mode, a matched-customer email automatically receives an iController account tag with no operator action
  2. A tagging failure surfaces as a deferred run flag and does not break Stage 3 + Stage 4 execution for that email
  3. Operator can audit tagging actions in `email_labels` plus before/after screenshots stored alongside the run
**Plans**: 7 plans
- [ ] 67-01-PLAN.md — Wave 0 gate-and-scaffold (acceptance probe re-run, migration file, test scaffolds, regression-report skeleton)
- [ ] 67-02-PLAN.md — Wave 1 apply migration + URL helper buildIcontrollerMessageUrl
- [ ] 67-03-PLAN.md — Wave 2 fill TODO(probe-artifact) blocks + add brand_mismatch + MAILBOX_BRAND_PATTERNS
- [ ] 67-04-PLAN.md — Wave 3 add icontroller-tag.requested event + second emit in classifier-label-resolver
- [ ] 67-05-PLAN.md — Wave 3 NEW debtorEmailIcontrollerTagger Inngest function + route.ts registration
- [ ] 67-06-PLAN.md — Wave 4 Bulk Review tagging-failure badge + detail-pane screenshot links
- [ ] 67-07-PLAN.md — Wave 5 acceptance + brand-mismatch + production smoke (operator-gated)
**UI hint**: yes

### Phase 68: swarm_registry generalisation + canonical context shape
**Goal**: Adding a new swarm requires only registry INSERTs - no edits to verdict-worker, classifier, or handler code - because every swarm-specific binding lives in `public.swarms` and `swarm_intents`
**Depends on**: Phase 63 (canonical context shape from RFC), Phase 66 (single canonical flow exists to be parameterised)
**Requirements**: SWRM-01, SWRM-02, SWRM-03, SWRM-04
**Success Criteria** (what must be TRUE):
  1. `public.swarms` has `stage1_regex_module`, `stage2_entity_resolver`, `stage3_coordinator_agent_key`, `side_effects[]` jsonb, plus the canonical context-shape contract column
  2. `swarm_intents` table exists with (`intent_key`, `handler_agent_key`, `handler_event`, `requires_orchestration`) and replaces every hardcoded intent->handler mapping
  3. A dry-run new-swarm onboarding requires zero edits to `verdict-worker` / classifier code - registry INSERTs only
  4. The `verdict-worker` `if swarm_type === 'debtor-email'` gate is replaced by a `side_effects[]` lookup
**Plans**: 9 plans
- [ ] 68-01-PLAN.md - Wave 1 [BLOCKING] migration: swarms columns + swarm_intents table + backfill (apply via Supabase MCP)
- [ ] 68-02-PLAN.md - Wave 2 registry helpers: loadSwarmIntents/loadHandlerEvent/loadCanonicalContextShape + side-effects.ts + dynamic.ts + resolveEntity alias
- [ ] 68-03-PLAN.md - Wave 3 verdict-worker swap: registry-driven categorize_archive dispatch (eliminate swarm_type === gate)
- [ ] 68-04-PLAN.md - Wave 3 label-resolver swap: Phase 67 icontroller-tag emit via evaluateSideEffects(stage2_match_live)
- [ ] 68-05-PLAN.md - Wave 3 coordinator-orchestrator swap: template-literal fan-out -> loadHandlerEvent
- [ ] 68-06-PLAN.md - Wave 3 debtor-email-coordinator swap: single-shot V2 dispatch -> loadHandlerEvent
- [ ] 68-07-PLAN.md - Wave 4 SWRM-03 sales-email-stub integration test (zero-code-edit onboarding proof)
- [ ] 68-08-PLAN.md - Wave 5 static audit + docs update (stage-3-coordinator.md, debtor-email-pipeline-architecture.md)
- [ ] 68-09-PLAN.md - Wave 5 full-suite + Phase 67 live smoke regression (operator-gated)

### Phase 69: Handler-agent canonicalisation (cross-swarm reuse)
**Goal**: Existing handler agents accept a canonical context shape with data-driven brand list, so they work across debtor-email, sales-email, and future UK/IE brands without prompt edits
**Depends on**: Phase 68 (registry must carry the canonical context shape and brand list)
**Requirements**: CANO-01, CANO-02, CANO-03, CANO-04
**Success Criteria** (what must be TRUE):
  1. `debtor-copy-document-body-agent` accepts the canonical context shape; its entity_register block is parameterised and passes regression tests on debtor + sales fixtures
  2. The brand list driving handler prompts is read from `swarms.entity_brand` registry rows, not hardcoded enums in agent prompts
  3. Cross-cutting handler agents are declared `swarm_type='cross-cutting'` in `public.orq_agents`; per-swarm specialisation only exists where genuinely required
  4. Onboarding a new entity_brand row produces correct handler output without any agent prompt change (UK/IE backlog scenario validated on fixtures)
**Plans**: 7 plans
- [ ] 69-01-PLAN.md — Wave 0 scaffolding (migrations, brand-register module, codegen script, test scaffolds)
- [ ] 69-02-PLAN.md — Wave 1 Supabase MCP migration apply (operator-gated, A1 iccafe disposition)
- [ ] 69-03-PLAN.md — Wave 2 codegen run + coordinator/types.ts re-export + registry.ts extension
- [ ] 69-04-PLAN.md — Wave 3 classifier-invoice-copy-handler refactor to brand_register input shape
- [ ] 69-05-PLAN.md — Wave 4 Orq.ai prompt PATCH via MCP (operator-gated; baseline + verify)
- [ ] 69-06-PLAN.md — Wave 5 regression fixtures (5 debtor + 3 sales + 1 UK) + LIVE_SMOKE=1 live Orq smoke
- [ ] 69-07-PLAN.md — Wave 6 docs (stage-4-handler.md, debtor-email-pipeline-architecture.md) + REQUIREMENTS.md CANO-* check-off

### Phase 70: Telemetry consolidation (pipeline_events)
**Goal**: Every stage decision flows into a single canonical `pipeline_events` table that becomes the source of truth for Bulk Review and the promotion recommender, while existing tables stay alive as denormalised read-models
**Depends on**: Phase 66 (single canonical flow is the only thing emitting events), Phase 68 (registry shape stable so swarm_type column is meaningful)
**Requirements**: TELE-01, TELE-02, TELE-03
**Success Criteria** (what must be TRUE):
  1. Every stage decision is recorded in `pipeline_events` with `swarm_type`, `stage`, `decision`, `confidence`, `override?`, `eval_type`
  2. Existing tables (`classifier_rules`, `agent_runs`, `email_labels`, `automation_runs`) continue to populate without consumer breakage
  3. Bulk Review and the promotion recommender both read from `pipeline_events` instead of joining 3+ legacy tables
**Plans**: 7 plans
- [ ] 70-01-PLAN.md — Wave 0 vitest scaffolds for the two test gaps (emit.test.ts, ingest route.test.ts)
- [ ] 70-02-PLAN.md — Wave 1 migration 20260506a + emit.ts + types.ts + helper test (BLOCKING checkpoint: operator applies migration via Supabase MCP)
- [ ] 70-03-PLAN.md — Wave 2 Stage 0 safety + Stage 2 label-resolver dual-write inside step.run
- [ ] 70-04-PLAN.md — Wave 2 Stage 3 coordinator + Stage 4 invoice-copy handler dual-write inside step.run (3 Stage 4 paths)
- [ ] 70-05-PLAN.md — Wave 3 Stage 1 ingest-route emit (D-09 carve-out documented) + route.test.ts
- [ ] 70-06-PLAN.md — Wave 4 Bulk Review loadPageData rewire (3 of 8 sub-queries; atomic per D-16)
- [ ] 70-07-PLAN.md — Wave 5 docs/agentic-pipeline/promotion-recommender.md stub + REQUIREMENTS.md TELE-* check-off

### Phase 71: Bulk Review 4-axis redesign + capability/regression eval split
**Goal**: Operators can override at any of the 4 stages independently, with each override producing a distinct learning signal tagged as either a new capability or a regression
**Depends on**: Phase 70 (UI consumes `pipeline_events` rather than fragile multi-table joins)
**Requirements**: REVW-01, REVW-02, REVW-03, REVW-04, REVW-05, REVW-06
**Success Criteria** (what must be TRUE):
  1. Operator can override at Stage 1 (wrong category) and the email re-routes to noise/archive/different category with the original verdict preserved as audit
  2. Operator can override at Stage 2 (wrong customer) - corrects `customer_account_id` and optionally re-runs Stage 3+4
  3. Operator can override at Stage 3 (wrong intent) and the email re-emits to a different handler-agent
  4. Operator can override at Stage 4 (wrong handler output) and the override records `draft_quality` plus reason for handler prompt tuning
  5. Every override is tagged `eval_type ∈ {capability, regression}` so model swaps can be measured against a stable regression set
  6. Each email occupies one row aggregating all 4 stage decisions plus per-run cost and tool calls
**Plans**: 5 plans
- [x] 71-01-PLAN.md — Wave 0 foundation: per-email view migration, OverrideAxis types, shadcn Switch+RadioGroup vendor, brand-color helper, override-event fixtures, Stage-2 customer-search source spike
- [x] 71-02-PLAN.md — Override write path: POST /api/automations/debtor-email/override + debtor-email-override-handler Inngest fan-out (REVW-01..05)
- [x] 71-03-PLAN.md — Read-side rewire: loadPageData → pipeline_events_email_summary view + view shape tests (REVW-06)
- [x] 71-04-PLAN.md — UI components: 11 NEW components (RecipientChipStrip, PredictedRow, PipelineFlow, StageStep, 4 stage widgets, EvalTypeRadio, OverrideConfirmDialog, IControllerInfoBanner)
- [x] 71-05-PLAN.md — UI integration + keyboard shortcuts + manual smoke (8 overrides on acceptance)
**UI hint**: yes

### Phase 72: Promotion recommender + Learning Inbox
**Goal**: High-volume LLM-handled patterns surface as actionable promotion recommendations (regex / sender mapping / prompt tune) that the operator can approve into deterministic rules with full audit trail and rollback
**Depends on**: Phase 70 (recommender consumes `pipeline_events`), Phase 71 (override signals exist with eval_type tagging)
**Requirements**: LERN-01, LERN-02, LERN-03, LERN-04, LERN-05
**Success Criteria** (what must be TRUE):
  1. `promotion_candidates` table contains rows aggregated from per-stage telemetry, each suggesting a concrete change (regex rule / sender mapping / prompt tune)
  2. An Inngest cron periodically refreshes candidates and never blocks the synchronous pipeline
  3. Operator sees a Learning Inbox UI listing each candidate with volume, expected cost savings, and the suggested change
  4. Operator approval of a candidate auto-creates the corresponding migration / PR / config change with full audit linking back to the LLM signals that produced it
  5. A promoted rule that later proves wrong can be rolled back to restore the original LLM-handled signal, with rollback events traceable in the audit trail
**Plans**: TBD
**UI hint**: yes

### Phase 73: Sales-email swarm (SugarCRM) - validation
**Goal**: A second swarm (sales-email backed by SugarCRM) ships via registry INSERTs alone, reusing the canonicalised body agent and registry-driven Bulk Review UI, proving the platform standard works for more than one domain
**Depends on**: Phase 68 (registry generalisation), Phase 69 (handler canonicalisation), Phase 70 (telemetry consolidation)
**Requirements**: SALES-01, SALES-02, SALES-03
**Success Criteria** (what must be TRUE):
  1. Sales-email is onboarded with one regex module + one Stage 2 SugarCRM resolver + one Stage 3 coordinator agent and zero new handler-agents
  2. Sales-email handles its own copy-invoice requests via the canonicalised cross-swarm body agent without prompt edits
  3. The sales-email Bulk Review surface emerges automatically from the registry-driven UI - no new React components required
**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
V3.0: 34 -> 35 -> 36 -> 37 -> 37.1 -> 38 -> 38.1
V4.0: 39 -> 40 -> 41 -> 42
V6.0: 44 -> 45 -> 46 -> 47
V7.0: 48 -> 49 -> 50 -> 51 -> 52 -> 53 -> 54
v8.0: 63 -> 64 -> 65 -> 66 -> 67 -> 68 -> 69 -> 70 -> 71 -> 72 -> 73

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 34. Foundation & Auth | V3.0 | 3/3 | Complete | 2026-03-20 |
| 35. Pipeline Engine | V3.0 | 4/4 | Complete | 2026-03-22 |
| 36. Dashboard & Graph | V3.0 | 4/4 | Complete | 2026-03-23 |
| 37. HITL Approval | V3.0 | 4/4 | Complete | 2026-03-23 |
| 37.1 Conversational Pipeline | V3.0 | 3/4 | In Progress | - |
| 38. Swarm Activation | V3.0 | 0/TBD | Not started | - |
| 38.1 Full Pipeline Lifecycle | V3.0 | 0/TBD | Not started | - |
| 39. Infrastructure & Credential Foundation | V4.0 | 3/3 | Complete | 2026-03-23 |
| 40. Detection, SOP Upload & Vision Analysis | V4.0 | 5/5 | Complete | 2026-03-23 |
| 41. Script Generation, Testing & MCP Deployment | V4.0 | 0/TBD | Not started | - |
| 42. Standalone Automations & Triggers | V4.0 | 0/TBD | Not started | - |
| 43. Upstream Sync | - | 0/3 | Not started | - |
| 44. Project Model & Data Collection | V6.0 | 3/3 | Complete | 2026-03-28 |
| 45. Executive Dashboard | V6.0 | 3/3 | Complete | 2026-03-30 |
| 46. Status Monitoring & O365 SSO | V6.0 | 0/TBD | Not started | - |
| 47. UI Redesign & Polish | V6.0 | 0/TBD | Not started | - |
| 48. Foundation | V7.0 | 2/3 | In Progress|  |
| 49. Navigation & Realtime | V7.0 | 0/TBD | Not started | - |
| 50. Data Pipeline | V7.0 | 0/TBD | Not started | - |
| 51. Hero Components | V7.0 | 0/TBD | Not started | - |
| 52. Live Interactivity | V7.0 | 0/TBD | Not started | - |
| 53. Advanced Observability | V7.0 | 0/TBD | Not started | - |
| 54. Polish | V7.0 | 1/1 | Code-complete | 2026-04-16 |
| 63. Architecture RFC | v8.0 | 0/TBD | Not started | - |
| 64. Stage 0 input safety + per-run budgets | v8.0 | 0/TBD | Not started | - |
| 65. Stage 3 ranked multi-intent coordinator | v8.0 | 0/TBD | Not started | - |
| 66. Pipeline consolidation (retire triage) | v8.0 | 0/TBD | Not started | - |
| 67. Stage 2 closure (iController DOM tagging) | v8.0 | 0/TBD | Not started | - |
| 68. swarm_registry generalisation | v8.0 | 0/TBD | Not started | - |
| 69. Handler-agent canonicalisation | v8.0 | 0/TBD | Not started | - |
| 70. Telemetry consolidation (pipeline_events) | v8.0 | 0/TBD | Not started | - |
| 71. Bulk Review 4-axis redesign | v8.0 | 0/TBD | Not started | - |
| 72. Promotion recommender + Learning Inbox | v8.0 | 0/TBD | Not started | - |
| 73. Sales-email swarm (SugarCRM) validation | v8.0 | 0/TBD | Not started | - |

## Progress Summary

| Version | Phase | Plans Complete | Status | Completed |
|---------|-------|----------------|--------|-----------|
| v0.3 | 1-05.2 (11 phases) | 28/28 | **Shipped** | 2026-03-01 |
| V2.0 | 6-11 (7 phases) | 11/11 | **Shipped** | 2026-03-02 |
| V2.1 | 26-33 (8 phases) | 9/9 | **Shipped** | 2026-03-13 |
| V3.0 | 34-38.1 (7 phases) | 14/TBD | **In Progress** | - |
| V4.0 | 39-42 (4 phases) | 8/TBD | **Partially Complete** | - |
| V5.0 | TBD | 0/TBD | **Defined** | - |
| V6.0 | 44-47 (4 phases) | 6/TBD | **Partially Complete** | - |
| V7.0 | 48-54 (7 phases) | 0/TBD | **Not started** | - |
| v8.0 | 63-73 (11 phases) | 0/TBD | **Defining** | - |

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

**Plans:** 4 plans

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
