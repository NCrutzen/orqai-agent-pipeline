# Resolver #95 — confident leaf-wrong (original confident-wrong set)

**Created:** 2026-06-18 (during Phase 122 verification)
**Scope:** out of Phase 122 (XSCOPE-03 bucket-C target = #98/#12/#38 + #96 control). Logged for follow-up.

## What
Eval fixture row **#95** resolves to leaf `524156` ("De Studio") at **high** confidence, but its operator ground-truth is **`525156`** (a sibling/different party). It is a *confident-wrong*: AUTO + high + wrong customer.

## Context
- #95 belongs to the ORIGINAL confident-wrong AUTO set (#2 / #85 / #95 / #97) — a Plan-120 / corroboration-tier root cause, distinct from the Phase-122 cross-scope leaf-vs-root bug.
- The Phase 122-05 leaf-vs-root fix MOVED #95 from root-wrong (`524011`) to leaf-wrong (`524156`); both wrong. The fix did not introduce #95's wrongness and is not expected to resolve it.
- `targetClass` precedence classifies #95 as `confident-wrong` (not bucket-C), so it does NOT fail the XSCOPE-03 bucket-C gate.
- GT `525156` vs resolved `524156` differ by one digit — confirm whether this is a genuine sibling-party mis-resolution or a fixture typo before designing a fix.

## Suggested next step
Investigate the #95 invoice/identifier in `zapier.dbo.resolver_index`: does the matched identifier map uniquely to `525156`, or does `524156` win on a stronger/earlier-precedence signal? Decide whether this needs a corroboration-tier tightening (the #2/#85/#95/#97 demote target) or a fixture correction.
