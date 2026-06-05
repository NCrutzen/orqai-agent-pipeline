# Requirements: V9.0 Sales-Email Canonical Pipeline — Outlook-driven

**Defined:** 2026-06-02
**Core Value:** Every recurring email-driven process at Moyne Roberts gets a swarm on the canonical 5-stage funnel; new swarms onboard via registry config, not code. V9.0 takes `verkoop@smeba.nl` end-to-end and is the first cross-swarm reuse of the v8.2 NXT resolver — the generality proof.
**Workspace:** `workspace/sales-agent-swarm` (parallel with the v8.2 debtor track in its own workspace). Phase numbering: **110+** (banded above v8.2's 90–95).
**Charter:** `MILESTONES.md` → V9.0.

## Verified Baseline (already live — do NOT re-build; verified 2026-06-02 against production)

Scope was corrected against live DB + code state before definition (the original charter was stale):

- ✅ **Outlook ingest is the production path** — `web/app/api/automations/sales-email/ingest/route.ts` (`SALES_SOURCE="outlook"`), **827 emails in 30d** (~33/day), Sugar→Outlook cutover completed **2026-05-06** (SugarCRM source has 2 stragglers since). The "move sales to Outlook" premise is already done.
- ✅ **`swarms` row exists** (`swarm_type='sales-email'`, Phase 74) — but is a Stage-0/1 shell: `stage2_entity_resolver`, `stage3_coordinator_agent_key`, `canonical_context_shape`, `resolution_config` are null; `entity_brand` empty; `side_effects` empty.
- ✅ **Stage 0 + Stage 1 LLM classifier live**, swarm-agnostic (`stage1_regex_module=null` → LLM-only). 13 noise categories: 8 AP-automation FYI rules auto-archive (`categorize_archive`); the 5 core sales categories (auto-reply, OOO×2, payment_admittance, unknown) are still `manual_review`.
- ✅ **Feedback forms are swarm-generic** (`email_feedback`, Phase 82.4) — usable by sales as-is.
- ❌ **Greenfield:** `swarm_intents` for sales = 0; `orq_agents` for sales = 0; Stage 2 resolver config absent; no Outlook-archive side-effect wired; Bulk Review surface not yet usable for the operator.

## v1 Requirements

Requirements for V9.0. Each maps to a roadmap phase (110+).

### Stage 1 — Noise Expansion + Calibration

- [ ] **STAGE1-01**: Operator-justified calibration of the 5 core sales noise categories on the live corpus — safe categories (auto-reply, OOO temporary/permanent) flip `manual_review` → `categorize_archive` behind the shadow→promote gate; `payment_admittance` + `unknown` stay in review with rationale. Delivered as a migration with audit trail.
- [ ] **STAGE1-02**: New sales-specific Stage 1 noise rules are discovered from the multi-week corpus (827+ emails) and added as `swarm_noise_categories` rows (data-driven, audit trail). The 8 inherited AP-noise rules are re-validated for sales fit — in particular `own_outbound_invoice_loopback` (disabled on debtor for 40% mis-archive) is gated/disabled unless it holds on the sales corpus.

### Outlook Cleanup + Backfill (production writes — gated)

- [ ] **CLEANUP-01**: A Stage 1 Outlook-archive side-effect is wired for sales `categorize_archive` categories — `swarms.side_effects` entry + a cleanup worker that archives matching mail in `verkoop@smeba.nl` via Graph (the action sales currently lacks; debtor uses iController delete, sales uses Outlook archive).
- [ ] **CLEANUP-02**: The noise rules are backfilled over the already-ingested corpus and matching emails are retroactively archived in Outlook — **auto-archive for high-confidence / AP-noise categories**, ambiguous matches routed to Bulk Review for operator approval. Idempotent (safe re-run); `own_outbound_invoice_loopback` excluded from auto per the debtor incident.

### Bulk Review Surface

- [ ] **REVIEW-01**: The sales-email Bulk Review surface works end-to-end like debtor-email — sidebar navigation entry + the registry-driven stage-keyed shell rendering rows, detail pane, queue tree, per-stage tabs (0/1/2/3), and feedback forms — so the operator can actually follow and act on sales emails. Verify the generic shell renders for sales and wire/build any gaps.

### Swarm Registry Enrichment (Stage-0/1 shell → full funnel)

- [ ] **SWARM-01**: The existing `sales-email` `swarms` row is enriched to a full-funnel config — `entity_brand=smeba`, `canonical_context_shape`, `stage2_entity_resolver`, `resolution_config`, `stage3_coordinator_agent_key` — delivered as a migration with `npm run codegen` committed atomically (no hardcoded enums, no hand-edited `*.generated.ts`).
- [ ] **SWARM-02**: All sales-specific behavior is expressed as registry data — zero `if swarm==='sales-email'` branches in shared workers (`classify`/classifier/coordinator/dispatcher). Any branch needed in a shared worker is treated as an architecture bug fixed in this milestone.

### Stage 2 — Resolver Reuse (cross-track dependency: v8.2 RESL-01/02/03)

- [x] **STAGE2-01**: Sales-email Stage 2 resolves customers by reusing the v8.2 NXT resolver via per-swarm config (`stage2_entity_resolver` + `resolution_config`, the RESL-03 dynamic-dispatch seam) — **zero Engine code changes** (the cross-swarm generality proof). Sequenced to land as the v8.2 seam lands; interleaves with, does not block, the rest of V9.0.
- [x] **STAGE2-02**: The debtor-only self-auth resolution tier degrades to a no-op for sales (designed acceptance test); customer-less prospects fall through to Stage 3 without blocking.

### Stage 3 — Sales Intent Agent (greenfield)

- [ ] **STAGE3-01**: A sales-specific Stage 3 intent agent (new Orq `sales-intent-agent`, registered in `orq_agents`) is built; `swarm_intents` rows seeded; `swarms.stage3_coordinator_agent_key` set. Dispatch runs through the existing registry-driven Stage 3 dispatcher — no code edits to the shared dispatcher.
- [ ] **STAGE3-02**: Sales intent vocabulary is seeded from the 827-email live corpus + the Phase 86 open-set discovery surface (emerges from data + operator promotion, never hand-curated by Claude or engineer — honors the locked 2026-05-19 principle).
- [ ] **STAGE3-03**: After the Stage 1 flip, every sales email leaving Stage 1 reaches a Stage 3 verdict; intents with no Stage 4 handler land in the Kanban human-lane (Phase 76) with a clear reason — zero silent dead-letters.

### SugarCRM Decommission (dead code only — live path already off Sugar)

- [ ] **SUGAR-01**: The dead SugarCRM code surface is removed — `web/lib/automations/sales-email-analyzer/` (incl. `fetch-sugarcrm-emails.ts`), `web/app/api/automations/smeba/sugarcrm-search`, `…/write-analysis`, and the stale `zapier_tools` Sugar note — after confirming no live path depends on it.

### Cutover Verification (lightweight)

- [ ] **VERIFY-01**: The live Zapier trigger for sales is confirmed Outlook-based (not a residual SugarCRM poll), ingest health (~33/day) is monitored for `verkoop@smeba.nl` in the pipeline-health monitor, and any stuck/legacy `source='sugarcrm'` rows are dispositioned.

### Attachment Ingest — uniform cross-swarm data source (Phase 116, added 2026-06-04)

Defined at Phase 116 planning from the 4 roadmap success criteria + CONTEXT.md decisions (D-01..D-13). Folds in todo `2026-06-04-sales-ingest-attachments-gap.md`.

- [ ] **ATTACH-05**: A generic, swarm-agnostic `email_pipeline.email_attachments` table (metadata + extraction status + extracted text + storage key) + a private Supabase Storage bucket + RLS (service_role FOR ALL, authenticated FOR SELECT, no anon) + two registry switches on `public.swarms.attachment_config` (`capture`, `extract`) with global caps — sales=both-on, debtor=capture-only (D-13). Migration + codegen-drift-free, mirroring the Phase 114 D-12 generic `resolution_audit` precedent.
- [x] **ATTACH-01** (SC-1): Ingest writes attachment metadata for new mail in every onboarded swarm via one shared swarm-agnostic helper, gated by the registry `capture` switch — no per-swarm branch. Debtor capture works purely via the registry row (D-13). Metadata only at ingest (D-05).
- [x] **ATTACH-02** (SC-2): Content extraction (PDF text-layer via `unpdf`, Orq.ai Router vision fallback for scans/images) is a registry-keyed funnel step between the Stage 1 verdict and the Stage 2 request (D-01/D-02) — zero swarm-specific branches in shared workers (SWARM-02 holds); fail-soft per attachment (D-03); extract switch OFF passes through unchanged.
- [ ] **ATTACH-03** (SC-3): Stage 2 consumes attachment-derived identifiers as an additional adapter-side body-source (concatenated into `body_text`, never a new engine field) with the no-engine-diff guard still green (STAGE2-01 holds).
- [ ] **ATTACH-06**: Bulk Review detail pane shows per-attachment metadata + extraction status in the rebuilt stage-keyed shell, following the bulk-review-flow-ux design contract (D-08). No preview/download UI.
- [ ] **ATTACH-04** (SC-4): Backfill over the existing corpus via Graph `source_id` message-ids — metadata for ALL mails (closing the `has_attachments=false` blind spot), content extraction for the Stage-1-survivor slice only (D-12); fail-loud hard cap, batched, idempotent, `source_gone` fail-soft. Executed or explicitly deferred-with-rationale.

## v2 / Deferred Requirements

Tracked, not in V9.0 scope.

### Self-learning (→ V10.0)

- **Multi-operator vocabulary reconciliation** — sales vs debtor operators describing the same intent differently (`operator_id` scoping + reconciliation).
- **Reply-tracing** — outbound Outlook replies linked to the inbound `pipeline_event` via `conversation_id` as a no-form ground-truth signal (V9.0 owning the Outlook mailbox is what unlocks this later).
- **Immediate-apply new intents** — 82.4-captured new-intent labels flowing into the Stage 3 intent list automatically.

### Handlers (→ V11.0)

- **Sales Stage 4 handlers** — turning the top-N uncovered sales intents (quote-request, order-status, …) into first-class Stage 4 handlers in priority order.

## Out of Scope

| Feature | Reason |
|---------|--------|
| SugarCRM source adapter / Sugar Stage-2 account lookup | SugarCRM deprecated 2026-06-02; sales Stage 2 reuses the NXT resolver by config |
| A second (non-NXT) resolution Engine | V9.0 proves cross-*swarm* reuse of the v8.2 Engine; cross-*backend* generality stays an unbuilt designed seam |
| Self-learning synthesis / Promotion Recommender | V10.0 milestone |
| Sales Stage 4 handlers | V11.0 milestone (intent-prioritised handlers) |
| Building the v8.2 resolver Engine/Index itself | Owned by the parallel v8.2 debtor workspace (RESL-01/02); V9.0 only consumes the RESL-03 seam |

## Traceability

Which phases cover which requirements. Populated by the roadmapper.

| Requirement | Phase | Status |
|-------------|-------|--------|
| REVIEW-01 | Phase 110 | Pending |
| SWARM-01 | Phase 110 | Pending |
| SWARM-02 | Phase 110 | Pending |
| VERIFY-01 | Phase 110 | Pending |
| STAGE1-01 | Phase 111 | Pending |
| STAGE1-02 | Phase 111 | Pending |
| CLEANUP-01 | Phase 112 | Pending |
| CLEANUP-02 | Phase 112 | Pending |
| STAGE3-01 | Phase 113 | Pending |
| STAGE3-02 | Phase 113 | Pending |
| STAGE3-03 | Phase 113 | Pending |
| STAGE2-01 | Phase 114 | Complete |
| STAGE2-02 | Phase 114 | Complete |
| SUGAR-01 | Phase 115 | Pending |
| ATTACH-05 | Phase 116 | Pending |
| ATTACH-01 | Phase 116 | Complete |
| ATTACH-02 | Phase 116 | Complete |
| ATTACH-03 | Phase 116 | Pending |
| ATTACH-06 | Phase 116 | Pending |
| ATTACH-04 | Phase 116 | Pending |

**Coverage:**

- v1 requirements: 14 total (V9.0 sales pipeline)
- Phase 116 attachment requirements: 6 (ATTACH-01..06), added 2026-06-04
- Mapped to phases: 20 (Phases 110–116)
- Unmapped: 0 ✓

---
*Requirements defined: 2026-06-02 — V9.0 Sales-Email (Outlook), scoped against verified production state.*
*Last updated: 2026-06-02 — traceability populated by roadmapper (14/14 mapped to Phases 110–115).*
*Updated: 2026-06-04 — Phase 116 added ATTACH-01..06 (attachment ingest); 20/20 mapped to Phases 110–116.*
