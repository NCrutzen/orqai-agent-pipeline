---
phase: 60
plan: "02"
subsystem: classifier
tags: [wave-1, backfill, ingest-route, classifier-cache]
requires:
  - public.classifier_rules (created in 60-00, applied in 60-01)
  - web/lib/classifier/cache.ts + wilson.ts (60-00)
  - web/lib/automations/debtor-email/mailboxes.ts (existing)
provides:
  - classifier/backfill.run + classifier/verdict.recorded Inngest events
  - classifierBackfill one-shot Inngest function (event-trigger)
  - classifierPromotionCron stub (real cron lands in 60-03)
  - Ingest route reads whitelist via cache; typed columns on every insert
affects:
  - web/lib/inngest/events.ts
  - web/app/api/inngest/route.ts
  - web/app/api/automations/debtor-email/ingest/route.ts
tech_stack:
  added: []
  patterns:
    - Inngest event-trigger one-shot (no cron) for idempotent seeding
    - module-level Map cache amortizing read across requests (60s TTL)
    - typed top-level columns on automation_runs (D-11) replacing JSONB-only routing
key_files:
  created:
    - web/lib/inngest/functions/classifier-backfill.ts
    - web/lib/inngest/functions/classifier-promotion-cron.ts
  modified:
    - web/lib/inngest/events.ts
    - web/app/api/inngest/route.ts
    - web/app/api/automations/debtor-email/ingest/route.ts
    - web/tests/classifier/backfill.test.ts
decisions:
  - D-04 satisfied via event-trigger one-shot (no cron); 6 seeds with Wilson CI-lo
  - D-08 cache used in ingest route per request; module-level Map TTL=60s
  - D-22 classify.ts untouched (verified empty git diff --stat)
  - D-28 step 3 fallback retained inside cache.ts
  - mailbox_id derives from ICONTROLLER_MAILBOXES (live-DB has no labeling_settings.id)
metrics:
  duration_minutes: ~20
  completed_date: 2026-04-28
  tasks_completed: 2
  files_changed: 6
---

# Phase 60 Plan 02: Wire data-driven whitelist into ingest route Summary

Wave 1 ships the runtime cutover: an event-triggered Inngest one-shot seeds the 6 debtor-email rules into `public.classifier_rules` with computed Wilson CI-lo, the ingest route now reads the whitelist via the 60s in-memory cache (with FALLBACK_WHITELIST defensive path per D-28 step 3), and every `automation_runs.insert` callsite in the route writes the typed columns (`swarm_type`, `topic`, `entity`, `mailbox_id`). The `classifier/promotion-cron` is registered as a stub so the serve route compiles; 60-03 fills in the body.

## Tasks Completed

| Task | Name | Commit |
| ---- | ---- | ------ |
| 1 | classifier backfill + cron stub + Inngest registry + green tests | `f73e16b` |
| 2 | Ingest route refactor — readWhitelist + typed columns | `6a27ebb` |

## Acceptance Evidence

### Task 1

- `grep -c "classifier/backfill.run" web/lib/inngest/events.ts` → **1** ✓
- `grep -c "classifier/verdict.recorded" web/lib/inngest/events.ts` → **1** ✓
- `grep -c 'id: "classifier/backfill"' web/lib/inngest/functions/classifier-backfill.ts` → **1** ✓
- `grep -c "wilsonCiLower" web/lib/inngest/functions/classifier-backfill.ts` → **2** (≥1) ✓
- `grep -c 'onConflict: "swarm_type,rule_key"' web/lib/inngest/functions/classifier-backfill.ts` → **1** ✓
- 6 distinct rule_keys present in SEEDS array (verified by test asserting `seeds.length === 6` and per-call `rule_key` matches)
- `grep -c "payment_admittance" web/lib/inngest/functions/classifier-backfill.ts` → **4** (≥3, the 3 small-N notes plus the file-header comment) ✓
- `grep -c 'TZ=Europe/Amsterdam 0 6 \* \* 1-5' web/lib/inngest/functions/classifier-promotion-cron.ts` → **2** (≥1; once in `// cron:` comment, once in createFunction config) ✓
- `grep -cE "classifierBackfill|classifierPromotionCron" web/app/api/inngest/route.ts` → **4** (≥2) ✓
- `pnpm vitest run tests/classifier/backfill.test.ts` → **4 tests passed, 0 todo** ✓
- `pnpm tsc --noEmit -p .` → exit 0, no classifier/inngest errors ✓

### Task 2

- `grep -c "AUTO_ACTION_RULES" web/app/api/automations/debtor-email/ingest/route.ts` → **0** ✓
- `grep -c "import { readWhitelist }" web/app/api/automations/debtor-email/ingest/route.ts` → **1** ✓
- `grep -c 'readWhitelist(admin, "debtor-email")' web/app/api/automations/debtor-email/ingest/route.ts` → **1** ✓
- `grep -c "whitelist.has" web/app/api/automations/debtor-email/ingest/route.ts` → **1** ✓
- `awk '/from\("automation_runs"\)\.insert/,/}\)/' route.ts | grep -c "swarm_type:"` → **6** (≥3) ✓
- `grep -c "mailbox_id:" web/app/api/automations/debtor-email/ingest/route.ts` → **6** (≥3) ✓
- `git diff --stat web/lib/debtor-email/classify.ts` → empty ✓ (D-22 enforced)
- `pnpm tsc --noEmit -p .` → exit 0, no errors anywhere ✓

### Wilson math sanity (asserted in test)

| n | k | computed ci_lo | spec target |
|---|---|----------------|-------------|
| 169 | 169 | 0.97777 | 0.978 ✓ |
| 151 | 151 | 0.97519 | (asserted equal to wilsonCiLower(151,151)) ✓ |
| 79  | 79  | 0.95363 | 0.954 ✓ |

## Deviations from Plan

### Auto-fixed issues

**1. [Rule 3 — Plan vs live-DB] `mailbox_id: settings.id` replaced with `ICONTROLLER_MAILBOXES` lookup**
- **Found during:** Task 2 — verifying the typed-columns insert payload.
- **Issue:** PLAN §Edit 2 and PATTERNS.md both specify `mailbox_id: settings.id` and the must_haves call `mailbox_id` "FK to debtor.labeling_settings.id". The live `debtor.labeling_settings` table has `source_mailbox` as primary key and **no `id` column** (verified in `supabase/migrations/20260423_debtor_email_labeling.sql:54-59` and confirmed by 60-01-SCHEMA-PUSH-LOG line 17: the migration backfill itself had to be patched to drop `ls.id`).
- **Fix:** Resolve `mailboxId` once per request via `ICONTROLLER_MAILBOXES[sourceMailbox] ?? null`. This is the **same** lookup table the migration's `CASE` backfill uses to populate historical rows, so old data and new writes share one mapping. The acceptance criterion `grep -c "mailbox_id: settings.id" >= 3` was reinterpreted as "mailbox_id appears on every insert" — `grep -c "mailbox_id:" >= 3` is **6**, satisfying the must_have semantically.
- **Files modified:** `web/app/api/automations/debtor-email/ingest/route.ts` (added `ICONTROLLER_MAILBOXES` import + `mailboxId` const).
- **Commit:** `6a27ebb`.

**2. [Doc nit] Acceptance grep `subject_paid_marker|payment_subject|payment_sender` would not match `payment_system_sender+body`**
- **Found during:** Task 1 acceptance verification.
- **Issue:** `payment_system_sender+body` does not contain the substring `payment_sender`, so the literal grep regex returns **5**, not the criterion's `>= 6`. The 6 rule_keys ARE seeded correctly — the regex was missing `payment_system_sender`.
- **Fix:** No code change. The test (`expect(upsertCalls).toHaveLength(6)` + per-call `rule_key` assertions) is the authoritative check; documenting here so downstream plans can update similar regex patterns.

No other deviations.

## Authentication Gates

None — all work was filesystem + local typecheck + vitest. Backfill function will need `classifier/backfill.run` event sent via the Inngest dashboard once deployed (post-60-02 manual smoke step listed in the plan's `<verification>`).

## Threat Model — Mitigations Realized

| Threat | Disposition | Realized in 60-02 |
|--------|-------------|-------------------|
| T-60-02-01 (DoS via per-request DB read) | mitigate | Module-level Map in `cache.ts`, 60s TTL — verified by `readWhitelist` only being called once per request handler |
| T-60-02-02 (DB transient failure → no auto-actions) | mitigate | `FALLBACK_WHITELIST` inside `cache.ts` returns the 6 seeded keys when error path hits |
| T-60-02-03 (Backfill double-run) | mitigate | `onConflict: "swarm_type,rule_key"` upsert; test asserts 12 upserts after two invocations |
| T-60-02-05 (Wrong CI-lo silently) | mitigate | Test pins `ci_lo` to `wilsonCiLower(n,n)` to 6 decimals + numeric `0.978/0.954` checks |

## TDD Gate Compliance

This plan is `type: execute` (not `type: tdd`) but Task 1 carried `tdd="true"`:
- **RED:** the existing 60-00 stub (`it.todo` blocks) was already on disk awaiting the impl.
- **GREEN:** Task 1 commit `f73e16b` ships impl + flips stubs to real assertions in one commit (the impl file and the test file are co-authored — the test mocks the admin client and stubs the Inngest wrapper, so it can fail independently of any DB).
- **Gate evidence in git log:** `feat(60-02): classifier backfill + cron stub + Inngest registry` is the GREEN commit. No separate `test:` commit because the stub was already on disk in `82af9da` (60-00). The test now exercises real assertions instead of `it.todo` (verified by `pnpm vitest run` reporting `4 passed, 0 todo`).

## Self-Check: PASSED

- `[ -f web/lib/inngest/functions/classifier-backfill.ts ]` ✓
- `[ -f web/lib/inngest/functions/classifier-promotion-cron.ts ]` ✓
- `git log --oneline | grep -E 'f73e16b|6a27ebb'` ✓
- `grep -c "AUTO_ACTION_RULES" web/app/api/automations/debtor-email/ingest/route.ts` → 0 ✓
- `git diff --stat web/lib/debtor-email/classify.ts` → empty ✓
- `pnpm vitest run tests/classifier/backfill.test.ts` → 4 passed ✓
- `pnpm tsc --noEmit -p .` → exit 0 ✓

## Ready for Wave 2

60-03 (classifier-promotion-cron real implementation) can now hang work on the stub at `web/lib/inngest/functions/classifier-promotion-cron.ts` and read against the seeded `public.classifier_rules` table. 60-04..60-06 (queue UI, verdict-worker) inherit the typed columns on `automation_runs` writes from this plan — the queue counts query and the rule-filter URL hook can both rely on `entity` / `mailbox_id` / `topic` being populated for every new row.
