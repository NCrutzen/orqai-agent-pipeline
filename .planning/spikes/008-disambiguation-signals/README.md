---
spike: 008
name: disambiguation-signals
type: standard
validates: "Given a multi-customer domain (one email domain → many NXT accounts), when we fetch richer NXT fields (number back-search: invoice/job/PO/order/quote; plus postcode, city, VAT, name, site) and match them against markers in the email body, then we can pick the right customer — establishing which markers actually disambiguate and how"
verdict: VALIDATED 2026-05-29 — number back-search (invoice/job/PO/order/quote → exactly one customer) is the highest-precision mechanism and even recovers no-domain-match cases; postcode is a strong NARROWING signal (85% email coverage, ~100% NXT-populated) but not a clean key (sender-signature confound); disambiguation = number back-search → postcode/VAT narrowing → LLM tiebreaker
related: [005, 006, 007]
tags: [stage-2, disambiguation, nxt, postcode, recall, measurement]
idea: stage-2-resolution-recall
---

# Spike 008: disambiguation-signals (multi-customer domains)

## Why This Exists

Spike 007 found that 60% of external misses are domain-resolvable, but **47 domains / 65 misses map to 2+ NXT customers** (property managers, facility-management orgs: `vbtgroep.nl`→81 accounts, `cbre.com`→59, `veolia.com`→30). Domain match identifies the *organisation*, not the *account*. This spike fetches richer NXT fields and tests which email markers actually pick the right one.

## NXT fields available for disambiguation (`nxt_benelux_prod`, schema via `Moyne-Roberts/db-query`)

- `customer`: postcode, city, vat_number, address_1/2, phone_number_1..4, name, external_code, g_number, company_registration_number, peppol_id, parent_id (hierarchy)
- `site`: postcode, city, name, address_1/2, phone, latitude/longitude — one row per managed building (key for FM orgs)
- `contact_person`: firstname, lastname, email, mobile, phone, job_title

## Number back-search — the primary mechanism (added per operator 2026-05-29)

A number is the strongest possible signal: an invoice/job/PO/order/quote number maps to **exactly one** customer, regardless of sender domain — so it disambiguates multi-customer domains AND recovers the no-domain-match bucket (Ariba/Basware/consumer emails that quote a number). 89% of multi-bucket emails already contain reference words. Today's `identifier_match` layer only does invoice numbers; this widens it to every back-searchable number.

### Back-search map (`nxt_benelux_prod`)

| Number in email | NXT table.column | → customer | Real format (sampled) |
|---|---|---|---|
| Invoice no. | `invoice.invoice_number` | `customer_id` / `paying_customer_id` (direct) | 8-digit, brand-prefixed — `18800001` |
| Order no. | `orders.order_id` | `customer_id` (direct) | small int — low value, internal |
| **PO / customer ref** | `orders.sales_reference`, `reference_1/2/3`, `quote_reference` | `customer_id` (direct) | free text — `SSQ75589`, `EPN51812756`, `96152-29066-1` |
| Job no. | `job.internal_id` | via `site_id` → `site.customer_id` | 6–7 digit — `870305`, `1026065` |
| Quote ref. | `quote.reference` | `customer_id` (direct) | `[A-Z]{2}\d{6}` — `SB000028` |
| Enquiry / opdracht | `quote.enquiry_number` | `customer_id` (direct) | free text — `Opdracht A1625828/1` |
| Ticket sign ref | `ticket.sign_reference` | via `job_id` → `site` → customer | free text |

### Extraction design notes
- **Structured numbers** (invoice 8-digit-188-prefix, job 6–7-digit, quote `SB######`) → match by format against the typed column. High precision, low false-positive.
- **Customer PO refs** live in `orders.sales_reference` / `reference_1/2/3` as the customer's *own* reference (`SSQ75589`, `EPN51812756`). Back-search = take alphanumeric tokens from the email and look them up as a match against those columns. Note `reference_1` also holds junk (`"Akkoord"`) — require token length/shape gating.
- **Brand-scope** the lookup (`customer.brand_id`) and watch cross-brand DBs (`nxt_ireland_prod` for `.ie`).
- A number hit short-circuits resolution — no tiebreaker needed.

## Evidence

### 1. Marker presence in emails (multi-customer bucket, 65 misses)

| Marker | Present in email | Notes |
|---|---:|---|
| NL postcode (`[1-9][0-9]{3} ?[A-Z]{2}`) | **55 (85%)** | high coverage |
| invoice/reference words | 58 (89%) | highest coverage |
| VAT/BTW token | 54 (83%) | loose match; true VAT number rarer |
| phone | 15 (23%) | low |

### 2. Discriminating power on the NXT side (distinct postcodes vs customers per domain)

Postcode is **~100% populated** on NXT customers. It narrows sharply, sometimes 1:1:
- `rcn.nl`: 11 customers → 11 distinct postcodes (1:1, perfect)
- `buildingsagency.be`: 17 → 11 postcodes; `veolia.com`: 30 → 15 postcodes + 16 distinct VAT
- `vbtgroep.nl`: 81 → 28 postcodes (narrows ~3×, single VAT — one legal entity)
- `schepvastgoed.nl`: 40 → 7 postcodes, 1 city (weak); `holland2stay.com`: 24 → 4 (weak)

City is consistently weaker than postcode. VAT discriminates well **when populated**, but coverage is low on `.nl` (schepvastgoed/holland2stay/fris/asnbank = 0 distinct VAT).

### 3. End-to-end proof: email postcode → NXT customer (the decisive test)

Extracted postcodes from real miss bodies, matched to NXT customers under the same domain:

| domain + email postcode | matched customers | result |
|---|---:|---|
| hanab.nl 4130EA | **1** (Hanab Installation Technology B.V, Vianen) | ✅ unique |
| hanab.nl 7543BK | **1** (Enschede) | ✅ unique |
| hanab.nl 9723JA | **1** (Vianen) | ✅ unique |
| rcn.nl 8626GG | **1** (RCN de Potten, Offingawier) | ✅ unique |
| hanab.nl 4131NJ | 9 (VolkerWessels sub-accounts, same building) | ⚠ needs 2nd signal |
| cbre.com 1059CM | **33** (CBRE-GWS IFM, Amsterdam HQ) | ❌ postcode doesn't separate |
| cbre 6604LJ / 2628SJ / croonwolteren 5652AA / hanab 4874SO | **0** | ❌ postcode not a customer postcode |

## Key Findings

1. **Postcode is a narrowing filter, not a unique key.** It cleanly resolves "normal" multi-site firms (hanab, rcn) but fails for big FM aggregators (CBRE: 33 accounts at one postcode).
2. **The sender-signature confound.** Several email postcodes matched *zero* NXT customers because the postcode in the body is the **sender's own office address** (e.g. CBRE Amsterdam HQ in the signature), not the target building. Naïve "first postcode in body" extraction will pick the wrong one. → must extract *all* postcodes and match each against the candidate set, never trust position.
3. **Invoice/reference number is the strongest single disambiguator** — 89% email coverage AND an invoice number maps to exactly one customer (zero ambiguity). The existing `identifier_match` layer already targets this but isn't catching these (likely `extract-invoices.ts` regex too narrow). Widening it is the highest-ROL disambiguation fix.
4. **VAT** = high precision, low coverage → confirmatory signal only.

## Full signal menu — every pattern explored (2026-05-29)

Coverage scanned across all 182 external misses (email side) and 74,432 NXT Benelux customers (NXT side). Ranked by precision then coverage.

| Signal | Email coverage | NXT field (coverage) | Precision | Verdict |
|---|---:|---|---|---|
| Thread / conversation_id | — | prior label on thread | high | ✅ Lever 1 (shipped) |
| Invoice number | within 89% ref-words | `invoice.invoice_number` 8-digit (direct) | →1 customer | ✅ back-search |
| Job number | " | `job.internal_id` 6–7d → site → cust | →1 customer | ✅ back-search |
| PO / order / sales ref | " | `orders.sales_reference`/`reference_1..3` (direct) | →1 customer | ✅ back-search |
| Quote / enquiry no. | " | `quote.reference` (`SB######`)/`enquiry_number` | →1 customer | ✅ back-search |
| **Customer / debtor number** | **13%** | `customer.id` / `previous_customer_id` (73%) | →1 customer | ✅ back-search (NEW) |
| **KvK / company reg.** | **13%** (8-digit) | `company_registration_number` (36%) | →~1 customer | ✅ back-search (NEW) |
| Sender DOMAIN | 96% biz | customer/contact email domain | org-level (multi-cust) | ✅ Lever 3 |
| VAT number | ~loose 83% | `vat_number` (39%) | high | ✅ confirm/narrow |
| Postcode | 85% | `customer.postcode`/`site.postcode` (~100%) | narrowing | ✅ narrow (signature confound) |
| **Phone** | **35%** | `phone_number_1` (78%), site, contact mobile | narrowing/confirm | ✅ narrow (NEW; needs +31/0 normalization) |
| Customer / building name | high | `customer.name`/`site.name` (100%) | fuzzy, medium | ✅ tiebreaker feature |
| City | high | `customer.city` (100%) | weak | feature only |
| **peppol_id** | intermediary emails | `peppol_id` (4.5%) | high | ◑ targets Ariba/Basware residue (NEW) |
| Contact display name | `sender_name` | `contact_person` first+last | medium (name collisions) | ◑ soft signal, combine only (NEW) |

### Ruled out
- **IBAN / bank account** — `customer` has NO bank field (only the brand's own `brand.bank_account_number`). No IBAN→customer path in NXT. Dead.
- **CC / recipient addresses** — `email_pipeline.emails.recipients` is **empty (0/182)** on ingested rows — another ingest gap, exactly like `conversation_id` was. If populated, CC-domain matching would help intermediary/forwarded mail (the real customer is often CC'd). → **candidate ingest fix**, then a recipient-domain match lever.
- **g_number** (19/74,432) and **external_code** (1/74,432) — effectively unpopulated. Dead.

## Recommended disambiguation pipeline (for the milestone)

For a domain that matches 2+ customers, run signals in precision order, each *narrowing* the candidate set, then let the existing LLM tiebreaker pick from the survivors:

1. **Number back-search** (widen `extract-invoices.ts` → multi-identifier): invoice / job / PO / order / quote / enquiry / **customer-debtor** / **KvK** numbers, looked up across the back-search map above → exactly one customer; short-circuit. Works even with no domain match.
2. **VAT number** (when present) → confirm/short-circuit.
3. **Postcode** — extract ALL postcodes in body, match each against candidate `customer.postcode` AND `site.postcode`; intersection narrows the set. Never assume the first postcode is the target (sender-signature confound).
4. **Phone** (normalize +31/+32/0) → narrow against `customer`/`site`/`contact` phones.
5. **Customer / building name** in subject+body → fuzzy match `customer.name` / `site.name` (FM emails usually name the property).
6. **LLM tiebreaker** over the narrowed candidates (already exists; feed it name+city+postcode per candidate).

This is multi-signal candidate-narrowing, NOT a deterministic single key. Pairs naturally with the existing tiebreaker (D-12).

## Follow-ups for the milestone

- Pull `site`-level postcodes into the candidate set (FM orgs where the building is a `site`, not a `customer`).
- Validate the sender-signature confound at scale (what % of body postcodes are the sender's own) — informs whether to strip the signature block before extraction.
- Measure realized disambiguation accuracy on a labelled sample once the pipeline is built.
- **Populate `email_pipeline.emails.recipients` at ingest** (currently empty — same class of bug as the `conversation_id` gap fixed in `976d42d6`), then add a recipient/CC-domain match lever for intermediary + forwarded mail.

## Queries

See `queries.sql`.
