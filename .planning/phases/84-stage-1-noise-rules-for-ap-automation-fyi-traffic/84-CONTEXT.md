# Phase 84: Stage 1 noise rules for AP-automation FYI traffic - Context

**Gathered:** 2026-05-19
**Status:** Ready for planning
**Source:** Stage 3 intent-distribution analysis 2026-05-19 (`payment_dispute` + `general_inquiry` + `other` deep-dive surfaced deterministic FYI senders reaching Stage 3)
**Milestone:** v8.1 "Validation + Visibility" — observe → understand → THEN automate. Phase 84 cleans the **input stream** by routing deterministic FYI traffic out of Stage 3 before any handler work.
**Depends on:** None hard. Can ship in parallel with Phase 83.

<domain>

## Phase Boundary

**Problem:** A meaningful slice of Stage 3 classifications today is "junk in, junk out" — emails that are FYI-only notifications from known structured senders (AP-automation portals, M365 system mail, own-domain outbound, ticketing-system auto-replies) are reaching Stage 3, getting force-binned into `general_inquiry` / `other` / sometimes `payment_dispute`, and inflating those buckets' apparent volume.

**Rule for V8.1:** these belong in `swarm_noise_categories` (Stage 1), not in Stage 3. They are deterministic by `sender_email` + subject template — no LLM judgment needed.

**Scope: register noise patterns only.** No new pipeline mechanics, no handler logic, no UI changes beyond the existing Stage 1 / classifier surfaces. Every change is a row in `swarm_noise_categories` (and/or `classifier_rules`) plus optional codegen rebuild.

**Evidence (Stage 3 events 2026-05-05..2026-05-19):**

- **Coupa PO notifications** (`*@coupahost.com`, subject `***Kopie voor referentie*** Nieuwe inkooporder NL########## is uitgegeven`) — 40 emails in 4 months on the broader corpus; ~half landed inside `payment_dispute` ranked-top. These are FYI: a new PO was issued by the customer. No reply expected.
- **Coupa "Betaald" / "Goedgekeurd voor betaling"** (same sender domain, subject `Factuur ######## gemarkeerd als Betaald door ISS` / `… goedgekeurd voor betaling …`) — 6 emails. FYI on existing invoices.
- **ISS PtP NL auto-reply** (`Invoice-PtP@nl.issworld.com`, subject `Automatisch antwoord: Documenten n.a.v. uitgevoerde werkzaamheden. Factuur: ########`) — 3 emails. Body literally says "Dit mailadres is uitsluitend bedoeld voor het automatisch verwerken van facturen. Verdere e-mails worden hier niet gelezen." Pure auto-reply.
- **FrieslandCampina supplier-portal reject** (`Robbie.Robot@frieslandcampina.com`, subject `FINAL_REMINDER_Invoice received for Candex related purchase(s)_…`) — Candex-portal routing instruction, not an inbound business message.
- **Microsoft 365 quarantine** (`q2q@apexfire.ie`, subject `Microsoft 365 security: You have messages in quarantine`) — system mail.
- **Phishing notices** (`melanie@rskinstallatie.nl`, "Uitleg pishing mail" / "Voorgaande mail niet openen") — sender-side incident notification. No action for Moyne Roberts.
- **FarmPlus bank-change notification** (`info@farmplus.nl`) — creditor announcing IBAN change. Routes to AP master-data, not debtor AR.
- **Own-domain outbound landing in own AR mailbox** (`administratie@fire-control.nl` → `administratie@fire-control.nl`, subject `Invoice 25122522` / `Invoice 25122523`) — Fire Control's own outbound invoice email arriving back in its own inbox.

</domain>

<decisions>

## Implementation Decisions

### D-01 — One noise category per sender pattern, not a mega-bucket

Each cluster above gets its own `swarm_noise_categories` row keyed by a stable sender+subject regex. Reasons:

- Future telemetry needs to count "how many Coupa PO notifications did we get this week" independently of "how many M365 quarantine notices."
- Each category may move to a real handler later (Coupa PO notifications → V8.2 `po_notification` handler if/when the operator promotes it via the Phase 86 surface). Cleaner provenance.

**Proposed category keys** (final names operator-confirmable in `/gsd-discuss-phase 84`):

- `coupa_po_issued`
- `coupa_invoice_paid_notification`
- `coupa_invoice_approved_notification`
- `iss_ptp_autoreply`
- `frieslandcampina_portal_reject`
- `m365_quarantine`
- `sender_phishing_notice`
- `supplier_bank_change_notification`
- `own_outbound_invoice_loopback`

### D-02 — Rules express as Stage 1 `classifier_rules`, not Stage 0 safety

Stage 0 = injection/safety. These FYI patterns are not safety risks; they are *categorical noise*. They belong at Stage 1 (regex pass) so the existing two-pass noise-filter design (regex → LLM 2nd-pass) handles them deterministically without ever consulting the LLM.

### D-03 — `own_outbound_invoice_loopback` rule is sender-domain == mailbox-tenant-domain

Special case: the rule needs to know the mailbox's tenant domain. Implementable as either:

- A static map in `swarms.tenant_domains` (jsonb) — preferred, registry-driven.
- A regex per swarm referencing each tenant domain literally.

**Decision:** static map on `swarms` row, codegen pulls into the classifier as a literal-union (same pattern as `entity_brand`). Adding a new tenant domain = INSERT + `npm run codegen`.

### D-04 — Action for each new noise category

All nine categories default to `action='categorize_archive'` (the standard "tag in Outlook + archive + clean from iController" path). None require human review by default. Operator can override per-category later via the existing Phase 71 4-axis surface if a category proves miscategorised.

### D-05 — Spot-check verification, not exhaustive

For each new category: produce 5-10 corpus-confirmed positive examples (from `email_pipeline.emails` history) before promotion to `auto_active`. Use Wilson-CI gate that already exists in `labeling-flip-cron` (Phase 60 mechanism). If precision drops below 95% during 24h shadow window, hold at `manual_review`.

### D-06 — Subject pattern stability check upfront

Coupa subjects use `***Kopie voor referentie***` and `Factuurnummer ######## is gemarkeerd als …` — substitute digits with `#` regex, confirm template stable across ≥ 3 months of corpus. Heijmans returns (already analysed 2026-05-19, 5/5 stable) is the model.

### D-07 — Out: handler logic for any of these categories

Coupa PO notifications could trigger an NXT order-create; M365 quarantine could trigger an IT ticket; FarmPlus bank-change could trigger an AP master-data update. **None of that lives in Phase 84.** Phase 84 only stops these emails from polluting Stage 3 distribution. Handler work waits for V8.2, after Phase 87 baseline confirms volume.

</decisions>

<scope>

## In scope

- 9 INSERTs (or however many survive `/gsd-discuss-phase` calibration) into `swarm_noise_categories`.
- `swarms.tenant_domains` column + codegen entry for D-03.
- Stage 1 `classifier_rules` rows (one per category) with sender + subject regex.
- 24h shadow window per category; promotion to `auto_active` after Wilson-CI gate.
- Spot-check corpus dump: 10 positives per category written to `.planning/phases/84-…/CORPUS-SAMPLES.md` for traceability.

## Out of scope

- Any Stage 4 handler for any of these categories.
- New noise categories discovered after Phase 84 ships — those belong in the routine `swarm_noise_categories` INSERT flow, not a phase.
- Stage 0 safety rule additions (none of these are safety patterns).

</scope>

<verification>

## Success criteria

1. **All 9 categories live and `auto_active`** in `swarm_noise_categories` for `debtor-email` (and `sales-email` where applicable — most apply cross-swarm).
2. **Coupa PO notifications no longer reach Stage 3.** Spot-check: zero `pipeline_events` rows with `stage=3 AND email.sender_email ILIKE '%coupahost.com' AND email.subject ILIKE '%inkooporder%uitgegeven%'` in the 7 days after deploy.
3. **`payment_dispute` ranked-top volume drops** by the Coupa-PO contribution (~10-15 emails / 2 weeks based on May 2026 baseline). Confirms misclassification source.
4. **`general_inquiry` + `other` ranked-top volume drops** by the M365 + phishing + auto-reply + bank-change contribution (~8-10 emails / 2 weeks).
5. **No false positives in 7-day shadow.** Operator approves Phase 84 closure only when each category's Wilson-CI lower bound > 0.95.

</verification>

<dependencies>

## Depends on

- Phase 60 / 74 Wilson-CI promotion infrastructure (already shipped).
- Phase 75 noise-vs-intent registry split (shipped 2026-05-07).

## Enables

- **Phase 87** — cleaner baseline. Without 84, the intent-volume baseline is contaminated by FYI traffic.
- **V8.2 handler scoping** — once Phase 86 + 87 produce a clean signal of what intents the operator actually sees, V8.2 picks handlers from real signal not noise.

</dependencies>

<risks>

## Risks

- **R-01 — Aggressive Coupa rule swallows a real dispute.** Coupa is multi-purpose (PO issue, paid, approved, **disputed**). The "betwist door ISS" subject pattern is the real dispute we want to *keep* in Stage 3. Mitigation: D-01 keeps each Coupa subject template as a separate rule; the "betwist" template gets NO noise rule.
- **R-02 — Own-domain loopback rule misfires** if an outbound `administratie@fire-control.nl → external` gets BCC'd back to the AR mailbox. Mitigation: D-03 plus an additional guard on `direction='inbound' AND from_address.domain = mailbox.tenant_domain`.
- **R-03 — Phishing-notice rule too sender-specific.** The current pattern is one supplier; we don't want a sender-keyed allowlist drift. Mitigation: 84 ships only the verified pattern; if more phishing-notice senders appear, they go through normal `swarm_noise_categories` INSERT, not a new phase.

</risks>
