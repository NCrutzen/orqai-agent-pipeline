# Phase 130: info@ Stage-1 noise-recalibration — Context

**Gathered:** 2026-06-16
**Status:** Ready for planning
**Source:** Operator decision + live data analysis (info-routing "unknown" pool, 30d)

<domain>
## Phase Boundary

P0 of the V9.7 Routing Swarm milestone. The info-routing swarm already ingests + runs Stage 0 (safety) and Stage 1 (noise filter) over two live mailboxes — **info@smeba.nl** (1.073/mo) and **info@fire-control.nl** (219/mo) — but routes nothing downstream (no Stage 2/3). Stage 1 currently auto-archives obvious noise (spam 473/mo, payment_admittance 28/mo → 359 auto_archived_noise events/mo) but dumps everything else into a **663/mo "unknown" pool** that a human triages by hand.

**A 120-row sample + sender-frequency analysis of that "unknown" pool shows it is ~50% latent noise that Stage 1 does not yet catch.** This phase closes that leak so the V9.7 router (Phase 131) gets a clean denominator. It does NOT build routing — only noise recalibration.

**Critical nuance from the data: the "unknown" pool is MIXED.** Several high-frequency senders are genuinely *routable* (not noise) and MUST NOT be archived:
- `adviesinveiligheid@mankr8.nl` (22/mo), `wka@unica.nl` (6), `veiligheid@pietervanforeest.nl` (3) → fire-control inspecties/ontruimingsplattegronden.
- `inkoopstatus@lasaulec.nl` (6), `procurement_be@cargill.com` (5), `heijmans@transparentglobal.com` (4), CBRE/Accor → klant-PO's / order / openstaande posten.
- `no-reply.fabk@mindef.nl` (6, "Retour van factuur") → finance/crediteuren.
- internal `*@fire-control.nl` (wander.denheijer 10, verkoop 8, opleidingen 8) → internal forwards/replies.

This is why the actionable-token carve-out (NOISE-04) is the cardinal safety constraint — a leak-fix that eats routable mail is worse than the leak.

This phase reuses the **existing** v8.0/v8.1 Stage-1 machinery: `classifier_rules` registry + the Wilson-CI shadow→promote `labeling-flip-cron` lifecycle + per-predictor attribution. No new mechanism — new *rules* as registry data.
</domain>

<decisions>
## Implementation Decisions

### Noise classes to target (LOCKED — from the data)
The five leaking noise classes, with observed recurring senders/signatures:
1. **Automated security/system reports** — `noreply@securitas.nl` (26/mo, "60289 Smeba Brandbeveiliging V.O.F."), `noreply-gms_nl@securitas.net` (3), `no-reply@login.antispamcloud.com` (4, SpamExperts reports), fleet/portal reports (`free2move-connectfleet`, `coperama marketplace`, `coupahost`).
2. **Cold-sales / SEO / outreach spam** — freemail (gmail/outlook/hotmail) + foreign domains with "Rank Higher", "App Idea", "Web Reparatie", "Price List", "website design proposal"; `taiwantrade`, `linkedin` outreach.
3. **Marketing newsletters** — `noreply@lidl.nl`, `noreply@logboekenonline.nl`, `rabobank` alerts, restaurant/event blasts (hertogjan, slagharen), trade newsletters (metaalnieuws).
4. **Auto-dealer / vehicle spam** — `info@impexcompany.nl` + `.be` (16/mo, "beste bod voor uw auto"), BMW/veiling/baslease/basworld.
5. **Unsolicited job applications** — `*@firemail.de` "Initiativbewerbung", generic "Vision Your Application".

### Mechanism (LOCKED)
- Register new candidates as `classifier_rules` rows (regex Pass-1 and/or LLM `stage-1-category-classifier` Pass-2 categories) — **registry data, zero per-swarm code branch** (SWARM-02).
- Candidates run in **shadow** and only promote via the existing **Wilson-CI confidence gate** (`labeling-flip-cron`). No blind auto-archive. (Note v8.1 finding: the Wilson-CI gate had empty telemetry — verify verdicts actually accumulate for info-routing.)
- Map each new noise class to a `swarm_noise_categories` key for info-routing (or reuse existing keys where they already exist for other swarms — cross-swarm rule reuse is allowed, swarm-isolated by default).

### Safety (LOCKED — NOISE-04)
- Hard **actionable-token carve-out**: never noise-reclass when the email carries an offerte / order / inkooporder / factuur / aanmaning / keuring / ontruiming / storing / werkbon signal (subject or body), even if the sender looks noisy.
- **Word-boundary** matching on all new regex rules (v8.2 RESL-08 lesson: unguarded id/keyword regex over-matches).
- The carve-out is verified on a sample before any promotion.

### Measurement (LOCKED — NOISE-03)
- Instrument the info@ "unknown" pool true-noise share before/after, **per live mailbox**. Target: ~50% → <20%. Use the existing `pipeline_events` Stage-1 decision telemetry; a labelled sample establishes the baseline true-noise fraction.

### Claude's Discretion
- Exact regex vs LLM-category split per noise class (regex for stable sender/domain patterns like securitas/impexcompany; LLM Pass-2 for fuzzy cold-sales/newsletter language).
- Whether to add a sender-domain denylist mechanism vs per-rule patterns (prefer existing `classifier_rules` shape).
- Baseline-labelling sample size (enough to estimate the noise fraction with a tight CI).
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Architecture (the locked source of truth — read before reasoning from code)
- `docs/agentic-pipeline/stage-1-regex.md` — two-pass noise filter (regex Pass-1, LLM `stage-1-category-classifier` Pass-2 on `unknown`); closed list = noise keys + `unknown`.
- `docs/agentic-pipeline/README.md` — 5-stage funnel, SWARM-02 invariant (no per-swarm branches).

### Milestone context
- `MILESTONES.md` (V9.7 section) + `docs/routing-swarm-milestone-charter.md` — milestone rationale, destinations, phasing.

### Existing mechanism to reuse (find in repo)
- The `classifier_rules` registry table + codegen (`supabase/migrations/` + `npm run codegen`).
- The Wilson-CI shadow→promote cron (`labeling-flip-cron`) + per-predictor attribution (v8.0 Phase 74/089, v8.1 Phase 84).
- `info_routing_mailbox_settings` (the 2 live + 4 dormant info@ boxes).
- `swarm_noise_categories` (Stage-1 noise registry).
</canonical_refs>

<specifics>
## Specific Ideas

- The single highest-volume noise target is `noreply@securitas.nl` (26/mo, identical recurring subject) — a trivial, high-precision regex win; good first shadow rule to validate the pipeline end-to-end.
- `info@smeba.nl`-self "Inzending contactformulier" (18/mo) is MIXED (real submissions like "Mr Martin Woodfield" + bot-gibberish names) — do NOT blanket-archive; treat as a discrimination case, not a noise class.
</specifics>

<deferred>
## Deferred Ideas

- Routing itself (Stage 3 router, forward side-effect) → Phase 131/132.
- Enabling the 4 dormant info@ mailboxes → registry-flip after smeba+fire-control proven.
- Re-evaluating the disabled `own_outbound_invoice_loopback` rule → out of scope (debtor/sales concern).
</deferred>

---

*Phase: 130-info-stage-1-noise-recalibration-v9-7-p0*
*Context gathered: 2026-06-16 via operator decision + live data analysis*
