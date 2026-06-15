---
spike: 011
name: sales-corroboration-opportunity
type: standard
validates: "Given the verkoop@smeba.nl corpus, when we extract every resolution signal the sales resolver knows (offerte/order/postcode/factuur + sender-domain + on-behalf-of) using the PRODUCTION extraction functions, then we learn how often ≥2 INDEPENDENT signals co-occur on the same email — the precondition for multi-signal corroboration (D-06). If signals rarely co-occur, corroboration cannot lift sales resolution and the milestone is debtor-weighted."
verdict: "VALIDATED 2026-06-15 (Phase A) — corroboration surface is ~40% of sales mail (B∪C), WELL above the 25% threshold. Sales is a first-class corroboration consumer, NOT debtor-only. Dominant pair = offerte∩postcode (16.4%, driven by the structured 'Offerte SBxxxxxx n.a.v. bezoek monteur op locatie' template that carries an offerte id AND a site/postcode by construction); postcode∩corp_domain (28.6%) is the spike-008/009 disambiguation pair. Intermediary share is LOW (on_behalf_of 1.8% vs debtor's Ariba/Basware/SpendLab tail) — sales mail is direct. own_domain 25.3% → D-07 quoted-sender extraction is load-bearing (internal FW of SugarCRM cases). 56.5% carry NO identifier → resolve on sender alone or are prospects. Phase B (live-NXT resolution lift) still GATED — 40% is the CEILING of applicability, not realised lift."
related: [008, 009, 010]
idea: cross-swarm-corroboration-resolver
tags: [stage-2, sales, corroboration, opportunity, read-only, measurement]
---

# Spike 011: sales-corroboration-opportunity

## Why this exists

The operator's thesis (note `.planning/notes/2026-06-15-cross-swarm-corroboration-resolver.md`):
make multi-signal **corroboration** the cross-swarm default — a weak match on one signal
gets confirmed (or refuted) by a second independent signal, raising hit-rate AND confidence
AND catching confident false positives.

This is validated on **debtor** (spikes 008/009/010). But debtor's dominant precision lever
is self-auth labelled IDs (aanmaning/klantnummer/werkbon) which **sales mail lacks**. Before
sizing a "Cross-Swarm Corroboration Resolver" milestone we need the cheap precondition:

> **On the verkoop@ corpus, how often do ≥2 independent resolution signals co-occur on the
> same email?** Corroboration is only possible when a second signal is present to corroborate
> with. No co-occurrence → no lift → corroboration is debtor-weighted, not a sales default.

This is the SAME scientific order spikes 005–010 followed: measure the opportunity before
committing the build.

## Two phases (probe before the expensive measurement)

- **Phase A — opportunity probe (THIS spike, read-only, runnable now).** Reuse the PRODUCTION
  extraction functions (`extractOfferteCandidates`, `extractOrderCandidates`,
  `extractPostcodeCandidates`, `extractInvoiceCandidates`) — no NXT, no network. Measure, per
  email, which signal KINDS are extractable, and how often ≥2 co-occur. Output = signal-presence
  rates + a co-occurrence matrix + four opportunity metrics. **No resolution is performed.**
- **Phase B — resolution-lift (GATED follow-up, needs live NXT).** For the ≥2-signal subset,
  run each signal's NXT lookup (`lookup*ToAccount` via `nxtRequest`), check whether independent
  signals agree on the same `customer_account_id`, and measure the realised lift (extra resolves
  + confident-false-positive demotions). Requires the NXT proxy reachable. NOT run here — Phase A
  decides whether Phase B is even worth wiring.

## What Phase A measures

Per email (subject + body), using the real extractors:

| Signal kind | Source fn (production) | Meaning |
|---|---|---|
| `offerte` | `extractOfferteCandidates` | SB######/SMEQ##### quote ids |
| `order` | `extractOrderCandidates` | werkorder / order numbers |
| `postcode` | `extractPostcodeCandidates` | NL postcode in address context (Site→customer) |
| `factuur` | `extractInvoiceCandidates` | NXT invoice numbers (debtor lookup, reused) |
| `corp_domain` | sender domain, minus freemail + own-tenant | resolvable org-level signal (spike 008/009) |
| `on_behalf_of` | probe-only regex `namens/op verzoek van/uw klant/t.b.v./in opdracht van` | intermediary → domain match unsafe, needs name |

> NOTE: `on_behalf_of` is a **probe-only** heuristic (NOT a production extractor — sales has no
> on-behalf-of extraction yet; spike 009 flagged it as mandatory). It estimates the intermediary
> share, where domain match must be disabled and a principal-name signal is required.

### Opportunity metrics (the deliverable)

- **A — `≥1 identifier`**: email carries any of offerte/order/postcode/factuur (resolvable beyond sender).
- **B — `≥2 identifier kinds`**: identifier×identifier corroboration is possible on the email alone.
- **C — `corp_domain ∩ ≥1 identifier`**: the spike-008/009 disambiguation case (resolvable domain +
  an identifier to pick the right account among a multi-customer org).
- **D — `on_behalf_of share`**: intermediary mail where domain match is a known false-positive risk.

## Interpreting the result (decision rule)

- **B or C high (say ≥25%)** → corroboration has real surface on sales mail → scope the milestone
  with sales as a first-class consumer.
- **B and C low, A modest** → most sales emails carry ≤1 signal → corroboration is mostly a
  confidence-booster on the few multi-signal emails + a false-positive guard; sales leans on
  sender/offerte precedence. Milestone is debtor-weighted; sales config tunes weights, not a new engine.
- Either way the **engine is unchanged**; only `resolution_config` weights + the corroboration
  scorer differ. This spike sizes, it does not redesign.

## How to run

```
cd web
npx tsx scripts/spike-011-sales-corroboration.ts
```

Read-only. Loads `web/.env.local` (`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`).
Pages `email_pipeline.emails WHERE mailbox='verkoop@smeba.nl' AND direction='inbound'`
(1509 rows, 2026-04-15 → 2026-06-14 at time of writing). Prints tables to stdout; capture to
`spike-011-output.txt` next to this README for the reproducibility audit.

## Deviation from spike conventions (justified)

CONVENTIONS.md puts spike scripts in `web/debtor-email-analyzer/src/`. This script lives in
`web/scripts/` instead because it **reuses the production extraction functions** (`@/lib/...`)
— running it from `web` is the only way to import them faithfully (the analyzer package has no
`@/` alias). Fidelity to the real resolver > the location convention.

## Phase B findings (2026-06-15, LIVE NXT prod, limit 40, nxtRequest-only)

Ran `spike-011b-sales-resolution-lift.ts --limit 40` against prod NXT (token harvest +
`/api/{quotes,sites,orders}/search` reads worked). The headline "60% resolved" is **spurious** —
Phase B caught a would-be production false positive instead:

- **`offerte` resolved 24/24 = 100% — but ALL 24 to the IDENTICAL account `512887`**, across a
  random sample spanning 24 distinct offerte numbers (SB014098 / SB012839 / SB013721 / SB014377
  / …). There is no real reading where 24 randomly-sampled quotes share one customer. **Root cause
  (code-confirmed):** `lookupOfferteToAccount` → `pickCustomer` (offerte.ts:85-105) takes
  `content[0]` of `/api/quotes/search` and reads `customerId` **without ever checking the returned
  quote's reference equals the searched `offerteNumber`**. So a broad/default search result hands
  back the first quote's customer regardless of input → a confident wrong-resolve. This is the
  EXACT failure mode spike 009 flagged (spendlab→EQUANS), now reproduced for sales offerte.
- **`postcode` resolved 0/29 = 0%** — the would-be corroboration partner never fired (so no
  cross-check could catch the offerte false positive). Needs its own look: `/api/sites/search`
  params, or postcode→Site→customer not wired, or these postcodes genuinely don't match SB Sites.
- **`order` 0/1.** No conflicts/agreements observed (only one signal ever resolved per email).

### What this means

1. **The spike paid for itself by catching a prod-blocking bug BEFORE sales Stage 2 cutover.**
   Sales is still `dry_run_config.stage_2_resolution = true` → no live harm done. But if cut over
   as-is, offerte_match would inject customer `512887` into ~25% of sales emails. **This is a
   hard blocker for the sales Stage 2 cutover**, independent of the corroboration milestone.
2. **It is also positive evidence FOR corroboration.** A working second signal (postcode→Site)
   would have *disagreed* with the bogus `512887` and demoted it (CONFLICT) — exactly the
   false-positive guard the operator's thesis is about. The value of corroboration is precisely
   that it does not trust a single confident-looking hit.
3. **The realised-lift number is NOT yet measured** — it cannot be until the offerte lookup is
   fixed (it returns garbage) and postcode is debugged. Phase B must be re-run after those fixes.

### Follow-ups (created from this spike)

- **BUG (blocker):** `lookupOfferteToAccount`/`pickCustomer` must verify the returned quote's
  reference == searched offerte number (and `/api/quotes/search` filtering must be confirmed).
  Same verify-the-match audit applies to `lookupOrderToAccount` and `lookupPostcodeToAccount`.
- **Debug:** postcode→Site 0% resolve rate on the sales corpus.
- **Re-run Phase B** after the fixes to get the true agreement/conflict/lift numbers.

## Out of scope

- Any NXT lookup / network call (that is Phase B).
- Any resolution, write, or registry change.
- Production extraction of `on_behalf_of` (that is a milestone task; here it is a probe estimate).
