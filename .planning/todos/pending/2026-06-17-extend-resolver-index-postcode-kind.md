---
created: 2026-06-17
phase_origin: 120-02
priority: medium
area: stage-2-resolver / nxt-sql
---

# Extend resolver_index with a postcode→site kind (re-enable sales postcode path)

## Context

Phase 120-02 migrated the sales identifier lookups (offerte/order/sites) from the
nxtRequest REST proxy to the `zapier.dbo.resolver_index` SQL back-search (LOCKED
Stage-2 transport rule: resolve via the SQL substrate, never REST).

Offerte (`quote_no`) and order (`order_no`) migrated cleanly. **Postcode→Site did
not**: `resolver_index` has no postcode index. Its `site_no` kind holds NUMERIC NXT
site numbers (e.g. 647225), and there is no `postcode` kind. So a postcode string
("1234AB") never matches and `lookupPostcodeToAccount` returns null (fail-closed).

This pauses ~55% of sales identifier volume (postcode_site was the highest-frequency
sales signal in the Phase 114 mining report: 706 hits / 55%).

## What to do

Extend the NXT-side MERGE that populates `zapier.dbo.resolver_index` to emit a
postcode→party kind (e.g. `identifier_kind = 'postcode'`, `identifier_value_norm` =
canonical "1234AB", `party_id` = owning customer of the Site, `is_unique_in_scope`
computed per the existing rules). This is the locked "extend the lookup tables,
don't add a REST call" path.

## Self-enable (no app code change beyond the kind allowlist)

`web/lib/automations/sales-email/lookups/sites.ts` is already wired to the
back-search. It filters returned rows by `POSTCODE_SITE_KINDS = {"postcode",
"site_no"}`. The moment resolver_index emits postcode rows, the path resolves at
confidence "medium" (corroborating-strength — one postcode → potentially many
Sites). The unit test `sites-backsearch.test.ts` already proves the wired path with
a mocked site/postcode row.

## Caveat

A postcode maps to potentially MULTIPLE Sites (hence "medium", not "high"). The
`is_unique_in_scope` computation must reflect that — a postcode shared by ≥2 parties
must be non-unique so the back-search fails closed rather than guessing.
