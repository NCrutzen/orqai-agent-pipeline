# Phase 84: Stage 1 noise rules for AP-automation FYI traffic - Context

**Gathered:** 2026-05-19
**Updated:** 2026-05-20 — `/gsd:discuss-phase 84` calibration round
**Status:** Ready for planning
**Source:** Stage 3 intent-distribution analysis 2026-05-19 (`payment_dispute` + `general_inquiry` + `other` deep-dive surfaced deterministic FYI senders reaching Stage 3) + 2026-05-20 corpus pull of every coupahost.com subject template.
**Milestone:** v8.1 "Validation + Visibility" — observe → understand → THEN automate. Phase 84 cleans the **input stream** by routing deterministic FYI traffic out of Stage 3 before any handler work.
**Depends on:** None hard. Can ship in parallel with Phase 83.

<domain>

## Phase Boundary

**Problem:** A meaningful slice of Stage 3 classifications today is "junk in, junk out" — emails that are FYI-only notifications from known structured senders (AP-automation portals, M365 system mail, own-domain outbound, ticketing-system auto-replies) are reaching Stage 3, getting force-binned into `general_inquiry` / `other` / sometimes `payment_dispute`, and inflating those buckets' apparent volume.

**Rule for V8.1:** these belong in `swarm_noise_categories` (Stage 1), not in Stage 3. They are deterministic by `sender_email` + subject template — no LLM judgment needed.

**Scope: register noise patterns only.** No new pipeline mechanics, no handler logic, no UI changes beyond the existing Stage 1 / classifier surfaces. Every change is a row in `swarm_noise_categories` (and/or `classifier_rules`) plus optional codegen rebuild.

**Evidence (Stage 3 events 2026-05-05..2026-05-19):**

- **Coupa "Betaald" / "Goedgekeurd voor betaling"** (`*@coupahost.com`, subjects `Factuur ######## gemarkeerd als Betaald door ISS` / `Factuur ######## is goedgekeurd voor betaling door ISS`) — 6 emails. FYI on existing invoices.
- **ISS PtP NL auto-reply** (`Invoice-PtP@nl.issworld.com`, subject `Automatisch antwoord: Documenten n.a.v. uitgevoerde werkzaamheden. Factuur: ########`) — 3 emails. Body literally says "Dit mailadres is uitsluitend bedoeld voor het automatisch verwerken van facturen. Verdere e-mails worden hier niet gelezen." Pure auto-reply.
- **FrieslandCampina supplier-portal reject** (`Robbie.Robot@frieslandcampina.com`, subject `FINAL_REMINDER_Invoice received for Candex related purchase(s)_…`) — Candex-portal routing instruction, not an inbound business message.
- **Microsoft 365 quarantine** (`q2q@apexfire.ie`, subject `Microsoft 365 security: You have messages in quarantine`) — system mail.
- **Phishing notices** (`melanie@rskinstallatie.nl`, "Uitleg pishing mail" / "Voorgaande mail niet openen") — sender-side incident notification. No action for Moyne Roberts.
- **FarmPlus bank-change notification** (`info@farmplus.nl`) — creditor announcing IBAN change. Routes to AP master-data, not debtor AR.
- **Own-domain outbound landing in own AR mailbox** (`administratie@fire-control.nl` → `administratie@fire-control.nl`, subject `Invoice 25122522` / `Invoice 25122523`) — Fire Control's own outbound invoice email arriving back in its own inbox.

**Dropped from scope during 2026-05-20 calibration:**

- **Coupa PO notifications** (`***Kopie voor referentie*** Nieuwe inkooporder NL########## is uitgegeven`, 40 emails in 4 months). Operator concern: even with the strict `***Kopie voor referentie***` prefix anchor, a noise rule that swallows new-PO notifications carries real downside if a future template variant slips through anchoring. The 2026-05-20 corpus pull confirmed neighbouring Coupa subjects that MUST stay in Stage 3 (`Factuurnummer # is gemarkeerd als betwist door ISS` × 6, `Invoice ## has been marked as Disputed by CBRE`, `Action Required - AECOM Registration Instructions` × 7, bare `CBRE (Revised) Purchase Order ##NLP#`). Decision: err toward visibility, do not filter Coupa POs in Phase 84. Revisit in V8.2 once Phase 86's discovery surface gives the operator a structured promotion path.
- **Coupa platform admin notifications** (`New payment role granted` / `New Coupa User Added`, 3 emails in 4 months). Volume too low to justify a registry row; if the cluster grows, Phase 86 will surface it.

</domain>

<canonical_refs>

## Canonical references — read before planning

- `docs/agentic-pipeline/README.md` — v8.0 5-stage funnel architecture (Stage 0 → 1 → 2 → 3 → 4) and the hard rule that a row exists in EXACTLY ONE of `swarm_noise_categories` or `swarm_intents`.
- `docs/agentic-pipeline/stage-1-regex.md` — two-pass noise filter (regex Pass 1 then LLM 2nd-pass on `unknown`). Phase 84 lives entirely in Pass 1.
- `docs/debtor-email-pipeline-architecture.md` — debtor-email implementation map; `swarm_noise_categories` registry + per-category handlers.
- `.planning/phases/60-*/60-CONTEXT.md` (and the Wilson-CI promotion mechanism shipped there) — gate for `manual_review → auto_active` flip.
- `.planning/phases/75-*/75-CONTEXT.md` — noise-vs-intent registry split (shipped 2026-05-07). Phase 84 only writes to the noise side.
- `.claude/skills/spike-findings-agent-workforce/references/info-routing-swarm-phase-88.md` — quantifies cross-swarm regex transferability (56% of debtor-email rules transfer cleanly to Smeba info-routing). Justifies D-08 cross-swarm default.
- `supabase/migrations/_template.sql` — RLS template; every new table or column ships with the standard policy block per CLAUDE.md Supabase patterns.

</canonical_refs>

<decisions>

## Implementation Decisions

### D-01 — One noise category per sender pattern, not a mega-bucket

Each cluster above gets its own `swarm_noise_categories` row keyed by a stable sender+subject regex. Reasons:

- Future telemetry needs to count "how many M365 quarantine notices did we get this week" independently of "how many supplier bank-change notifications."
- Each category may move to a real handler later (e.g., supplier bank-change → V8.2 AP master-data handler if the operator promotes it via Phase 86). Cleaner provenance.

**Final category keys (8, locked 2026-05-20):**

- `coupa_invoice_paid_notification`
- `coupa_invoice_approved_notification`
- `iss_ptp_autoreply`
- `frieslandcampina_portal_reject`
- `m365_quarantine`
- `sender_phishing_notice`
- `supplier_bank_change_notification`
- `own_outbound_invoice_loopback`

(Originally 9 — `coupa_po_notification` dropped per 2026-05-20 corpus review; see `<domain>` block "Dropped from scope".)

### D-02 — Rules express as Stage 1 `classifier_rules`, not Stage 0 safety

Stage 0 = injection/safety. These FYI patterns are not safety risks; they are *categorical noise*. They belong at Stage 1 (regex pass) so the existing two-pass noise-filter design (regex → LLM 2nd-pass) handles them deterministically without ever consulting the LLM. **Regex-only, no body-text safety checks** — keep the rule body simple.

### D-03 — `own_outbound_invoice_loopback` rule needs a tenant-domain lookup

**Problem:** the rule "if `from_address.domain == mailbox.tenant_domain` AND `direction == inbound`, treat as loopback" needs a registered tenant domain per swarm. Today the database has no place to store "this swarm's tenant domain is X".

**Decision:** add `swarms.tenant_domains jsonb NOT NULL DEFAULT '[]'::jsonb`, **shape = flat array of lowercase domain strings**, e.g. `["fire-control.nl", "moyneroberts.com"]`. Codegen pulls this into the classifier as a literal-union (same pattern as `entity_brand`). Adding a new tenant domain = INSERT + `npm run codegen`.

**Why flat array (vs `{primary, aliases}` object):** YAGNI. JSONB is migrate-friendly — if a future phase ever needs primary/alias semantics, ALTER the shape without data loss. No current tenant needs alias semantics.

**Loopback rule body:** `direction = 'inbound' AND lower(split_part(from_address, '@', 2)) = ANY(swarms.tenant_domains)`. The `direction='inbound'` guard catches the rare case of a sender-spoofed external email claiming to be from the tenant domain.

### D-04 — Action for each new noise category

All eight categories default to `action='categorize_archive'` (the standard "tag in Outlook + archive + clean from iController" path). None require human review by default. Operator can override per-category later via the existing Phase 71 4-axis surface if a category proves miscategorised.

### D-05 — Volume-adaptive shadow gate (revised from fixed 24h)

**Problem with original 24h shadow:** low-volume categories like `coupa_invoice_paid_notification` (6 emails / 4 months ≈ 1 per 2 weeks) would produce ~0 live observations in 24h, leaving Wilson-CI permanently unable to close.

**Decision:** Wilson-CI gate stays, BUT promotion to `auto_active` triggers when **either**:
1. The 7-day live shadow window has elapsed AND the Wilson-CI lower bound > 0.95, OR
2. The category's upfront corpus spot-check has ≥ 10 hand-confirmed positives (against `email_pipeline.emails` 90-day history) AND zero hand-confirmed false positives, AND a 7-day live shadow shows no false-positive flags by the operator.

In practice: high-volume categories (Coupa-Betaald, m365_quarantine, own_outbound_loopback) close on the live Wilson-CI gate within the 7-day window. Low-volume categories (ISS-PtP auto-reply, sender_phishing_notice) close on the corpus-evidence path. Either way, the 7-day shadow window is the floor — no same-day promotions.

### D-06 — Subject pattern stability check upfront

Coupa-Betaald / Coupa-Goedgekeurd subjects use `Factuur ######## gemarkeerd als Betaald door ISS` / `Factuur ######## is goedgekeurd voor betaling door ISS` — substitute digits with `#` regex, confirm template stable across ≥ 3 months of corpus. The 2026-05-20 corpus pull already confirms these two templates are stable.

### D-07 — Out: handler logic for any of these categories

M365 quarantine could trigger an IT ticket; FarmPlus / supplier bank-change could trigger an AP master-data update. **None of that lives in Phase 84.** Phase 84 only stops these emails from polluting Stage 3 distribution. Handler work waits for V8.2, after Phase 87 baseline confirms volume.

### D-08 — Cross-swarm by default (new, 2026-05-20)

**Decision:** all 8 categories register against BOTH `debtor-email` and `sales-email` swarms by default. Single source of evidence per pattern, two rows in `swarm_noise_categories`.

**Justification:**
- The senders themselves don't care which mailbox they hit — `q2q@apexfire.ie` M365 quarantine can land in any tenant mailbox, not just AR.
- Spike 003 (2026-05-19, `.claude/skills/spike-findings-agent-workforce/`) quantified that 56% of debtor-email's production regex rules transfer cleanly to a brand-new swarm (`info-routing` for `info@smeba.nl`). The 8 Phase 84 categories are deliberately the cross-cutting ones (system mail, auto-replies, phishing notices, loopback).
- `own_outbound_invoice_loopback` is *especially* cross-swarm: any swarm whose mailbox has its own outbound bouncing back hits this. Future info-routing onboarding (Phase 88) inherits the rule for free if registered cross-swarm now.

**Per-swarm overrides:** if a sales-email-specific corpus check during planning shows a category has FP risk for sales-email (e.g., a sales mailbox legitimately receives M365 quarantine reviews), drop just that swarm's row — but the default is both.

</decisions>

<scope>

## In scope

- 8 noise categories × 2 swarms (debtor-email + sales-email) = 16 INSERTs into `swarm_noise_categories`, one row per (category, swarm).
- 8 `classifier_rules` rows — one per category (rule body is swarm-agnostic; categories link back via FK).
- `swarms.tenant_domains jsonb NOT NULL DEFAULT '[]'::jsonb` column + RLS-compatible migration + codegen entry (D-03).
- Populate `tenant_domains` for every existing swarm row during the same migration (operator-verified list, committed in the migration file).
- Per-category corpus spot-check: ≥ 10 hand-confirmed positives written to `.planning/phases/84-stage-1-noise-rules-for-ap-automation-fyi-traffic/CORPUS-SAMPLES.md` for traceability.
- 7-day shadow window per category (D-05); promotion to `auto_active` when Wilson-CI or corpus-evidence gate fires.

## Out of scope

- Any Stage 4 handler for any of these categories.
- `coupa_po_notification` (dropped per 2026-05-20 calibration — see `<domain>` "Dropped from scope").
- `coupa_platform_role_admin` (skipped — volume too low).
- New noise categories discovered after Phase 84 ships — those belong in the routine `swarm_noise_categories` INSERT flow, not a phase.
- Stage 0 safety rule additions (none of these are safety patterns).
- Future info-routing swarm registration of the 8 rules — registered as part of Phase 88 onboarding, not Phase 84 (Phase 84 only writes against existing swarms).

</scope>

<verification>

## Success criteria

1. **All 8 categories live and `auto_active`** in `swarm_noise_categories` for both `debtor-email` and `sales-email`.
2. **`own_outbound_invoice_loopback` catches the Fire Control case.** Spot-check: zero `pipeline_events` rows with `stage=3 AND email.from_address ILIKE '%@fire-control.nl' AND mailbox = 'administratie@fire-control.nl'` in the 7 days after deploy.
3. **`general_inquiry` + `other` ranked-top volume drops** by the M365 + phishing + auto-reply + bank-change + loopback contribution (~8-10 emails / 2 weeks based on May 2026 baseline).
4. **`payment_dispute` ranked-top volume drops** by the Coupa-Betaald + Coupa-Goedgekeurd contribution (~3-6 emails / 2 weeks). Smaller than the original Phase 84 forecast because the 40-email Coupa PO contribution is no longer being filtered.
5. **No false positives in 7-day shadow.** Operator approves Phase 84 closure only when each category's gate (Wilson-CI ≥ 0.95 OR corpus-evidence path per D-05) is satisfied.
6. **`swarms.tenant_domains` populated for every existing swarm row** at migration time — codegen output committed alongside.

</verification>

<dependencies>

## Depends on

- Phase 60 / 74 Wilson-CI promotion infrastructure (already shipped).
- Phase 75 noise-vs-intent registry split (shipped 2026-05-07).

## Enables

- **Phase 87** — cleaner baseline. Without 84, the intent-volume baseline is contaminated by FYI traffic.
- **Phase 88** — info-routing swarm onboarding inherits the 8 cross-swarm rules for free via Phase 88's registration step (per D-08).
- **V8.2 handler scoping** — once Phase 86 + 87 produce a clean signal of what intents the operator actually sees, V8.2 picks handlers from real signal not noise.

</dependencies>

<risks>

## Risks

- **R-01 — Coupa Betaald/Goedgekeurd templates change.** ISS owns the template. Mitigation: D-06 corpus stability check; subject regex anchored on `Factuur ` prefix + ` door ISS` suffix; promotion gates on operator approval.
- **R-02 — Own-domain loopback rule misfires** if an outbound `administratie@fire-control.nl → external` gets BCC'd back to the AR mailbox AND we mis-classify the BCC. Mitigation: D-03 `direction='inbound'` guard plus the rule explicitly checks `from_address.domain ∈ tenant_domains` — a true reply from a customer never carries the tenant domain in `from_address`.
- **R-03 — Phishing-notice rule too sender-specific.** The current pattern is one supplier (`rskinstallatie.nl`). Mitigation: 84 ships only the verified pattern; if more phishing-notice senders appear, they go through normal `swarm_noise_categories` INSERT, not a new phase.
- **R-04 — Cross-swarm default surfaces a sales-email-specific false positive** that wasn't visible in debtor-email corpus. Mitigation: 7-day shadow on the sales-email rows runs in parallel; operator can drop a single swarm's row mid-shadow without affecting the other.
- **R-05 — `tenant_domains` codegen drift.** A new swarm onboarded without a `tenant_domains` entry would mean the loopback rule silently never fires for it. Mitigation: migration sets `NOT NULL DEFAULT '[]'` so the column is always present; codegen CI gate (`npm run codegen && git diff --exit-code`) catches drift from registry to literal-union.

</risks>

<deferred>

## Deferred Ideas (noted for future phases, not for Phase 84)

- **Coupa PO notification noise rule** — 40 emails / 4 months matters, but corpus review surfaced enough edge cases (bare CBRE PO, Revised PO, Disputed-by-CBRE, Action-Required registration) that we'd rather see them. Revisit in V8.2 when Phase 86's discovery surface lets the operator promote a cluster with confidence.
- **Coupa platform role-admin notifications** — 3 emails / 4 months. Below registry-row threshold. Phase 86 may auto-surface the cluster.
- **AP master-data handler for supplier bank-change** — Phase 84 filters the noise; the actual AP master-data update workflow is a V8.2 handler.
- **M365 quarantine → IT ticket handler** — same pattern; Phase 84 filters, V8.2 may automate.
- **`{primary, aliases}` shape for tenant_domains** — only if a multi-brand tenant materialises. JSONB makes the migration safe.

</deferred>
