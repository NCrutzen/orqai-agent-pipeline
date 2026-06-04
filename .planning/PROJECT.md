# MR Automations Toolkit (formerly Agent Workforce)

## What This Is

A platform for production AI-driven automations at Moyne Roberts. The current focus is the **canonical 5-stage email-handling pipeline** (Stage 0 input safety → Stage 1 noise filter → Stage 2 entity resolution → Stage 3 intent coordinator → Stage 4 handler), validated on debtor-email across 5 mailboxes and being extended to sales-email and future swarms via a registry-driven architecture.

The original "browser-UI agent-swarm builder" thesis (V3.0–V6.0) was paused 2026-03-25 in favour of shipping production automations against real Moyne Roberts processes (debtor-email recovery, sales-email triage, supplier onboarding, etc.). The Agent OS UI (v7.0) was kept and extended to surface these production pipelines.

## Core Value

Every recurring email-driven process at Moyne Roberts gets a swarm. New swarms onboard via registry INSERTs (Phase 68) without code changes. Operators give per-email feedback that the system distils into new rules and intents (V10.0 self-learning; re-sequenced 2026-06-02). Top-volume intents become handlers in priority order (V11.0).

The product is no longer "a colleague creates a swarm via a browser UI." The product is "a swarm exists for every business process that needs one, and it self-improves from operator feedback."

## Requirements

### Validated

Shipped in v0.3 (2026-03-01) — 50 requirements:

- Adaptive input handling (brief → detailed, pipeline depth adapts)
- Architect subagent with complexity gate (single-agent default)
- Domain research subagents (smart skip when input is detailed)
- Agent spec generation (all 18 Orq.ai fields, copy-paste ready)
- Orchestration spec (agent-as-tool, data flow, error handling, HITL)
- Dataset generation (test inputs, eval pairs, adversarial cases 30%+)
- Naming convention (`[domain]-[role]-agent` kebab-case)
- Directory output structure (`Agents/[swarm-name]/`)
- Claude Code skill distribution (install script, update command)
- GSD integration (standalone + within GSD phases)
- Discussion step (surfaces gray areas before architect)
- Tool resolver (unified tool catalog, MCP-first)
- Prompt strategy (XML-tagged, heuristic-first, context-engineered)
- KB-aware pipeline (discussion → researcher → spec generator)
- Modular install with capability tiers (core/deploy/test/full)

Shipped in V2.0 (2026-03-02) — 23 requirements:

- ✓ Autonomous agent deployment to Orq.ai via MCP/API (DEPLOY-01 through DEPLOY-08) — V2.0
- ✓ Automated testing pipeline with dataset upload, evaluator selection, 3x experiments (TEST-01 through TEST-05) — V2.0
- ✓ Prompt iteration loop with diagnosis, diff proposals, HITL approval, stopping conditions (ITER-01 through ITER-07) — V2.0
- ✓ Guardrails and hardening via evaluator promotion and quality gates (GUARD-01 through GUARD-03) — V2.0

Shipped in V2.1 (2026-03-13) — 24 requirements:

- ✓ Dataset-preparer subagent with MCP/REST upload, smoke test, stratified splits (DATA-01 through DATA-05) — V2.1
- ✓ Experiment-runner subagent with REST-only execution, adaptive polling, holdout mode (EXPR-01 through EXPR-06) — V2.1
- ✓ Results-analyzer subagent with triple-run statistics, category slicing, hardener compat (ANLZ-01 through ANLZ-05) — V2.1
- ✓ Rewritten test.md orchestrating 3 subagents with validation gates (TEST-01 through TEST-03) — V2.1
- ✓ Failure-diagnoser + prompt-editor for section-level diagnosis and HITL-approved iteration (ITPIPE-01 through ITPIPE-06) — V2.1
- ✓ Rewritten iterate.md with 2-subagent loop and 5 stop conditions (LOOP-01 through LOOP-03) — V2.1

### Abandoned (2026-03-25 pivot)

The browser-UI agent-swarm-builder thesis was paused when the team pivoted to shipping production automations directly. Phases and partial deliverables retained for traceability.

- **V3.0 Web UI & Dashboard** — abandoned at ~91% planning (phases 34–38 never executed; no production deployment)
- **V4.0 Browser Automation Builder** — abandoned at phases 39–40; SOP+screenshot+Playwright vision was never built; Browserless.io is still used directly by individual automations
- **V5.0 Cross-Swarm Intelligence** — never started
- **V6.0 Executive Dashboard** — phases 44–45 partially shipped (project model + KPI cards); phases 46–47 abandoned

The pieces of V3/V4/V6 that survived the pivot were absorbed into V7.0 (Agent OS UI) and v8.0 (pipeline-on-real-data).

### Shipped under the pivot

**V7.0 Agent OS** (shipped 2026-04-30 — phases 48-54):
- [x] O365 SSO via Azure AD for frictionless executive access
- [x] Full visual redesign with new design system (Satoshi + Cabinet Grotesk, glassmorphism, dark/light)
- [x] Sidebar with swarm navigation (Debtor Email, Sales Email, + generic template)
- [x] AI narrative briefing per swarm (dedicated Orq.ai Briefing Agent)
- [x] Live delegation graph with animated orchestrator → sub-agent paths
- [x] Subagent fleet cards with recursive detail drawer
- [x] Kanban execution board for business-stage job tracking
- [x] Gantt-style observability swimlanes (per-agent timeline)
- [x] Claude-style terminal event stream (Supabase Realtime)
- [x] Data integration: Supabase + Orq.ai API (traces, tool calls, agent metrics)

**v8.0 Agentic Platform** (shipped 2026-05-20 — 31 phases, 49/49 in-scope requirements, 7/7 flows verified — see `milestones/v8.0-ROADMAP.md`):
- [x] Architecture RFC (Phase 63) — canonical 5-stage funnel locked
- [x] Stage 0 input safety / prompt-injection guard (Phase 64)
- [x] Per-run token & cost budgets + tool-call allowlists per intent (Phase 64)
- [x] Stage 3 ranked multi-intent coordinator + Stage 3.5 escalation (Phase 65)
- [x] Pipeline consolidation — legacy triage path retired (Phase 66)
- [x] Stage 2 closure: iController DOM tagging (Phase 67)
- [x] Bulk Review 4-axis override redesign (Phase 71) + unified stage-keyed shell (Phase 82)
- [x] `public.swarms` registry generalisation + canonical context-shape (Phase 68)
- [x] Cross-swarm handler-agent canonicalisation (Phase 69)
- [x] Single canonical `pipeline_events` table (Phase 70) — *coverage gap, see Phase 82.2*
- [x] Stage 1 LLM Category Classifier — swarm-agnostic (Phase 74)
- [x] **Sales-email Stage 0/1 canary**: 181 emails ingested (30d), 91% Stage 0 reach, Stage 1 LLM classifying — corpus accruing for V9.0 rule + intent design (re-sequenced 2026-06-02). (Was Half B of original v8.0 charter; satisfied incidentally by Phase 74 rollout.)
- [x] **Phase 82.2** — Stage 0 telemetry coverage fix (debtor mailboxes ≥99%)
- [x] **Phase 82.3** — Per-stage audit surface (click-through popup with verdict + evidence + screenshots)
- [x] **Phase 82.4** — Feedback capture infrastructure (`email_feedback` table + Stage 2/3 forms + history view)
- [x] **Phase 82.9** — Stage 2 audit-panel evidence expansion (resolver inputs + LLM tiebreaker reasoning)
- [x] **Phase 83** — Body ingestion fix (1344 priors backfilled; Stage 1+3 read full thread)
- [x] **Phase 089** — Stage 1 LLM 2nd-pass auto-action promotion track (839 rows backfilled)
- [→] Promotion recommender + Learning Inbox **synthesis layer** — **moved to V10.0** (re-sequenced 2026-06-02; T2 draft-proposer on top of 82.4 capture + reply-tracing)
- [→] Sales-email full operator onboarding — **moved to V9.0, Outlook-driven** (re-sequenced 2026-06-02; SugarCRM deprecated — Stage 2 reuses the v8.2 NXT resolver by config, Stage 3 sales intent agent, multi-operator handling)

### Active

**Two parallel tracks** (re-sequenced 2026-06-02 — see `docs/collaboration.md` for the per-workspace single-writer model):

**V9.0 Sales-email canonical pipeline — Outlook-driven** _(THIS workspace `workspace/sales-agent-swarm`; phases 110+)_ — `verkoop@smeba.nl` runs the full 5-stage funnel end-to-end, driven from Outlook (SugarCRM deprecated). Registry-INSERT swarm; Stage 2 reuses the v8.2 NXT resolver by config; sales-specific Stage 3 intent agent; per-swarm feedback as a second operator stream. Requirements: `INGEST-*`, `SWARM-*`, `STAGE1-*`, `STAGE2-*`, `STAGE3-*`, `FEEDBACK-*` (see `REQUIREMENTS.md`). Charter: `MILESTONES.md` V9.0.

**v8.2 Stage 2 Resolution Recall** _(parallel debtor track, separate workspace; phases 90–95)_ — SQL-native NXT resolver substrate (`RESL-01…15`); gated on debiteuren-afdeling validation. V9.0's Stage 2 reuse depends on its `RESL-01/02/03` seam (cross-track — interleave, don't block). Charter: `MILESTONES.md` v8.2.

**v8.1 "Validation + Visibility" SHIPPED 2026-06-01** — body ingestion, Stage-1 noise rules (shadow), Stage-3 prompt v3 + open-set discovery surface, retro baseline. Archive: `milestones/v8.1-ROADMAP.md`.

### Defined (not yet active)

**Roadmap re-sequenced 2026-06-02 (operator):** the debtor track (v8.2) and sales track (V9.0) now run in **parallel** instead of serially. Sales-email and the self-learning milestone swapped slots (V9.0 ↔ V10.0) because the debiteuren-afdeling is slow to validate Stage-2 matching, and **SugarCRM is being deprecated** — sales moves to Outlook and can ship fast without waiting on debtor validation or the self-learning layer. See MILESTONES.md V9.0/V10.0 re-sequencing notes.

**v8.2 Stage 2 Resolution Recall** _(debtor track — runs parallel with V9.0)_ — generic, cross-swarm entity-resolution substrate (Index + Engine + Source Adapters), registry-configured per swarm. Lifts Stage 2 recall (~65% unresolved → ~35%): ~17% high-precision auto-resolve + ~56% ranked suggestions (HITL). Debtor-email first consumer; **sales-email (now V9.0) reuses the same NXT Engine by per-swarm config** — no SugarCRM adapter. Gated on operator (debiteuren-afdeling) validation of the matching. Validated via spike 005–010b (`.planning/spikes/010-comprehensive-backtest/DESIGN-GUIDE.md`). See MILESTONES.md for the full RESL-xx requirements + P0–P5 phases.

**V9.0 Sales-email canonical pipeline — Outlook-driven** _(was V10.0; re-sequenced 2026-06-02)_ — `verkoop@smeba.nl` runs the same 5-stage funnel as debtor-email end-to-end, **driven from Outlook** (SugarCRM deprecated; `sales-email-analyzer/` retired). **Stage 2 reuses the v8.2 NXT resolver by config** (no Sugar lookup); sales-email-specific Stage 3 intent agent; Phase 78 actually executed. Runs in parallel with v8.2; no longer depends on the self-learning milestone. Multi-operator capture scaffolded here (reconciled in V10.0).

**V10.0 Promotion Recommender + Learning Inbox + reply-tracing** _(was V9.0; re-sequenced 2026-06-02)_ — prose-feedback synthesis across **two** operator streams (debtor + V9.0 sales). Stage 2 sparse corrections (Stream A) + Stage 3 row-by-row intent review (Stream B) + **reply-tracing** (outbound Outlook replies linked to the inbound `pipeline_event` = no-form ground-truth signal). T2 draft-proposer tier: LLM clusters feedback, drafts concrete system changes, operator one-click approves. New intents apply immediately. Multi-operator vocabulary-reconciliation folds in here. Wilson-CI noise-rule promotion (existing) coexists, not absorbed. Depends on V9.0 sales live + v8.2.

**V11.0 Intent-prioritised handlers** — top-N most-frequent uncovered Stage 3 intents become first-class Stage 4 handlers per milestone. Reads the two swarms' intent-volume signal (V9.0 sales + debtor) + V10.0's promoted intent definitions. Coverage dashboard + handler-scaffolding template + dispatch via `swarm_intents`.

### Out of Scope

- Orq.ai Deployments — output targets Agents API (`/v2/agents`), not the simpler Deployments pattern
- Real-time agent monitoring/observability — Orq.ai handles this natively
- CLI skill management -- lives in orqai-agent-pipeline repo
- Dynamic/exploratory browser-use — already handled by existing Orq.ai MCP tools

## Current Milestone: v8.2 Stage 2 Resolution Recall (debtor track) ∥ V9.0 Sales-email Outlook (sales track) — two parallel tracks, re-sequenced 2026-06-02

**V9.0 Sales-email is now ACTIVE in this workspace** (`workspace/sales-agent-swarm`) — formalized into `REQUIREMENTS.md` + a phase roadmap on **2026-06-02**. Phase numbering starts at **110** (banded above v8.2's 90–95) to avoid cross-workspace collision. The **v8.2 debtor track runs in parallel in its own workspace**. `.planning/STATE.md` / `ROADMAP.md` are single-writer per workspace and reconciled at PR merge (see `docs/collaboration.md`; the per-workstream STATE restructure is tracked as `SEED-002` — its parallel-workspace trigger is now met).

**v8.1 "Validation + Visibility" SHIPPED 2026-06-01** — 8 phases (83–88.2); audit `passed`; all 4 operator-UAT items dispositioned (85 signed · 88 fixed · 86 accepted on live cron · 84 D-05 promotion gate evaluated → 0/16 eligible, telemetry N=0). Delivered body ingestion, Stage-1 noise rules (shadow), Stage-3 prompt v3 + open-set discovery surface, and the retro baseline that *refuted SC-1 usefully* (catch-all is upstream Stage-1 noise, not Stage-3) → directly scoped v8.2. Archive: `milestones/v8.1-ROADMAP.md`. **v8.2 next:** lift Stage-2 customer-resolution recall (~65% unresolved) via a SQL-native resolver in `zapier.dbo` over `nxt`; pre-build validation complete (`spikes/010-comprehensive-backtest/VALIDATION-FINDINGS-v8.2.md` — write-path confirmed, go/no-go P0–P5, auto-flip gated on a full-population dry-run).

**v8.0 closed 2026-05-20** — 31 in-scope phases, 49/49 in-scope requirements satisfied, 7/7 cross-phase flows verified. Operator UAT PASS via Phase 999.8 + 82.9 sign-off. Debtor-person onboarded 2026-05-18 with Bulk Review + audit panels + feedback capture live. Sales-email Stage 0+1 producing live traces. Archive: `milestones/v8.0-ROADMAP.md`.

**v8.1 anchor:** intent vocabulary emerges from the LLM's proposals + operator promotion during dry-run, never from hand-curation (locked 2026-05-19). Phase 86 builds the discovery surface; V9.0 builds the promotion side. Calendar gated on Phase 87's retro-classification baseline before V8.2 handler work begins.

**Pipeline architectural decisions (locked):**
- Workflow-first per Anthropic guidance; agents (autonomous loops) only where decomposition is genuinely required
- Stage 2 labeling is enriching, NOT blocking — coordinator handles customer-less emails downstream
- 4-axis override model — each stage gets its own override type for independent learning signals
- Brand-multitenant from day 1 (Smeba, Berki, Sicli-Noord/Sud, Smeba-Fire today; UK/IE coming, no hardcoded enums)
- Single canonical `pipeline_events` table — sole source of per-stage decision history

**Previous milestones:** V7.0 Agent OS shipped 2026-04-30. V2.1 / V2.0 / v0.3 (orq-agent-pipeline CLI tooling) shipped earlier. V3.0/V4.0/V6.0 abandoned per 2026-03-25 pivot.

## Context

- **Platform:** Orq.ai — agent orchestration (model routing, prompt versioning, evals); LLM calls via the Orq.ai Router, not direct provider SDKs
- **Stack:** Next.js on Vercel · Supabase (Postgres + Realtime + auth) · Inngest (durable functions) · Zapier (NXT SQL bridge + Outlook ingest; **SugarCRM trigger deprecated 2026-06-02**) · Browserless.io (no-API systems) · ElevenLabs (voice) · Twilio (telephony). Full guidance in `CLAUDE.md`.
- **Mailboxes in scope:** debtor-email on 5 mailboxes (debiteuren@smeba.nl, debiteuren@berki.nl, debiteuren@smeba-fire.be, administratie@fire-control.nl, sicli) ; sales-email at verkoop@smeba.nl (Outlook-driven from V9.0; SugarCRM deprecated)
- **Operator model:** single debtor-person from week of 2026-05-18; sales-email operator added in V9.0 (Outlook). Multi-operator reconciliation lands in V10.0 self-learning. (Re-sequenced 2026-06-02.)
- **Users:** 5–15 Moyne Roberts employees, mostly non-technical. The product is the *automations themselves*, not a swarm-builder UI.

## Constraints

- **Platform:** Must target Orq.ai Agents API — all output specs must be valid for `/v2/agents` endpoint and/or Orq.ai Studio manual setup
- **Auth:** Email/password auth primary. M365 SSO as additional provider when Azure AD tenant setup is complete.
- **Hosting:** Vercel for frontend/API, Supabase for data/auth/realtime — no self-hosted infrastructure
- **Updates:** Pipeline logic must auto-deploy from GitHub repo — no manual deployment steps
- **Users:** Non-technical colleagues must complete the full pipeline without developer assistance

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Target Orq.ai Agents, not Deployments | Agents support orchestration, persistent state, tool execution loops, and A2A Protocol | ✓ Good |
| Kebab-case naming convention | Matches Orq.ai's own deployment key patterns | ✓ Good |
| Directory-per-swarm output structure | Groups related agents with orchestration and datasets | ✓ Good |
| Claude Code skill distribution via GitHub | Moved to orqai-agent-pipeline repo | ✓ Good |
| Smart subagent spawning based on input detail | Avoids unnecessary research, reduces token cost | ✓ Good |
| MCP-first with API fallback | MCP covers agents/datasets/evaluators; REST covers tools/prompts/memory | ✓ Good — validated in V2.0 |
| Modular capability tiers | Users control automation; core tier preserves V1.0 behavior | ✓ Good |
| XML-tagged prompt strategy | Anthropic context engineering patterns produce consistent output | ✓ Good |
| Subagents as .md instruction files | LLM reasoning handles diagnosis/proposals — no custom code needed | ✓ Good — validated at scale in V2.1 (5 new subagents) |
| Per-agent `--agent` flag (not positional args) | Consistent convention across all 4 commands, documented in SKILL.md | ✓ Good |
| Native `settings.guardrails` API for guardrail attachment | Direct Orq.ai integration, no application-layer workarounds | ✓ Good |
| Holdout dataset for re-test | Clean isolation between training and iteration testing | ✓ Good |
| HITL approval before any prompt change | Non-technical users maintain trust and control | ✓ Good |
| Next.js + Supabase + Vercel + Inngest | Validated production stack across debtor-email + sales-email; durable Inngest workflows underpin the 5-stage funnel | ✓ Good |
| 5-stage funnel as canonical architecture | One shape covers every email-driven swarm; new swarms onboard via registry INSERTs (Phase 68) | ✓ Good — proven across debtor mailboxes |
| Registry-driven swarm config | `swarms` + `swarm_intents` + `swarm_noise_categories` tables replace hardcoded enums; cross-swarm handler reuse | ✓ Good — Phase 68/69 |
| `pipeline_events` as single per-stage source of truth | Replaces parallel tables for stage decision history; backs Bulk Review and the upcoming Learning Inbox | ✓ Good — Phase 70 (coverage fix in 82.2) |
| Stage 2 enriching, not blocking | Customer-less emails still reach Stage 3; Stage 2 adds context when available | ✓ Good |
| 4-axis Bulk Review overrides | Each stage gets independent override signal; feeds V10.0 self-learning synthesis (re-sequenced 2026-06-02) | ✓ Good — Phase 71 |
| Pivot away from browser-UI swarm-builder (2026-03-25) | Building automations directly delivers value faster than building the meta-tool to build them | ✓ Good — validated by debtor-email production wins |

**Abandoned decisions (V3/V4/V5/V6):** node graph swarm builder, AI-vision screenshot annotation, Playwright auto-generation as pipeline stage, cross-swarm intelligence layer. Retained in `MILESTONES.md` history for traceability.

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-06-04 — Phase 114 complete (STAGE2-01/02 validated): sales Stage 2 reuses the v8.2 NXT resolver via per-swarm config, zero Engine changes, dry-run gated; gap-closure 114-06/07 verified passed. Next: Phase 113 (Stage 3 sales intent agent). Prior: 2026-06-02 V9.0 milestone start.*
