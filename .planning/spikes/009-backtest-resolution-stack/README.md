---
spike: 009
name: backtest-resolution-stack
type: standard
validates: "Given the resolution stack proposed by spikes 005-008, when we trace 5 real unresolved emails end-to-end against live NXT, then we learn which assumptions hold and which break — before committing the milestone"
verdict: VALIDATED 2026-05-29 — several assumptions BREAK. Domain match produces confident false positives (intermediaries); number back-search misses fresh inbound POs; name match is ambiguous for chains; a new 'on behalf of / namens' pattern is mandatory; some misses are Stage-1 noise. Net: Stage 2 recall must output RANKED SUGGESTIONS, not silent auto-resolve.
related: [005, 006, 007, 008]
tags: [stage-2, backtest, resolution, nxt, assumptions]
idea: stage-2-resolution-recall
---

# Spike 009: backtest-resolution-stack

## Method

Pulled 5 real unresolved debtor emails (one per failure mode), read the full bodies, extracted candidate signals by hand, and back-searched each against live `nxt_benelux_prod` via the Zapier MCP. Goal: does the proposed stack actually resolve them — correctly?

## Per-email backtest

### 1. `rene.groothuis@cbre.com` — "Smeba - CBRE Purchase Order #95NLP6415039"
A fresh CBRE purchase order sent to Smeba. **True customer:** a CBRE GWS entity (billing addr 1059 CM Amsterdam).
- Number back-search PO `95NLP6415039` → **NO order found** in NXT (it's a *new* inbound PO, not yet an order in our system).
- Body has **three** postcodes: `6604 LJ` (= SMEBA's OWN supplier address on the PO!), `2628 SJ` Delft (the delivery *site*), `1059 CM` Amsterdam (CBRE billing → 33 customers).
- Domain `cbre.com` → 59 customers.
- **Verdict: ❌ hard.** Naive "first postcode" picks our own address. Resolution needs: strip own-brand addresses → site-match `2628 SJ` → LLM tiebreaker over CBRE entities. Number back-search useless here.

### 2. `s4system-prodeu+boels...@eusmtp.ariba.com` — "Voltooi uw registratie voor Boels"
Ariba supplier-portal nag. **True principal:** Boels. Body: "uw klant, Boels".
- Domain = intermediary (Ariba); no number; no postcode.
- Only signal = the NAME "Boels" → matches **6** Boels entities (Verhuur/Industrial/Luxembourg/Verwarming).
- **Verdict: ◑ name → tiebreaker**, and borderline whether this is even an actionable debtor email (portal registration).

### 3. `wka-IT@hanab.nl` — "RE: Aanvraag WKA en KvK Fire-control B.V."
Hanab (customer) asking Fire Control for KvK/WKA docs to release payment. **True customer:** Hanab Installation Technology B.V (Vianen).
- Postcodes in signature: `4131 NJ` (→ 9 customers) AND `4130 EA` (Postbus → **1 customer, unique**).
- KvK is mentioned — but it's *Fire-control's* KvK (our brand), requested BY the customer → a red herring.
- **Verdict: ✅ resolves via postcode** — but only if we extract ALL postcodes and prefer the unique match (the first one, 4131NJ, is ambiguous).

### 4. `ap.recovery@spendlab.com` — "Case: 20251009-387 – Jumbo Supermarkten B.V. – SMEBA"
SpendLab (AP-recovery firm) acting **namens Jumbo**. **True customer:** Jumbo Supermarkten B.V. (Veghel).
- Domain `spendlab.com` → resolves to **"EQUANS"** (id 544685, Brussels) — a **CONFIDENT FALSE POSITIVE**: an unrelated customer happens to carry a spendlab.com contact email. Auto-applying this would inject the wrong customer.
- Real signal = NAME "Jumbo Supermarkten B.V." (in subject + "namens Jumbo") → matches **30+** Jumbo entities (~5 exact "Jumbo Supermarkten B.V." variants).
- **Verdict: ❌→◑** domain is actively WRONG; needs on-behalf-of detection + name → tiebreaker.

### 5. `werkbon-noreply@totaaltechniekgroep.nl` — "werkorder 402601499" (21 misses/mo — the top single domain)
Automated work-order callback from TotalKlima/TotaalTechniekGroep. **Domain → 1 customer (unique).**
- Resolvable by domain, BUT it's a `noreply` automated werkbon nag (×21/mo), reply-to a different address.
- **Verdict: ⚠ resolves, but is arguably Stage-1 noise**, not a Stage-2 resolution target. The single biggest "miss domain" may belong in the noise registry.

## Assumption scorecard

| Assumption (from 005-008) | Backtest result |
|---|---|
| Domain match recovers ~60% of external misses cleanly | **PARTIALLY FALSE** — confident false positives on intermediary/shared domains (spendlab→EQUANS). Domain is a *candidate generator*, not a resolver; needs an intermediary guard. |
| Number back-search → exactly one customer | **TRUE but lower coverage** — only hits OUR existing invoice/job/order/quote. Fresh inbound POs (CBRE) aren't in our system → miss. "89% have ref words" overstated realised hits. |
| Postcode narrows well | **TRUE, confound severe** — emails carry our OWN address + delivery + billing postcodes (CBRE). Must strip own-brand and try ALL postcodes. |
| Name match rescues intermediaries | **TRUE but ambiguous** — chains explode (Jumbo 30+, Boels 6). Name → candidate set → tiebreaker, never a key. |
| (missing) | **NEW: 'namens / op verzoek van / uw klant X' is a first-class pattern** — the real customer is the NAMED principal, not the sender. Mandatory extraction for intermediaries (SpendLab, Ariba, Basware, debt-recovery firms). |
| (missing) | **NEW: a meaningful slice of misses are Stage-1 noise** (noreply werkbon ×21, portal nags) — should be filtered/categorised, not resolved. |

## Design implications for the milestone (this reshapes it)

1. **Output ranked SUGGESTIONS to Bulk Review, not silent auto-resolve.** The EQUANS false positive proves auto-applying a "confident" single-customer domain hit injects wrong data. Auto-resolve must be gated to genuinely safe cases (our own invoice/job-number hit, or domain+postcode agreement with no intermediary flag). Everything else = operator picks from a ranked shortlist. Aligns with the existing operator-in-the-loop Bulk Review surface.
2. **Intermediary handling is a named sub-system**, not an edge case: maintain an intermediary-domain set (Ariba/Basware/SpendLab/Coupa/debt-recovery) → on those, DISABLE domain match and run on-behalf-of name extraction.
3. **On-behalf-of extraction** (LLM or regex over "namens/voor/uw klant/t.b.v. X" + subject "– X –") → candidate name → name match → tiebreaker.
4. **Postcode**: strip own-brand addresses first; extract ALL; prefer unique candidate match.
5. **LLM tiebreaker is the workhorse**, fed the full email + candidate details (name/city/postcode) — it can read "namens Jumbo", recognise which postcode is the supplier vs the building, etc. The deterministic signals NARROW; the LLM (or operator) DECIDES.
6. **Re-examine the top miss domains for Stage-1 noise** (totaaltechniekgroep noreply ×21) before counting them as Stage-2 recall wins — some belong in `swarm_noise_categories`.

## Net effect on milestone sizing

The aggregate floors (Lever 3 ~60%, combined 32%) were optimistic about *clean* auto-resolution. Realistically: a smaller fraction auto-resolves safely; the larger win is **high-quality ranked suggestions that cut operator time per row**, plus a few clean deterministic wins (our-number back-search, unique domain+postcode). The milestone's success metric should be "operator-accepted suggestion rate + time-to-resolve", not "% silently auto-resolved".

## Queries

Backtest pulls: `queries.sql`.
