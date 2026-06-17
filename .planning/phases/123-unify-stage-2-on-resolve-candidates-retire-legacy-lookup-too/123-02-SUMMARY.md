---
phase: 123-unify-stage-2-on-resolve-candidates-retire-legacy-lookup-too
plan: 02
subsystem: agentic-pipeline-stage-2-resolver
tags: [stage-2, resolve_candidates, sales, sender-match, factuur-match, legacy-removal]
requires:
  - lookupResolveCandidates (nxt.resolve_candidates Zap 43uuz1r, resolver_index substrate)
  - resolver_index identifier kinds: email_domain, email_address, invoice_no (all live)
  - SALES_RESOLVE_INTENT "sales_resolution" allowlist (seeded by 20260616b)
provides:
  - resolve_candidates-backed sales sender_match (email_domain/email_address back-search)
  - resolve_candidates-backed sales factuur_match (invoice_no, root_party_id rollup)
  - 4 sales test files driving the resolve_candidates mock (zero legacy wrapper mocks)
affects:
  - web/lib/automations/sales-email/resolve-customer.ts
  - web/lib/automations/sales-email/lookups/offerte.ts
tech-stack:
  added: []
  patterns:
    - resolve_candidates single-substrate Stage-2 resolution (mirrors offerte/order lookups)
    - scope_key + is_unique_in_scope gate + distinct-party/distinct-root fail-closed
    - root_party_id rollup (D-04) for invoice resolution
    - sender_domain corroboration axis name decoupled from resolver_index kind (D-05)
key-files:
  created:
    - .planning/phases/123-unify-stage-2-on-resolve-candidates-retire-legacy-lookup-too/123-02-SUMMARY.md
  modified:
    - web/lib/automations/sales-email/resolve-customer.ts
    - web/lib/automations/sales-email/lookups/offerte.ts
    - web/lib/automations/sales-email/__tests__/corroboration-sales.test.ts
    - web/lib/automations/sales-email/__tests__/resolve-customer.test.ts
    - web/lib/automations/sales-email/__tests__/unresolved-fallthrough.test.ts
    - web/lib/automations/sales-email/__tests__/self-auth-noop-sales.test.ts
decisions:
  - "Sales scope constants exported from lookups/offerte.ts (SALES_ENVIRONMENT_ID / SALES_BRAND_SCOPE / SALES_SCOPE_KEY) and reused by the adapter — single source of truth, mirrors how order.ts already imports SALES_RESOLVE_INTENT from offerte.ts (chose the export option over a local const block)."
metrics:
  duration: "~6 minutes"
  completed: 2026-06-17
  tasks: 2
  files: 6
---

# Phase 123 Plan 02: Rewire SALES Stage-2 (sender + factuur) onto resolve_candidates Summary

The sales Stage-2 adapter `sender_match` and `factuur_match` cases now resolve the
customer over the single generic `nxt.resolve_candidates` substrate — the SAME
transport the offerte/order lookups already use — instead of the legacy per-kind
wrappers (`lookupSenderToAccount` / `lookupIdentifierToAccount`). The corroboration
signal shape (independence axis names `sender_domain` + `invoice_no`) and the
fail-closed posture (`is_unique_in_scope` + `scope_key` + distinct-party/root != 1
→ null, no LLM tiebreaker for sales) are preserved, the adapter keeps zero
swarm-name runtime branch, and the 4 sales test files were rewired to drive the
`resolve_candidates` mock. This is the sales half of capability-before-removal:
sales no longer CALLS the legacy wrappers before Plan 03 deletes them.

## What Was Built

- **Task 1 — sender_match + factuur_match → resolve_candidates** (commit `341aa64e`):
  - **sender_match:** the D-07 own-tenant quoted-sender swap is UNCHANGED. The
    effective sender is passed to `lookupResolveCandidates(SALES_RESOLVE_INTENT)` as
    BOTH the full lowercased address (`email_address`) and its bare domain
    (`email_domain`); returned rows are filtered to `identifier_kind` in
    `{email_address, email_domain}`, `scope_key === SALES_SCOPE_KEY`,
    `is_unique_in_scope === true`; `email_address` rows are preferred over
    `email_domain`; distinct `party_id` != 1 → null (no signal — no LLM tiebreaker
    for sales). The single-hit StepHit keeps `result.method:"sender_match"`,
    `confidence:"high"`, status carried, and `signal.identifier_kind:"sender_domain"`
    (the corroboration independence axis name is preserved regardless of which
    resolver_index kind matched).
  - **factuur_match:** `extractInvoiceCandidates` is unchanged; the candidates are
    passed to `lookupResolveCandidates(SALES_RESOLVE_INTENT)` as `invoice_no` seeds.
    Returned rows are filtered `identifier_kind === "invoice_no"` + scope +
    `is_unique_in_scope`, rolled up by `root_party_id ?? party_id` (D-04); distinct
    root != 1 → null. Single → StepHit with `result.method:"identifier_match"`,
    `signal.identifier_kind:"invoice_no"`, `confidence:"high"`, status carried,
    `matched_identifiers = candidates`.
  - Lookup error → `.catch → { matches: [] }` → the case returns null (fail-closed).
  - The `seenIdentifiers` trail, the no-corroboration short-circuit path, and the
    corroboration collect + `scoreCorroboration` path are byte-unchanged. No
    swarm-name branch (corroboration still gated on `config.corroboration` only).
  - **offerte.ts:** the three sales scope constants (`SALES_ENVIRONMENT_ID`,
    `SALES_BRAND_SCOPE`, `SALES_SCOPE_KEY`) were changed from module-private to
    `export` so the adapter reuses them rather than redefining (single source of
    truth; the plan's allowed 1-line export option).
- **Task 2 — rewire the 4 sales test files** (commit `b8d7838b`): every mock of
  `lookupSenderToAccount` / `lookupIdentifierToAccount` was replaced with a
  `lookupResolveCandidates` mock returning `ResolveCandidateMatch` rows tagged
  `email_address` / `email_domain` (sender) or `quote_no` / `invoice_no`
  (identifiers), `scope_key "SB"`, `is_unique_in_scope` per scenario. Where a test
  drove multiple wrapper outputs per step, it now uses ONE `resolve_candidates` mock
  whose rows' `identifier_kind` selects which step consumes them (the adapter filters
  by kind). All assertion intents preserved: single-hit resolve, ambiguous → demote,
  lone-sender → medium, unresolved fall-through, self-auth no-op, WR-04 attempted-id
  trail, WR-05 quoted-header preference.

## Decisions Made

- **Sales scope constants exported from `lookups/offerte.ts`** and reused by the
  adapter, instead of a local const block in `resolve-customer.ts`. This mirrors how
  `lookups/order.ts` already imports `SALES_RESOLVE_INTENT` from `offerte.ts`, keeps
  one source of truth for the sales scope, and is the plan-sanctioned option ("1-line
  export change to offerte.ts is allowed under this plan"). `order.ts` retains its own
  module-local copies of the scope constants — no conflict, no change needed there.

## Deviations from Plan

### [Rule 1 — Bug] resolve-customer.test.ts garbage-id (V5) test assertion would have broken

- **Found during:** Task 2.
- **Issue:** The V5 garbage-identifier test (`from_email: "prospect@brand-new.example"`)
  asserted `lookupResolveCandidatesMock` was NOT called. After the rewire,
  `sender_match` calls `resolve_candidates` for any valid sender address, so a valid
  prospect address would now legitimately invoke the substrate — making the
  "substrate never called" assertion test the wrong thing.
- **Fix:** Changed the test's `from_email` to an own-tenant forwarder
  (`verkoop@smeba.nl`) with NO quoted-header block, so `effectiveSender` is null and
  `sender_match` no-ops. The substrate is then only reachable via the identifier
  steps, which the malformed offerte/order/postcode tokens must gate — preserving the
  test's actual intent (the V5 format gate runs before any substrate call). Comment
  updated to explain the new setup.
- **Files modified:** `web/lib/automations/sales-email/__tests__/resolve-customer.test.ts`
- **Commit:** `b8d7838b`

Otherwise: plan executed exactly as written.

## Verification

- `cd web && npx tsc --noEmit` → 0 errors.
- `cd web && npx vitest run lib/automations/sales-email/__tests__/` → 4 files, 21 tests passed.
- `cd web && npx vitest run lib/automations/sales-email` → 14 files, 91 tests passed.
- `grep -n "lookupSenderToAccount\|lookupIdentifierToAccount" web/lib/automations/sales-email/resolve-customer.ts`
  → only a comment line (no runtime call).
- `grep -nE "swarm_type|=== 'sales|=== 'debtor" web/lib/automations/sales-email/resolve-customer.ts`
  → only a comment line (no runtime swarm-name branch).
- `grep -rn "lookupSenderToAccount\|lookupIdentifierToAccount" web/lib/automations/sales-email/__tests__/`
  → nothing.
- `identifier_kind: "sender_domain"` + `identifier_kind: "invoice_no"` both still present
  in resolve-customer.ts (corroboration independence axis preserved).

## Threat Model Compliance

- **T-123-05 (Spoofing, sender domain back-search):** mitigated —
  `is_unique_in_scope` + `scope_key === SALES_SCOPE_KEY` gate + distinct-party != 1 →
  null; no LLM tiebreaker for sales (corroboration is the multi-signal path).
- **T-123-06 (Tampering, D-07 quoted-sender extraction):** accepted — the WR-05
  `QUOTED_HEADER_RE` quoted-header-scoped extraction is byte-unchanged; a bare
  signature address is not trusted.
- **T-123-07 (Elevation, swarm-name branch creep):** mitigated — corroboration stays
  gated on `config.corroboration` presence; grep asserts no `swarm_type` runtime
  branch (only a documenting comment).

## Note for Plan 03

This is the sales half of capability-before-removal: production code no longer CALLS
the two legacy wrappers from either swarm (debtor in Plan 01, sales here), but the
wrapper definitions, types, schemas, `NxtToolId` literals, `callNxtTool` branches in
`nxt-zap-client.ts`, the 2 `zapier_tools` rows, and the `nxt_lookup_requests` CHECK
constraints are still present — Plan 03 deletes them.

## Self-Check: PASSED

- FOUND: web/lib/automations/sales-email/resolve-customer.ts
- FOUND: web/lib/automations/sales-email/lookups/offerte.ts
- FOUND: .planning/phases/123-unify-stage-2-on-resolve-candidates-retire-legacy-lookup-too/123-02-SUMMARY.md
- FOUND commit 341aa64e (feat sender + factuur rewire)
- FOUND commit b8d7838b (test rewire)
