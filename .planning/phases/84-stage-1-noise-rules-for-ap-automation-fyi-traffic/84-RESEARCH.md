# Phase 84: Stage 1 noise rules for AP-automation FYI traffic - Research

**Researched:** 2026-05-20
**Domain:** Stage 1 noise-filter registry expansion (cross-swarm) + `swarms.tenant_domains` schema add + codegen reuse
**Confidence:** HIGH (mostly verified against repo code + RFC docs)

## Summary

Phase 84 is a **pure registry / data-only phase** with one additive schema change. Eight new noise categories register against TWO swarms (`debtor-email`, `sales-email`), producing 16 `swarm_noise_categories` rows. The only structural change is `swarms.tenant_domains jsonb NOT NULL DEFAULT '[]'::jsonb`, which powers a single new rule (`own_outbound_invoice_loopback`). The Wilson-CI promotion infrastructure (Phase 60) and the LLM 2nd-pass + confidence gate (Phase 74 + 999.8) are already shipped and require no modification. D-05's "volume-adaptive shadow + corpus-evidence" gate is **operator policy on top of existing infrastructure**, not new code.

The pivotal architectural caveat: today's Stage 1 **regex code lives in `web/lib/debtor-email/classify.ts` as a static module** dispatched via `swarms.stage1_regex_module = '@/lib/debtor-email/classify'`. New regex rules for `debtor-email` are **code edits** to `classify.ts` — they are NOT stored as DB rows in `swarm_noise_categories` (that table carries `category_key` + action + label only, not regex bodies). For `sales-email` (`stage1_regex_module = null`), the only Stage 1 pass is LLM 2nd-pass, which reads the closed-list `swarm_noise_categories` keys at call-time — so adding sales-email keys is data-only. This asymmetry is the most important thing for the planner to model correctly.

**Primary recommendation:** Plan three parallel tracks — (1) one migration adding 16 `swarm_noise_categories` rows + 8 `classifier_rules` candidate rows + the `tenant_domains` column + per-swarm tenant_domains population; (2) `classify.ts` code edits adding the 8 new regex matchers for debtor-email (including the loopback rule that reads `swarms.tenant_domains`); (3) corpus spot-check fixtures (≥10 hand-confirmed positives each) committed to `CORPUS-SAMPLES.md`. The codegen pattern from `gen-entity-types.ts` is the model for a parallel `gen-tenant-domains.ts` if literal-union TS typing is wanted, BUT the existing fallback (`const TENANT_DOMAINS = [...]` in `debtor-email-coordinator.ts:50`) is fine until cross-swarm consumers materialise.

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01** — One noise category per sender pattern. **8 category keys (locked 2026-05-20)**:
  `coupa_invoice_paid_notification`, `coupa_invoice_approved_notification`, `iss_ptp_autoreply`, `frieslandcampina_portal_reject`, `m365_quarantine`, `sender_phishing_notice`, `supplier_bank_change_notification`, `own_outbound_invoice_loopback`. **Dropped**: `coupa_po_notification`, `coupa_platform_role_admin`.
- **D-02** — Stage 1 `classifier_rules` (regex Pass 1), NOT Stage 0 safety. Regex-only, no body-text safety checks.
- **D-03** — `swarms.tenant_domains jsonb NOT NULL DEFAULT '[]'::jsonb`, **shape = flat array of lowercase domain strings**, e.g. `["fire-control.nl", "moyneroberts.com"]`. Codegen pulls into classifier as literal-union (same pattern as `entity_brand`). Adding a tenant domain = INSERT + `npm run codegen`. Loopback rule body: `direction = 'inbound' AND lower(split_part(from_address, '@', 2)) = ANY(swarms.tenant_domains)`.
- **D-04** — All eight categories default to `action='categorize_archive'`. None require human review by default.
- **D-05** — **Volume-adaptive shadow gate**. Promotion to `auto_active` when EITHER (1) 7-day shadow elapsed AND Wilson-CI ≥ 0.95, OR (2) ≥10 hand-confirmed corpus positives, zero hand-confirmed FPs, AND 7-day live shadow shows no operator-flagged FPs. 7-day floor either way.
- **D-06** — Subject pattern stability check upfront. Coupa-Betaald / Coupa-Goedgekeurd templates already corpus-confirmed stable across ≥3 months.
- **D-07** — **Out**: handler logic for any of these categories. Phase 84 only stops them polluting Stage 3.
- **D-08** — **Cross-swarm by default**: all 8 categories register against BOTH `debtor-email` and `sales-email` = 16 rows. Per-swarm overrides allowed if sales-email corpus spot-check shows FP risk.

### Claude's Discretion

- Tenant-domain codegen split (separate script `gen-tenant-domains.ts` vs extending `gen-entity-types.ts`).
- Exact placement of new regex rules in `classify.ts` order (specificity-first, first-match-wins).
- Whether to put the loopback rule's domain list lookup inside `classify.ts` (synchronous import of generated file) or via the Stage 1 worker passing it in (registry read).
- Where the `CORPUS-SAMPLES.md` fixtures live (root of the phase folder confirmed by scope).

### Deferred Ideas (OUT OF SCOPE)

- Coupa PO notification noise rule (Phase 86 revisit).
- Coupa platform role-admin notifications (too low volume).
- AP master-data handler for `supplier_bank_change_notification` (V8.2 handler work).
- M365 quarantine → IT ticket handler (V8.2 handler work).
- `{primary, aliases}` shape for `tenant_domains` (YAGNI; jsonb makes future migration safe).
- Future info-routing swarm registration of these 8 rules (Phase 88 onboarding inherits them via its own INSERTs; Phase 84 only writes against EXISTING swarms).

## Phase Requirements

ROADMAP.md Phase 84 entry does not enumerate REQ-IDs. The scope sentence reads: "9 noise categories ... New `swarms.tenant_domains` column + codegen. Wilson-CI shadow gate before promotion." That count is **outdated** — CONTEXT.md 2026-05-20 calibration locked **8 categories** (`coupa_po_notification` dropped). Use CONTEXT.md's lock list as the authoritative count; flag for planner to align ROADMAP.md if needed.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Regex matching (debtor-email) | Application code (`web/lib/debtor-email/classify.ts`) | — | Code-resident regex per Phase 60 D-22; not DB-backed |
| Regex matching (sales-email) | LLM 2nd-pass (`stage-1-category-classifier`) | — | `swarms.stage1_regex_module=null` for sales-email; no Pass 1 regex module exists |
| Noise-category registry | Database (`public.swarm_noise_categories`) | App cache 60s TTL | Read via `loadSwarmNoiseCategories` in `web/lib/swarms/registry.ts` |
| Promotion gate (Wilson-CI / hysteresis) | Inngest cron (`classifier-promotion-cron.ts`) | `classifier_rule_telemetry` view | Phase 60 shipped; no Phase-84 change needed |
| Mailbox `dry_run` flip (per-mailbox safety) | Inngest cron (`labeling-flip-cron.ts`) | `debtor.labeling_settings` | Per-mailbox-and-predictor gate, separate from per-rule gate |
| Tenant-domain registry | Database (`public.swarms.tenant_domains` jsonb) | Codegen literal-union | Phase 83 stub today; Phase 84 makes it registry-driven |
| Loopback rule evaluation | `classify.ts` (in-app) reading generated TS const | Codegen on `tenant_domains` | First-match-wins regex pass already has access to `from`; needs domain-set extension |
| Corpus spot-check tooling | Standalone TS scripts (`web/debtor-email-analyzer/`) + Inngest `classifier-spotcheck-sampler` | `email_pipeline.emails` | Existing tooling, no new infra needed |

## Standard Stack

### Core (already in tree — reuse only)
| Library / Module | Version / Path | Purpose | Why Standard |
|------------------|----------------|---------|--------------|
| `@supabase/supabase-js` | already pinned | Service-role writes for registry inserts | Project standard per CLAUDE.md |
| `tsx` | already in `web/scripts/` | Codegen runner (`npm run codegen`) | Phase 69 D-03 precedent |
| `wilsonCiLower` | `web/lib/classifier/wilson` | CI lower-bound for promotion gate | Phase 60 standard; FLIP_N_MIN=50, FLIP_CI_LO_MIN=0.95, DEMOTE_CI_LO_MAX=0.92 |
| `loadSwarmNoiseCategories` | `web/lib/swarms/registry.ts` | 60s-TTL registry read with last-known-good | Phase 56.7 standard |
| `classify` (debtor-email regex) | `web/lib/debtor-email/classify.ts` | First-match-wins regex pass | Static module per Phase 74 D-03 |
| Inngest cron (`TZ=Europe/Amsterdam ...`) | `inngest.createFunction` | Daily promotion sweeps | Phase 60 standard, CLAUDE.md cron rule |

### Supporting
| Library | Purpose | When to Use |
|---------|---------|-------------|
| `classifier-corpus-backfill` Inngest fn | Re-runs `classify()` over historical corpus, seeds `classifier_rules` `n/agree` | Use after `classify.ts` edits land to backfill telemetry for new rules |
| `classifier-spotcheck-sampler` Inngest fn | Samples ≤50 hard-case rows per promotable rule into `automation_runs` for operator review | Use after corpus-backfill to surface hard cases for the 7-day shadow window |
| `debtor.labeling_settings.dry_run` | Per-mailbox safety gate; reads `labeling-flip-cron.ts` | Existing rollout safety — new categories inherit it for free |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Code-resident regex in `classify.ts` | DB-backed regex bodies in `classifier_rules.definition jsonb` | Phase 60 explicitly deferred (D-23 deferred): significant scope (regex sandbox, evaluation engine). Phase 84 must NOT take this on. |
| Separate `gen-tenant-domains.ts` script | Extend `gen-entity-types.ts` to emit two files | Separate script keeps the entity-brand generator small and single-purpose; entity codegen reads jsonb-of-objects shape, tenant_domains is a flat string array — different parsing |

**No new dependencies required.** Phase 84 is built entirely from in-tree primitives.

## Runtime State Inventory

> Phase 84 is **registry data + targeted code edits**, not a rename. Still inventoried per planner contract.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `swarm_noise_categories` rows (5 debtor-email + 5 sales-email + spam each = ~12 rows today) — Phase 84 adds 16. `swarms.tenant_domains` does not yet exist. `classifier_rules` may have rows for the new regex keys after corpus-backfill runs. | Migration adds 16 `swarm_noise_categories` rows; 8 `classifier_rules` candidate rows; column-add `swarms.tenant_domains`; per-swarm population. |
| Live service config | None — no n8n, no Datadog, no Zapier-stored regex bodies. Regex bodies live in `classify.ts` (git). | None |
| OS-registered state | None — no Windows Task Scheduler, no pm2, no systemd touched. | None |
| Secrets/env vars | `LABELING_CRON_MUTATE`, `CLASSIFIER_CRON_MUTATE` (env vars consumed by the two crons). No new env vars. | None |
| Build artifacts / installed packages | `web/lib/automations/debtor-email/coordinator/entity.generated.ts` exists today. Phase 84 may add `web/lib/automations/debtor-email/coordinator/tenant-domains.generated.ts` (or similar) if codegen extended. | Run `npm run codegen` after migration applied; commit generated files. |

**Key observation:** the static `TENANT_DOMAINS` const at `web/lib/inngest/functions/debtor-email-coordinator.ts:50` (`["smeba.nl", "smeba-fire.be", "moyneroberts.com"]`) is **already there as a Phase 83 stub** with an explicit `TODO(phase-84 D-03)` comment. The Phase 84 migration must populate the new column and `debtor-email-coordinator.ts:50` must be swapped to read from the registry/generated file (the TODO is the wiring contract).

## Architecture Patterns

### System Architecture Diagram

```
                ┌───────────────────────────┐
                │ Outlook ingest (Zapier or │
                │ business-hours cron)      │
                └───────────────┬───────────┘
                                ↓
                     Stage 0 safety worker
                                ↓
                  classifier/screen.requested
                                ↓
            ┌───────────────────────────────────┐
            │ classifier-screen-worker.ts       │
            │ 1. load swarms + noise_categories │
            │ 2. Pass 1: regex via              │
            │    STAGE1_REGEX_MODULES[swarms.   │
            │    stage1_regex_module]           │
            │    (debtor-email: classify.ts;    │
            │     sales-email: skipped → unknown)│
            │ 3. Pass 2: LLM (only if Pass 1    │
            │    returned 'unknown')            │
            │    — stage-1-category-classifier  │
            │      Orq agent, closed list = noise│
            │      keys from registry + 'unknown'│
            │ 4. emit classifier/verdict.recorded│
            └───────────────┬───────────────────┘
                            ↓
            ┌─────────────────────────────────────┐
            │ classifier-verdict-worker.ts        │
            │ swarm_noise_categories.action       │
            │ switch:                             │
            │   categorize_archive ─→ Outlook +   │
            │     iController cleanup             │
            │   swarm_dispatch      ─→ event fire │
            │   manual_review       ─→ Bulk Review│
            └─────────────────────────────────────┘

                ──── parallel infra (Phase 60) ────

            ┌──────────────────────────────────┐  daily 06:00 Amsterdam Mon-Fri
            │ classifier-promotion-cron.ts     │  reads classifier_rule_telemetry,
            │ (per-rule Wilson-CI)             │  mutates classifier_rules.status
            └──────────────────────────────────┘  iff CLASSIFIER_CRON_MUTATE=true

            ┌──────────────────────────────────┐  daily 06:00 Amsterdam Mon-Fri
            │ labeling-flip-cron.ts            │  reads agent_runs.human_verdict,
            │ (per-mailbox-per-predictor       │  flips debtor.labeling_settings.
            │  Wilson-CI)                      │  dry_run iff LABELING_CRON_MUTATE
            └──────────────────────────────────┘
```

### Recommended Project Structure (additions only)

```
supabase/migrations/
  └── 20260520_phase84_*.sql              # one or more migrations:
                                          # - swarms.tenant_domains column + populate
                                          # - 16 swarm_noise_categories rows
                                          # - 8 classifier_rules candidate rows

web/lib/debtor-email/
  └── classify.ts                         # EDIT: add 8 new regex matchers
                                          # (loopback rule reads tenant-domain list)
  └── tenant-domains.generated.ts         # NEW (optional): codegen output

web/scripts/
  └── gen-tenant-domains.ts               # NEW (optional): mirrors gen-entity-types.ts

web/lib/inngest/functions/
  └── debtor-email-coordinator.ts:50      # EDIT: swap TENANT_DOMAINS const for
                                          # registry/generated import

.planning/phases/84-.../
  └── CORPUS-SAMPLES.md                   # NEW: per-category corpus evidence
                                          # (≥10 hand-confirmed positives each)
```

### Pattern 1: Add a noise category — three-place idempotent insert
**What:** A new `swarm_noise_categories` row + (if dispatch behaviour differs) a `classifier_rules` seed row + (if debtor-email regex required) a `classify.ts` edit.
**When to use:** Every time Phase 84 adds one of the 8 categories.
**Example (from `20260511_swarm_noise_spam_key.sql` — canonical precedent):**
```sql
insert into public.swarm_noise_categories
  (swarm_type, category_key, display_label, outlook_label, action, swarm_dispatch, display_order)
values
  ('debtor-email', 'coupa_invoice_paid_notification', 'Coupa: Invoice Paid', 'Payment Admittance', 'categorize_archive', null, 80),
  ('sales-email',  'coupa_invoice_paid_notification', 'Coupa: Invoice Paid', 'Payment Admittance', 'categorize_archive', null, 80)
on conflict (swarm_type, category_key) do update set
  display_label  = excluded.display_label,
  outlook_label  = excluded.outlook_label,
  action         = excluded.action,
  swarm_dispatch = excluded.swarm_dispatch,
  display_order  = excluded.display_order,
  updated_at     = now();
```
The same migration must run for each of the 8 keys × 2 swarms. Outlook label re-use: most map to existing "Payment Admittance" / "Auto-Reply" / "Spam" / "System Notification"; new labels create new Outlook categories and need operator confirmation.

### Pattern 2: Schema add with RLS — `swarms.tenant_domains`
**What:** ALTER TABLE adding the new column. RLS already enabled on `public.swarms` (verified `20260429b_swarm_registry.sql:68`).
**Example:**
```sql
ALTER TABLE public.swarms
  ADD COLUMN IF NOT EXISTS tenant_domains jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Per-swarm population in the SAME migration (operator-verified lists):
UPDATE public.swarms
  SET tenant_domains = '["smeba.nl","smeba-fire.be","moyneroberts.com","fire-control.nl"]'::jsonb
WHERE swarm_type = 'debtor-email';

UPDATE public.swarms
  SET tenant_domains = '["smeba.nl"]'::jsonb  -- example; operator confirms
WHERE swarm_type = 'sales-email';
```
No new RLS policies needed (table already has `service_role manages swarms` + `authenticated reads swarms`).

### Pattern 3: Codegen extension
**What:** Mirror `web/scripts/gen-entity-types.ts` for tenant_domains.
**Generator output shape (suggested):**
```typescript
// web/lib/automations/debtor-email/coordinator/tenant-domains.generated.ts
export const TENANT_DOMAINS_BY_SWARM = {
  "debtor-email": ["fire-control.nl","moyneroberts.com","smeba-fire.be","smeba.nl"],
  "sales-email":  ["smeba.nl"],
} as const;
```
Alphabetical sort per swarm (precedent: `gen-entity-types.ts:52` `const sorted = [...codes].sort()`). Idempotency: read existing file, skip write if identical (precedent: `gen-entity-types.ts:85-90`).

### Pattern 4: Wilson-CI promotion (NO change to infrastructure)
**Existing flow** (verified `classifier-promotion-cron.ts`):
1. Cron reads `classifier_rule_telemetry` view (groups `agent_runs` by `swarm_type, rule_key`, counts `human_verdict in ('approved','edited_minor')` as agreement).
2. Per `(swarm_type, rule_key)`: compute `wilsonCiLower(n, agree)`.
3. `shouldPromote` / `shouldDemote` helpers in `web/lib/classifier/wilson` use N≥30 floor.
4. Mutation gated by `CLASSIFIER_CRON_MUTATE=true` env var; default = shadow mode (writes `classifier_rule_evaluations` only).
5. `manual_block` rules NEVER auto-touched.

**D-05 gate semantics layer on top — operator policy, not new code:** the planner decides when to flip `CLASSIFIER_CRON_MUTATE`, or alternatively just pre-promotes specific `classifier_rules.status` to `'promoted'` once the corpus-evidence path is satisfied (operator hand-write to the table). No new gate code is required.

### Anti-Patterns to Avoid
- **DON'T put regex bodies in `swarm_noise_categories`.** That table has only `category_key`, `display_label`, `outlook_label`, `action`, `swarm_dispatch`, `display_order`, `enabled`, `requires_orchestration`. Regex stays in `classify.ts` (Phase 60 D-22, Phase 84 D-02 locked).
- **DON'T add a `swarm_intents` row for any of the 8 categories.** Hard separation rule (RFC, repeated in CLAUDE.md): a key is in EXACTLY ONE of `swarm_noise_categories` OR `swarm_intents`. Stage 1 noise keys MUST NOT appear in `swarm_intents`. Verified by `20260507_phase75_swarm_categories_data_cleanup.sql` deleting intent rows from the noise table.
- **DON'T destructure `inngest.send`** when wiring any new event (CLAUDE.md learning `dae6276` + Phase 65 commit `dae6276`).
- **DON'T put cron strings inside `/** */` JSDoc** — `*/N` closes the comment (CLAUDE.md learning `eb434cfd`).
- **DON'T hand-edit `*.generated.ts`** (gen-entity-types precedent + CLAUDE.md Phase 69 D-03).
- **DON'T add a SECURITY DEFINER function without `SET search_path`** (CLAUDE.md Supabase patterns).
- **DON'T grant anon writes** on any new policy (CLAUDE.md + `20260520_harden_rls.sql`).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Wilson-CI math | Custom binomial CI in TS | `wilsonCiLower(n, agree)` from `web/lib/classifier/wilson` | Phase 60 standard; helpers `shouldPromote` / `shouldDemote` already encode N≥30 + 0.95/0.92 hysteresis |
| Promotion cron | New Inngest fn for Phase 84 rules | Existing `classifier-promotion-cron.ts` — it auto-picks up new `(swarm_type, rule_key)` pairs from `classifier_rule_telemetry` | Zero-touch generalisation |
| Corpus re-classification | Bespoke script per category | Existing `classifier-corpus-backfill` Inngest fn — re-runs `classify()` over corpus, seeds `classifier_rules.n/agree` | Runs over the 6,114-email LLM corpus with paging already correct (1k-batch) |
| Spot-check sampling | Custom UI | Existing `classifier-spotcheck-sampler` Inngest fn — emits ≤50 hard-case rows per rule into `automation_runs` for operator review | Renders in existing review UI |
| Registry cache | Per-call DB read | `loadSwarmNoiseCategories` / `loadSwarm` from `web/lib/swarms/registry.ts` — 60s TTL, last-known-good on error | Standard everywhere; <50µs cached read |
| Codegen | Manual `*.generated.ts` edits | Mirror `web/scripts/gen-entity-types.ts` (read registry → sort → render → idempotent write) | Phase 69 D-03 standard; CI gate `npm run codegen && git diff --exit-code` |
| Outlook label management | New label invention per category | Map to existing labels (`Payment Admittance`, `Auto-Reply`, `Spam`, `System Notification`) where possible | Operator already uses these; less Outlook setup friction |

**Key insight:** Phase 84 is **almost entirely an INSERT + 8 regex matchers**. Every piece of infrastructure (promotion, telemetry, dispatch, spot-check, cache, codegen) exists. Resist the urge to add new files where the existing framework already handles it.

## Common Pitfalls

### Pitfall 1: Hard-separation invariant breach
**What goes wrong:** Adding a Phase 84 key to BOTH `swarm_noise_categories` AND `swarm_intents` would violate the locked Phase 75 contract. Stage 3 prompt would expose a noise key as a selectable intent, regressing to the pre-75 state.
**Why it happens:** "Cross-cutting" categories like `m365_quarantine` feel orthogonal to both noise and intent; a tired planner may register both.
**How to avoid:** Only `swarm_noise_categories` writes in Phase 84. Verify with: `SELECT category_key FROM swarm_noise_categories WHERE swarm_type='debtor-email' INTERSECT SELECT intent_key FROM swarm_intents WHERE swarm_type='debtor-email';` must return zero rows post-migration.
**Warning signs:** Stage 3 LLM proposing one of the Phase 84 keys as an intent in shadow logs.

### Pitfall 2: Regex specificity ordering
**What goes wrong:** `classify.ts` is first-match-wins. A new broad regex (e.g., `iss_ptp_autoreply` matching `Automatisch antwoord:`) placed BEFORE the existing `auto_reply` rule could swallow generic OoO traffic and misclassify it. Inverse risk for `supplier_bank_change_notification` — a sender-domain-only rule could swallow legitimate AR inbound.
**Why it happens:** New rules appended to end of file by default; specificity ordering not maintained.
**How to avoid:** Sender+subject combined anchors (D-06 + Coupa-Betaald template `Factuur \d+ gemarkeerd als Betaald door ISS`); place new rules BEFORE the broad `SUBJECT_AUTO_REPLY` and `SENDER_PAYMENT_ROLE` matchers. Phase 60-09 commit pattern: explicit negative-lookahead (e.g., `(?!FP-)` for FP- portal IDs) when a narrow exception is needed.
**Warning signs:** Corpus-backfill `agree` count drops for existing rules after Phase 84 ships.

### Pitfall 3: Loopback rule misses `direction` guard
**What goes wrong:** Without the `direction='inbound'` guard (D-03), a sender-spoofed external email claiming `from: administratie@fire-control.nl` would be auto-archived. R-02 risk.
**Why it happens:** The Stage 1 `classify({subject, from, bodySnippet})` signature does NOT today carry `direction` — `classifier-screen-worker.ts:201` notes "sender_email is not on the classifier/screen.requested payload."
**How to avoid:** Either (a) widen the `classify()` signature to accept `direction`, OR (b) evaluate the loopback rule in the Stage 1 worker (post-`classify()`) where `direction` is in scope. Option (b) keeps `classify.ts` pure and decouples the rule from the regex module's narrow input. Recommend Option (b): worker reads `swarms.tenant_domains` via registry cache, applies the loopback check after Pass 1 if no regex matched and the address indicates loopback.
**Warning signs:** Operator sees a customer reply (external sender, but from-address spoofs the tenant) auto-archived during 7-day shadow.

### Pitfall 4: Codegen drift between migration and generated file
**What goes wrong:** Migration runs, `tenant_domains` populated, but `tenant-domains.generated.ts` not regenerated before commit → loopback rule reads stale list, silently doesn't fire for newly registered domains.
**Why it happens:** Operator forgets `npm run codegen` between two-step changes.
**How to avoid:** CI gate `npm run codegen && git diff --exit-code` (CLAUDE.md Phase 69 D-03). Make it a wave-0 plan task.
**Warning signs:** Post-deploy spot-check shows 0 loopback matches even though Fire Control corpus has multiple confirmed loopbacks.

### Pitfall 5: Sales-email has no Pass 1 regex module
**What goes wrong:** Planning the Phase 84 rules as "regex bodies" assumes sales-email picks them up the same way debtor-email does. It doesn't — `swarms.stage1_regex_module = null` for sales-email; only Pass 2 LLM runs.
**Why it happens:** Sales-email symmetry is assumed.
**How to avoid:** For sales-email, the rules ARE registry-only — adding the `swarm_noise_categories` row makes the LLM include them in the closed-list prompt. NO regex code edit for sales-email. This matches the 2026-05-11 `swarm_noise_spam_key` precedent verbatim (its migration comment explicitly documents this asymmetry).
**Warning signs:** Confusion in the plan about where the sales-email regex lives. Answer: there is no sales-email regex.

### Pitfall 6: D-05 corpus-evidence path lacks an explicit storage location
**What goes wrong:** Operator hand-confirms ≥10 positives but evidence not committed → promotion gate cannot be verified.
**Why it happens:** `CORPUS-SAMPLES.md` is the scope-listed location, but no tooling enforces it.
**How to avoid:** Pre-commit hook OR plan task that explicitly writes the file with email_id references per category. Use existing `web/debtor-email-analyzer/src/search-emails.ts` or `sample-bodies.ts` (verified present) to pull candidates; copy email_ids + subject + sender + verdict into `CORPUS-SAMPLES.md`.
**Warning signs:** Promotion to `auto_active` requested with `CORPUS-SAMPLES.md` empty or under-populated.

### Pitfall 7: Sales-email FP risk for cross-swarm rules (R-04)
**What goes wrong:** A category fine for debtor-email (e.g., `m365_quarantine`) may have a legitimate sales-email use case (e.g., a sales rep being CC'd on a quarantine review). Cross-swarm default surfaces an FP only visible in sales-email corpus.
**Why it happens:** Spike 003 quantified 56% cross-swarm transferability — meaning 44% have swarm-specific risk.
**How to avoid:** For each of the 8 categories, a corpus spot-check against the **sales-email** corpus (not just debtor-email) must run in Wave 0. Drop the sales-email row if the operator flags any FP. CONTEXT.md R-04 mitigation: 7-day parallel shadow + per-swarm rollback.
**Warning signs:** Sales-email operator manually overrides a Phase 84 category mid-shadow.

### Pitfall 8: Replay-unsafe id generation
**What goes wrong:** Any `crypto.randomUUID()` or `Date.now()` outside `step.run` in new Inngest paths regenerates on replay → INSERT key A, UPDATE on key B.
**Why it happens:** CLAUDE.md Phase 65 learning (`dae6276` for `this`-binding, `dd2583a` for replay-id). Phase 84 likely doesn't need new Inngest fns, but if it does, the rule still applies.
**How to avoid:** Generate inside `step.run`. Phase 84's plan should NOT add new Inngest functions — existing infrastructure handles it.

## Code Examples

Verified patterns from in-tree sources.

### Adding noise rows for multiple swarms (idempotent UPSERT)
```sql
-- Source: supabase/migrations/20260511_swarm_noise_spam_key.sql (verbatim pattern)
insert into public.swarm_noise_categories
  (swarm_type, category_key, display_label, outlook_label, action, swarm_dispatch, display_order)
values
  ('debtor-email', 'iss_ptp_autoreply', 'ISS PtP auto-reply', 'Auto-Reply', 'categorize_archive', null, 70),
  ('sales-email',  'iss_ptp_autoreply', 'ISS PtP auto-reply', 'Auto-Reply', 'categorize_archive', null, 70)
on conflict (swarm_type, category_key) do update set
  display_label  = excluded.display_label,
  outlook_label  = excluded.outlook_label,
  action         = excluded.action,
  swarm_dispatch = excluded.swarm_dispatch,
  display_order  = excluded.display_order,
  updated_at     = now();
```

### Loopback evaluation in the Stage 1 worker (recommended placement, Pitfall 3)
```typescript
// Inside classifier-screen-worker.ts AFTER regex pass returned 'unknown',
// BEFORE the LLM 2nd-pass invocation. Pseudocode based on
// loadSwarm() / TENANT_DOMAINS pattern verified in
// web/lib/inngest/functions/debtor-email-coordinator.ts:50

const swarm = await loadSwarm(admin, swarm_type);
const tenantDomains = (swarm?.tenant_domains as string[] | undefined) ?? [];
const fromDomain = from.split("@")[1]?.toLowerCase() ?? "";
if (direction === "inbound" && tenantDomains.includes(fromDomain)) {
  return { category: "own_outbound_invoice_loopback", matchedRule: "loopback_tenant_domain" };
}
// otherwise fall through to LLM 2nd-pass as today
```
**Caveat:** `direction` is NOT on the `classifier/screen.requested` event today (verified `classifier-screen-worker.ts:201` comment). The plan must EITHER widen the event payload, OR look up direction from `email_pipeline.emails` in the worker. Source: `web/lib/inngest/functions/classifier-screen-worker.ts:201`.

### Codegen idempotency pattern (mirror gen-entity-types.ts)
```typescript
// Source: web/scripts/gen-entity-types.ts:82-92 (verbatim shape)
const existing = existsSync(OUTPUT_PATH)
  ? readFileSync(OUTPUT_PATH, "utf8")
  : null;
if (existing === next) {
  console.log("[gen-tenant-domains] already up-to-date — no write");
  return;
}
writeFileSync(OUTPUT_PATH, next, "utf8");
```

### Standalone TS for corpus spot-check sampling (CLI invocation)
```bash
# Source: web/debtor-email-analyzer/ — existing tooling per CLAUDE.md
cd web/debtor-email-analyzer
npx tsx src/search-emails.ts                     # full-text search
npx tsx src/sample-bodies.ts                     # body snippet dump
# Or Inngest:  inngest dashboard → fire classifier/spotcheck.queue
#   { "max_per_rule": 50, "triggeredBy": "phase-84-corpus-evidence" }
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Hardcoded `AUTO_ACTION_RULES` `Set` in `ingest/route.ts:39-46` | `classifier_rules` table with Wilson-CI promotion cron | Phase 60 (shipped 2026-04-29) | Phase 84 inherits this — adding `(swarm_type, rule_key)` is data-only |
| Single `swarm_categories` table mixing noise + intents | Hard split: `swarm_noise_categories` (Stage 1) + `swarm_intents` (Stage 3) | Phase 75 (shipped 2026-05-07) | Phase 84 must respect the invariant |
| Hand-curated brand list in code | Build-time codegen of `entity.generated.ts` from `swarms.entity_brand` jsonb | Phase 69 D-03 | Phase 84 reuses the pattern for `tenant_domains` |
| Synchronous Stage 1 dispatch in `ingest/route.ts` | `classifier-screen-worker.ts` Inngest fn | Phase 74 / Phase 82.2 Plan 06 | Adding categories no longer requires touching the ingest route |
| Stage 1 regex-only Pass 1 | Two-pass (regex Pass 1 → LLM Pass 2 on `unknown`) | Phase 74 | Phase 84 lives in Pass 1 entirely — no new LLM prompt needed |

**Deprecated / outdated:**
- ROADMAP.md line 111 still says "9 noise categories" — outdated; CONTEXT.md 2026-05-20 lock is **8**. (`coupa_po_notification` dropped per `<domain>` "Dropped from scope".) Flag for planner.

## Project Constraints (from CLAUDE.md)

- **Test-first:** acceptance/test credentials by default; production-only write requires explicit confirmation (CLAUDE.md). N/A for Phase 84 since work targets the prod registry directly via service-role; but the CONTEXT.md 7-day shadow window IS the production-safety equivalent.
- **Service role for automation writes** (no RLS server-side); never grant anon writes.
- **RLS verified** on `public.swarms` and `public.swarm_noise_categories` (`20260429b_swarm_registry.sql:67-83`). Phase 84 column add inherits.
- **Pre-push hook** `npm run check:supabase` fails CI on any ERROR-level advisor lint. Phase 84 migrations must pass — column-add with default does NOT trigger `rls_disabled_in_public`.
- **No cron strings in JSDoc** (`*/N` closes the comment).
- **Inngest:** all side effects in `step.run`; non-deterministic ids generated inside `step.run`; never destructure `inngest.send`.
- **Supabase migrations:** copy `supabase/migrations/_template.sql`; include ENABLE RLS + at least one policy (for new tables; column-adds inherit).
- **Codegen drift gate:** `npm run codegen && git diff --exit-code`. Phase 84 must wire this if it adds a codegen output.
- **Build-time codegen for registry-driven literal-union TS types** (Phase 69 D-03) — the pattern Phase 84 D-03 reuses.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| n/a | ROADMAP.md Phase 84 entry does not declare REQ-IDs | CONTEXT.md `<scope>` and `<verification>` blocks are the de-facto requirement source. Planner should treat the 6 success criteria as REQ-84-01..06. |

Suggested mapping (planner can lock IDs):
- REQ-84-01: 16 `swarm_noise_categories` rows live and `auto_active` for both swarms (CONTEXT verification §1).
- REQ-84-02: `own_outbound_invoice_loopback` catches Fire Control case (§2).
- REQ-84-03: `general_inquiry` + `other` ranked-top volume drops ~8-10 / 2 weeks (§3).
- REQ-84-04: `payment_dispute` ranked-top volume drops ~3-6 / 2 weeks (§4).
- REQ-84-05: No FPs in 7-day shadow per category gate D-05 (§5).
- REQ-84-06: `swarms.tenant_domains` populated for every existing swarm; codegen committed (§6).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | [ASSUMED] Pre-existing `n/agree` counters in `classifier_rules` can be seeded by `classifier-corpus-backfill` over the 6,114-email corpus, and that corpus already contains examples of the new Phase 84 categories. | Don't Hand-Roll / Wilson-CI | If the Phase 84 senders are absent from the 6,114-row corpus, corpus-backfill returns N=0 and the Wilson-CI gate cannot fire on the live shadow alone. Mitigation: D-05 corpus-evidence path handles this exact case (≥10 hand-confirmed positives + zero hand-confirmed FPs). |
| A2 | [ASSUMED] The `m365_quarantine` Outlook label maps cleanly to the existing "System Notification" or similar label; no new Outlook category creation required. | Pattern 1 | If operator wants a dedicated "Quarantine" label, a one-time Outlook setup step is needed per shared mailbox. Low risk — operator-confirmable in planning. |
| A3 | [ASSUMED] The `classifier-screen-worker.ts` event payload widening to carry `direction` (per Pitfall 3) is acceptable — alternative is a worker-side DB lookup of `email_pipeline.emails.direction`, which adds one query per Stage 1 invocation. | Code Examples — loopback evaluation | If event widening rejected (e.g., breaks producer contract), the per-call DB lookup is the fallback. Both viable. |
| A4 | [ASSUMED] Phase 86's `intent_proposals_v1` does not yet exist, so Phase 84 does not need to coordinate with it. | Architecture diagram | Verified: ROADMAP shows Phase 86 unblocked but not shipped. Risk = false. |
| A5 | [CITED `web/lib/inngest/functions/debtor-email-coordinator.ts:50`] Today's static `TENANT_DOMAINS = ["smeba.nl","smeba-fire.be","moyneroberts.com"]` is the only consumer of the concept. | Runtime State Inventory | Verified by grep — only one occurrence outside migrations & generated files. |
| A6 | [ASSUMED] Sales-email corpus is large enough for D-05 corpus-evidence (≥10 hand-confirmed per category). | Pitfall 7 | If a category has <10 positives in sales-email corpus, drop that swarm's row per CONTEXT.md R-04 mitigation. Operator-decidable. |

## Open Questions

1. **Where does the per-call `direction` value come from at Stage 1?**
   - What we know: `classifier-screen-worker.ts:201` notes `sender_email` is not on the event payload today; `direction` likely isn't either.
   - What's unclear: Does the producer (`stage-0-safety-worker.ts`) have `direction` at hand, or must the screen-worker JOIN `email_pipeline.emails`?
   - Recommendation: planner-time grep + decide event-widening vs worker-side lookup. Either works; event-widening is cleaner.

2. **Should the Coupa-Betaald / Goedgekeurd subject regexes match on `door ISS` ONLY, or generalise to `door {VENDOR}`?**
   - What we know: D-06 anchors the templates on `door ISS`. Corpus 2026-05-20 also surfaced "door CBRE" variants (legitimate dispute traffic) which MUST stay in Stage 3.
   - What's unclear: Whether the CBRE-Betaald subject template exists at all and would be safe to add (probably not, given the dispute risk for CBRE in CONTEXT.md `<domain>`).
   - Recommendation: Phase 84 ships `door ISS` only. CBRE-variant added later via the normal `swarm_noise_categories` INSERT flow once a clean CBRE-Betaald corpus exists.

3. **What's the exact rule_key naming convention?**
   - What we know: Existing rule_keys: `subject_paid_marker`, `payment_subject`, `mailbox_flip:smeba:regex`. LLM synthetic keys: `llm:{category}:{confidence}`.
   - What's unclear: Should Phase 84 rules be `noise:coupa_invoice_paid_notification` or just `coupa_invoice_paid_notification`?
   - Recommendation: Match the category_key directly (simpler; `classifier_rule_telemetry` joins `agent_runs.rule_key` to `classifier_rules.rule_key` by string equality — no namespace required). Mirrors today's `payment_admittance` rollup pattern.

4. **Does codegen produce a per-swarm map or a flat list?**
   - What we know: `gen-entity-types.ts` produces `ENTITY_BRANDS = [...]` (flat) — but that's a single-swarm consumer.
   - What's unclear: With cross-swarm tenant domains, do we want `TENANT_DOMAINS_BY_SWARM = { "debtor-email": [...], "sales-email": [...] }` (a map) or a flat list keyed at call-time?
   - Recommendation: per-swarm map — the loopback rule needs to scope by `swarm_type` and a flat list would conflate. Matches D-03 intent.

5. **Should Phase 84's regex edits land in one commit or per-category commits?**
   - What we know: CLAUDE.md prefers per-feature commits; Phase 60 / 74 favoured atomic per-wave commits.
   - Recommendation: one commit per wave, NOT per category — each category needs (a) migration row, (b) classify.ts edit, (c) corpus-sample fixture together to be reviewable. Eight tiny PRs would fragment review.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Supabase (Postgres) | Migration + registry writes | ✓ | n/a (managed) | — |
| Inngest (cron + event workers) | Existing infra reuse | ✓ | n/a (managed) | — |
| Orq.ai `stage-1-category-classifier` | LLM 2nd-pass (no change) | ✓ | Active per `20260506_phase74_stage1_classifier_agent_activate.sql` | — |
| `tsx` (codegen runner) | `npm run codegen` | ✓ | in `web/package.json` | — |
| Node.js (`web/scripts/`) | Codegen script execution | ✓ | per package.json engines | — |
| `email_pipeline.emails` corpus | Corpus spot-check + corpus-backfill | ✓ | 6,114-row LLM corpus per Phase 60-08 | — |
| `web/debtor-email-analyzer/` tooling | Hand-confirmed spot-check sampling | ✓ | `search-emails.ts`, `sample-bodies.ts` present | — |

**No missing dependencies.** Phase 84 runs entirely on existing infrastructure.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (existing — verified by `web/lib/inngest/functions/__tests__/*.test.ts`) |
| Config file | `web/vitest.config.ts` (existing) |
| Quick run command | `cd web && npx vitest run classifier-screen-worker --reporter=verbose` |
| Full suite command | `cd web && npm run test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REQ-84-01 | 16 `swarm_noise_categories` rows present per swarm after migration | integration | `psql -c "select count(*) from swarm_noise_categories where category_key in (...)"` (or supabase REST) | ❌ Wave 0 — write `scripts/phase-84-verify-registry.ts` |
| REQ-84-02 | `own_outbound_invoice_loopback` rule fires on Fire Control fixture | unit | `cd web && npx vitest run classify -t "own_outbound_invoice_loopback"` | ❌ Wave 0 — extend `web/lib/debtor-email/__tests__/classify.test.ts` (likely exists) with fixtures |
| REQ-84-02 | Loopback rule does NOT fire when `direction='outbound'` (guard) | unit | same test file | ❌ Wave 0 |
| REQ-84-02 | Loopback rule does NOT fire for external sender claiming tenant domain (defence-in-depth verification of D-03 guard) | unit | same | ❌ Wave 0 |
| REQ-84-03..04 | Volume baseline drops post-deploy | manual + Supabase query | hand-run SQL against `pipeline_events` (the planner can wire to a Phase 87 baseline) | manual-only — operator validates during 7-day shadow |
| REQ-84-05 | No FP in 7-day shadow per category | manual | Bulk Review operator sweep | manual-only |
| REQ-84-06 | `swarms.tenant_domains` populated for every swarm row | integration | `psql -c "select swarm_type, jsonb_array_length(tenant_domains) from swarms"` | ❌ Wave 0 |
| REQ-84-06 | Codegen output matches DB | integration / CI gate | `cd web && npm run codegen && git diff --exit-code` | ✓ if codegen extended; ❌ if separate script — Wave 0 |
| Static-check | New category keys do NOT appear in `swarm_intents` (hard separation) | integration | `select swarm_type, category_key from swarm_noise_categories where (swarm_type, category_key) in (select swarm_type, intent_key from swarm_intents)` returns 0 rows | ❌ Wave 0 — add to `web/__tests__/static-checks/` |
| Replay-safety | Any new Inngest writes use `step.run`-bound UUIDs | static | grep test | N/A — Phase 84 should NOT add new Inngest fns |

### Sampling Rate
- **Per task commit:** `cd web && npx vitest run classify --reporter=basic` (fast, classify-only)
- **Per wave merge:** `cd web && npm run test` + `cd web && npm run codegen && git diff --exit-code`
- **Phase gate:** Full suite green + `npm run check:supabase` clean + 7-day shadow telemetry reviewed before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `web/lib/debtor-email/__tests__/classify.test.ts` — 8 new test groups (one per category), 3 fixtures per group (positive / negative / boundary). Loopback group gets +3 for tenant-domain edge cases.
- [ ] `web/__tests__/static-checks/swarm-hard-separation.test.ts` — query both registries, fail if intersection non-empty.
- [ ] `scripts/phase-84-verify-registry.ts` — post-migration smoke (16 rows × 2 swarms; `tenant_domains` populated per swarm).
- [ ] `web/scripts/gen-tenant-domains.ts` (NEW) — codegen script if codegen approach chosen.
- [ ] `web/package.json` — extend `codegen` npm script to chain both generators if separate.
- [ ] `.planning/phases/84-*/CORPUS-SAMPLES.md` — ≥10 hand-confirmed positives per category × 8 categories × per-swarm sales-email check per D-08.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Phase 84 only writes to registry; auth handled by Supabase service-role |
| V3 Session Management | no | n/a |
| V4 Access Control | yes | Service-role-only writes on `swarms` + `swarm_noise_categories`; RLS already enforces. No anon writes (CLAUDE.md). |
| V5 Input Validation | yes | New regex patterns must be ReDoS-safe (no catastrophic backtracking); JSONB tenant_domains validated via codegen |
| V6 Cryptography | no | n/a |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Sender-spoofing of tenant domain to abuse loopback rule | Spoofing | `direction='inbound'` guard (D-03); 7-day shadow with operator review (D-05) |
| ReDoS via complex new regex (e.g., nested quantifier in Coupa subject) | DoS | Reuse existing pattern shape from `classify.ts` (verified-safe by Phase 60-08 corpus run); avoid nested `(...)+` |
| Privilege escalation via registry write | Elevation | Service-role-only; RLS already enforces (`20260429b_swarm_registry.sql:67-83`) |
| Stale `tenant_domains` enables silent miss of new tenant onboarding | Tampering / Integrity | `NOT NULL DEFAULT '[]'` so column always present; codegen CI gate catches drift (D-03 R-05 mitigation) |
| Hard-separation invariant breach silently registers a noise key as Stage 3 intent | Tampering / Integrity | New static-check test in Wave 0 (Validation Architecture) |

## Sources

### Primary (HIGH confidence — verified in repo)
- `docs/agentic-pipeline/stage-1-regex.md` — Stage 1 two-pass architecture (RFC, locked)
- `docs/agentic-pipeline/README.md` — 5-stage funnel + tenancy
- `.planning/phases/84-.../84-CONTEXT.md` — locked Phase 84 decisions (D-01..D-08)
- `.planning/phases/60-.../60-CONTEXT.md` — Wilson-CI promotion infrastructure
- `supabase/migrations/20260429b_swarm_registry.sql` — swarms + swarm_categories schema + RLS
- `supabase/migrations/20260504b_swarms_registry_generalisation.sql` — Phase 68 column additions (stage1_regex_module, entity_brand, canonical_context_shape)
- `supabase/migrations/20260507_phase75_swarm_categories_rename_to_noise.sql` — Phase 75 rename + hard-separation establishment
- `supabase/migrations/20260507_phase75_swarm_categories_data_cleanup.sql` — explicit DELETE of intent keys from noise table
- `supabase/migrations/20260511_swarm_noise_spam_key.sql` — canonical precedent for the Phase 84 INSERT pattern (cross-swarm row pair)
- `supabase/migrations/20260506_phase74_sales_email_seed.sql` — sales-email seed with `stage1_regex_module=null`
- `supabase/migrations/20260428_classifier_rules.sql` — classifier_rules schema
- `supabase/migrations/20260428_classifier_rule_telemetry.sql` — telemetry view
- `web/lib/swarms/registry.ts` — `loadSwarmNoiseCategories`, `loadSwarm`, 60s TTL cache
- `web/lib/swarms/types.ts` — `SwarmRow`, `SwarmNoiseCategoryRow` (no `tenant_domains` field yet)
- `web/lib/inngest/functions/classifier-screen-worker.ts` — Stage 1 dispatch (verified registry-driven, `STAGE1_REGEX_MODULES` static map)
- `web/lib/inngest/functions/classifier-verdict-worker.ts` — action switch on `swarm_noise_categories.action`
- `web/lib/inngest/functions/classifier-promotion-cron.ts` — per-rule Wilson-CI promotion (no Phase 84 change needed)
- `web/lib/inngest/functions/labeling-flip-cron.ts` — per-mailbox-per-predictor flip; FLIP_N_MIN=50, 0.95/0.92 gates
- `web/lib/inngest/functions/debtor-email-coordinator.ts:46-50` — explicit `TODO(phase-84 D-03)` and static `TENANT_DOMAINS` const
- `web/lib/inngest/functions/classifier-corpus-backfill.ts` — corpus re-classification fn
- `web/lib/inngest/functions/classifier-spotcheck-sampler.ts` — spot-check sampling fn
- `web/lib/debtor-email/classify.ts` — Stage 1 regex (first-match-wins, code-resident)
- `web/scripts/gen-entity-types.ts` — codegen precedent (idempotent, alphabetical sort)
- `web/lib/swarms/brand-register.ts` — codegen consumer pattern
- `web/debtor-email-analyzer/src/` — corpus tooling (`search-emails.ts`, `sample-bodies.ts`, etc.)
- `supabase/migrations/_template.sql` — RLS template
- `CLAUDE.md` — Supabase / Inngest / codegen rules
- `.claude/skills/spike-findings-agent-workforce/references/info-routing-swarm-phase-88.md` — cross-swarm transferability quantification (56%), forward Phase 88 dependency confirmation
- `.planning/ROADMAP.md` — Phase 84 entry (note: still says "9 categories" — outdated vs CONTEXT lock of 8)

### Secondary (MEDIUM confidence)
- `supabase/migrations/20260512_phase9998_agent_runs_predictor.sql` — Phase 999.8 per-predictor split (referenced by labeling-flip-cron rewrite)

### Tertiary (LOW confidence — flagged in Assumptions Log)
- Whether the existing 6,114-row corpus contains enough Phase-84-sender examples for `classifier-corpus-backfill` to seed non-zero `n` (A1)
- Sales-email corpus depth for D-08 per-swarm corpus check (A6)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every primitive verified in tree
- Architecture: HIGH — RFC docs are locked, registry shape verified by migrations
- Pitfalls: HIGH — drawn from Phase 60-09, Phase 65 commit history, CLAUDE.md learnings, Phase 75 cleanup migration
- D-05 gate semantics: MEDIUM — operator policy on shipped infrastructure; planner should confirm the exact ops procedure
- Codegen split decision: MEDIUM — both options viable; planner picks at planning time
- Sales-email FP risk surface: LOW — Spike 003 quantified cross-swarm transferability at 56%, but per-category sales-email corpus inspection has not happened yet (Wave 0 work)

**Research date:** 2026-05-20
**Valid until:** 2026-06-20 (30 days — Stage 1 infra is stable; only the Phase 86 discovery surface lands in v8.1 and is independent)

## RESEARCH COMPLETE

**Phase:** 84 - Stage 1 noise rules for AP-automation FYI traffic
**Confidence:** HIGH

### Key Findings

1. **Phase 84 is data + 8 regex matchers, not infrastructure.** Wilson-CI cron (`classifier-promotion-cron.ts`), per-mailbox flip cron (`labeling-flip-cron.ts`), corpus-backfill / spot-check Inngest fns, registry cache layer, codegen pattern, RLS — all shipped. New code = 8 regex matchers in `classify.ts` + one optional codegen script.
2. **The debtor-email vs sales-email asymmetry is critical.** Debtor-email = code edit to `classify.ts` (because `stage1_regex_module='@/lib/debtor-email/classify'`). Sales-email = registry-only INSERT (because `stage1_regex_module=null`, only LLM 2nd-pass runs). Precedent: `20260511_swarm_noise_spam_key.sql` documents this verbatim in its comment block.
3. **Hard-separation invariant is locked and tested at the data layer** (Phase 75) — Phase 84 must add ONLY to `swarm_noise_categories`, never `swarm_intents`. A static-check test in Wave 0 should enforce.
4. **D-05 promotion gate is operator policy, not new code.** `classifier-promotion-cron.ts` already supports the Wilson-CI path; corpus-evidence is a manual pre-promotion (hand-edit `classifier_rules.status='promoted'` or pre-seed via corpus-backfill). The 7-day floor is enforced by waiting before flipping `CLASSIFIER_CRON_MUTATE`.
5. **`swarms.tenant_domains` does NOT yet exist** — confirmed by grep. A Phase 83 Plan 06 stub at `web/lib/inngest/functions/debtor-email-coordinator.ts:50` carries an explicit `TODO(phase-84 D-03)` comment. The Phase 84 migration + codegen swap retire that TODO.
6. **`classifier/screen.requested` event does NOT carry `direction` today** (per worker code comment at line 201) — the loopback rule (`own_outbound_invoice_loopback`) needs either an event-payload widening or a worker-side `email_pipeline.emails` lookup. Resolve at planning time.
7. **ROADMAP.md is stale at one line** ("9 noise categories" — CONTEXT lock is 8). Flag for planner alignment.

### File Created
`.planning/phases/84-stage-1-noise-rules-for-ap-automation-fyi-traffic/84-RESEARCH.md`

### Confidence Assessment
| Area | Level | Reason |
|------|-------|--------|
| Standard Stack | HIGH | All primitives verified in repo with file:line references |
| Architecture | HIGH | RFC docs locked; registry shape verified by 4 migrations |
| Pitfalls | HIGH | Distilled from Phase 60-09 commits, Phase 65 learnings, CLAUDE.md, Phase 75 cleanup |
| D-05 gate ops | MEDIUM | Infrastructure exists but operator runbook is policy-level |
| Sales-email FP risk | LOW | Spike 003 gave 56% transferability bound; per-category sales-email corpus check is Wave 0 work |

### Open Questions (full list in main body §Open Questions)
1. How does `direction` reach the Stage 1 worker (event widen vs DB lookup)?
2. Coupa-Betaald scope — `door ISS` only, or generalise? Recommendation: ISS-only.
3. Rule_key naming: `noise:{category_key}` vs flat `{category_key}`? Recommendation: flat.
4. Codegen output shape: per-swarm map vs flat list? Recommendation: per-swarm map.
5. Commit granularity: per-wave vs per-category? Recommendation: per-wave.

### Ready for Planning
Research complete. Planner can now create PLAN.md files. Recommended wave structure:
- **Wave 0**: tests + corpus fixtures + static checks + sales-email corpus per-category review
- **Wave 1**: migration (column add + 16 rows + 8 candidate classifier_rules + tenant_domains populate) + codegen + retire `TENANT_DOMAINS` const
- **Wave 2**: `classify.ts` 8 regex matchers + Stage 1 worker `direction`/loopback wiring
- **Wave 3**: shadow window (7d) + corpus-evidence path executed + D-05 gate satisfied → promote
