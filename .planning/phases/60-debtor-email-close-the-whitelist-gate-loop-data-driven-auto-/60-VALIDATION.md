---
phase: 60
slug: debtor-email-close-the-whitelist-gate-loop-data-driven-auto
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-28
---

# Phase 60 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Sourced from RESEARCH.md §Validation Architecture (lines 720-768).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (already in `web/`); Phase 36 introduced jsdom config |
| **Config file** | `web/vitest.config.ts` |
| **Quick run command** | `cd web && pnpm vitest run web/tests/classifier --reporter=basic` |
| **Full suite command** | `cd web && pnpm vitest run` |
| **Estimated runtime** | quick ~5s · full ~60s |

---

## Sampling Rate

- **After every task commit:** Run quick command (classifier subset)
- **After every plan wave:** Run full suite
- **Before `/gsd-verify-work`:** Full suite must be green + 1-day shadow-mode cron successful run before flipping `CLASSIFIER_CRON_MUTATE=true`
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

CONTEXT.md uses Decision IDs (D-00..D-29). Tests are mapped to decisions; planner will assign concrete task IDs during planning.

| Decision | Behavior | Test Type | Automated Command | File Exists | Status |
|----------|----------|-----------|-------------------|-------------|--------|
| D-02 | Wilson 95% CI-lo math correct (gates: N≥30, ci_lo≥0.95) | unit | `pnpm vitest run web/tests/classifier/wilson.test.ts` | ❌ W0 | ⬜ pending |
| D-03 | Demote at <0.92 (hysteresis) | unit | `pnpm vitest run web/tests/classifier/promotion-gates.test.ts -t demotion` | ❌ W0 | ⬜ pending |
| D-04 | Backfill seeds 6 rules with correct CI-lo, status='promoted' | integration | `pnpm vitest run web/tests/classifier/backfill.test.ts` | ❌ W0 | ⬜ pending |
| D-05 | classifier_rules CHECK constraints reject invalid status/kind | manual (DDL) | manual SQL via Supabase Studio | manual | ⬜ pending |
| D-08 | Cache returns same Set within 60s; refetches after | unit | `pnpm vitest run web/tests/classifier/cache.test.ts` | ❌ W0 | ⬜ pending |
| D-10 | Page renders with status='predicted' rows; Outlook NOT called | integration (mocked) | `pnpm vitest run web/tests/queue/page.test.tsx` | ❌ W0 | ⬜ pending |
| D-11 | Migration backfill populates typed columns from result JSONB | integration (DB) | `SELECT count(*) WHERE swarm_type IS NULL` post-backfill | manual | ⬜ pending |
| D-13 | Counts query uses index (no Seq Scan on 10k rows) | manual | `EXPLAIN ANALYZE` in Supabase Studio | manual | ⬜ pending |
| D-15 | `?rule=X` filter applies to JSONB path | integration | `pnpm vitest run web/tests/queue/rule-filter.test.tsx` | ❌ W0 | ⬜ pending |
| D-16 | Approve writes feedback row + fires Inngest event; does NOT call Outlook inline | integration (mocked Inngest) | `pnpm vitest run web/tests/queue/actions.test.ts` | ❌ W0 | ⬜ pending |
| D-17 | Row disappears from list on `predicted → feedback` (broadcast invalidates) | manual smoke | manual click-through | manual | ⬜ pending |
| D-19 | Cron with `CLASSIFIER_CRON_MUTATE=false` writes evaluation row but NOT classifier_rules.status update | integration (mocked DB) | `pnpm vitest run web/tests/classifier/cron-shadow.test.ts` | ❌ W0 | ⬜ pending |
| D-21 | Race-cohort banner shows when rule.promoted_at=today AND remaining count > 0 | unit | `pnpm vitest run web/tests/queue/race-cohort.test.tsx` | ❌ W0 | ⬜ pending |
| D-26 | /classifier-rules dashboard renders status + sparkline rows | unit | `pnpm vitest run web/tests/classifier-rules/rules-table.test.tsx` | ❌ W0 | ⬜ pending |
| D-29 | Both Inngest functions register (route.ts handler resolves) | smoke | `pnpm dev` then GET `/api/inngest` returns function list | manual | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `web/tests/classifier/wilson.test.ts` — covers D-02
- [ ] `web/tests/classifier/cache.test.ts` — covers D-08
- [ ] `web/tests/classifier/promotion-gates.test.ts` — covers D-02/D-03
- [ ] `web/tests/classifier/backfill.test.ts` — covers D-04
- [ ] `web/tests/classifier/cron-shadow.test.ts` — covers D-19 (mocked admin client)
- [ ] `web/tests/queue/page.test.tsx` — covers D-10
- [ ] `web/tests/queue/rule-filter.test.tsx` — covers D-15
- [ ] `web/tests/queue/actions.test.ts` — covers D-16
- [ ] `web/tests/queue/race-cohort.test.tsx` — covers D-21
- [ ] `web/tests/classifier-rules/rules-table.test.tsx` — covers D-26
- [ ] (Optional) shared mocks for Supabase admin client + Inngest send

---

## Manual-Only Verifications

| Behavior | Decision | Why Manual | Test Instructions |
|----------|----------|------------|-------------------|
| Counts-query index health on real volume | D-13 | Requires real row counts; vitest can't `EXPLAIN ANALYZE` | Open Supabase Studio → run `EXPLAIN ANALYZE SELECT swarm_type, topic, entity, mailbox_id, count(*) FROM automation_runs WHERE status='predicted' GROUP BY 1,2,3,4` → confirm Index Scan, not Seq Scan |
| Live broadcast → row disappears on approve | D-17 | Requires browser + realtime channel | Open `/automations/debtor-email-review` in two tabs, approve in one, confirm row vanishes from the other within 2s |
| 14-day shadow-mode plausibility | D-19 | Time-windowed observation | Daily check `/classifier-rules` "would have promoted" indicator; spot-check 5 random evaluations against ground truth |
| Inngest function registration | D-29 | Requires running Next.js dev server | `pnpm dev` → `curl localhost:3000/api/inngest` → confirm both `classifier-promotion-cron` and `classifier-verdict-worker` listed |
| DDL CHECK constraint rejection | D-05 | DDL self-validates at migration time; runtime test redundant | Run failing-insert SQL in Supabase Studio post-migration |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
