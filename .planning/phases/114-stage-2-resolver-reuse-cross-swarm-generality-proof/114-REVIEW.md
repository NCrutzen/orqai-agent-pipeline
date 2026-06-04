---
phase: 114-stage-2-resolver-reuse-cross-swarm-generality-proof
reviewed: 2026-06-04T00:00:00Z
depth: standard
files_reviewed: 33
files_reviewed_list:
  - scripts/no-engine-diff-check.sh
  - supabase/migrations/20260604_generic_resolution_audit.sql
  - supabase/migrations/20260604b_sales_resolution_config.sql
  - web/app/api/automations/sales-email/ingest/route.ts
  - web/lib/agentic-pipeline/resolve/__tests__/body-source-selection.test.ts
  - web/lib/agentic-pipeline/resolve/__tests__/conversation-id-forward-rate.test.ts
  - web/lib/agentic-pipeline/resolve/__tests__/dispatch.test.ts
  - web/lib/agentic-pipeline/resolve/__tests__/port-equivalence.test.ts
  - web/lib/agentic-pipeline/resolve/__tests__/resolution-blocklists-seed.test.ts
  - web/lib/agentic-pipeline/resolve/__tests__/self-auth-noop.test.ts
  - web/lib/agentic-pipeline/resolve/body-source.ts
  - web/lib/agentic-pipeline/resolve/config.ts
  - web/lib/agentic-pipeline/resolve/engine.ts
  - web/lib/agentic-pipeline/resolve/forward-rate-paths.ts
  - web/lib/agentic-pipeline/resolve/steps/identifier-match.ts
  - web/lib/agentic-pipeline/resolve/steps/sender-match.ts
  - web/lib/agentic-pipeline/resolve/steps/thread-inheritance.ts
  - web/lib/automations/debtor-email/resolve-debtor.ts
  - web/lib/automations/sales-email/__tests__/resolve-customer.test.ts
  - web/lib/automations/sales-email/__tests__/self-auth-noop-sales.test.ts
  - web/lib/automations/sales-email/__tests__/unresolved-fallthrough.test.ts
  - web/lib/automations/sales-email/lookups/offerte.ts
  - web/lib/automations/sales-email/lookups/order.ts
  - web/lib/automations/sales-email/lookups/sites.ts
  - web/lib/automations/sales-email/resolve-customer.ts
  - web/lib/inngest/events.ts
  - web/lib/inngest/functions/stage-2-customer-resolver.ts
  - web/lib/outlook/__tests__/fetch-shape.test.ts
  - web/lib/outlook/client.ts
  - web/lib/pipeline-gating/dry-run-gate/__tests__/dry-run-gate.test.ts
  - web/lib/pipeline-gating/dry-run-gate/index.ts
  - web/lib/swarms/dynamic.ts
  - web/lib/swarms/types.ts
  - web/scripts/output/sales-identifier-mining.json
  - web/scripts/sales-identifier-mining.ts
findings:
  critical: 2
  warning: 5
  info: 4
  total: 11
status: issues_found
---

# Phase 114: Code Review Report

**Reviewed:** 2026-06-04
**Depth:** standard
**Files Reviewed:** 33
**Status:** issues_found

## Summary

Phase 114 onboards a sales Stage 2 entity resolver onto the generic resolution
engine transplanted from the donor branch, with a registry-driven worker
dispatch and a swarm-agnostic `resolution_audit` table. The no-Engine-diff guard
and the migrations are well-constructed, and the engine/steps files were verified
against the donor-byte-identical constraint (no logic-change findings raised in
those files, per scope note).

Two correctness defects dominate. First, the worker sources `brand_id` exclusively
from `debtor.labeling_settings` keyed by `source_mailbox` — for sales
(`verkoop@smeba.nl`) that row does not exist, so `brand_id` is `null` and **two of
the five seeded precedence steps (`sender_match`, `factuur_match`) can never fire**.
Second, `entity_brand` is read as `entity_brand[0]` and cast `as string`, but the
registry shape for that column has migrated to an array of objects — the audit row
and the Stage 3 hand-off can carry `"[object Object]"` / a JSON object where a brand
string is expected. Both undermine the "cross-swarm generality proof" the phase
claims to demonstrate.

## Critical Issues

### CR-01: Sales `brand_id` is always null → `sender_match` and `factuur_match` are dead steps

**File:** `web/lib/inngest/functions/stage-2-customer-resolver.ts:86-126`
**Issue:**
The worker loads resolver inputs from `debtor.labeling_settings`:

```ts
step.run("load-settings", async () => {
  const { data } = await admin
    .schema("debtor")
    .from("labeling_settings")
    .select("dry_run, nxt_database, brand_id, entity, icontroller_company")
    .eq("source_mailbox", source_mailbox)   // = "verkoop@smeba.nl" for sales
    .maybeSingle();
  return data;
}),
...
const brandId: string | null = settingsRow?.brand_id ?? null;
```

`debtor.labeling_settings` is the debtor swarm's per-mailbox table; there is no row
for the sales mailbox `verkoop@smeba.nl`, so `settingsRow` is `null` and
`brandId === null` for every sales email. The sales adapter then gates two of its
five precedence steps on `args.brand_id`:

- `sender_match`: `if (effectiveSender && args.brand_id)` (resolve-customer.ts:131)
- `factuur_match`: `if (extract.candidates.length > 0 && args.brand_id)` (resolve-customer.ts:208)

Both branches are skipped whenever `brand_id` is null — i.e. always — so sales
resolution silently collapses to offerte/postcode/order only. The seed migration
documents `sender_match` as the highest-confidence cross-cutting signal and places
it FIRST in precedence, but at runtime it is unreachable. This defeats the
data-driven precedence design and will mis-route every sender-resolvable or
invoice-resolvable sales email to `unresolved`.

The seed config carries the brand in `scope.brand_scope: ['SB']`, but neither the
worker nor the adapter reads `config.scope` — `brand_id` only ever comes from the
(nonexistent) debtor settings row.

**Fix:** Source the brand for the generic path from registry/config rather than
`debtor.labeling_settings`. For example, in the worker derive the brand from the
swarm's `resolution_config.scope.brand_scope` (or `entity_brand`) when
`usesGenericPath`, and pass that as `brand_id`:

```ts
const genericBrandId =
  (resolutionConfig as { scope?: { brand_scope?: string[] } } | null)
    ?.scope?.brand_scope?.[0] ?? null;
const effectiveBrandId = usesGenericPath ? genericBrandId : brandId;
```

then pass `effectiveBrandId` into `resolver.resolveEntity({ ..., brand_id: effectiveBrandId })`.
Add a worker-level test asserting that for a sales event a non-null brand reaches
`resolveEntity` so `sender_match` is exercised.

### CR-02: `entity_brand` read as `[0] as string` corrupts the audit + Stage 3 hand-off

**File:** `web/lib/inngest/functions/stage-2-customer-resolver.ts:144-146`
**Issue:**

```ts
const entityBrand: string | null = Array.isArray(swarmGate?.entity_brand)
  ? ((swarmGate?.entity_brand as unknown[])[0] as string | undefined) ?? null
  : null;
```

Per `web/lib/swarms/types.ts:57-63`, `entity_brand` migrated from `string[]`
(Phase 68 seed) to `Record<string, unknown>[]` (BrandRegister metadata objects)
after `20260505a_entity_brand_expansion.sql`, and `brand-register.ts` is the
canonical reader. Taking `[0] as string` blindly assumes the legacy string-array
shape. If the sales row carries the post-migration object shape, `entityBrand`
becomes an object cast to `string`, which is then:

- inserted into `email_pipeline.resolution_audit.entity_brand` (a `text` column,
  migration `20260604_generic_resolution_audit.sql:36`) — stringified to
  `"[object Object]"` or rejected, and
- emitted as both `entity` and `entity_brand` on `${swarm_type}/coordinator.requested`
  (lines 343-344), feeding a malformed brand into the Stage 2→3 context-shape
  contract.

This is a silent data-corruption path on the exact "generic audit + Stage 3
hand-off" surface the phase introduces.

**Fix:** Read the brand through the canonical brand-register loader (or normalize
explicitly), e.g.:

```ts
const firstBrand = Array.isArray(swarmGate?.entity_brand)
  ? swarmGate!.entity_brand[0]
  : null;
const entityBrand: string | null =
  typeof firstBrand === "string"
    ? firstBrand
    : firstBrand && typeof firstBrand === "object"
      ? (firstBrand as { code?: string; brand_id?: string }).code ??
        (firstBrand as { brand_id?: string }).brand_id ?? null
      : null;
```

Confirm the sales row's `entity_brand` shape and add an assertion test that the
emitted `entity_brand` is a scalar brand code, not an object.

## Warnings

### WR-01: `nxt_database` defaulted to literal `"nxt"` for sales reads

**File:** `web/lib/inngest/functions/stage-2-customer-resolver.ts:188`
**Issue:** On the generic path the worker passes
`nxt_database: nxtDatabase ?? "nxt"`. For sales `nxtDatabase` is null (same root
cause as CR-01 — no debtor settings row), so the literal `"nxt"` is used. The sales
sender/factuur lookups (`lookupSenderToAccount`, `lookupIdentifierToAccount`) thread
this into the debtor Zapier-SQL cross-DB views. If `"nxt"` is not the correct
database handle for the sales brand, those lookups silently return no matches rather
than erroring. Even after CR-01 is fixed, this hardcoded fallback should come from
config, not a magic string.
**Fix:** Source `nxt_database` from `resolution_config.source`/`scope` for the
generic path (or document why `"nxt"` is always correct for every onboarded swarm)
and drop the literal default.

### WR-02: `postcode_site_match` regex collides with other identifier formats → wrong-account risk

**File:** `web/lib/automations/sales-email/lookups/sites.ts:18`
**Issue:** `POSTCODE = /\b[1-9][0-9]{3}\s?[A-Za-z]{2}\b/g` matches any
"4 digits + 2 letters" token, not only genuine NL postcodes. Tokens such as a
reference like `1234AB`, a product/SKU code, or a partial offerte fragment will be
treated as a postcode and sent to `/api/sites/search`. Because the adapter
short-circuits on the FIRST hit and `postcode_site_match` sits ahead of
`factuur_match`/`order_match` in precedence, a spurious postcode match can resolve an
email to the wrong customer account with `confidence: "high"`. This is the highest-
volume identifier (55%), so false positives here have broad blast radius.
**Fix:** Tighten validation — require the postcode to appear in an address-like
context, validate against a real NL postcode range/list, and/or treat a postcode-only
match as `medium` confidence pending corroboration (the D-06 fast-follow). At minimum
add negative-case tests (SKU/reference strings that must NOT resolve).

### WR-03: `order` regex matches mid-word, broadening false positives

**File:** `web/lib/automations/sales-email/lookups/order.ts:16`
**Issue:** `ORDER_GENERIC = /order[a-z]*\s*[:#]?\s*(\d{4,8})/gi` has no leading word
boundary, so it matches inside longer words ("herorder 12345", "doororder...", and
"werkorder 1634448" via the embedded "order"). The werkorder collision is benign
(deduped to the same digits), but the missing `\b` means unrelated substrings ending
in "order" followed by any 4-8 digit run get extracted and sent to NXT. Combined with
first-hit short-circuit, this is a (lower-volume) wrong-account vector.
**Fix:** Anchor the pattern: `/\border[a-z]*\s*[:#]?\s*(\d{4,8})/gi`. Add a test for
a mid-word negative case.

### WR-04: Worker error fallback discards extracted identifiers in `matched_identifiers`

**File:** `web/lib/inngest/functions/stage-2-customer-resolver.ts:208-221`
**Issue:** When `resolver.resolveEntity` throws, the catch block builds an
`unresolved` result with `matched_identifiers: []`, discarding any identifiers the
adapter had extracted before the throw. The legacy debtor path has the same shape,
but for sales this means the audit row + Stage 3 hand-off lose the evidence trail
exactly when a lookup failed — the case where an operator most needs to see which
identifier was attempted. Note also the adapter itself never throws on lookup error
(every lookup `.catch`es to null/empty), so this catch is effectively dead for the
sales path; the audit will show no identifiers even though some were tried.
**Fix:** Have the adapter surface attempted identifiers even on the unresolved path
(it already accumulates `seenIdentifiers`), and prefer the adapter's own
`inputs.matched_identifiers` over `[]` in the worker catch.

### WR-05: `extractQuotedSender` picks the first non-tenant email anywhere in the body

**File:** `web/lib/automations/sales-email/resolve-customer.ts:73-79`
**Issue:** On an own-tenant forward the adapter scans the whole body and returns the
FIRST non-tenant email address as the effective sender. Email bodies routinely
contain unrelated addresses (cc lists, signatures, mailto links, disclaimers,
prior-thread participants). Picking the first match positionally can resolve the
thread to the wrong external party, again with `confidence: "high"` via
`sender_match`. The mining report notes 23% internal forwards, so this path is well-
exercised.
**Fix:** Constrain extraction to the quoted-header context (e.g. lines following
`Van:`/`From:`/`Verzonden namens`), or require the address to appear in the first
quoted header block rather than anywhere in the body. Add a fixture with a signature
address that must NOT win over the quoted-header sender.

## Info

### IN-01: Duplicate `lookupIdentifierToAccount` import

**File:** `web/lib/automations/sales-email/resolve-customer.ts:41-43`
**Issue:** `lookupSenderToAccount` and `lookupIdentifierToAccount` are imported from
the same module (`nxt-zap-client`) across two separate `import` statements (lines 41
and 43). Harmless but redundant.
**Fix:** Merge into a single import statement.

### IN-02: Three identical `pickCustomer` helpers duplicated across lookups

**File:** `web/lib/automations/sales-email/lookups/offerte.ts:79`, `order.ts:64`, `sites.ts:68`
**Issue:** The tolerant response-envelope parser `pickCustomer` is copy-pasted
verbatim in all three lookup modules. Divergence risk if one is later hardened and
the others are not.
**Fix:** Extract a shared `pickCustomer` (and the `SalesCustomerMatch` type already
shared from offerte.ts) into a single `lookups/_shared.ts`.

### IN-03: `case_ref` mined but silently unsupported — no runtime guard

**File:** `supabase/migrations/20260604b_sales_resolution_config.sql:20-23`
**Issue:** The migration header explains `case_ref` (18%) is intentionally excluded
from precedence because it has no account lookup. That reasoning is sound, but
nothing in code or schema prevents a future operator from adding `"case_ref"` to the
precedence array, where the engine/adapter would silently skip it (unknown step name)
— a config that looks active but does nothing.
**Fix:** Optionally log a warning when a precedence entry matches no known step, so a
typo'd or unsupported step name is observable rather than silent.

### IN-04: `runThreadInheritanceOnly` duplicated from the thread-inheritance step

**File:** `web/lib/inngest/functions/stage-2-customer-resolver.ts:609-674`
**Issue:** This helper reimplements the exact query + mapping already in
`resolve/steps/thread-inheritance.ts`. The comment acknowledges the duplication
("kept duplicated rather than extracted"). Acceptable given the engine-byte-identical
constraint, but worth noting as a known maintenance hazard if the debtor label query
schema changes.
**Fix:** None required this phase; track for consolidation once the engine-diff guard
is retired.

---

_Reviewed: 2026-06-04_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
