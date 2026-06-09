---
phase: 114-stage-2-resolver-reuse-cross-swarm-generality-proof
plan: 07
subsystem: sales-email-stage-2
tags: [stage-2, resolution, sales-email, security-hardening, gap-closure, wr-02, wr-03, wr-04, wr-05, in-01]
gap_closure: true
requires:
  - 114-04 (sales Stage 2 adapter + lookups)
  - 114-06 (Stage 2 worker generic path — owns the worker file; untouched here)
provides:
  - "Postcode extraction gated to address-like context + downgraded to medium confidence (WR-02)"
  - "Word-boundary-anchored order regex (WR-03)"
  - "Unresolved path carries attempted-but-unmatched identifiers (WR-04)"
  - "Quoted-header-scoped sender extraction (WR-05)"
  - "Single merged nxt-zap-client import (IN-01)"
affects:
  - web/lib/automations/sales-email
tech-stack:
  added: []
  patterns:
    - "Address-context heuristic gate over a postcode-shaped regex (street-number / address-label cue within ~30-char window)"
    - "Per-lookup confidence on SalesCustomerMatch (optional, defaults high; postcode self-downgrades to medium)"
    - "Quoted-header line scan (Van:/From:/Verzonden namens/On..wrote:) + following lines for forward-sender extraction"
    - "Extract-time identifier accumulation so the unresolved fall-through audit trail is non-empty"
key-files:
  created: []
  modified:
    - web/lib/automations/sales-email/lookups/sites.ts
    - web/lib/automations/sales-email/lookups/order.ts
    - web/lib/automations/sales-email/lookups/offerte.ts
    - web/lib/automations/sales-email/resolve-customer.ts
    - web/lib/automations/sales-email/__tests__/resolve-customer.test.ts
decisions:
  - "WR-02 confidence downgrade implemented via an optional confidence field on SalesCustomerMatch (one-file-each change) rather than branching in the adapter — keeps identifierResult generic and lets each lookup declare its own confidence-strength."
  - "WR-02 address-context is a heuristic narrowing (street-number OR address-label cue in a ~30-char window), explicitly NOT a full NL postcode-range validation — documented inline and tied to the D-06 corroboration fast-follow as the proper engine-level fix."
  - "WR-04 worker catch-block matched_identifiers:[] left untouched: it is dead-for-sales (all adapter lookups .catch to null, the adapter never throws) AND the worker file is owned by plan 114-06. The adapter-side trail is the real fix."
metrics:
  duration: ~12m
  tasks: 2
  files: 5
  completed: 2026-06-04
---

# Phase 114 Plan 07: Sales Stage 2 Review-Warning Gap Closure Summary

Hardened the sales Stage 2 lookup + adapter surface against the five Phase 114 review warnings (WR-02..WR-05) plus the trivial IN-01 duplicate-import cleanup — cutting the false-positive blast radius on the highest-volume identifiers (postcode 55%, sender, order) with negative-case TDD tests, ZERO engine/config/steps changes.

## What Was Built

Two TDD tasks, each RED → GREEN, committed atomically:

**Task 1 (d2af4442) — postcode (WR-02) + order (WR-03) regex hardening**
- `order.ts`: anchored `ORDER_GENERIC` with a leading `\b` (`/\border[a-z]*\s*[:#]?\s*(\d{4,8})/gi`) so a mid-word "order" (e.g. `herorder 12345`) no longer matches. `WERKORDER` already requires the literal `werkorder` prefix — left as-is.
- `sites.ts`: postcode extraction now requires an address-like context. A candidate is accepted only when the ~30-char window around it contains a street-number pattern OR an address-label cue (`adres|postcode|straat|weg|laan|plein|locatie|vestiging`). A bare SKU/reference token shaped like `1234AB` is rejected. Documented inline as a heuristic narrowing, not full NL postcode-range validation.
- `sites.ts` + `offerte.ts` + `resolve-customer.ts`: postcode hits now resolve at `confidence:"medium"` (a postcode maps to potentially multiple Sites — corroborating strength only). Implemented via an optional `confidence` field on `SalesCustomerMatch` (offerte.ts), set to `"medium"` by `lookupPostcodeToAccount`, honored by `identifierResult` (default `"high"`). Tied to the D-06 corroboration fast-follow as the proper engine fix.

**Task 2 (11f71fef) — sender (WR-05) + identifier trail (WR-04) + import merge (IN-01)**
- `extractQuotedSender`: rewritten to scope extraction to the quoted-header context. Scans for the first quoted-header line (`Van:` / `From:` / `Verzonden namens` / `On ... wrote:`) and pulls the first non-own-tenant address from that line + the next few lines. No quoted-header block → returns null (no positional first-match guess over the whole body). Stops signature/cc/disclaimer addresses from hijacking `sender_match` at high confidence. D-07 internal-forward resolution preserved (resolved via the quoted header, not an arbitrary body address).
- WR-04: `offerte_match` / `postcode_site_match` / `order_match` now push extracted candidates into `seenIdentifiers` at EXTRACTION time (before the account lookup), so the unresolved fall-through carries attempted-but-unmatched identifiers. Added an order-preserving `dedupe` helper. Inline note that the worker catch-block `matched_identifiers:[]` (WR-04 part 2) is dead-for-sales.
- IN-01: merged the two `@/lib/automations/debtor-email/nxt-zap-client` imports into one statement.

## Verification

- `npx vitest run lib/automations/sales-email/__tests__/resolve-customer.test.ts` — 14/14 green (10 inherited + 4 WR-02/WR-03 + 3 WR-05/WR-04; note 4+3 added across the two tasks, totalling 14).
- `bash scripts/no-engine-diff-check.sh` — exit 0; engine/config/steps byte-identical to donor, dynamic.ts only the sales registration entry.
- `grep -c 'from "@/lib/automations/debtor-email/nxt-zap-client"' resolve-customer.ts` — 1 (imports merged).
- `grep -nc '\border' lookups/order.ts` — 1 (anchored).
- `npx tsc --noEmit` — no errors in touched files.
- `npx eslint` (touched files) — 0 errors.

## Deviations from Plan

### Auto-fixed Issues

None beyond the plan-sanctioned threading. The plan offered two implementation paths for the WR-02 confidence downgrade (a `confidence` field on `SalesCustomerMatch`, OR branching in the adapter). The field approach was chosen and required a small honoring change in `resolve-customer.ts`'s `identifierResult` (default `"high"`, honors `hit.confidence`) — explicitly anticipated by the plan ("add a `confidence` field ... and have identifierResult honor it"). Not a deviation.

## Known Stubs

None. All changes are wired and exercised by tests.

## Deferred Issues

- **D-06 multi-match corroboration** remains the proper engine-level fix for WR-02 (a postcode mapping to multiple Sites should RAISE confidence when corroborated by other signals). Tracked in `.planning/todos/pending/2026-06-04-d06-corroboration-fast-follow.md`. The medium-confidence downgrade shipped here is the safe interim. The no-Engine-diff gate remains PROVISIONAL until corroboration lands (per that todo).

## Full-Suite Note

`npx vitest run` (full): 2470 passed / 1 failed. The single failure is `scripts/__tests__/no-legacy-inngest-names.test.ts` ("web/ is free of pre-Phase-88.1 function ids and event names"), which **passes when run in isolation** (2/2) and **does not reference any file touched by this plan**. It is a flaky/timeout artifact under full-suite parallel contention (the run took 7140ms), out-of-scope per the executor scope boundary — logged here, not fixed.

## Self-Check: PASSED

- Created files: n/a (modify-only plan)
- Modified files: all 5 FOUND on disk
- Commits: d2af4442 FOUND, 11f71fef FOUND
