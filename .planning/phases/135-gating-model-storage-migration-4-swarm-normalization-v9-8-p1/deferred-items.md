# Phase 135 — Deferred Items

## [135-05 discovery] 135-02 cutover left stale `dry_run_config` test fixtures (27 full-suite failures)

**Discovered:** 2026-06-30, during 135-05 Task 3 full-suite run (`cd web && npm test`).

**Symptom:** 27 tests fail across 10 files (3091 passed, 23 skipped). Representative:
`coordinator-stage3-routing-gate.test.ts > OPEN (sales, stage_3_routing=false) → emits sales-email/predicted`
asserts `decision === "predicted"` but receives `"predicted_held"`.

**Root cause:** the 135-02 cutover renamed the worker-read interface `dry_run_config` →
`gating_config`, but these worker **test fixtures still set the old `dry_run_config` key**
on their swarm mocks. The worker now reads `swarm.gating_config?.stage_3_routing`, which is
`undefined` in the stale fixtures → fail-closed → `held`/`predicted_held` instead of the
intended live path. 16 test files repo-wide still reference `dry_run_config`:

```
grep -rln "dry_run_config" web/lib web/tests   # → 16 files
```

Affected failing files (10): `coordinator-stage3-routing-gate.test.ts`,
`routing-no-forward-gate.test.ts`, `debtor-email-coordinator.test.ts`,
`coordinator-forward-request-emit.test.ts`, `coordinator-intent-label-emit.test.ts`,
`coordinator-routing-verdict.test.ts`, `stage-2-customer-resolver.test.ts`,
`stage-4-info-routing-forward.test.ts`, `classifier-invoice-copy-handler.test.ts`,
plus `info-routing-coordinator-schema.test.ts` / `support-tickets/transcribe.test.ts`
(the latter two pass in isolation — full-suite test-pollution, separate from the rename).

**Not a production regression.** The live post-apply read-back (135-05) confirms every swarm's
`gating_config` is correctly populated and the workers read the renamed key in production.
The MIGRATE-02 "no behavior change" pin tests (`dry-run-gate.test.ts`,
`forward-bucket-release.test.ts`, `intent-label-gate.test.ts`,
`dry-run-gate-preservation.test.ts`) + `derive-mode.test.ts` are all GREEN. This is
test-fixture maintenance debt from the cutover, not a behavior defect.

**Why deferred (not fixed in 135-05):** plan 135-05 is the apply + post-apply verification
plan (`files_modified: []`); these failures are pre-existing to plan 05 and rooted in the
135-02 cutover, outside this plan's declared file scope. Fixing is a mechanical fixture
rename (`dry_run_config:` → `gating_config:` in the 16 worker-test swarm mocks).

**Follow-up:** a 135-02 follow-up (or a dedicated cleanup plan) should rename `dry_run_config`
→ `gating_config` in the 16 test fixtures and re-run `cd web && npm test` to green.
