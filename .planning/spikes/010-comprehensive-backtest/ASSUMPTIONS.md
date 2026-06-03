# Assumption Register — Stage 2 Resolution Recall

Each must be backtested LIVE against real emails/threads + NXT. Status: ⬜ untested · ✅ holds · ❌ breaks · ◑ partial.
Owner = agent batch. Evidence captured in FINDINGS.md.

## Batch A — Domain match precision & intermediaries (design-critical)
- A1 ⬜ A business-domain sender maps to ≥1 NXT customer (the 88% claim) holds across a larger/older sample, not just 30d.
- A2 ⬜ When a domain maps to exactly ONE NXT customer, that customer is the CORRECT one (not a false positive).
- A3 ⬜ Intermediary/shared-service domains (ariba/basware/spendlab/coupa/onguard/etc.) attach to unrelated customer records → domain match is dangerous on them. Enumerate which of our miss-domains are intermediaries.
- A4 ⬜ Intermediary emails reliably contain "namens/op verzoek van/uw klant/on behalf of X" naming the real principal.
- A5 ⬜ The named principal resolves to an NXT customer by name (and how ambiguous).

## Batch B — Number back-search (precision + coverage)
- A6 ⬜ Our invoice numbers (8-digit) appearing in emails resolve to the correct customer via invoice.customer_id.
- A7 ⬜ Job numbers (job.internal_id) in emails resolve via site→customer correctly.
- A8 ⬜ Customer PO refs in emails match orders.sales_reference/reference_* WHEN the order exists.
- A9 ⬜ Fresh inbound POs are frequently NOT in our orders yet (back-search miss) — quantify the rate.
- A10 ⬜ Quote refs (SB######) and enquiry_number resolve correctly.
- A11 ⬜ Customer/debtor number cited in email → customer.id or previous_customer_id (and which one).
- A12 ⬜ Numbers in emails collide across types (a string that matches both an invoice AND an order/job of different customers) — false-positive risk.

## Batch C — Postcode / address / geo
- A13 ⬜ Extracting ALL postcodes beats first-postcode (the first is often wrong).
- A14 ⬜ Emails frequently contain our OWN brand postcode/address (must be stripped) — quantify.
- A15 ⬜ Within a multi-customer domain, postcode narrows to a unique customer often enough to matter.
- A16 ⬜ Site-level postcode (site table) recovers cases customer.postcode misses (FM delivery sites).
- A17 ⬜ Belgian 4-digit postcodes are too noisy to use without context (vs NL 1234AB).

## Batch D — Other signals
- A18 ⬜ VAT number in email → vat_number; high precision when present.
- A19 ⬜ Phone (normalized +31/+32/0) → customer/site/contact narrows correctly.
- A20 ⬜ KvK in email sometimes refers to OUR entity, not the customer (false signal) — quantify.
- A21 ⬜ Customer NAME fuzzy match is ambiguous for chains/franchises → never a standalone key.
- A22 ⬜ Sender display-name → contact_person fullname is too collision-prone to use alone.

## Batch E — Threads, inheritance, structure
- A23 ⬜ body_full_text reliably contains the full quoted thread (extraction source).
- A24 ⬜ thread_inheritance: a prior label on the same conversation_id is the SAME customer (no intra-thread contamination).
- A25 ⬜ Internal-forward emails (own-brand sender) contain a recoverable external customer in the quoted thread.
- A26 ⬜ Cross-brand threads resolve to the correct BRAND's customer DB (Hanab↔Fire Control case).
- A27 ⬜ conversation_context table is populated and usable for thread reconstruction.

## Batch F — Aggregate / strategy
- A28 ⬜ Signals corroborate more than they conflict; define the precedence when they conflict.
- A29 ⬜ A safe AUTO-RESOLVE set exists (single high-precision signal, no intermediary) with ~0 false positives — size it.
- A30 ⬜ A meaningful share of top miss-domains are Stage-1 noise (noreply/automated), not Stage-2 targets — quantify.
- A31 ⬜ The 65% unresolved rate is stable over 90d (not a 30d artifact); recompute over 90d + by brand.
- A32 ⬜ recipients/CC, if populated, would carry the real customer for intermediary/forwarded mail (sized as future ingest fix).
