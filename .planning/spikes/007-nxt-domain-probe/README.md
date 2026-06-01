---
spike: 007
name: nxt-domain-probe
type: standard
validates: "Given the ~127 'never-seen' external-miss domains, when we query NXT for a domain→customer match, then we learn how many are real NXT customers — converting Spike 005's 19.2% Lever-3 floor into a true estimate and deciding Lever 3 vs Lever 4 scope"
verdict: VALIDATED 2026-05-29 — 88% of business miss-domains are real NXT customers; 60% of external misses domain-resolvable (3x the proxy floor). Lever 3 confirmed high-value; build it deep.
related: [005, 006]
tags: [stage-2, recall, nxt, probe, decision-fork, measurement]
idea: stage-2-resolution-recall
---

# Spike 007: nxt-domain-probe (the decision fork)

## Why This Is First

Spikes 005/006 measured a recall floor of 32.4% using only our own history as ground truth. The single biggest unknown left: **127 of 182 external misses come from domains we've never resolved before** — undecidable by proxy. This probe settles it against NXT itself and decides the shape of the whole milestone:

- Many of the 127 → real NXT customers ⇒ **Lever 3 (domain match) is large; Lever 4 may be unnecessary.**
- Few of the 127 → real customers (mostly vendors/prospects/intermediaries) ⇒ **Lever 3 near its 19% floor; Lever 4 (LLM body extraction) is the only path to the residue.**

Read-only. No production code path. Build levers only *after* this runs.

## Pre-classification (do before querying NXT)

Eyeballing the domain list (see `domains.sql` output) shows three classes — split them first, because two of them don't need NXT at all:

1. **Likely direct customers** — `totaaltechniekgroep.nl` (21 misses), `hanab.nl`, `rskinstallatie.nl`, installers/retailers/VVE-beheerders. → the actual NXT test set.
2. **E-invoicing / procurement intermediaries** — `*.ariba.com`, `p2p.basware.com`, `spendlab.com`, `sap.com`, `factuurportal.eu`, `eusmtp.*`. Sender domain ≠ customer; the customer is in the invoice/body. → **pre-classified as Lever 4 (body extraction), skip NXT domain test.**
3. **Free-webmail leakage** — any that slipped the free-domain filter (e.g. `icloud.com`). → exclude.

The size of bucket 2 alone is a partial answer: a large bucket 2 means Lever 4 is mandatory regardless of NXT results.

## How to Run

NXT SQL is only reachable via the Zapier whitelisted-IP path (CLAUDE.md / `feedback_nxt_data_access`). Two viable execution paths:

- **Reuse the generic NXT lookup Zap** (`public.zapier_tools` registry; body-field auth) with a domain-LIKE query, OR
- Add a tsx probe under `web/debtor-email-analyzer/src/spike-007-nxt-probe.ts` that calls the existing `nxt-zap-client` with a new domain-scoped lookup. **Note:** today's `lookupSenderToAccount` matches the *exact* contact email; the probe needs a new query shape: `WHERE contact_person_email LIKE '%@<domain>'` grouped to `top_level_customer_id`.

Per-brand: run against each brand's `nxt_database` (the misses span brands). For the probe, the SMEBA debtor DB covers most volume; widen if needed.

### NXT query shape (per domain, per brand)

```sql
-- conceptual; actual execution via Zapier NXT SQL
SELECT DISTINCT top_level_customer_id, top_level_customer_name
FROM <contacts join>
WHERE lower(contact_person_email) LIKE '%@' || :domain;
```

Outcome per domain: `0 customers` (not a customer), `1 customer` (Lever-3 recoverable), `2+ customers` (tiebreaker-recoverable).

## Decision Rule (what the result feeds)

Let `H` = share of bucket-1 domains (weighted by miss count) that return ≥1 NXT customer.

| Result | Interpretation | Milestone shape |
|---|---|---|
| `H` high (say ≥60%) | domain match recovers most of the 127 | **Build Lever 3 deep; defer Lever 4** |
| `H` mid (30–60%) | domain helps but leaves a tail | Lever 3 + Lever 4 both, Lever 3 first |
| `H` low (<30%) | most misses aren't domain-resolvable | **Lever 4 (LLM body extraction) is the headline; Lever 3 is cleanup** |

Combine with bucket-2 size: large bucket 2 forces Lever 4 in regardless.

## Input

The never-seen domains, ranked by miss volume — regenerate with `domains.sql`. Top of list as of 2026-05-29: `totaaltechniekgroep.nl` (21), `cbre.com` (6), `hanab.nl` (5), `argroep.nl` (3), `buildingsagency.be` (3), `rskinstallatie.nl` (3), … (~127 distinct domains total).

## Results — VALIDATED 2026-05-29

**Executed live** via the Zapier MCP SQL Server tools against `nxt_benelux_prod` (cross-DB from the `zapier` integration DB). Schema from the `Moyne-Roberts/db-query` repo: `dbo.customer` (id, name, brand_id, parent_id hierarchy, email, vat_number) + `dbo.contact_person` (email, customer_id). Domain extracted via `SUBSTRING(email, CHARINDEX('@',email)+1, 200)`, matched on equality.

### Headline

**88% of the 78 curated business miss-domains (69/78) exist as a real NXT Benelux customer/contact.** The "never-seen" domains from Spike 005 were NOT non-customers — they were customers we'd simply never resolved because Stage 2 layer-2 does *exact-email* matching only.

### Weighted by miss volume (182 external misses, 30d)

| Bucket | Domains | Misses | % external | Recovery path |
|---|---:|---:|---:|---|
| Unique-customer domain | 21 | 45 | 24.7% | Clean direct domain match |
| Multi-customer domain | 47 | 65 | 35.7% | Domain → org, existing LLM tiebreaker picks account |
| **Domain-resolvable subtotal** | **68** | **110** | **60.4%** | **Lever 3 (+ tiebreaker)** |
| No NXT-Benelux match | 35 | 72 | 39.6% | consumer-ISP individuals + Ariba/Basware intermediaries + IE brand |

**Lever 3 recovers ~60% of external misses — 3x Spike 005's 19.2% proxy floor.**

### Key structural finding: multi-customer domains

Property managers / facility-management orgs map one domain to many NXT accounts: `vbtgroep.nl`→81, `cbre.com`→59, `schepvastgoed.nl`→40, `veolia.com`→30, `holland2stay.com`→24. For these, domain match identifies the *organisation* but not *which account/site* — so Lever 3 must hand multi-customer domains to the existing LLM tiebreaker (and likely a site-level disambiguation step using `dbo.site` / `customer.parent_id`), NOT auto-resolve.

### The no-match bucket (72 misses)

Mostly consumer-ISP senders not in the free-domain filter (ziggo/kpn/planet/etc.) → individuals, only resolvable by exact-contact or body extraction; plus e-invoicing intermediaries (`*.ariba.com`, `p2p.basware.com`) where the customer is in the invoice body (Lever 4); plus `apexfire.ie` (lives in `nxt_ireland_prod`, not Benelux). 9 of the 78 business domains genuinely had no Benelux match.

## Decision (resolved)

`H` ≈ 88% (very high) → **build Lever 3 deep.** It reuses the existing tiebreaker for multi-customer orgs. Lever 4 (LLM body extraction) is still warranted but for the *intermediary/consumer* residue, not the headline. Site-level disambiguation (`dbo.site`) emerges as a new sub-lever for the big FM/property domains.

## Production note

This spike used the claude.ai-authenticated Zapier MCP for live SQL. The **production** Lever 3 resolver must still go through the whitelisted Zapier path (`nxt-zap-client` + a new `nxt.domain_lookup` query shape: `email LIKE '%@'+domain` grouped to `top_level_customer_id`) — the MCP may be unavailable in headless/cron contexts.

