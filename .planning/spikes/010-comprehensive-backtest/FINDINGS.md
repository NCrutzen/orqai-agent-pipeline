# Findings — Assumption Scorecard (spike 010)

11 agents, live tests vs real email threads + NXT. ✅ holds · ❌ breaks · ◑ partial. Full design in DESIGN-GUIDE.md.

## Batch A — domain & intermediaries
- A1 ◑ "88% domains resolve" inflated — many resolve to a SET, not a customer.
- A2 ❌ single-customer domain ≠ correct (sap.com→an individual; candex→the intermediary).
- A3 ✅ intermediary domains attach to unrelated customers (basware.com=30) — dangerous.
- A4 ◑ "namens X" present on intermediaries only (~10% of all misses); over-fires on echoed templates.
- A5 ◑ named principal resolves but highly ambiguous (EQUANS 62, ISS 29, IKEA 27).

## Batch B — numbers
- A6 ❌ NXT invoice.invoice_number (188xxxxx) ≠ customer-cited numbers. **BUT revived via peppol (FU1).**
- A7 ✅ job.internal_id via werkbon subject → site → customer (12/12).
- A8 ✅ PO refs → orders.* when booked.
- A9 ✅ ~40-50% fresh inbound POs not yet orders (miss).
- A10 ✅ quote refs SB######/BB###### resolve.
- A11 ✅ "Klantnummer:" → customer.id (NOT previous_customer_id); A40 "Ons klantnummer" = their id for us.
- A12 ❌ id-space collisions (customer.id vs site.id) — namespace must follow labeled context.
- A36 ✅ gov-dunning recoverable via quoted Klantnummer.

## Batch C — postcode/geo
- A13 ◑ multiple postcodes common; first often wrong; "most-frequent" is NOT the fix → extract-all ∩ candidates.
- A14 ✅ 21% contain our own postcode (first in 64%) → denylist mandatory.
- A15 ◑ narrows only when a true ship-to/delivery block present (PO/work-order).
- A16 ✅ site.postcode recovers FM cases customer.postcode misses — must ∩ domain candidates.
- A17 ✅ BE 4-digit too noisy (year "2026" dominates).

## Batch D — other signals
- A18 ❌ VAT rare (6.8%), returns parent-set; own/intermediary contamination.
- A19 ❌ phone poisoned by own number + collisions.
- A20 ✅ KvK is 74% OUR own number — worst signal without blocklist.
- A21 ✅ name ambiguous for chains (Dirk 73, CBRE 64); rarely unique.
- A22 ✅ sender display-name → contact mostly absent or collides.
- A34 ◑ single-match domains ~80% genuine; junk tail (inactive/individual/intermediary) → filter status + person-rows.

## Batch E — threads
- A23 ◑ body_full_text source-dependent (zapier ~100%, outlook 9.5%, sugarcrm 0%).
- A24 ◑ untestable (label data too thin); structural contamination risk real (121 mixed threads).
- A25 ✅ 75% of internal-forwards have recoverable external addr in quoted thread (but can be intermediary).
- A26 ❌ domain/name NOT brand-safe (hanab.nl → 3 brands); customer NUMBER is brand-safe.
- A27 ✅ conversation_context populated (2.8% coverage) — cleaner than body regex; backfill = high value.
- A32 ❌ recipients ~81% populated but = receiving mailbox, not customer; real party in quoted headers.

## Batch F — strategy
- A28 ✅ corroboration common where it matters; precedence defined.
- A29 ✅ safe auto-resolve set exists (~17-25%), self-authenticating IDs.
- A30 ✅ ~10-13% hard noise (single-sender noreply) + ~14% real-mail-with-noise-subject.
- A31 ✅ 65% stable (5-wk history); worst smeba-fire.be 70.6%, best berki 56.7%.
- A33 ✅ platform contamination sized; platform-score rule (distinct/contacts).
- A35 ✅ principal in subject for ~18% (our aanmaning) + intermediary subjects.
- A37 ❌-as-stated: real FP is quoted "Namens TBlox" delegate headers, not dunning template; Klantnummer is an untapped SIGNAL.

## Follow-ups (FU)
- FU1 ✅ Invoice back-search REVIVED: `zapier.dbo.vw_peppol_invoice.exact_invoice_id` → customer_id, brand-scoped (NL 17-25M unique; BE 32-33M collides 3× → brand mandatory).
- FU2 ❌ Lever 1 BUG: backfill hit emails not labels → inheritance dead by construction. Realisable 22 (44 bidirectional). All labels status='dry_run' (status filter not the bug).
- FU3 ✅ Sizing: 17% auto (100% precision, 47/47), 56% suggest, 27% hard, 10% noise. Regex fixes (drop ^anchor; colon optional).
- FU4 ✅ Concrete blocklists produced (own-entity, freemail, platform, own-domain-on-925-customers).
- E2E ✅ Fresh-email validation: auto 10/10 correct, suggest 3/3 plausible, 0 wrong auto. One guard: brand-scope BE invoices (feasible via source_mailbox).

## New assumptions raised & folded into design
A33-A43, A-INV1..3, A-OWN1..2, A-PLAT1, NA1..3 — all incorporated into DESIGN-GUIDE.md (§5 blocklists, §6 brand, §9 bugs, §11 guards).

## Confidence
HIGH. The validated pipeline (§3) with brand-scoping + blocklists + self-auth-ID-first precedence is sound: 0 false positives across all auto-resolve validation on fresh data. Remaining unknowns are operator/config questions (§14), not design risks.
