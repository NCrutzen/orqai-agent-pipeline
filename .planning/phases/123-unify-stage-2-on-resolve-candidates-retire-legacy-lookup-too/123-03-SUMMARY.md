---
phase: 123-unify-stage-2-on-resolve-candidates-retire-legacy-lookup-too
plan: 03
subsystem: agentic-pipeline-stage-2-resolver
tags: [stage-2, resolve_candidates, legacy-removal, atomic-removal, nxt-zap-client]
requires:
  - 123-01 (debtor rewired off the legacy wrappers in production)
  - 123-02 (sales rewired off the legacy wrappers in production)
provides:
  - lean nxt-zap-client.ts carrying ONLY nxt.candidate_details + nxt.resolve_candidates
  - NxtToolId union = "nxt.candidate_details" | "nxt.resolve_candidates"
  - repo-wide absence of the two legacy tool ids/wrappers/types/schemas (grep 0)
affects:
  - web/lib/automations/debtor-email/nxt-zap-client.ts
  - web/scripts/spike-011b-sales-resolution-lift.ts
  - web/tests/labeling/nxt-zap-client.test.ts
  - web/lib/automations/debtor-email/__tests__/nxt-zap-client-allowlist.test.ts
  - web/lib/automations/sales-email/resolve-customer.ts
tech-stack:
  added: []
  patterns:
    - single-substrate Stage-2 resolution (nxt.resolve_candidates) — legacy per-kind tools retired
    - retire-with-note for one-off measurement spikes (provenance kept, broken legacy path dropped)
key-files:
  created:
    - .planning/phases/123-unify-stage-2-on-resolve-candidates-retire-legacy-lookup-too/123-03-SUMMARY.md
  modified:
    - web/lib/automations/debtor-email/nxt-zap-client.ts
    - web/scripts/spike-011b-sales-resolution-lift.ts
    - web/tests/labeling/nxt-zap-client.test.ts
    - web/lib/automations/debtor-email/__tests__/nxt-zap-client-allowlist.test.ts
    - web/lib/automations/sales-email/resolve-customer.ts
decisions:
  - "Spike 011b RETIRED with a top-of-file deprecation note (not rewired): it is a Phase-120 one-off measurement whose findings are baked into the live corroboration engine. The legacy wrapper imports + the --with-zapier sender/factuur path were removed so the file still type-checks; the --with-zapier flag is now a parsed no-op. A full rewire to lookupResolveCandidates was not warranted for a historical spike."
  - "Historical comments in resolve-customer.ts and spike-011b that named the deleted wrapper symbols verbatim were reworded to 'the two legacy per-kind wrappers/tools' so the RESL-UNIFY-04 absence-grep stays a clean 0 — the absence gate should not be polluted by provenance prose."
  - "Task 1 commit boundary: nxt-zap-client.ts itself type-checks after deletion, but tsc still reports 8 caller-side errors (spike + nxt-zap-client.test.ts) at that boundary — expected and resolved by Task 2. The atomicity guarantee (green build) is asserted at the Task 3 boundary, not per-file."
metrics:
  duration: "~10 minutes"
  completed: 2026-06-17
  tasks: 3
  files: 5
---

# Phase 123 Plan 03: Delete legacy NXT lookup tools (code removal) Summary

Atomic code removal of `nxt.contact_lookup` + `nxt.identifier_lookup` from `nxt-zap-client.ts` (wrappers, input types, Zod match schemas, `ResponseSchemaByTool`/`LookupKindByTool` entries, `NxtToolId` literals, and `callNxtTool` overload branches), plus rewire of the 2 remaining test files to `nxt.resolve_candidates` and retirement of the spike-011b legacy path — repo grep 0, tsc 0, full vitest suite green at this commit boundary.

## What was built

- **Task 1 (`2e5fd6ce`):** Deleted every legacy symbol from `web/lib/automations/debtor-email/nxt-zap-client.ts`:
  - `NxtToolId` collapses to `"nxt.candidate_details" | "nxt.resolve_candidates"`.
  - Removed `ContactLookupInput` / `IdentifierLookupInput` types.
  - Removed `ContactMatchSchema` / `IdentifierMatchSchema` + their `ContactMatch` / `IdentifierMatch` type exports.
  - Removed the 2 `ResponseSchemaByTool` + 2 `LookupKindByTool` entries.
  - Collapsed the `callNxtTool` input conditional to `candidate_details ? CandidateDetailsInput : resolve_candidates ? ResolveCandidatesInput : never`.
  - Removed the `lookupSenderToAccount` / `lookupIdentifierToAccount` wrappers.
  - Updated the header `// Tools:` doc-comment.
  - KEEP list (untouched): candidate_details + resolve_candidates paths, registry loader, wait/poll machinery, `ToolNotAllowedForIntentError`, `__resetZapierToolCacheForTests`.

- **Task 2 (`7044341c`):** Rewired the 2 remaining test files + retired the spike:
  - `tests/labeling/nxt-zap-client.test.ts`: retargeted the registry fixture + all `callNxtTool` assertions from `nxt.contact_lookup` to `nxt.resolve_candidates` (resolve input shape `{nxt_database, brand_id, environment_id, identifiers}`, `ResolveCandidateMatch` shape `{identifier_kind, identifier_value_norm, party_id, party_name, is_unique_in_scope}`, `lookup_kind="resolve_candidates"`). Preserved coverage: body-field auth POST shape, brand_id-format reject, sync-pattern mismatch, missing `DEBTOR_FETCH_WEBHOOK_SECRET`, missing `NEXT_PUBLIC_APP_URL`, Zod parse reject.
  - `lib/automations/debtor-email/__tests__/nxt-zap-client-allowlist.test.ts`: retargeted the default-deny scenarios from `nxt.identifier_lookup` to `nxt.resolve_candidates` (NULL allowlist denies, empty-array denies, unlisted-intent denies, listed-intent permits); `ToolNotAllowedForIntentError` coverage intact.
  - `scripts/spike-011b-sales-resolution-lift.ts`: retired-with-note — dropped the legacy wrapper imports + the `--with-zapier` sender/factuur path (now a no-op).

- **Task 3 (`991e4a63`):** Atomicity gate for RESL-UNIFY-04:
  - Repo-wide grep for `lookupSenderToAccount | lookupIdentifierToAccount | nxt.contact_lookup | nxt.identifier_lookup` across `web/ *.ts` → **0** (reworded one residual provenance comment in `sales-email/resolve-customer.ts`).
  - `tsc --noEmit` → **0 errors**.
  - Full `vitest run` → **325 files passed, 2732 tests passed, 0 failed** (22 files / 40 tests skipped, 91 todo).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Historical comments named the deleted symbols, polluting the absence grep**
- **Found during:** Task 2 + Task 3
- **Issue:** Provenance comments in `spike-011b-sales-resolution-lift.ts` and `sales-email/resolve-customer.ts` referenced the deleted wrapper/tool-id tokens verbatim. The RESL-UNIFY-04 acceptance grep (`nxt.contact_lookup | nxt.identifier_lookup | lookupSenderToAccount | lookupIdentifierToAccount`) matched them, which would make the atomicity gate read non-zero and could mislead a future drift check.
- **Fix:** Reworded the comments to "the two legacy per-kind wrappers/tools" while preserving the historical note. No behavior change.
- **Files modified:** `web/scripts/spike-011b-sales-resolution-lift.ts`, `web/lib/automations/sales-email/resolve-customer.ts`
- **Commits:** `7044341c` (spike comments), `991e4a63` (resolve-customer comment)

### Discretionary Choices (CONTEXT-permitted)

- **Spike 011b: retire vs. rewire.** Per the plan's Task 2 guidance ("prefer retire-with-note … only do a full rewire if trivial"), the spike was retired. Phase 120's sales-corroboration findings are already baked into the live engine; a full `--with-zapier` rewire to `lookupResolveCandidates` was not justified for a one-off historical measurement. The script still type-checks and the `--with-zapier` flag is a parsed no-op.

## Known Stubs

None. The retired `--with-zapier` path is a deliberate no-op in a historical spike script, not a stub feeding any UI or production surface; it is documented in the file's top deprecation banner.

## Self-Check: PASSED

- `web/lib/automations/debtor-email/nxt-zap-client.ts` — FOUND, NxtToolId = candidate_details + resolve_candidates only, grep 0 legacy symbols.
- `web/scripts/spike-011b-sales-resolution-lift.ts` — FOUND, no legacy imports.
- `web/tests/labeling/nxt-zap-client.test.ts` — FOUND, suite green.
- `web/lib/automations/debtor-email/__tests__/nxt-zap-client-allowlist.test.ts` — FOUND, suite green.
- Commits `2e5fd6ce`, `7044341c`, `991e4a63` — all present in `git log`.
- Repo-wide legacy grep = 0; tsc = 0 errors; full vitest suite green (2732 passed).
