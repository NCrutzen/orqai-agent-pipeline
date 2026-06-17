---
status: partial
phase: 120-d-06-multi-signal-corroboration-engine-generic-cross-swarm
source: [120-04-PLAN.md, RERUN-FINDINGS.md]
started: 2026-06-17
updated: 2026-06-17
---

## Current Test

[awaiting the resolve_candidates-unification phase — the debtor swarm must resolve via
the generic resolver before this gate is meaningful]

## Tests

### 1. Resolver correctness re-run over the frozen 100-email fixture
expected: overall correct% materially above the 64% baseline; the 4 confident-wrong AUTO
rows (#2,#85,#95,#97) demote below AUTO (confidence ≠ high); the 12 bucket-B rows gain a
2nd agreeing signal or degrade to suggestie; gold-signal rows (factuur/klantnummer) do NOT
regress.
result: [pending — deferred; debtor not yet on resolve_candidates. Run via
`cd web && NXT_LOOKUP_WAIT_MS=60000 npx tsx scripts/eval/resolver-correctness-gate.ts --report`
once the debtor swarm resolves through resolve_candidates.]

## Summary

total: 1
passed: 0
issues: 0
pending: 1
skipped: 0
blocked: 0

## Gaps
