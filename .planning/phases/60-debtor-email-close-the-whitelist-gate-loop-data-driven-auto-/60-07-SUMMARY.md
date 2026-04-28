---
phase: 60
plan: 07
status: deferred
date: 2026-04-28
---

# 60-07 SUMMARY — Post-Shadow Cleanup (DEFERRED)

This plan is deferred by design — both tasks are calendar-gated and operator-judgment-only.

## Tasks

| # | Task | Earliest run | Status |
|---|------|--------------|--------|
| 1 | Drop `FALLBACK_WHITELIST` from `web/lib/classifier/cache.ts` | **2026-04-29** (T+1 day) | Pending — checklist scaffolded |
| 2 | Flip `CLASSIFIER_CRON_MUTATE=true` in Vercel env | **2026-05-12** (T+14 days) | Pending — checklist scaffolded |

## Audit Artifact

`60-07-FLIP-CHECKLIST.md` — operator-completed checklist with verification gates, drop/flip steps, rollback runbook. Resume signal: "60-07 ready for fallback drop" or "60-07 ready for shadow flip".

## Why Deferred

- D-28 step 4: fallback removal requires a documented clean-run window only the operator can witness in Vercel logs.
- D-19: shadow flip requires 14 days of cron evaluations + spot-check on `/automations/classifier-rules` dashboard.

## How to Resume

When the timer elapses for either task:

```
/gsd-do "60-07 ready for fallback drop"   # task 1
# or
/gsd-do "60-07 ready for shadow flip"     # task 2
```

The orchestrator will read this SUMMARY + the checklist, complete the operator-checked verification, perform the code/env change, and update this SUMMARY with the actual completion date.

## Phase Status

The substantive Phase 60 work (Waves 0-3 + 60-05) is shipped:
- 60-00 (Wave 0 scaffold)
- 60-01 (Wave 0 schema push)
- 60-02 (ingest-route refactor + backfill)
- 60-03 (promotion cron — shadow)
- 60-04 (`/classifier-rules` dashboard)
- 60-06 (verdict-worker + actions split)
- 60-05 (queue-UI rewrite)

Only 60-07 awaits time. Phase ROADMAP entry stays `[ ]` until both checklist items are done; STATE.md notes `60-07 deferred (calendar-gated)`.
