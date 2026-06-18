---
gsd_state_version: 1.0
milestone: V9.5
milestone_name: Stage-2 Resolver Correctness — Corroboration + Attachment-Borne IDs + Cross-Brand Scope — ACTIVE
status: executing
stopped_at: Phase 122 (cross-brand scope; XSCOPE-01/02/03) complete + verified (PR #117); gap-closure 122-05 leaf-vs-root fix. Phase 121 (attachment-borne IDs) closed + merged (#118). Phases 120 + 123 (corroboration + resolve_candidates unification) + 119 (per-mailbox isolation) already merged (PR #111/#110). Quick task 260618-iwx (cross-swarm noise rules) also merged. V9.5 resolver phases (119/120/121/122/123) all complete.
last_updated: 2026-06-18
last_activity: 2026-06-18 -- Phase 122 complete + verified (PR #117); cross-scope leaf-vs-root fix landed
progress:
  total_phases: 4
  completed_phases: 4
  total_plans: 16
  completed_plans: 16
  percent: 100
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
**Current focus:** V9.5 resolver milestone complete — Phase 121 (attachment-borne IDs) + Phase 122 (cross-brand scope) both done. Phase 122 verified + merged via PR #117 (gap-closure 122-05 leaf-vs-root fix). Open follow-ups: `2026-06-18-v95-loose-ends-do-not-forget.md` + `2026-06-18-resolver-95-leaf-wrong-confident.md`.
**Previous milestones:** v0.3 (2026-03-01), V2.0 (2026-03-02), V2.1 (2026-03-13), V7.0 (2026-04-30). V3.0/V4.0/V5.0/V6.0 abandoned per 2026-03-25 pivot.

## Current Position

Phase: 122 (cross-brand-scope-customer-resolution) — COMPLETE (5 of 5 plans; verified, PR #117)
Plan: 5 of 5
Status: Complete (pending PR #117 merge → deploy)

### Cross-machine handoff (updated 2026-06-17) — debtor intent-label + observe

SHIPPED + MERGED to main: Phase 118 (PR #104); #107 widened the delta-sync source filter to `source IN ('outlook','zapier-debtor-ingest')`; #108 pruned stale sicli/.nl entries; **Phase 119 per-mailbox fan-out isolation (PR #110)**; **Phase 120 + 123 — resolver corroboration + resolve_candidates unification, legacy lookups retired (PR #111)**.

LIVE production config (in Supabase `public.swarms` — shared across machines, NOT in git):

- debtor-email: `dry_run_config.stage_3_intent_label=false` (AI: labels LIVE). `behavior_tracking_config={enabled:true, mailboxes:[debiteuren@smeba.nl, administratie@fire-control.nl, debiteuren@smeba-fire.be, debiteuren@berki.nl]}` — observe **RE-ENABLED 2026-06-17** after the Phase 119 fan-out fix; all 4 mailboxes tick independently, sales unaffected (verified live).
- sales-email: labels live + `behavior_tracking_config={enabled:true, mailboxes:["verkoop@smeba.nl"]}`.
- `debtor.labeling_settings` = 4 rows. Sicli (noord+sud) rows DELETED 2026-06-16 (re-add later with verified address).

RESOLVED: the 2026-06-16 regression (debtor multi-mailbox observe starved + froze sales) is fixed by Phase 119 per-mailbox fan-out isolation; debtor observe re-enabled + verified live 2026-06-17.
Last activity: 2026-06-18 - Phase 122 cross-brand scope complete + verified (PR #117); Phase 121 closed + merged (#118); quick task 260618-iwx (cross-swarm noise rules) on main

## Performance Metrics

**Velocity:**

- Total plans completed: 53
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
| Phase 117 P01 | 6min | 3 tasks tasks | 7 files files |
| Phase 117 P02 | 11min | 3 tasks | 7 files |
| Phase 112.5 P05 | 5m | 2 tasks | 4 files |
| 112.5 | 5 | - | - |
| 113 | 5 | - | - |
| 120 | 4 | - | - |
| Phase 123 P03 | ~10 minutes | 3 tasks | 5 files |
| 123 | 4 | - | - |
| Phase 121 P01 | 5min | 3 tasks | 1 files |
| Phase 121 P02 | 14m | 3 tasks | 6 files |
| Phase 121 P03 | ~9m | 3 tasks | 3 files |
| Phase 122 P122-02 | 8min | 2 tasks | 4 files |
| Phase 122 P122-03 | 18min | 2 tasks | 4 files |

## Accumulated Context

| Phase 48 P01 | 3min | 2 tasks | 9 files |

### Roadmap Evolution

- Phase 118 added (2026-06-16): Multi-mailbox behavior-sync — extend Phase 112.5 `swarm-behavior-sync.ts` to observe MULTIPLE mailboxes per swarm row (`behavior_tracking_config.mailboxes: string[]` with singular `mailbox` fallback), so debtor-email's ~5 debiteuren mailboxes can feed the Outlook correction loop. Step 1 (enabler) of the debtor intent-labeling rollout; step 2 (flip `stage_3_intent_label` gate + enable `behavior_tracking_config` for debtor across all mailboxes) follows post-merge. Workspace: `multi-mailbox-behavior-sync`.

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

- **[Phase 123-02]** Sales `sender_match` (email_address/email_domain back-search, address-first) + `factuur_match` (invoice_no, root_party_id rollup) now resolve over the single generic `nxt.resolve_candidates` substrate; legacy `lookupSenderToAccount`/`lookupIdentifierToAccount` no longer called from sales production code or mocked in any sales test; corroboration signal axes (`sender_domain`/`invoice_no`) + fail-closed posture (is_unique_in_scope + scope_key + distinct-party/root !=1 → null, no LLM tiebreaker for sales) preserved; zero swarm-name runtime branch. Sales scope constants exported from `lookups/offerte.ts` and reused (single source of truth). tsc 0, sales suite 91 passed. Both swarms now off the legacy wrappers in production (capability-before-removal complete; Plan 03 deletes the defs/types/zapier_tools rows). Commits 341aa64e/b8d7838b.
- **[Phase 123-01] Task 3 auto_safe_kinds reconciliation — operator selected Option A:** the debtor invoice path calls `resolve_candidates(invoice_no)` DIRECTLY in the NON-AUTO block, independent of `auto_safe_kinds` (live debtor stays `[]`). Preserves the live AUTO/SUGGEST risk posture, keeps the ≥2 → llmTiebreak escalation (fail-closed), and lets Plan 04's frozen 100-email eval score precisely the sender behavior change. Option B (debtor seed `auto_safe_kinds += invoice_no`, turning on the root-rollup AUTO tier) was REJECTED — not covered by the frozen eval. No debtor seed migration added. Corroboration engine (Phase 120) + brand_id-combined invoice search (Phase 122) remain out of scope.
- **[Phase 123-01]** Debtor `sender_match` (email_domain/email_address back-search) + `identifier_match` (invoice_no, root_party_id rollup) both resolve over the single generic `nxt.resolve_candidates` substrate; legacy `lookupSenderToAccount`/`lookupIdentifierToAccount` no longer called from production steps or mocked in any resolve test; both engine.ts call sites pass config; ambiguity fails closed; SWARM-02 swarm-agnostic grep green. tsc 0, vitest 176 passed. Capability-before-removal — Plan 03 deletes the wrapper defs/types/zapier_tools rows. Commits 0284340a/c3871383/371a93f8.
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
- [Phase 112.5-05]: activated the dormant `category_edited` signal by feeding the Phase 117 baseline into the behaviour-sync worker. (1) signal-derive: new pure `intentKeyFromCategories` (first AI:-prefixed entry, prefix-stripped, else null) replaces the flat `categories[0]` derivation — removed-label/changed-to-non-AI → category_key null (ambiguous), changed-to-another-AI → should-be-intent; all three share verdict `reclassify` (SignalVerdict union BYTE-UNCHANGED, no new member). (2) worker: seeds `prevCategories` (keyed by immutable_id) from a swarm_type-scoped `swarm_written_categories` SELECT inside the existing derive-and-write step.run (replay-safe), inverting immutableToEmailId; fail-safe on no-baseline (absent id → no transition, dormant default preserved); idempotent via existing dedupe_key 23505 no-op; `prevIsRead` stays empty (read_aged still dormant); ZERO per-swarm branches. 13 signal-derive + 10 behavior-sync tests green (4 new category tests), full email-behavior 56/56, tsc 0. Commits 3cf15049/dd3447c3. SC-2 / OUTLOOK-BEHAV-05 met. Code correct independent of 117 live data (0 signals when baseline empty); sales stays registry-paused (behavior_tracking_config.enabled=false) until Sugar cut-over.
- [Phase 117-02]: wired the Plan 01 primitives into the live pipeline — swarm-agnostic pipeline/intent-label.requested event emitted by the SHARED coordinator on every Stage-3 verdict-with-top-intent (BOTH the routing-GATED/held path AND the OPEN path; the category WRITE gate stage_3_intent_label is independent of the routing gate), additive to debtor's emit-predicted (byte-unchanged). New registered stage3IntentLabelWorker writes AI:<intent_key> onto the source Outlook message behind isStageBlocked(swarm,"stage_3_intent_label") — fail-closed no-op when GATED (both swarms seeded GATED), idempotent (write-on-change via readWrittenCategory), never-clobber (skip on 112.5 category_edited transition / review-signal), strip-stale (mergeIntentCategory full-array PATCH). ZERO swarm_type literals (SWARM-02 grep 0). docs/swarm-behavior-tracking.md documents the swarm_written_categories 112.5 prevCategories baseline read-contract (D-5; signal side OUT of 117). 34 tests green, tsc 0. Commits a6fd913b/4e4c949e/cbb4ec97. Task 4 [BLOCKING] migration-apply HALTED for operator — NOT applied to prod.
- [Phase 118-01]: swarm-behavior-sync.ts now observes MULTIPLE mailboxes per swarm row. BehaviorTrackingConfig gains `mailboxes?: string[]` (kept `mailbox?: string`); `load-enabled-swarms` flattens each enabled swarm row to one EnabledSwarm per (swarm x mailbox) via the LOCKED read order `cfg.mailboxes ?? (cfg.mailbox ? [cfg.mailbox] : [])` (empty → skip), weights shared per swarm. All four loop-body step.run ids (refresh-folder-map / tracked-folders / delta / derive-and-write) embed the raw mailbox segment so cross-mailbox Inngest memoization can't collide (no hash, no non-deterministic source); top-level resolve-run-id / resolve-tick-iso stay singular; concurrency:1 preserved (sequential per-mailbox). DATA-only idempotent jsonb migration `20260616_phase118_sales_mailboxes_array.sql` (BEGIN…COMMIT, minus-key drop of singular 'mailbox' + jsonb_set enabled + jsonb_build_array; no DDL/RLS) **APPLIED to prod by operator via Supabase MCP** — live-verified sales-email `behavior_tracking_config={"enabled":true,"mailboxes":["verkoop@smeba.nl"]}` (singular key gone), debtor-email unchanged `{"enabled":false}`. vitest 13/13 (incl. 112.5 regression + 3 new: multi-mailbox iteration / step-id uniqueness / singular fallback), tsc 0, codegen no drift, check:supabase 0 ERROR/6 WARN/23 INFO. Hard-separation respected (no swarm_noise_categories/swarm_intents touch). Commits 32d0b26d/45467745/f7946e6e. **Step 2 (debtor enablement — flip stage_3_intent_label=false + set debtor behavior_tracking_config mailboxes[] across its 5 debiteuren mailboxes) is post-merge, OUT OF SCOPE.**
- [Phase ?]: [Phase 117-01]: shipped pure AI: ${intent_key} mapper (strip-stale merge, D-1), DEDICATED fail-closed stage_3_intent_label gate key (D-3), email_id-keyed swarm_written_categories store (D-4/D-5). Migration 20260615 (RLS service_role+authenticated SELECT, no anon; stage_3_intent_label=true GATED both swarms via jsonb ||) WRITTEN not applied — Plan 02 [BLOCKING] applies + check:supabase. 23 tests green, tsc 0. Commits c3baae1e/be18115e/05c1b2ab.
- [Phase 121-01]: empirical baseline — only #24 (xlsx extraction + one-mail->many guard) is buildable-now residual; #16/#19/#28/#29/#86 regression-guard (gated on Phase 123), #83 precedence verify-only (engine byte-identical), #15->116, #85->122. Both swarms already capture=true/extract=true (ATID-03/04 met). No outward NXT/Zapier call. Build planned 2026-06-18 as 121-02 (exceljs .xlsx/.csv branch in extract.ts + verify-first 358-root many-customer guard, engine byte-identical) + 121-03 (acceptance; live debtor re-run deferred to Phase 123).
- [Phase 123-03]: Deleted nxt.contact_lookup + nxt.identifier_lookup ENTIRELY from nxt-zap-client.ts (lookupSenderToAccount/lookupIdentifierToAccount wrappers, ContactLookupInput/IdentifierLookupInput, ContactMatchSchema/IdentifierMatchSchema + type exports, ResponseSchemaByTool + LookupKindByTool entries, NxtToolId literals, callNxtTool overload branches). NxtToolId = candidate_details | resolve_candidates. Spike 011b RETIRED-with-note (Phase 120 work done); 2 remaining test files rewired to resolve_candidates. RESL-UNIFY-04 atomicity: repo grep 0, tsc 0, full vitest 2732 passed. DB half (2 zapier_tools rows + CHECK widen-back) is Plan 04. Commits 2e5fd6ce/7044341c/991e4a63.
- **[Phase 123-04] Task 2 DELETE-only prod deviation (operator-approved, T-123-10):** pre-flight count of legacy nxt_lookup_requests rows = 1171 (>0), so the narrowed CHECK re-add would fail → applied ONLY `DELETE FROM public.zapier_tools WHERE tool_id IN ('nxt.contact_lookup','nxt.identifier_lookup')` to live mvqjhlxfvtqqubqgdvhz (apply_migration `retire_legacy_lookup_tools_delete_only_p123`); the 2 nxt_lookup_requests CHECK constraints stay WIDE. Verified: legacy tool_ids ABSENT, candidate_details+invoice_fetch+resolve_candidates PRESENT; check:supabase 0 ERROR. Widen-back deferred to todo `2026-06-17-widen-back-nxt-lookup-requests-checks.md` (prune inert rows first). Legacy tools now gone from code AND database (capability-before-removal complete).
- **[Phase 123-04] Task 3 correctness eval deferred-with-evidence (operator APPROVED-TO-CLOSE):** ran the frozen 100-email gate over the unified resolve_candidates path (commit dcfd0409, RERUN-FINDINGS.md). Overall correct = 18% (14/79) vs 64% baseline = RED, but ROOT CAUSE is a transport artifact in the pre-existing, Phase-123-untouched `candidate_details` tool: live debtor.nxt_lookup_requests eval window shows resolve_candidates 163 req/163 complete-with-result (unified path works), candidate_details 26 req/0 results/all `pending` (LLM-tiebreaker enrichment Zap fires but async callback never lands → rows degrade to unresolved; same issue as Monday's Sales eval per operator). Demotion-DIRECTION targets PASSED: confident-wrong AUTO #2/#85/#95/#97 = 4/4 demoted; bucket-B = 12/12 resolved-or-demoted (corroboration firing correctly). The clean absolute-% re-run is DEFERRED to todo `2026-06-17-candidate-details-callback-and-clean-eval-rerun.md` (fix callback → re-run; closes the deferred Phase-120 / 123 debtor gate). Phase code+DB+transport deliverables COMPLETE and proven live; the absolute-% acceptance number is the only deferred item.
- [Phase ?]: [Phase 121-02] xlsx/csv attachment extraction added adapter-side in extract.ts (exceljs lazy-import, string-only, early-capped, fail-soft, UNTRUSTED-fenced); engine byte-identical (no-engine-diff donor re-baselined to post-123 b816c627). Many-customer guard = STRUCTURAL (verify-first: 358-distinct-root demotes below AUTO) — no new adapter-side guard, stage-2-customer-resolver.ts untouched. Commits 35bc3b6e/62685a1a/ca810e1e.
- [Phase ?]: [Phase 121-03] Build acceptance split: verifiable-now (xlsx extract + 116-05 fold ATID-01 + 358-root demotion + no-engine-diff exit 0) green without live fixture; live debtor correctness-gate re-run over frozen 100 DEFERRED to Phase 123 (blocked on debtor → resolve_candidates + DEBTOR_FETCH_WEBHOOK_SECRET). Test-only plan, engine byte-identical.
- [Phase ?]: [Phase 122-02] suggestie Confidence (D-06 4-tier), cross_scope_misroute? (D-09), CrossScopeConfig (D-10) types landed; numericConfidence projects suggestie->0.7 (distinct value, medium 0.7 slot reused, no displacement); both stage-2 worker casts widened. cross-scope tests RED on LOGIC only (Plan 03 GREEN target); numericConfidence test GREEN; tsc 0; no swarm-name branch. Commits b1c00d9c/8cef3fbb.
- [Phase ?]: [Phase 122-03] Cross-scope fallback shipped as a SHARED PURE post-pass (resolveCrossScope) over already-fetched all-brand res.matches, wired into all three SUGGEST drop sites. Relaxation = OMIT the brand prefix-family filter ONLY; no second lookupResolveCandidates, no swarm-name branch. AUTO only on single distinct root/party + strong kind (D-03a) or scoreCorroboration high (D-03b); else suggestie emitted directly. Gated on config.cross_scope.enabled; opt-out byte-identical. Full resolve suite 65 GREEN. Commits dabcca71/7e2fcddc.
- [Phase ?]: [Phase 122-04] Debtor cross_scope opt-in migration (20260618a, jsonb||concat ADD-only) + debtorP0Config lockstep + RED-first lockstep test; APPLIED LIVE to mvqjhlxfvtqqubqgdvhz (no precedence/auto_safe_kinds drift). Commit 243646b0.
- [Phase ?]: [Phase 122-05] GAP-CLOSURE: cross-scope returned root_party_id (parent) instead of the matched leaf party_id — found via airtight A/B + NXT resolver_index query (the plan-prescribed auto_resolve_kinds config-tighten would have MASKED it). Fix: root_party_id used ONLY for the distinctness bar (D-08); resolved customer + degrade shortlist surface the leaf party_id; misroute annotation falls back to scope_key (resolver_index has no brand_id column). Bucket-C XSCOPE-03 re-run PASS (0 reachable confident-wrong); #98/#12/#38 now resolve to correct leaf. Operator: keep-live. Commits 9c7e2d16/e6ccdff4. Follow-up: #95 leaf-wrong (original confident-wrong set, separate root cause).

### Blockers/Concerns

- Azure AD tenant setup has organizational dependencies (IT admin access)
- Supabase Management API token expired -- Phase 50 migration apply blocked (seed update also needs this or Studio access)
- **Phase 110 / Plan 110-04 Task 4 UNBLOCKED + APPLIED (2026-06-03)**: the 3 `20260603*` migrations are now applied to remote `mvqjhlxfvtqqubqgdvhz` via Supabase MCP `apply_migration` (after re-linking the MCP OAuth to the Agent-Workforce org `oavpdqisdpzxqttgdgpt`). Verified live: sales `entity_brand=['smeba']` + `stage3_coordinator_agent_key='sales-intent-agent'` + all dry_run flags blocked + `swarm_intents=0`/`side_effects=[]` (inert); **debtor `dry_run_config.stage_1_cleanup=false` (LIVE preserved)**. `entity.generated.ts` regenerated + committed (`c774f989`). RLS advisor green (0 ERROR). Outstanding: per-mailbox `pipeline_health_snapshots` row for `verkoop@smeba.nl` populates on next monitor cron tick; Task 5 human governance checkpoint awaiting operator "approved".
- Supabase Realtime plan limits need verification (carry forward from Phase 49)
- **Phase 117-02 Task 4 CHECKPOINT (blocking-human) — the migration-apply:** operator/orchestrator must (1) apply `supabase/migrations/20260615_phase117_intent_label_store_and_gate.sql` to remote (`mvqjhlxfvtqqubqgdvhz`) via Supabase MCP apply_migration — creates `public.swarm_written_categories` (RLS service_role FOR ALL + authenticated SELECT, no anon) + seeds `dry_run_config.stage_3_intent_label=true` GATED for BOTH swarms via jsonb `||`; (2) `npm run check:supabase` → 0 ERROR; (3) confirm seed = both swarms `stage_3_intent_label`='true', other per-stage flags preserved; (4) `cd web && npm run codegen && git diff --exit-code` → no drift; (5) trigger one live sales Stage-3 verdict → confirm `pipeline/intent-label.requested` fired AND worker returned `decision="gated"` (no Graph PATCH), `swarm_written_categories` stays empty. **Sales caveat (D-3 ⚠): keep BOTH swarms GATED at phase close — do NOT flip sales live until the Sugar cut-over / Power Automate sweep clears.** Resume signal: "migration applied". Details: `phases/117-*/117-02-SUMMARY.md`.
- **Phase 113-05 Task 3 CHECKPOINT (blocking-human) — the STAGE3-03 go-live:** operator must, IN ORDER: (1) **apply migration `20260609c` to remote BEFORE/atomic-with the coordinator code deploy** — the routing gate is FAIL-CLOSED and live `swarms.dry_run_config` currently has NO `stage_3_routing` key, so a code-only deploy would HOLD debtor's live predicted-emit. 20260609c sets debtor=false (open, preserves live emit) + sales=true (gated). (2) dry-run observation: trigger live sales Stage 3, verdicts persist + surface in Bulk Review while routing held; run `cd web && npx tsx scripts/eval/sales-stage3-deadletter-check.ts <since> <until>` → gap=0. (3) review ~100 sales verdicts (ranked intents + entity_relationship; Zod-failure row shows raw output + working retry; axis-3 overrides recordable). (4) on green-light, FLIP sales `stage_3_routing`→false → coordinator emits `sales-email/predicted` → dispatcher opens Kanban routing (reversible by re-gating, D-09). (5) record green-light + sample size in UAT. Resume: "go-live approved". Details: `phases/113-*/113-05-SUMMARY.md`.
- **Phase 113-03 Task 2 CHECKPOINT (blocking-human):** operator must (1) create the `sales-intent-agent` SHELL + json_schema in Orq Studio (run `cd web && npx tsx scripts/orq/manage-sales-intent-agent.ts` to print the schema; Studio → Tools → Add → JSON Schema, then Model parameters → Response Format = it; confirm the Model dropdown is non-empty), (2) trigger `sales-email/retro-classify.requested` with `bootstrap:true` + a recent Outlook since/until (NOT a full SugarCRM sweep) and confirm `stage_3_retro_runs` gains rows tagged `run_type='bootstrap'` + sales `intent_proposal_clusters` is non-empty, (3) promote clusters to ~80% coverage (D-02), (4) record the `promoted_intents` yaml in `113-03-SUMMARY.md`. Resume signal: "agent created". (Plan 04 falls back to reading promoted clusters from the DB if the yaml stays empty.)

### Quick Tasks Completed

| # | Description | Date | Commit | Status | Directory |
|---|-------------|------|--------|--------|-----------|
| 260611-jwt | SugarCRM openstaande-e-mails inventarisatie + Outlook-locatie-match rapport | 2026-06-11 | 008cb16f | | [260611-jwt-sugarcrm-openstaande-e-mails-inventarisa](./quick/260611-jwt-sugarcrm-openstaande-e-mails-inventarisa/) |
| 260618-iwx | cross-swarm noise rules: shared swarm_type='*' scope on swarm_noise_categories + runtime union + cross-swarm telemetry + per-swarm opt-out (info-routing 7 junk cats shared) | 2026-06-18 | 6824e0ad | Verified | [260618-iwx-cross-swarm-noise-rules-shared-scope-op-](./quick/260618-iwx-cross-swarm-noise-rules-shared-scope-op-/) |

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

Last session: 2026-06-18T10:12:34.290Z
Stopped at: Phase 122 complete + verified (PR #117); gap-closure 122-05 leaf-vs-root fix landed. Phase 121 closed + merged (#118). V9.5 resolver phases (119/120/121/122/123) all complete.
Resume with: merge PR #117 → deploy (keep-live: fix is correct in production only after deploy). Then consider /gsd-complete-milestone V9.5 / next milestone.
Resume file: .planning/todos/pending/2026-06-18-v95-loose-ends-do-not-forget.md

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

- Start the next milestone with /gsd-new-milestone
