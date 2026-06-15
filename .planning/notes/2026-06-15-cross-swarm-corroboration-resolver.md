# Decision note — Cross-swarm multi-signal corroboration in Stage 2

**Date:** 2026-06-15
**Author:** operator intuition (read the live corpora) + synthesis against existing spikes
**Status:** PROPOSAL — not a plan. One open decision + one open empirical question.
**Type:** decision note (NOT a fresh spike — the recon is already done, see Priors)

## The thesis (operator, sharpened)

Customer identity is mailbox-independent. A customer is the same NXT account whether
they mail debiteuren@, verkoop@, planning@ or order-entry@. So Stage 2 ("who is this
customer?") should be **one shared resolution brain**, not N per-swarm resolvers each
with its own precedence.

The win the operator is after is NOT "run more lookups for more raw hits." It is
**corroboration**: when one signal resolves weakly (e.g. a factuur-match at low
confidence, or a domain that maps to 30 accounts), bring in an independent second
signal (postcode, klantnummer, site, on-behalf-of name) to:

1. **raise confidence** when signals agree (factuur → customer A AND postcode → customer A
   = much stronger than either alone), and
2. **demote a confident false positive** when signals disagree (domain → "EQUANS" but the
   body says "namens Jumbo" → the domain hit is wrong, not just weak).

Point (2) is the non-obvious half and the one that makes this worth doing: cross-referencing
doesn't only lift recall, it *catches* wrong high-confidence resolves before they inject bad data.

## Priors — this is already validated, do not re-spike

| Source | What it already establishes |
|---|---|
| `.planning/spikes/008-disambiguation-signals` | Disambiguation = number back-search (invoice/job/PO/order/quote → exactly 1 customer) → postcode/VAT **narrowing** ∩ candidate set → LLM tiebreaker. Postcode = 85% email coverage / ~100% NXT-populated but not a clean key (own-address confound). |
| `.planning/spikes/009-backtest-resolution-stack` | Traced 5 real misses. Domain match gives **confident false positives** (spendlab.com → EQUANS); name match explodes for chains (Jumbo 30+); **'namens / op verzoek van / uw klant X' is a mandatory first-class pattern**; some misses are Stage-1 noise. Net: **output RANKED SUGGESTIONS, not silent auto-resolve.** |
| `.planning/spikes/010-comprehensive-backtest/GENERIC-RESOLUTION-DESIGN.md` | The generic, registry-configured **cross-swarm** engine: strip own-entity → self-auth IDs → number back-search → domain → postcode/site ∩ candidate set → on-behalf-of name → score + **confidence gate (AUTO / SUGGEST / HARD / FLAG)** → emit `PipelineStageContext`. Debtor = first consumer; sales (SugarCRM, V10) = the generality test. |
| `.planning/spikes/010-comprehensive-backtest/DESIGN-GUIDE.md §0.10` | Live-NXT validated build rules: env=BX hard filter, brand = tiebreaker (cross-brand forwarding), `exact_invoice_id` 99.84% unique post-brand-scope, extraction-layer guards, thread-inheritance precedence fix. |
| Shipping code | Engine + dispatch seam already merged on `workspace/sales-golive`: `web/lib/agentic-pipeline/resolve/engine.ts`, `web/lib/swarms/dynamic.ts` (`loadStage2Resolver`), `swarms.resolution_config`. Sales adapter `web/lib/automations/sales-email/resolve-customer.ts` is live. |

**Conclusion:** the corroboration idea = the validated design's steps 3–7 + the AUTO/SUGGEST
confidence gate. It is not a new hypothesis; it is a partially-shipped one.

## What is shipping vs what is deferred

- **Shipping (P0 / Phase 90 / Phase 114):** the generic engine, the registry dispatch seam,
  per-swarm `resolution_config`, and a **precedence + short-circuit-on-first-hit** resolver.
  The sales adapter is explicitly labelled "iteration 1 = PRECEDENCE-ONLY (no corroboration)".
- **Deferred (D-06 "fast-follow"):** multi-signal **corroboration / scoring within a single
  resolution** — i.e. the exact thing this note is about. The sales adapter comment names it:
  a `corroborate` config field would today be *silently ignored by the engine*.

So the operator's idea = **pull D-06 forward and make corroboration the cross-swarm default**,
rather than leaving each swarm on iteration-1 precedence-short-circuit.

## UPDATE 2026-06-15 — spike 011 Phase A answered the precondition

`.planning/spikes/011-sales-corroboration-opportunity` measured signal co-occurrence on the
verkoop@ corpus (1509 inbound, production extractors, read-only). Result: **corroboration
surface ≈ 40%** of sales mail (≥2 identifier kinds 18.8% ∪ corp-domain+identifier 37.1%).
That is well above the 25% "first-class consumer" threshold → **corroboration generalises to
sales; it is NOT debtor-only.** Dominant structural pair = offerte∩postcode (the standard
"Offerte SBxxxxxx n.a.v. bezoek monteur op locatie" template carries both by construction).
Intermediary/on-behalf-of share is LOW (1.8%) — sales mail is direct, unlike debtor's
Ariba/Basware/SpendLab tail. So the open question below is **answered for opportunity**; only
the realised live-NXT lift (Phase B) remains. The recommendation stands: scope the milestone,
size it with Phase B.

## The one genuinely open EMPIRICAL question (this is the only thing left to measure)

All corroboration evidence to date is on the **debtor** corpus. Debtor's dominant precision
lever is **self-auth labelled IDs** (aanmaningsnummer / klantnummer / werkbon) — ~17% safe
AUTO at 100% precision. The design doc explicitly warns these **do not transfer**: the future
SugarCRM sales backend has no self-auth stamps and `body_full_text` = 0%.

But sales today resolves against **NXT** (not SugarCRM yet — `resolve-customer.ts` uses
`nxtRequest`). So the open question is concrete and measurable:

> **On the verkoop@ corpus, does multi-signal corroboration (offerte ∩ postcode ∩ sender,
> on-behalf-of, order/factuur back-search) lift accepted-resolution rate and confidence the
> way it does on debtor — given that self-auth IDs, debtor's strongest lever, are largely
> absent in sales mail?**

If yes → corroboration generalises cleanly; make it the cross-swarm default. If the lift is
weak → sales leans harder on sender/offerte/site precedence and the corroboration layer is
debtor-weighted. Either way the *engine* is unchanged; only `resolution_config` weights differ.

## The decision to make (not for the spike — for the milestone)

**D-A:** Pull D-06 corroboration forward as the **shared cross-swarm default** (the operator's
proposal), or keep per-swarm precedence-short-circuit as iteration-1 and add corroboration
per-swarm later?
  - Pulling it forward = one resolution brain, signals cross-reference everywhere, confident
    false positives caught uniformly. Cost: the corroboration scorer + a real `corroborate`
    config field the engine honours (today ignored), + the AUTO/SUGGEST gate wired to Bulk Review.
  - Keeping iteration-1 = ships sales-golive faster on a thinner resolver; corroboration is a
    follow-up milestone.

**Recommendation:** keep sales-golive on iteration-1 precedence (don't re-architect Stage 2 on
the go-live critical path), and scope **"Cross-Swarm Corroboration Resolver" as the next Stage 2
milestone** — with the verkoop@ corroboration-lift measurement above as its sizing spike (it is
the only un-run measurement; everything else is designed).

## Non-negotiables carried from the backtests (do not re-litigate)

- Output = **ranked SUGGESTIONS to Bulk Review**, AUTO only for genuinely safe cases
  (own-number unique hit, or domain+postcode agreement with no intermediary flag).
- **Strip own-entity identifiers first** (own address postcodes contaminate — CBRE case).
- **Intermediary / on-behalf-of is a named sub-system**, not an edge case (Ariba/Basware/
  SpendLab/debt-recovery → disable domain match, run 'namens X' name extraction).
- **Deterministic signals NARROW; the LLM / operator DECIDES.**
- Engine stays swarm-agnostic; all swarm difference lives in `resolution_config` + the adapter.

## Open questions for the milestone (not this note)

1. Does the engine's scorer corroborate across signals run **in parallel**, or does precedence
   still short-circuit and corroboration only kicks in on low-confidence/ambiguous hits? (Latency
   vs recall — gate cheap regex-extraction first, only do the NXT lookup if the identifier is present.)
2. How is brand/tenant **scope** parameterised once the resolver is shared (debtor = brand-tiebreak
   on BX; sales = smeba.nl tenant)?
3. Confidence-gate thresholds per swarm, or one shared rubric?
