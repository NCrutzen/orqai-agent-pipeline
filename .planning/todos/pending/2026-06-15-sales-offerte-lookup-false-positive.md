---
captured: 2026-06-15
source: Spike 011 Phase B (live-NXT resolution-lift probe on verkoop@ corpus)
status: in-progress
priority: H
target_milestone: sales-golive (BLOCKER for sales Stage 2 cutover)
tags: [stage-2, sales, resolution, bug, false-positive, offerte, nxt]
---

## UPDATE 2026-06-15 — fail-closed safety guard SHIPPED

The false positive is fixed. New shared matcher
`web/lib/automations/sales-email/lookups/_match.ts` (`pickMatchingCustomer`) replaces the three
identical blind-`content[0]` `pickCustomer` helpers in offerte.ts / order.ts / sites.ts. It only
returns a customer when a search row DEMONSTRABLY references the searched identifier (schema-agnostic
value scan: exact field equality always, ≥6-char containment for embedded postcodes/refs, short
terms require exact equality). Non-matching response → null (SAFE MISS). Regression tests:
`lib/automations/sales-email/lookups/__tests__/match.test.ts` (9, incl. the literal 512887 case) +
two adapter tests updated to realistic responses. Full sales suite green (74/74).

**Caveat (important):** this guarantees "never wrong", not "resolves". Because the real
`/api/{quotes,orders,sites}/search` response schema was never validated, the live resolve-rate may
now drop toward ~0 until the schema is confirmed (offerte was returning garbage anyway). That is the
correct fail-closed posture for a customer-identity resolver. The items below remain OPEN.

### Still open
1. Debug the `postcode` 0% resolve rate. **ROOT CAUSE FOUND (spike 011c):** see below.
2. Re-run spike 011 Phase B after the endpoint contracts are fixed.

## UPDATE 2026-06-15 — live schema probe (spike 011c) reveals all 3 endpoints are mis-called

`web/scripts/spike-011c-schema-probe.ts` captured the REAL response shapes (read-only, 6 prod
searches). The lookups were built on a guessed contract that does not match reality:

- **`POST /api/quotes/search` IGNORES `searchTerm`.** REAL (`SB014098`) and BOGUS (`ZZ999999`)
  return the SAME 20-row default list (`{content:[20]}`, 15 distinct customerIds). The searched
  quote is NOT in the default page → the 512887 bug was content[0] of an unfiltered list. The row
  shape IS rich and usable: `id, brandId, customerId, customerName, siteId, siteName, siteCity,
  sitePostcode, status, reference, netQuoteValue, type, name, relatedJobId, salesRep, createdOn,
  validUntilDate, closedDate, sentOn`. **Need the correct search param** (searchTerm is wrong);
  then match on `reference` and read `customerId`.
- **`POST /api/orders/search` IGNORES `searchTerm` too** (array[20], same for REAL/BOGUS) AND the
  row has **no customer id** — keys `internalId, planWindowEnd, ticket, order, customerName, brand`.
  Order resolution needs the correct search param AND a customerId source (customerName only is not
  resolvable to an account id safely).
- **`POST /api/sites/search` → 405 Method Not Allowed.** Wrong HTTP method/path entirely (returns
  `{type, status, path, message}`). This is why postcode resolved 0/29 in Phase B. Try GET, or the
  correct sites search path.

### Next (needs the correct NXT REST search contract)
- Once the contract is known: filter `quotes` by `reference`, find a `customerId` source for
  `orders`, fix the `sites` method; then the existing fail-closed matcher already guards correctness.
- Re-run spike 011 Phase B for the true lift numbers.

## UPDATE 2026-06-15 — bounded discovery probe (spike 011d) found NO working filter

`web/scripts/spike-011d-endpoint-discovery.ts` tried 13 proven-style variants (per nxt-client.ts:
customers = POST /api/customers {searchTerm}; items = POST /api/items/search {searchTerm}). NONE
filtered:
- `POST /api/quotes/search` returns the SAME 20-row default list for `{searchTerm}`, `{reference}`,
  `{searchText}`, `{…,size:200}`. `POST /api/quotes` → 500. `GET /api/quotes/search?searchTerm=` →
  400. `GET /api/quotes?reference=` → 405.
- `POST /api/orders/search {searchText}` → unfiltered 20. `POST /api/orders {searchTerm}` → 500.
  `GET /api/orders/search?searchTerm=` → 0 rows.
- `POST /api/sites {searchTerm|postcode}` → 0 rows (the proven `/api/sites` filters by `customerId`,
  NOT postcode). `GET /api/sites?postcode=` → 405; `GET /api/sites/search?searchTerm=` → 400.

**Conclusion: the quote/order/site search filter cannot be reverse-engineered by guessing.** These
are list endpoints whose real filter mechanism is unknown (likely a `filter`/`criteria` object or a
query DSL the SPA sends). Stop guessing — further probing is low-yield + prod load.

### Correct path forward (option 2 — get the real contract, do not guess)
- **Capture the SPA's actual quote-search XHR** via Browserless (the token-harvest infra already
  drives the NXT SPA): open a quote search in the UI, record the network call (method, path, exact
  body/params), replicate it. This is a build task, not a probe.
- OR ask the NXT integration owner for the quote/order/site search contract.
- Re-evaluate whether postcode→customer is even REST-resolvable: proven `/api/sites` is keyed by
  `customerId`, so there may be no postcode→site search — postcode may need a different strategy
  (or drop as an AUTO signal, keep as corroboration-only).
- The fail-closed matcher (`_match.ts`) already guards correctness, so this is a RECALL task, not a
  safety blocker. Sales Stage 2 stays safe (resolves ~nothing) until the contract lands.

### Spike artifacts
`web/scripts/spike-011{c,d}-*.ts` + `.planning/spikes/011-…/spike-011{c,d}-*.txt` (structure-only).

## UPDATE 2026-06-15 — SQL back-search VERIFIED; REST path should be replaced, NOT the REST infra deleted

The REST detour was the wrong transport. The PROVEN substrate already exists in the `zapier`
database: tables `resolver_index` / `resolver_customer` / `resolver_watermark` — exactly the
DESIGN-GUIDE Layer-A projection (`swarm_source, environment_id, scope_key, identifier_kind,
identifier_value_norm, party_id, party_name, parent_party_id, is_unique_in_scope, precedence,
status, …`), populated from `nxt`.

Verified live (read-only, Zapier SQL): offerte **SB014098** → `quote_no` value **`14098`** (index
stores the bare digits, no "SB" prefix) → **`BX228895` Bever B.V.**, `scope_key='SB'`,
`is_unique_in_scope=true`. Matches the email subject ("Offerte SB014098 … Bever Utrecht"). The
bogus `512887` does NOT exist as a quote resolution — it was purely a REST artifact. Identifier
kinds present include `quote_no, order_no, po_no, invoice_no, job_no, postcode, …` (the full
back-search vocab, already indexed with uniqueness + precedence — i.e. corroboration-ready).

### Corrected fix path (replace transport, keep the rest)
- **Replace** the auto-resolution lookups `offerte.ts` / `order.ts` / `sites.ts`: drop the
  `nxtRequest` REST calls; back-search `zapier.dbo.resolver_index` instead
  (`WHERE identifier_kind=… AND identifier_value_norm=<normalized> AND scope_key='SB'`,
  prefer `is_unique_in_scope=1`). Normalize the offerte to bare digits (strip the SB/SMEQ prefix)
  before lookup. The `_match.ts` fail-closed guard becomes unnecessary for these (SQL is exact)
  but stays harmless.
- **Production transport:** a Zapier SQL Zap (like the debtor sender/factuur webhooks) querying
  `resolver_index`, registered in `public.zapier_tools` — OR wire the generic engine's
  `resolve_candidates` path (DESIGN-GUIDE) which reads this same index. This is the v8.2 / Phase-90
  resolution-recall substrate; it belongs in that milestone.
- **DO NOT delete the NXT REST infra.** `nxtRequest`/`nxt-client`/token-store/proxy are load-bearing
  for: order-entry writes (`create-sales-order`), order-entry UI lookups
  (`/api/nxt/lookup/{customers,sites,items,brands,order-types}`), and the operator's MANUAL Stage-2
  customer-search widget (`stage-2-search.ts`, `stage-2-widget.tsx`, `stage-2-decide.tsx`,
  `thread-actions.ts`) which uses the PROVEN `searchCustomers` (POST /api/customers). Only the three
  auto-resolution identifier lookups switch transport.
- Bonus: because `resolver_index` already carries every identifier kind with `is_unique_in_scope` +
  `precedence`, switching to it ALSO unlocks the D-06 corroboration milestone
  (`[[2026-06-04-d06-corroboration-fast-follow]]`) — one SQL call returns the whole candidate set.
---

# Sales offerte/identifier lookups return a customer WITHOUT verifying the match

## What spike 011 Phase B found

Ran `web/scripts/spike-011b-sales-resolution-lift.ts --limit 40` against prod NXT
(read-only). Of 40 ≥1-identifier sales emails:

- **`offerte` "resolved" 24/24 = 100% — but ALL 24 to the SAME account `512887`**,
  across a random sample spanning 24 DISTINCT offerte numbers (SB014098, SB012839,
  SB013721, SB014377, …). No real reading has 24 random quotes sharing one customer.
- `postcode` 0/29, `order` 0/1.

## Root cause (code-confirmed)

`lookupOfferteToAccount` → `pickCustomer` in
`web/lib/automations/sales-email/lookups/offerte.ts:85-105` takes `content[0]` of the
`/api/quotes/search` response and reads `customerId` **without ever checking that the
returned quote's reference equals the searched `offerteNumber`**. A broad/default search
result therefore hands back the first quote's customer regardless of input → a confident
WRONG resolve. This is the exact failure mode spike 009 flagged (spendlab→EQUANS).

Audit the sibling lookups for the same defect: `lookupOrderToAccount` (order.ts) and
`lookupPostcodeToAccount` (sites.ts) use the same `pickCustomer`-style first-row pattern.

## Why it is not (yet) causing harm

Sales Stage 2 is still gated: `public.swarms` sales-email
`dry_run_config.stage_2_resolution = true`. Nothing is written live. **But this is a hard
blocker for the sales Stage 2 cutover** — flipping dry-run off as-is would inject customer
`512887` into ~25% of sales emails (offerte presence rate, spike 011 Phase A).

## Fix

1. In `pickCustomer` (and order/sites equivalents): only accept a row whose quote/order
   reference (or Site postcode) **equals the searched identifier**. Reject `content[0]` blindly.
2. Confirm `/api/quotes/search` (+ orders/sites) actually filter on `searchTerm` server-side;
   if they return a broad list, filter client-side by exact reference before `pickCustomer`.
3. Add a unit test: a bogus offerte number (`SB999999`) must resolve to `null`, not a customer.
4. Separately debug the `postcode` 0% resolve rate on the sales corpus (sites search params /
   postcode→Site→customer wiring).
5. Re-run spike 011 Phase B after the fix to get the TRUE agreement/conflict/lift numbers
   (the current run's lift is unmeasurable while offerte returns garbage).

## Link

- Spike: `.planning/spikes/011-sales-corroboration-opportunity/` (README "Phase B findings")
- Related: `[[2026-06-04-d06-corroboration-fast-follow]]` — a working 2nd signal (postcode)
  would have DEMOTED this false positive (CONFLICT). The bug is positive evidence for the
  corroboration milestone.
