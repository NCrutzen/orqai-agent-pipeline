---
gsd_state_version: 1.0
milestone: V9.0
milestone_name: Sales-Email Canonical Pipeline — Outlook-driven
status: executing
stopped_at: Completed 116-04-PLAN.md
last_updated: "2026-06-09T09:58:02.606Z"
last_activity: 2026-06-09
progress:
  total_phases: 10
  completed_phases: 7
  total_plans: 46
  completed_plans: 38
  percent: 70
---

# Project State

## Out-of-band capture (2026-06-04) — NXT direct REST access

Ad-hoc enabler gebouwd buiten de GSD-workflow (branch `feat/nxt-rest-proxy-mcp`, PR #63), retroactief vastgelegd in `.planning/quick/2026-06-04-nxt-rest-proxy-direct-api/`. **Workspace-gate override geflagd** (geen `/gsd-new-workspace`; infra/enabler-werk, niet milestone-gesequenced).

- **Wat:** generieke NXT REST passthrough-proxy (`/api/automations/nxt/proxy`) + `nxtRequest()` client + MCP-server (`tools/nxt-mcp/`) zodat skills/Stage-4 Handlers rechtstreeks tegen NXT `/api/*` praten zonder handmatig token-beheer.
- **Security:** env-gescheiden secrets (acc/prod), read-only prod (`allowWrite:true` voor niet-GET). Nieuwe Vercel secret `NXT_PROD_WEBHOOK_SECRET`.
- **Verifieerd live:** acc + prod read-only + 6/6 route-gating. NXT-credentials → `active`. Learning `9dfb23b5`.
- **Open:** PR #63 merge + prod-deploy nodig vóór collega de hosted endpoint gebruikt. Enabler voor V9.0 (sales) + debtor Stage-4 tracks.

## Roadmap Re-sequencing (2026-06-02, operator)

Future milestones re-slotted + split into **two parallel tracks** (full detail in `PROJECT.md`, `ROADMAP.md`, `MILESTONES.md` V9.0/V10.0 notes):

- **V9.0 ↔ V10.0 swapped.** **V9.0 = Sales-email canonical pipeline, Outlook-driven** (was V10.0). **V10.0 = Promotion Recommender + Learning Inbox + reply-tracing** (self-learning; was V9.0).
- **SugarCRM deprecated.** Sales-email moves from the SugarCRM "Emails" trigger to Outlook ingest (same path as debtor). `sales-email-analyzer/` + `fetch-sugarcrm-emails.ts` retired. Sales **Stage 2 reuses the v8.2 NXT resolver by per-swarm config** — no Sugar adapter.
- **Two parallel tracks:** debtor (v8.2 Stage-2 recall, gated on debiteuren-afdeling validation) ∥ sales (V9.0, independent, fast on Outlook). Both converge into V10.0 self-learning.
- **Reply-tracing (new in V10.0):** outbound Outlook replies linked to the inbound `pipeline_event` via `conversation_id` = no-form ground-truth feedback signal.
- **Why:** debiteuren-afdeling is slow to validate; don't block sales on it. Sales no longer depends on the self-learning milestone.
- Memory updated: `project_sales_email_source_sugarcrm.md` (Sugar→Outlook).

## Deferred Items

Acknowledged and deferred at **v8.1 milestone close (2026-06-01)** — 24 open artifacts surfaced by the pre-close audit, mostly project-wide parking-lot (none block the shipped v8.1 flows):

| Category | Item(s) | Status |
|----------|---------|--------|
| debug | injection-suspected-and-s3-drop · pipeline-side-effects-frozen | root_cause_found |
| debug | wka-intra-company-forward-leak | verified (closed) |
| verification | Phase 999.4 (backlog phase, not v8.1) | human_needed |
| quick_task | 11 items (orq-agent + housekeeping, Mar–May) | missing |
| todo | 5+ pending — incl. `granular-dry-run-gating` (→ v8.2), override+note flow, Stage-1 chip semantics | pending |
| seed | SEED-001 info-routing (→999.9) · SEED-002 per-workstream state | dormant |
| context_q | Phase 88 CONTEXT (3 questions — resolved via UAT) | resolved |

These remain as artifacts (not lost); revisit during v8.2 grooming or via `/gsd-check-todos`. Full audit: `milestones/v8.1-MILESTONE-AUDIT.md`.

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-12)

**Core value:** Production AI automations on Orq.ai serving Moyne Roberts operators — debtor-email today, sales-email and beyond after v8.0 closure. (V3.0/V4.0/V6.0 browser-UI swarm-builder thesis abandoned 2026-03-25.)
**Current focus:** Phase 113 — stage-3-sales-intent-agent-greenfield
**Previous milestones:** v0.3 (2026-03-01), V2.0 (2026-03-02), V2.1 (2026-03-13), V7.0 (2026-04-30). V3.0/V4.0/V5.0/V6.0 abandoned per 2026-03-25 pivot.

## Current Position

Phase: 113 (stage-3-sales-intent-agent-greenfield) — EXECUTING
Plan: 5 of 5 (113-05 code complete; CHECKPOINT-BLOCKED at Task 3 operator go-live)
Status: Awaiting operator go-live (apply 20260609c + dry-run review + flip sales stage_3_routing→false)

**Phase 112 outcome (zelfde dag):**
Phase: 112 (outlook-cleanup-backfill-gated-production-writes) — COMPLETE (go-live verified 2026-06-04)
Plan: 3 of 3
Status: Sales Stage-1 Outlook archive LIVE (`stage_1_archive=false`, migration `sales_stage1_archive_golive`); backfill complete (67 archived / 38 sugar-skip / ~1650 queued predicted); loopback disabled + supplier_bank_change demoted after canary findings
Last activity: 2026-06-09

**Phase 112 incident (2026-06-04):** prod ran pre-110-04 code without the per-stage gate → loopback rule archived 141 real internal forwards since May 21. Emergency stop + full restore + gate-code deployed (PR #61) + canary bugfixes (PR #65: global canary cap, Graph-400 skip). Learning `52930d32`. Details: `phases/112-*/112-03-SUMMARY.md`.

**Phase 111 outcome:** Stage 1 noise calibration for sales-email. Both migrations applied live (3 safe keys → categorize_archive, INERT behind the Plan-01 verdict-worker gate until Phase 112; stage_1_retro_runs table). The two CRITICAL architecture gaps closed swarm-agnostically (verdict-worker dry-run gate + Wilson promotion gate generalized — 0 per-swarm branches). Stage-1 retro harness + operator-gated cluster-mining discovery shipped (no auto-INSERT). own_outbound_invoice_loopback left test-first (data-driven). Live: check:supabase 0 ERROR, codegen no-drift, 313 tests green.

**Carry-forward from v8.1 (closed 2026-06-01):** the loopback false-archive incident (Phase 84 `own_outbound_invoice_loopback`) was code-mitigated (#58/#59, migration `20260530_disable_own_outbound_loopback.sql`); the 27-email Stage-3 recovery re-dispatch (list in `87-LOOPBACK-RECOVERY.md`) is operator follow-up, tracked outside this milestone.

## Performance Metrics

**Velocity:**

- Total plans completed: 35
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
| 88 | 4 | - | - |
| Phase 114 P01 | 5min | 3 tasks | 15 files |
| Phase 114 P02 | 25m | 3 tasks | 3 files |
| Phase 114 P03 | 7m | 4 tasks | 5 files |
| Phase 114 P05 | 15m | 3 tasks | 4 files |
| Phase 114 P06 | 4m | 2 tasks | 2 files |
| Phase 114 P07 | 12m | 2 tasks | 5 files |
| 114 | 7 | - | - |
| Phase 116 P01 | 8m | 2 tasks | 2 files |
| Phase 116 P02 | 6m | 3 tasks | 5 files |
| Phase 116 P03 | 9min | 2 tasks | 5 files |
| Phase 116 P04 | 6m | 3 tasks | 7 files |
| Phase 116 P05 | 12m | 3 tasks | 9 files |
| Phase 116 P06 | 5m | 2 tasks | 4 files |
| 116 | 6 | - | - |
| Phase 113 P01 | 11m | 3 tasks | 5 files |
| Phase 113 P02 | 9m | 3 tasks | 9 files |
| Phase 113 P03 | 8m | 2 tasks | 6 files |
| Phase 113 P03 | 8m | 2 tasks | 6 files |
| Phase 113 P04 | 7m | 2 tasks | 4 files |

## Accumulated Context

| Phase 48 P01 | 3min | 2 tasks | 9 files |

### Roadmap Evolution

**V9.0 Sales-Email (Outlook) roadmap created 2026-06-02 — Phases 110–117 (coarse granularity). Runs parallel with v8.2 debtor (phases 90–95, separate workspace).**

- Phase 117 added (2026-06-09): Outlook Intent Categories — generic cross-swarm correction loop. Write each swarm's Stage 3 top-1 intent back to the source Outlook message as an `AI:`-prefixed native category via Graph; operators correct it in place; Phase 112.5 Graph-delta tracking turns the edit into a labelled human-correction signal (feeds eval/calibration + V10.0 Promotion Recommender). Swarm-agnostic by design — every Outlook-backed swarm uses it, second swarm onboards via a registry row only (SWARM-02). Registry-gated + per-stage dry-run flag (reuses Phase 112 gated-write infra). Depends on 113 + 112.5 + 112.

- Phase 110 added: Visibility Foundation — sales-email Bulk Review usable (REVIEW-01) + enrich the Stage-0/1 `swarms` shell to full-funnel config via migration+codegen (SWARM-01) + assert zero per-swarm branches in shared workers (SWARM-02 architecture gate) + confirm Outlook ingest health & disposition legacy `source='sugarcrm'` rows (VERIFY-01). Observe before auto-acting. First V9.0 phase; depends on nothing (baseline Outlook ingest + Stage 0/1 live).
- Phase 111 added: Stage 1 Noise Expansion + Calibration — flip safe core categories (auto-reply, OOO×2) manual_review→categorize_archive behind the shadow→promote gate, keep payment_admittance+unknown in review (STAGE1-01); mine the 827+ corpus for new sales noise rules + re-validate the 8 inherited AP rules incl. gating own_outbound_invoice_loopback (STAGE1-02). Depends on 110.
- Phase 112 added: Outlook Cleanup + Backfill (gated production writes) — wire the Stage 1 Outlook-archive side-effect sales lacks (CLEANUP-01) + idempotent backfill over the ingested corpus: auto-archive high-confidence/AP-noise, ambiguous→Bulk Review approval, loopback EXCLUDED from auto (CLEANUP-02). Depends on 111 (rules settled) + 110 (approval surface).
- Phase 113 added: Stage 3 Sales Intent Agent (greenfield) — new Orq `sales-intent-agent` in orq_agents + seed swarm_intents + set stage3_coordinator_agent_key, dispatch via existing shared dispatcher (STAGE3-01); intent vocabulary emerges from corpus + Phase 86 open-set discovery, never hand-curated (STAGE3-02); every post-Stage-1 email reaches a Stage 3 verdict, handler-less intents → Phase 76 Kanban human-lane, zero silent dead-letters (STAGE3-03). Depends on 110 + 111.
- Phase 114 added: Stage 2 Resolver Reuse — cross-swarm generality proof. Sales Stage 2 reuses the v8.2 NXT resolver via per-swarm config (stage2_entity_resolver + resolution_config, the RESL-03 seam) with ZERO Engine code changes (STAGE2-01); debtor-only self-auth tier degrades to no-op + customer-less prospects fall through to Stage 3 (STAGE2-02). **External/cross-track dep: v8.2 RESL-01/02/03 — sequenced to land AS the seam lands; interleaves, does not block the rest of V9.0.** Depends on 110.
- Phase 115 added: SugarCRM Dead-Code Decommission — remove sales-email-analyzer/ (incl. fetch-sugarcrm-emails.ts), /api/automations/smeba/sugarcrm-search + …/write-analysis, stale zapier_tools Sugar note, after confirming no live path depends on it (SUGAR-01). Independent cleanup — last or parallel.
- V9.0 dependency graph: 110 ──> {111 ──> 112, 113, 114(∥v8.2 RESL seam)}; 115 independent. Stage 4 handlers OUT (V11.0). Numbering starts at 110 to band above v8.2's 90–95 (separate workspace) and avoid cross-workspace collision.
- Phase 116 added (2026-06-04): Attachment Ingest — uniform cross-swarm attachment data source. Capture attachment metadata + on-demand content extraction (PDF text first) as a registry-configured, swarm-agnostic source for Stage 2 resolution (adapter-side body-source, no engine diffs — STAGE2-01 holds), Stage 3 intent signals, and future Stage 4 handlers (V11.0). Sales onboards first; debtor/info@ opt in via registry row only (SWARM-02 gate). Folds in todo 2026-06-04-sales-ingest-attachments-gap.md incl. backfill decision over the 1,273-mail corpus.

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
- Phase 88.2 inserted after Phase 88.1: Tier-2 CI backlog cleanup (URGENT)

### Decisions

- **[2026-06-04, operator] V9.0 re-sequenced: Phase 114 (Stage 2 resolver reuse) executes BEFORE Phase 113 (Stage 3 intent agent).** Data-grond: verkoop@-corpus (1.273 inbound) is uitzonderlijk klant-resolvebaar — 32% "offerte" in subject, 27% nummer-referenties, 75% business-domeinen (2% freemail), ≥44% extern-domein overlap met debiteuren@-senders (ondergrens). Runtime is toch Stage 2→3 (context-shape contract); customer-resolved corpus verrijkt de intent-seeding (STAGE3-02) met een klant-vs-prospect-as. Consequentie: v8.2 RESL-01/02/03 seam-dep staat nu op het kritieke pad — 114-discuss moet eerst seam-status vaststellen (seam NIET geland in deze workspace; alleen registry-kolommen, `resolution_config` = inert placeholder). Twee ingest-gaten als 114-prereq vastgelegd (todos 2026-06-04: attachments-gap + sender-email-gap).
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
- [Phase ?]: Phase 114-01: v8.2 RESL-03 resolver seam transplanted verbatim (generic resolveEntity engine + loadStage2Resolver dispatch + debtor config+adapter refactor + donor test suite); donor seam suite green (port-equivalence + dispatch pass); D-03 dormant honored (Stage 2 worker un-rewired). Cross-track: workspace/v8.2-resolution-recall must rebase after enabler merge (D-02).
- [Phase ?]: Phase 114-02: generic email_pipeline.resolution_audit table (swarm-agnostic, RLS service_role+authenticated SELECT) applied to remote; stage_2_resolution fail-closed gate key live; D-13 read surface unblocked. Task 3 checkpoint cleared via Management API apply.
- [Phase 114-04]: Sales onboards to Stage 2 via config + ONE dispatch line + a sales lookup adapter (offerte/order/Sites via nxtRequest, factuur+sender reuse debtor D-11) — ZERO edits to engine.ts/config.ts/resolve/steps/* (STAGE2-01 generality proof in action). Real resolution_config live on remote (mvqjhlxfvtqqubqgdvhz, Management API HTTP 201): precedence ["sender_match","offerte_match","postcode_site_match","factuur_match","order_match"] (data-driven D-04, case_ref excluded — corroborating-only), auto_safe_kinds:[] (STAGE2-02 no-op), llm_tiebreaker:false. dry_run_config.stage_2_resolution=true (fail-closed). Sales Stage 2 swarm_dispatch event 'sales-email/stage-2.customer-resolve.requested' seeded (Pitfall 6); worker registry-driven (loadStage2Resolver + generic resolution_audit write + second Inngest trigger), debtor behaviour-neutral. check:supabase 0 ERROR. **Checkpoint decisions (operator):** (1) migration applied to remote; (2) D-06 multi-match corroboration DEFERRED to fast-follow (tripwire todo `2026-06-04-d06-corroboration-fast-follow.md` — corroboration ENGINE change must land BEFORE the no-Engine-diff gate is final; Plan 05 Task 3 asserts it exists).
- [Phase ?]: Phase 114-03: ingest hardened (from→sender fallback + has_attachments, swarm-agnostic); D-14 fix-forward only; D-04 mining report committed (postcode 55%/offerte_sb 22%/case_ref 18%/factuur 7%, total=1282 with_sender=928 null=354) — Plan 04 precedence input, Pitfall-4 corrected.
- [Phase ?]: Phase 114-05: STAGE2-01 locked via scripts/no-engine-diff-check.sh (byte-equality engine/config/steps vs donor; single sales dispatch line allowed; PROVISIONAL until D-06 corroboration fast-follow). STAGE2-02 locked via self-auth-noop + unresolved-fallthrough acceptance tests. D-02 v8.2 rebase note left.
- [Phase ?]: Phase 114-06: SC-1 blockers closed in the Stage 2 worker only — CR-01 generic brand_id from resolution_config.scope.brand_scope[0], CR-02 entity_brand inline-guarded to scalar code (object→.code), WR-01 nxt_database config-sourced. Debtor byte-neutral; no-engine-diff exit 0; suite 2461 green.
- [Phase ?]: Phase 114-07: closed review warnings WR-02..WR-05 + IN-01 in sales lookups/adapter (postcode address-context gate + medium confidence per D-06 interim; order regex word-boundary-anchored; quoted-header-scoped sender; unresolved path surfaces attempted identifiers). ZERO engine/config/steps diff.
- [Phase ?]: Phase 116-01: generic email_attachments table + private bucket + RLS; swarms.attachment_config switches (capture/extract + caps + stage2_dispatch_event) seeded sales=both-on debtor=capture-only (D-13). Migrations committed; remote-apply + check:supabase gated to checkpoint.
- [Phase ?]: Phase 116-02: Graph attachment helpers via single graphFetch boundary (zod-validated) + pure swarm-agnostic extract.ts (unpdf text-layer first, Orq Router vision fallback, fail-soft coded statuses, caps); no swarm literal, no direct LLM key; 12 tests green
- [Phase ?]: Phase 116-03: registry-gated swarm-agnostic captureAttachmentMetadata wired into both ingest routes; debtor capture via Plan-01 registry row (D-13 proof), zero debtor-specific code; metadata-only at ingest (D-05), fail-soft, idempotent on (email_id,attachment_id); AttachmentConfig typed on SwarmRow; suite 2491 green.
- [Phase ?]: 116-04: extraction funnel step is registry-keyed (extract switch gates; stage2_dispatch_event names the downstream event, no code literal); verdict worker untouched
- [Phase ?]: 116-04: shared extractEmailAttachments helper owns the download/store/extract/update loop so Plan 06 backfill reuses one implementation (no drift)
- [Phase ?]: Phase 116-05: attachment text folded into Stage 2 body_text (STAGE2-01-safe, engine pristine); AttachmentList in Stage 2 Read column on /review via hydrateBulkReviewRow.attachments; metadata+status only, no preview/download (D-08). Plan data-path corrected: /review uses InlineExpandRow→Stage2Read, not UnifiedDetailPane.
- [Phase ?]: Phase 116-06: gated corpus attachment backfill worker (sales-email/attachments.backfill.run) — metadata for ALL mails (closes has_attachments=false blind spot, SC-4); extraction ONLY for Stage-1-survivors (disposition != auto, reusing Phase 112 classifyDisposition) via the SHARED Plan 04 extractEmailAttachments helper; fail-loud 40k cap + bounded batches + 404->source_gone fail-soft + idempotent upsert; live 1273-mail run DEFERRED to operator checkpoint.
- [Phase ?]: Phase 113-02: Q1 seam resolved — shared Stage 3 coordinator dispatches per-swarm via registry agent key + swarm-keyed schema map, single parameterized invoke, zero literal swarm branch, dispatcher byte-unchanged, debtor byte-neutral.
- [Phase ?]: Phase 113-02: sales retro reconstruct-input folds extracted attachment text into the body byte-comparable to live Stage 2 (exact UNTRUSTED delimiter, Pitfall 4); sales carries no brand entity into Stage 3.
- [Phase 113-03]: sales Stage 3 retro-classify side-channel built (mirrors debtor Phase 87 6 locks — writes ONLY stage_3_retro_runs, invokeSalesIntentAgent cache-bypass, replay-safe run_id). Bounded bootstrap bypass of the R-04 cluster gate: honored ONLY when sales swarm_intents===0 (the empty-cluster chicken-and-egg first pass), THROWS if bootstrap=true after seeding (T-113-11), rows tagged run_type via ranked_intents._meta JSONB sibling (no migration). No Stage-3 baseline (sales aggregate-baseline is Stage-1-shaped). manage-sales-intent-agent.ts: list_models-validated create→PATCH→get-verify (D-13); validated live — all 4 catalog ids present (matched by BARE model_id; /v2/models drops the provider prefix). Agent is a SHELL in Plan 03 (--finalize gated on non-empty enum → Plan 04 post seed+codegen). CHECKPOINT-BLOCKED on the Studio json_schema + bootstrap retro + operator cluster promotion; promoted_intents PENDING in 113-03-SUMMARY (Plan 04 has a DB-fallback).
- [Phase ?]: [Phase 113-04]: 12 operator-promoted sales intents + mandatory 'other' residual seeded into swarm_intents (20260609b, Management API HTTP 201, all placeholder); codegen regenerated intent.generated.ts (sales-email=13); sales-intent-agent json_schema intent enum re-PATCHed to 13 (get_agent verified). 3-way invariant closed; hard-separation + other-routes guards green; check:supabase 0 ERROR; dispatcher untouched.
- [Phase 113-05]: swarm-agnostic Stage-3 ROUTING gate landed in the SHARED coordinator BETWEEN persist-ranked and flip/emit — registry-driven, fail-closed, no swarm literal. DEDICATED dry_run_config.stage_3_routing key (NOT stage_3_labeling reuse — debtor's predicted-emit fires today while stage_3_labeling=true, so reuse would regress debtor; T-113-10). GATED → persist verdict + decision_details.routing_held=true marker, withhold predicted-emit (decision='predicted_held'); OPEN → emit as today. Migration 20260609c seeds debtor=false(open)/sales=true(gated) — NOT YET APPLIED. Dead-letter reconciliation smoke (sales-stage3-deadletter-check.ts, pure fn + Supabase main, exit 1 on gap; held verdict counted terminal-visible) + 7 fixture tests. Bulk Review retry PROVEN to accept swarm_type='sales-email' (replayKanbanRow same-intent fires registry sales handler_event). 18 plan tests + 298 inngest suite green; dispatcher byte-unchanged (git-diff guard); tsc 0; check:supabase 0 ERROR. CHECKPOINT-BLOCKED on Task 3 operator go-live (apply 20260609c + dry-run review + flip). Commits c433d1d8, a318a5cd.

### Blockers/Concerns

- Azure AD tenant setup has organizational dependencies (IT admin access)
- Supabase Management API token expired -- Phase 50 migration apply blocked (seed update also needs this or Studio access)
- **Phase 110 / Plan 110-04 Task 4 UNBLOCKED + APPLIED (2026-06-03)**: the 3 `20260603*` migrations are now applied to remote `mvqjhlxfvtqqubqgdvhz` via Supabase MCP `apply_migration` (after re-linking the MCP OAuth to the Agent-Workforce org `oavpdqisdpzxqttgdgpt`). Verified live: sales `entity_brand=['smeba']` + `stage3_coordinator_agent_key='sales-intent-agent'` + all dry_run flags blocked + `swarm_intents=0`/`side_effects=[]` (inert); **debtor `dry_run_config.stage_1_cleanup=false` (LIVE preserved)**. `entity.generated.ts` regenerated + committed (`c774f989`). RLS advisor green (0 ERROR). Outstanding: per-mailbox `pipeline_health_snapshots` row for `verkoop@smeba.nl` populates on next monitor cron tick; Task 5 human governance checkpoint awaiting operator "approved".
- Supabase Realtime plan limits need verification (carry forward from Phase 49)
- **Phase 113-05 Task 3 CHECKPOINT (blocking-human) — the STAGE3-03 go-live:** operator must, IN ORDER: (1) **apply migration `20260609c` to remote BEFORE/atomic-with the coordinator code deploy** — the routing gate is FAIL-CLOSED and live `swarms.dry_run_config` currently has NO `stage_3_routing` key, so a code-only deploy would HOLD debtor's live predicted-emit. 20260609c sets debtor=false (open, preserves live emit) + sales=true (gated). (2) dry-run observation: trigger live sales Stage 3, verdicts persist + surface in Bulk Review while routing held; run `cd web && npx tsx scripts/eval/sales-stage3-deadletter-check.ts <since> <until>` → gap=0. (3) review ~100 sales verdicts (ranked intents + entity_relationship; Zod-failure row shows raw output + working retry; axis-3 overrides recordable). (4) on green-light, FLIP sales `stage_3_routing`→false → coordinator emits `sales-email/predicted` → dispatcher opens Kanban routing (reversible by re-gating, D-09). (5) record green-light + sample size in UAT. Resume: "go-live approved". Details: `phases/113-*/113-05-SUMMARY.md`.
- **Phase 113-03 Task 2 CHECKPOINT (blocking-human):** operator must (1) create the `sales-intent-agent` SHELL + json_schema in Orq Studio (run `cd web && npx tsx scripts/orq/manage-sales-intent-agent.ts` to print the schema; Studio → Tools → Add → JSON Schema, then Model parameters → Response Format = it; confirm the Model dropdown is non-empty), (2) trigger `sales-email/retro-classify.requested` with `bootstrap:true` + a recent Outlook since/until (NOT a full SugarCRM sweep) and confirm `stage_3_retro_runs` gains rows tagged `run_type='bootstrap'` + sales `intent_proposal_clusters` is non-empty, (3) promote clusters to ~80% coverage (D-02), (4) record the `promoted_intents` yaml in `113-03-SUMMARY.md`. Resume signal: "agent created". (Plan 04 falls back to reading promoted clusters from the DB if the yaml stays empty.)

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

Last session: 2026-06-09T12:13:00.000Z
Stopped at: 113-05-PLAN.md code complete (Tasks 1+2 committed); CHECKPOINT-BLOCKED at Task 3 operator go-live (apply 20260609c + dry-run review + routing flip)
Resume with: operator completes Task 3 (resume signal "go-live approved"), then `/gsd-execute-phase 115`
Resume file: .planning/phases/113-stage-3-sales-intent-agent-greenfield/113-05-SUMMARY.md

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

## Operator Next Steps

- Start the next milestone with /gsd:new-milestone
