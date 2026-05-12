---
title: v8.0 pipeline status & V9/V10/V11 framing
date: 2026-05-12
type: session-note
related_phases: [55, 56, 58, 74, 82.2, 82.4, 999.8]
related_milestones: [v8.0, V9.0, V10.0, V11.0]
---

# v8.0 Pipeline Status & Next-Milestone Framing — 2026-05-12

Session-output snapshot capturing the diagnostic findings, architectural decisions, and milestone-framing conversation from 2026-05-12. Pinning these here because the conversation surfaced a lot of "ground truth vs. planning artifact" gaps that will be needed when v8.0 audits and V9.0 planning kick off.

## Headline state

- v8.0 (Agentic Platform) **shipped substantively** but two telemetry/capture gaps block honest closure: Phase 82.2 (Stage 0 coverage) and Phase 82.4 (feedback capture for the incoming debtor-person operator).
- The original v8.0 charter had a "Half B" promise — *"prove the platform by onboarding a second swarm (sales-email/SugarCRM) in under a day"* — that was **partially met by accident**: sales-email Stages 0+1 are live and accumulating a usable corpus, but Stages 2+3 were never built. We deliberately deferred the "full sales-email" half to V10.0 instead of forcing it into v8.0 stabilisation.
- The Promotion Recommender + Learning Inbox originally scoped as v8.0 Phase 72 has been reframed entirely: the new V9.0 is **prose-feedback → LLM synthesis → draft proposals**, not the original telemetry-driven Wilson-CI extension.

## Production telemetry findings (queried 2026-05-12)

### Stage 0 telemetry coverage gap

`pipeline_events.stage=0` reach per mailbox over the last 7 days:

| Mailbox | Inbound | Reached Stage 0 | % |
|---|---|---|---|
| verkoop@smeba.nl (sales) | 174 | 159 | **91%** |
| debiteuren@smeba.nl | 96 | 25 | **26%** |
| debiteuren@berki.nl | 66 | 30 | 45% |
| debiteuren@smeba-fire.be | 61 | 21 | 34% |
| administratie@fire-control.nl | 59 | 25 | 42% |

- **219 emails over 7 days reached Stage 1 with no Stage 0 row.** Stage 0 only ever writes `decision='safe'` (159 sales + 133 debtor); the `suspected` branch has zero rows in 7 days — either it never fires or it doesn't emit telemetry.
- Likely root cause: `stage-0-safety-worker.ts` has three emit branches (operator override L87, budget breach L169, main path L255). The debtor-email `/ingest` pre-creates an `automation_runs` row with `stage='stage_0_safety_pending'` (Phase 64 pattern). The worker likely takes an UPDATE-existing branch and skips the `emitPipelineEvent` call that the INSERT-fresh branch makes. Sales-email's `/ingest` does its own double-emit per the inline warning, which is why sales-email is 91%.
- This is a telemetry bug, not a safety-logic bug. No operational incidents. **But it blocks V9.0's per-email-trace Bulk Review surface.**
- Fix scope: Phase 82.2 (stubbed). Includes backfilling ≤30d historical Stage 0 rows from `automation_runs` where possible; rows where source data is unavailable get `decision='unknown_legacy'`.

### Sales-email canary already running

| Signal | Value |
|---|---|
| Inbound to verkoop@smeba.nl (30d) | 181 |
| With full body text | 162 (89%) |
| Stage 1 LLM verdicts (14d) | 153 `unknown` + 10 `ooo_temporary` + 2 `auto_reply` |
| Date range | 2026-04-15 → 2026-05-12 |

- The "canary" Half B of v8.0's charter (*prove cross-swarm onboarding*) was met incidentally by the Phase 74 rollout: sales-email runs through Stages 0+1 of the canonical pipeline, even though no one explicitly executed Phase 78.
- The 92% `unknown` Stage 1 rate is the **correct outcome** for sales-email today — `stage1_regex_module=null` in the swarms registry (per `20260506_phase74_sales_email_seed.sql`), so the LLM-only Stage 1 leaves real sales emails uncategorised because there are no sales-specific noise rules yet. The corpus is exactly what V10.0 needs for regex+intent design.
- Stage 2 (Sugar resolver) and Stage 3 (sales intent agent) have zero events — correct, that's V10.0 scope.

### Volume reality for the operator workload

| Stage | Daily volume (debtor-email aggregate) |
|---|---|
| Inbound | 70–125 emails/day |
| Reach Stage 1 (always = inbound) | 70–125 |
| Reach Stage 2 (after noise filter) | ~25 |
| Reach Stage 3 | ~25 |

- The debtor-person's prose-feedback workload is bounded by Stage 3 volume (~25 rows/day), **not** inbound. At 15s structured-confirm median = ~6 minutes/day in steady state.
- Stage 2 prose corrections are sparse (only when wrong) — estimated 1–5/day in week 1, declining.
- Initial operator estimate of "30–50/day" matched Stage 3 volume, not total inbound — clarified during the session.

## Locked architectural decisions (this session)

| Decision | Why |
|---|---|
| **V9.0 synthesis tier = T2 (draft-proposer)** | T1 (digest-only) too passive for operator effort; T3 (auto-apply) is the "agent that builds agents" recursion that doesn't survive production scale |
| **V9.0 operator scope = single (debtor-person)** | Multi-operator vocabulary reconciliation deferred to V10.0 where it actually matters |
| **V9.0 prose scope = Stages 2 + 3 only** | Stages 0/1 already covered by Bulk Review 4-axis overrides (Phase 71). Adding prose at S0/S1 = 250 events/day with most carrying zero new information. Capping at S2+S3 = ~50 events/day, of which ~15 have prose. |
| **Form shape = structured-first, prose-optional** | Confirms LLM verdict in 5 seconds when correct; only types prose on override or new-intent proposal |
| **Immediate-apply on new intents** | Operator UX needs visible effect; new label enters the Stage 3 LLM intent list for the next inbound email. Guardrail: fuzzy-match against existing intents at form submit time. |
| **Wilson-CI noise-rule promotion stays parallel, not absorbed** | `labeling-flip-cron` works; refactoring it just for architectural purity = rework with no value. Revisit after 3 months of V9.0 data. |
| **Capture/synthesis split** | Capture (`email_feedback` table + form) ships in v8.0 as Phase 82.4 so operator has a channel from day 1. Synthesis (clusterer + drafter + Learning Inbox) ships in V9.0 on top of pre-existing captured data. Clean dependency boundary. |

## Phase status sweep findings

Earlier in this session we triaged five phases that had plan/summary mismatches distorting `gsd-progress` routing:

| Phase | Original scope | What we found | Resolution |
|---|---|---|---|
| **55** debtor-email pipeline hardening | 4 bundles (multi-mailbox, draft idempotency, review-lane, agent_runs) | Plans 01/02/05 delivered under other migrations (`20260428_public_agent_runs.sql`, multi-mailbox resolver, swarm_type writes). Plans 03/04 obsoleted by Phase 63 RFC + Phase 71 Bulk Review. | `55-CLOSURE.md` (superseded) + per-plan stub SUMMARYs |
| **56** iController auto-labeling | 9 plans across 4 waves | All 8 production-code plans shipped (`labeling-flip-cron`, `llm-tiebreaker`, `resolve-debtor`, 6 migrations). Only 56-00 had a SUMMARY; rest were doc-lag. | `56-CLOSURE.md` + per-plan stub SUMMARYs |
| **58** cron cost optimization | 1 plan: business-hours window | Confirmed in source — `TZ=Europe/Amsterdam */N 6-19 * * 1-5` in all 4 target files. Pattern now project-wide CLAUDE.md convention. | Stub SUMMARY |
| **74** Stage-1 LLM classifier | 5 plans, 1 missing SUMMARY | Phase already closed (`5b46175`). Plan 03's `20260506_phase74_stage1_classifier_agent_activate.sql` shipped. | Stub SUMMARY |
| **999.8** Stage-1 LLM 2nd-pass + predictor attribution | 8 plans, all with SUMMARYs | `VERIFICATION.md` says `status: human_needed`, 4/4 must-haves green, 2 browser smokes pending. | Outstanding — operator UAT |

**Key learning:** the gap between *roadmap doc state* and *production code state* is significant for milestones with many in-flight phases. Phase 55 was a clean case of "scope drift" (RFC mid-milestone rerouted half the plans through different phases). Phase 56 was pure documentation lag. Both produced the same symptom — `gsd-progress` routing to "current phase = 55/56" — but had different root causes.

## v8.0 closure punch list (locked 2026-05-12)

| Item | Status |
|---|---|
| Phase 82.2 — Stage 0 telemetry coverage fix | Stubbed; needs `/gsd-discuss-phase 82.2` |
| Phase 82.4 — Feedback capture infrastructure | Stubbed; needs `/gsd-discuss-phase 82.4` |
| Phase 999.8 — 2 outstanding browser smokes | Operator UAT pending |
| `/gsd-audit-milestone v8.0` | Run AFTER 82.2 + 82.4 + 999.8 ship — formal closure audit |

Once all four land, v8.0 closes formally and V9.0 opens with a clean scope.

## V9/V10/V11 framing locked

| Milestone | Scope | Depends on |
|---|---|---|
| **V9.0** Promotion Recommender + Learning Inbox | Pure synthesis: LLM clusters captured `email_feedback`, drafts proposals (new resolver step / new intent / new noise rule), Learning Inbox tab on Bulk Review for one-click apply. Single-operator scope (debtor-person). | v8.0 closure (82.2 + 82.4); held-out clusterer eval dataset |
| **V10.0** Sales-email canonical pipeline | New Sugar Stage 2 resolver + sales-email Stage 3 intent agent + Phase 78 actually executed + multi-operator handling (forces `operator_id` everywhere, vocabulary reconciliation in synthesis). Second customer of V9.0's feedback infrastructure. | V9.0 capture surface live; sales-email operator availability |
| **V11.0** Intent-prioritised handlers | Coverage dashboard ranking uncovered Stage 3 intents by volume × business value; handler-scaffolding template; dispatch via `swarm_intents`. Top-N intents per milestone become first-class Stage 4 handlers. | V10.0 producing multi-swarm intent-volume signal |

## Project-level hygiene done this session

- `PROJECT.md` rewritten — headline now reflects 2026-03-25 pivot to MR Automations Toolkit. V3.0/V4.0/V5.0/V6.0 marked **abandoned** with rationale (browser-UI swarm-builder thesis deprecated; production automations win).
- `MILESTONES.md` — V9.0/V10.0/V11.0 charter blocks prepended with locked decisions + success criteria + dependency chain + V9.0 risk register.
- Commits this session: `fcb6d33` (Phase 55 closure), `096430a` (Phase 55 stubs), `e4786b2` (Phase 56/58/74 sweep), `fab2735` (v8.0 closure prep), `aa67877` (fire-control debug close-out), `8649670` (Phase 82.4 + canary-already-met).

## Operational follow-ups (not gated on milestone close)

- The `fire-control-graph-405` debug session resolved 2026-05-11 — root cause was per-mailbox FullAccess delegation missing on `administratie@fire-control.nl` for the `zapier@moyneroberts.com` connection. Operator action only, no code change. Debug doc moved to `.planning/debug/resolved/`. Three operational scripts kept under `web/scripts/` as reference for future M365 delegation incidents.
- `STATE.md` still references "Phase --phase (82.1)" as current — minor; `/gsd-progress` now correctly identifies state via `roadmap.analyze` after the SUMMARY backfill.

## Where to look next

- **Before Monday 2026-05-18:** `/gsd-discuss-phase 82.2` and `/gsd-discuss-phase 82.4` to surface gray areas, then plan + execute both in parallel (no file conflicts between them).
- **After both ship:** `/gsd-audit-milestone v8.0` for formal closure.
- **Then:** V9.0 kickoff with the captured `email_feedback` corpus as the design substrate for the clusterer eval.

