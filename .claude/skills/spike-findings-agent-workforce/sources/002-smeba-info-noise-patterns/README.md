---
spike: 002
name: smeba-info-noise-patterns
type: standard
validates: "Given the 5,316-row Smeba inbound corpus, when we apply candidate noise rules first-match-wins ordered by specificity, then we identify the dominant noise categories with cluster sizes, sample emails, and the residual 'unknown' shape"
verdict: VALIDATED — with one architectural surprise that changes the proposal
related: [001]
tags: [recon, noise, smeba, info-inbox]
---

# Spike 002: smeba-info-noise-patterns

## What This Validates

Given the corpus produced by Spike 001 (5,316 inbound rows over 90 days), when we apply seven candidate noise rules first-match-wins ordered by specificity, then we get cluster sizes and sample emails per category — and a view of what remains in the `unknown` bucket that the future router agent will see.

## How to Run

```bash
cd web/debtor-email-analyzer
npx tsx src/spike-002-cluster.ts
```

Read-only. No DB writes. Rules are the literal `RULES` array in `spike-002-cluster.ts` — change the array, re-run, iterate.

## Results

**Verdict: VALIDATED** — but with one finding that reshapes the noise-category proposal (see Surprises below).

### Cluster sizes (first-match-wins)

| Rule key | Count | % of inbound |
|---|---:|---:|
| `m365_spam_tag` | 2,899 | 54.5% |
| `own_domain_loopback` | 950 | 17.9% |
| `noreply_notification` | 214 | 4.0% |
| `marketing_newsletter` | 13 | 0.2% |
| `auto_reply_ooo` | 12 | 0.2% |
| `meta_facebook_notification` | 1 | 0.0% |
| `delivery_failure` | 0 | 0.0% |
| **noise subtotal** | **4,089** | **76.9%** |
| `unknown` (→ router) | 1,227 | 23.1% |

### Surprises (these change Spike 003's question and the proposal doc)

1. **`own_domain_loopback` isn't homogeneous noise.** The 950 emails from `smeba.nl` / `smeba-fire.be` / `moyneroberts.com` look like *internal operational traffic*, not chaff. Top sample subjects: `Afspraak maken (Smeba) — …`, `Openingstijden of n.a.w. aanpassen (Smeba) — …`, `Niet aanwezig (Smeba) — …`, `FW: [CASE:…] Brandblussers`. These look like CRM/ticketing workflow emails staff is intentionally CC'ing or forwarding to `info@smeba.nl`. Treating them all as "archive and forget" would suppress legitimate workflow.
   - **Implication:** the rule needs to either (a) split into `internal_workflow_cc` (keep / surface) vs `internal_loopback_noise` (archive), or (b) leave own-domain in `unknown` so the router agent gets to triage. Spike 003 has to answer this.
2. **The `delivery_failure` rule fires zero times** in a corpus that demonstrably contains undeliverable notices. Why: `[SPAM]` catches them first. Outlook's spam filter is treating most bounces as spam. The rule is dead-on-arrival as written — useful only as a post-`[SPAM]` filter inside the spam bucket, not as a top-level category.
3. **`marketing_newsletter` is tiny (0.2%).** Expected this to be a major category; reality is M365 already tags marketing mail as `[SPAM]`. The few that survive (`mailing@chocolateriepierre.nl`, `newsletter@mailing.ets-informatics.be`) are legitimate B2B outreach. **Architectural implication:** info-routing doesn't need an aggressive newsletter rule — Microsoft has already done the work. A narrow rule for survived-newsletters is fine but low-volume.
4. **`auto_reply_ooo` is tiny (0.2%, 12 emails) and all from `smeba.nl` itself.** Out-of-office replies arrive at info@smeba.nl when Smeba staff CC the inbox and someone in CC is OoO. These are doubly-internal. Treatable, but minor volume.
5. **`meta_facebook_notification` matched 1 email — and it's a phishing impersonation.** The sender was `102299100065@r1.deped.gov.ph` with subject `[META GERVERIFIEERD] …`. The Meta-subject regex caught a fake, not a real Meta notification. Useful! But: M365's `[SPAM]` rule probably already caught the real ones too.
6. **`unknown` bucket is 23.1% = ~14 emails/day = the router agent's workload.** Top senders mix `gmail.com` / `outlook.com` / `hotmail.com` (consumers) with B2B domains: `mindef.nl` (Dutch MoD), `fedasil.be` (Belgian asylum agency), `cbre.com`, `cargill.com`, `ballast-nedam.nl`, `heijmans.nl`. Sample subjects: `Offerte blusmiddelen`, `Beschikbaar personeel week 9`, `Contract inzake controle brandblussers`, `Betaalspecificatie`. Real quote requests, finance, contracts, recruitment. **The router agent's job is well-defined: triage these to sales / finance / HR / support.**

### Provisional noise-category proposal (drafted from this spike, hardens after 003+004)

Ordered by rule specificity (first match wins):

| key | regex / predicate | sample volume | action |
|---|---|---:|---|
| `m365_spam_tag` | `^\s*\[SPAM\]` on subject | 54.5% | `categorize_archive` |
| `own_domain_loopback` | sender domain ∈ `swarms.tenant_domains` | 17.9% | **TBD — Spike 003 must answer: archive vs. route** |
| `noreply_notification` | sender local-part starts with `noreply\|no-reply\|donotreply\|notifications?\|notify\|alerts?\|automated\|mailer\|postmaster` | 4.0% | `categorize_archive` |
| `auto_reply_ooo` | subject matches automatic/OoO/read-receipt markers | 0.2% | `categorize_archive` |
| `marketing_newsletter` | sender local-part newsletter markers OR ESP-style domain | 0.2% | `categorize_archive` |
| `unknown` | fall-through | 23.1% | `swarm_dispatch` → router agent |

Dead on arrival:
- `delivery_failure` — caught by `[SPAM]` upstream; don't ship.
- `meta_facebook_notification` — almost-zero volume; subject regex picked up phishing not the real thing; don't ship as separate rule.

### Cross-references for the rest of the spike series

- **Spike 003** must answer: do these 6 candidate rules overlap with debtor-email's existing 4 (`auto_reply`, `ooo_temporary`, `ooo_permanent`, `payment_admittance`)? Specifically: is `own_domain_loopback` already handled in debtor-email post-Phase 84, and what's the right semantics?
- **Spike 004** samples the 1,227 unknown-bucket emails to preview the router's intent shape (sales / finance / HR / …) — **without** hand-curating the vocabulary.

## Investigation Trail

1. **First pass: applied 7 candidate rules in priority order.** Cluster sizes came out as expected for `[SPAM]` and `noreply` but `own_domain_loopback` at 17.9% was higher than predicted from Spike 001's 12.4% domain-share. Reason: Spike 001 only counted `smeba.nl`; this rule also catches `smeba-fire.be`, `moyneroberts.com` (3.6%), and Smeba's sibling brand domains.
2. **Examined `own_domain_loopback` samples** and saw they're operational workflow emails (`Afspraak maken (Smeba)`, `Niet aanwezig (Smeba)`), not noise. Pivot: this rule is **not** a simple archive bucket. Punted the right semantics to Spike 003.
3. **Examined `delivery_failure`'s zero hits.** Confirmed by manually re-checking subjects in the `m365_spam_tag` bucket — many `UndeIiverable` / `mail delivery failure` subjects there. The rule isn't broken; the order is. If we wanted to recover them, we'd need a 2nd-pass classifier *inside* the `[SPAM]` bucket — but Outlook's archive already handles `[SPAM]` correctly, so this is academic.
4. **Confirmed `unknown` bucket is genuine business email**, not residual noise. That's the encouraging answer for the router agent's feasibility.

## Files

- `web/debtor-email-analyzer/src/spike-002-cluster.ts` — first-match-wins classifier with 7 candidate rules
- `.planning/spikes/002-smeba-info-noise-patterns/cluster-output.txt` — captured run output
