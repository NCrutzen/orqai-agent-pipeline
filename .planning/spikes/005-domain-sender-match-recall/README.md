---
spike: 005
name: domain-sender-match-recall
type: standard
validates: "Given an external unresolved Stage 2 miss, when its sender DOMAIN is matched against domains that have resolved to exactly one customer before, then it resolves to that customer — measuring realized recall (Lever 3)"
verdict: VALIDATED — floor 19.2% of external misses; true ceiling needs a live NXT domain probe
related: [006]
tags: [stage-2, entity-resolution, recall, debtor-email, measurement]
idea: stage-2-resolution-recall
---

# Spike 005: domain-sender-match-recall (Lever 3)

## What This Validates

Today's Stage 2 `sender_match` (layer 2 of `resolve-debtor.ts`) does **exact** sender-email → NXT contact-person lookup. 96% of external Stage 2 misses come from a business domain, so the hypothesis is that a **domain-level** match (`@acme.be` → the Acme customer) recovers a large slice with zero LLM cost.

**Given** an external unresolved miss, **when** its sender domain is matched against a customer, **then** it resolves.

## Measurement Method (and its honest limit)

NXT is only reachable via the Zapier whitelisted IP, so no live ad-hoc NXT query was possible. Instead the spike uses **our own resolution history as a ground-truth proxy**: build a `domain → customer` map from every `debtor.email_labels` row that *did* resolve to a customer (all-time), keep only domains that map to **exactly one** customer (a "confident" map), and test the last-30d external misses against it.

This yields a **conservative FLOOR**, not the true number, because:
- The map only knows domains we've already received resolvable mail from. NXT contains many customers we've never emailed.
- Domains mapping to 2+ customers are excluded from the floor, but in production they'd go to the existing LLM tiebreaker and often still resolve.

Free-webmail domains (gmail/hotmail/outlook/…) are excluded — they can't be domain-mapped.

## How to Run

Run via Supabase MCP / `psql` against `email_pipeline` + `debtor` schemas. Full query in [queries.sql](#queries). (Deviation from the tsx convention in CONVENTIONS.md: the corpus lives entirely in Supabase and the measurement is pure SQL, so MCP SQL was used directly. Queries + results captured here for reproducibility.)

## Results

**Verdict: VALIDATED** — domain matching is a real lever; floor is modest, ceiling is unknown without NXT.

Window: 30 days. External unresolved misses = **182**.

| Bucket | Misses | % of external | Recovery path |
|---|---:|---:|---|
| Unique-domain (confident map) | **35** | **19.2%** | Direct domain → customer (the measured floor) |
| Ambiguous domain (2+ customers) | 20 | 11.0% | Existing LLM tiebreaker |
| Domain never seen before | 127 | 69.8% | **Undecidable by proxy** — needs live NXT domain probe or Lever 4 |

- **Floor: 35/182 (19.2%)** of external misses recover from domain matching alone, against our own history.
- The **127 "never-seen" domains** are the crux: how many are real NXT customers vs vendors/prospects/spam can only be settled by a live NXT domain lookup. This is the single biggest open question for milestone sizing.

## Conclusion / What It Means for the Build

- Ship domain-level matching as a new layer (between exact sender_match and identifier_match), reusing the LLM tiebreaker for ambiguous domains. Floor payoff ≥19% of external misses, likely much more once NXT (not just our history) is the lookup target.
- **Follow-up needed:** a one-shot NXT domain probe (via the Zapier SDK path) over the 127 unseen domains to convert the floor into a real estimate. Out of scope here (no whitelisted-IP access from the spike).

## Queries

See `queries.sql` in this directory.

## Investigation Trail

- 2026-05-29 — built confident domain→customer map (all-time resolved labels, free-mail excluded, n_customers=1). 18 distinct domains matched 35 misses.
- 2026-05-29 — bracketed the rest: 20 ambiguous, 127 never-seen. Concluded proxy can only adjudicate ~30% (55/182) of external misses; the rest gates on live NXT.
