---
status: resolved
phase: 121-attachment-borne-identifier-extraction
source: [121-VERIFICATION.md]
started: 2026-06-17
updated: 2026-06-17
---

## Current Test

[resolved — see decisions below]

## Tests

### 1. ROADMAP [x] marker vs. unplanned 121-02/03
expected: Decide whether the discovery wave (121-01) alone closes Phase 121, or whether the `[x]` should be held until Plan 121-02 (xlsx extraction + one-mail→many guard for #24) is planned and built. The manifest provides the 121-02 scope; it has not been planned. 121-03 (eval acceptance) is additionally blocked on Phase 123 (debtor → resolve_candidates).
result: RESOLVED — plan 121-02 now. ROADMAP [x] reverted to [ ]; phase stays open until the #24 build (xlsx extraction + one-mail→many guard) is planned and executed. 121-03 acceptance remains blocked on Phase 123.

### 2. ATID-01..04 traceability gap
expected: REQUIREMENTS.md contains only Phase 120 (CORR-01..05) — zero ATID-* rows. Plan declares requirements [ATID-01, ATID-03, ATID-04] and SUMMARY claims them met (fold ships, both swarms opted-in, adapter-side constraint held), but there is nothing in the registry to close against. Decide whether to transcribe ATID-01..04 into REQUIREMENTS.md for formal V9.5 traceability.
result: RESOLVED — ATID-01..04 added to REQUIREMENTS.md (Phase 121 section) with status notes. Left OPEN until 121-02 lands (ATID-01 xlsx residual) and 121-03 confirms (ATID-04 eval, gated on Phase 123).

## Summary

total: 2
passed: 2
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps
