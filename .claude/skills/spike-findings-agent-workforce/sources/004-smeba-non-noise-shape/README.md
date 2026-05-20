---
spike: 004
name: smeba-non-noise-shape
type: standard
validates: "Given the 1,236-row post-noise unknown bucket, when we eyeball a deterministic random sample of 30 emails, then we have a preview of the router agent's workload distribution for Phase 88 capacity planning — without proposing intent vocabulary"
verdict: VALIDATED — with one methodological caveat
related: [001, 002, 003]
tags: [recon, preview, router-agent, smeba]
---

# Spike 004: smeba-non-noise-shape

## What This Validates

Given the 1,236-row "post-noise unknown" bucket produced by Spike 002's rules, when we sample 30 emails deterministically (seed=42), then we can describe in plain English the shape of the future router agent's workload — for **capacity planning only**.

**Methodological caveat (locked 2026-05-19 principle):** This spike does NOT propose intent vocabulary. Labels in the analysis below are *descriptive shorthand for what the operator sees*, not registry keys. The real `swarm_intents` vocabulary for info-routing emerges through Phase 86's discovery surface during shadow operation. This spike feeds Phase 88's *capacity* discussion, not its *vocabulary*.

## How to Run

```bash
cd web/debtor-email-analyzer
npx tsx src/spike-004-sample.ts
```

Deterministic seeded shuffle — same 30 rows every run.

## Results

**Verdict: VALIDATED** — preview achieved. Headline numbers below; full 30-email hand-pass in the [Investigation Trail](#investigation-trail).

### Router workload sizing

| Metric | Value |
|---|---:|
| Total inbound (90d) | 5,316 |
| Post-noise unknown bucket | 1,236 (23.3%) |
| Per-day arrival rate | **~14 emails/day** |
| Estimated real business email after eyeball-noise removal | **~7 emails/day** |

### Hand-pass distribution across 30 samples

Two-tier split: what is operationally *real* business, vs what is *noise-by-business-meaning* that leaked through Spike 002's regex.

| Group | Count / 30 | Share | Daily estimate |
|---|---:|---:|---:|
| **Real business email** | 15 | 50% | ~7/day |
| → finance / AP / payment / refund / invoice-copy | 6 | 20% | ~3/day |
| → sales / quote-request / order | 4 | 13% | ~2/day |
| → HR / unsolicited applications | 2 | 7% | ~1/day |
| → support / operations / service-report | 2 | 7% | ~1/day |
| → admin / master data update | 2 | 7% | <1/day |
| **Noise leaking past Spike 002 rules** | 15 | 50% | ~7/day |
| → cold B2B outreach (SEO, web-dev, recruitment-agencies, energy, car-export, etc.) | 10 | 33% | ~5/day |
| → phishing impersonation (Meta Verified, prince-shape supply inquiry) | 2 | 7% | ~1/day |
| → unsolicited surveys | 1 | 3% | <1/day |
| → FedEx tracking (regex miss — sender `Trackingupdates@` didn't match `^noreply`) | 1 | 3% | <1/day |
| → German bankruptcy estate sale (B2B noise) | 1 | 3% | <1/day |

### What this tells Phase 88 (capacity, not vocabulary)

1. **The router is a small system.** ~14 emails/day reach Stage 3, and only ~7/day are real business email. There's room to operate Stage 3 in shadow for months without burying any operator in review work.
2. **Finance is the biggest real bucket** (~3 emails/day, 20% of residue). Mostly things that should have been sent to `crediteuren@`/`debiteuren@`/finance-specific addresses but landed at `info@`. Sample shapes seen: payment advice, AP exception ("Niet conform inkoopordernummer"), supplier invoice (PostNL), refund request, invoice-copy request. **Implication:** the router's most-frequent action will be "forward to finance" — overlapping closely with debtor-email's existing terminals. Several of these (refund, invoice-copy) already have debtor-email noise keys.
3. **Cold-outreach is one third of post-noise volume** (~5/day). The M365 `[SPAM]` filter doesn't catch hand-targeted-feeling B2B sales pitches. **Architectural question for Phase 88:** does the router (a) forward all cold outreach to a human for triage, or (b) does Stage 1 need a new `cold_outreach` noise rule? **Recommendation per the locked principle: let Phase 86's discovery surface decide.** If `cold_outreach` emerges as a frequent `intent_proposal` cluster during shadow, then promote it to a Stage 1 noise rule once Wilson-CI clears.
4. **Phishing leakage is non-trivial** (~7% in sample = ~1/day). Two of 30 emails were impersonations that passed M365's filter. This isn't an architectural blocker but is a safety-flag input for the future Stage 0 (Phase 64) — info-inbox spam-filter bleed-through is higher than debtor-inbox bleed-through. Worth noting in Phase 64's threat-modelling pass.
5. **Three Spike 002 regex polish items surfaced** (not blocking, just hygiene):
   - `Trackingupdates@fedex.com` doesn't match `^noreply` — widen to include `^tracking|^updates|^delivery|^shipment` if FedEx-style notifications cluster.
   - The single Meta phishing impersonation that escaped (sender `lhhpelypvractsrvlvawitw@nss.sellpia247.com`) — caught by `meta_facebook_notification` in Spike 002 but only because of the subject prefix. Confirms that rule is anti-phishing more than anti-Meta-noise; rename if shipped.
   - German bankruptcy + Indian-supplier scams aren't catchable by Stage 1 regex without TLD/reputation features — Stage 0 (Phase 64) territory, not Stage 1.

### What this explicitly does NOT do

- **Does not propose `swarm_intents` rows** for info-routing.
- **Does not name router intents** like `to_sales`, `to_finance`, etc. The shorthand labels above ("sales", "finance", "HR") are descriptive of what an operator sees, not registry keys.
- **Does not promote any Phase 88 vocabulary** that didn't emerge through Phase 86's discovery surface.

If Phase 88 ships before Phase 86 exists, this spike's preview is **not** authoritative — Phase 88 should ship a placeholder router (single `unknown_intent` terminal with full-email forward to a triage queue) and let real-world traffic populate the discovery surface from week 1.

## Investigation Trail

1. **Built a deterministic 30-row sample** using a seeded LCG shuffle so the spike is reproducible. Applied Spike 002's rules in-line (rather than re-querying through Spike 002's script) for self-containment.
2. **Hand-passed each of 30 emails** by reading subject + sender + 240-char body preview. Tagged each into one of 11 informal buckets. Tallies in the table above; full per-row pass below for traceability.
3. **Cross-checked against Spike 003's findings.** Email #11 (kopie facturen request) matches debtor-email's `invoice_copy_request` shape exactly. Emails #14 and #24 are payment-admittance hits Spike 003 already caught. Validates that Stage 1 will continue to peel off real noise inside the "unknown" bucket as Phase 84's rule additions land — the router workload shrinks further.

### Full 30-row hand-pass

| # | Sender | Subject | My read |
|---|---|---|---|
| 1 | Procurement_BE@cargill.com | Cargill Purchase Order 4521445260 | real — sales/orders (customer PO) |
| 2 | safety@maasoever.com | inspectie/offerte | real — sales (quote request + contact update) |
| 3 | udegbunam.v@firemail.de | Unsolicited application as Second-Level Supporter | real — HR (unsolicited application) |
| 4 | lead.P2P@p2p.basware.com | Niet conform inkoopordernummer | real — finance (AP exception, invoice rejection) |
| 5 | arjen@stroom-partner.nl | Korte check: betaalt u te veel? | noise — cold B2B outreach (energy savings) |
| 6 | info@insolvenzrecht-gabel.de | Insolvenzverwalter Warenbestand | noise — cold B2B (DE bankruptcy estate sale) |
| 7 | zakelijkefactuur@facturen.postnl.nl | PostNL factuur 1106-26315789 | real — finance (incoming supplier invoice) |
| 8 | lhhpelypvract...@nss.sellpia247.com | Meta Verified Verifieer | noise — phishing impersonation |
| 9 | Paul.Witteman@asfaltnu.nl | FW: ANAII opmerking jaarlijks onderhoud | real — support/ops (service report forward) |
| 10 | raees.m@firemail.de | Initiativbewerbung als Maschinenbauingenieur | real — HR (DE unsolicited application) |
| 11 | joost@spacewinner.nl | kopie facturen | real — finance (invoice copy request — matches debtor-email shape) |
| 12 | jarka@justrealestatebv.com | Adreswijziging | real — admin (master-data update) |
| 13 | milou.joosten@mezzoscholen.nl | Opzegging overeenkomst controle blusmiddelen | real — admin/sales (contract termination) |
| 14 | CrediteurenBE@hansanders.com | Nexeye Payment advice 2000075037 | real — finance (already caught by `payment_admittance` per Spike 003) |
| 15 | gert.claes@cawdekempen.be | Fwd: Prijsvraag keuring brandblusapparaten | real — sales (RFQ for blusmiddelen keuring) |
| 16 | info@impexcompany.nl | Smeba — Maandelijkse Auto-verkoopherinnering | noise — cold B2B outreach (car export) |
| 17 | Merybook.nic@outlook.com | Re: Quick Help with Your Bookkeeping | noise — cold outreach (outsourced bookkeeping) |
| 18 | suzanne@intraservice.nl | RESERVE YOUR BOOTH TODAY | noise — cold outreach (trade-show pitch) |
| 19 | gracerriley8@gmail.com | Let's continue your mobile app discussion | noise — cold outreach (mobile app dev) |
| 20 | info@auto-tweedehands.com | Smeba Fire — Autoverkoop herinnering | noise — cold outreach (car export, same as #16) |
| 21 | Trackingupdates@fedex.com | Uw zending is onderweg | noise — FedEx tracking (Spike 002 regex miss) |
| 22 | Dimity3456@hotmail.com | Reach their ideal audience | noise — cold outreach (SEO) |
| 23 | communication@vo.eu | Korte vraag over onze samenwerking | real — admin (existing-partner survey) |
| 24 | aecomremittances@aecom.com | Separate Remittance Advice | real — finance (already `payment_admittance` per Spike 003) |
| 25 | mrtomansah9@gmail.com | INQUIRY FOR SUPPLY | noise — phishing/scam (Nigerian-prince shape) |
| 26 | Procurement_BE@cargill.com | Cargill Third Reminder PO Acknowledgement | real — sales/orders (PO follow-up) |
| 27 | info@tandarts-oeffelt.nl | factuur 17322535 (dubbele betaling) | real — finance (customer refund request) |
| 28 | Madhu.Web.Expert@outlook.com | Cost | noise — cold outreach (web dev) |
| 29 | innovatiemonitor@seo.nl | Nederlandse Innovatie Monitor 2026 | noise — unsolicited survey |
| 30 | arjan@wr.nl | Vacatures vervullen zonder risico | noise — cold outreach (recruitment agency) |

## Files

- `web/debtor-email-analyzer/src/spike-004-sample.ts` — deterministic seeded sample of post-noise unknown bucket
- `.planning/spikes/004-smeba-non-noise-shape/sample-output.txt` — captured run output
