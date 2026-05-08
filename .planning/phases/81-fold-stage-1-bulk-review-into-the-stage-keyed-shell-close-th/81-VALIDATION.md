---
phase: 81
slug: fold-stage-1-bulk-review-into-the-stage-keyed-shell-close-th
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-08
---

# Phase 81 — Validation Strategy

> Per-phase validation contract. Pure UI/route reframe — validation is dominated by route renders, redirect contracts, and DOM state from URL params. No backend pipeline behavior changes.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (existing — `web/vitest.config.ts`) |
| **Config file** | `web/vitest.config.ts` |
| **Quick run command** | `cd web && npx vitest run app/\(dashboard\)/automations/\[swarm\]/stage-1` |
| **Full suite command** | `cd web && npx vitest run` |
| **Estimated runtime** | ~30s quick / ~3-4 min full |

---

## Sampling Rate

- **After every task commit:** Run quick command scoped to the changed area (stage-1, stage-2, or middleware).
- **After every plan wave:** Run full suite command.
- **Before `/gsd-verify-work`:** Full suite must be green; manual route smoke (Section: Manual-Only) signed off.
- **Max feedback latency:** 30 seconds (quick) / 240 seconds (full).

---

## Per-Task Verification Map

> Filled by the planner once PLAN.md files exist. Every task gets a row. Goal-backward checks (CONTEXT.md verification 1–10) each map to ≥1 row below.

| Goal-backward check (CONTEXT) | Plan target | Wave | Test Type | Automated Command | File |
|-------------------------------|-------------|------|-----------|-------------------|------|
| #1 `/stage-1` renders with `<PageHeader>` + `<StageTabStrip currentStage={1}>`, no "Bulk Review" h1 | Stage 1 page wrap | 1 | unit (RTL) | `npx vitest run stage-1/__tests__/page.test.tsx` | TBD |
| #2 chip-strip renders one chip per `swarm_noise_categories` row + "All" + count badges from `classifier_queue_counts` | Chip-strip component | 2 | unit (RTL) | `npx vitest run stage-1/__tests__/noise-category-chip-strip.test.tsx` | TBD |
| #3 Clicking chip writes `?topic=<noise_key>` and filters row list | Chip-strip URL state | 2 | unit (RTL) | `npx vitest run stage-1/__tests__/noise-category-chip-strip.test.tsx` | TBD |
| #4 `?sub=pending` renders candidate-rule list + working detail pane | Loader sub branch + detail pane | 2 | unit (loader) + RTL | `npx vitest run stage-1/__tests__/load-page-data.test.ts stage-1/__tests__/pending-promotion.test.tsx` | TBD |
| #5 Legacy `/review` (incl. `?tab=pending`, `?tab=safety`) 308-redirects with query params preserved | Middleware redirect | 1 | unit | `npx vitest run __tests__/middleware-review-redirect.test.ts` | extends existing |
| #6 `/stage-2` renders placeholder + live tagging-failures count + ↗ link | Stage 2 placeholder | 3 | unit (RTL) | `npx vitest run stage-2/__tests__/page.test.tsx` | TBD |
| #7 `web/app/(dashboard)/automations/[swarm]/review/` directory removed; no `../review/` imports remain | Directory rename | 1 | grep gate | `! rg -n "automations/\[swarm\]/review" web/app web/tests` | n/a |
| #8 No `QueueTree` references in non-test files | Cleanup | 4 | grep gate | `! rg -n "QueueTree" web/app/\(dashboard\)/automations` | n/a |
| #9 `/stage-3` and `/stage-4` render unchanged (regression) | Regression smoke | 4 | unit (RTL) | `npx vitest run stage-3 stage-4` | existing |
| #10 Cross-swarm `/automations/<other>/stage-1` populates from that swarm's noise categories | Registry-driven render | 2 | unit (RTL) | `npx vitest run stage-1/__tests__/page.test.tsx -t "cross-swarm"` | TBD |

---

## Wave 0 Requirements

Wave 0 is verification-only (no new fixtures expected) since vitest infrastructure exists:

- [ ] **Verify** `swarms.stage2_entity_resolver` is set for `debtor-email` (DB read via Supabase MCP `execute_sql`). If null, plan adds the registry update; otherwise no-op for D-15.
- [ ] **Verify** `web/tests/queue/` external imports of `automations/[swarm]/review/...` (4 files per RESEARCH.md) — confirm exact paths so Wave 1 rename rewrites them in the same atomic step.
- [ ] **Verify** `loadTaggingFailuresForReview` cross-swarm fallback returns 0 / "—" when `swarm_type !== 'debtor-email'` (read source — RESEARCH says it does; double-check).
- [ ] **Verify** rule-promotion components in `web/app/(dashboard)/swarm/[swarmId]/(components)` exist for reuse by `?sub=pending` detail pane (grep). If none, plumb fresh server actions.
- [ ] **Decide (planner)** whether the Filters popover (entity + mailbox) ships in this phase or as follow-up. URL params `?entity=` / `?mailbox=` must continue to work via direct URL editing regardless.

---

## Manual-Only Verifications

| Behavior | Goal-backward check | Why Manual | Test Instructions |
|----------|---------------------|------------|-------------------|
| Visual parity with Sketch 005 (chip gap, radius, active-state token, header alignment) | #1, #2 | Visual fidelity not assertable in jsdom | Open `/automations/debtor-email/stage-1` in dev, compare to `.claude/skills/sketch-findings-agent-workforce/sources/005-swarm-shell-integration/index.html` |
| Realtime row updates still flow on `${swarmType}-review` channel after directory rename | n/a (D-19 contract) | Requires live Supabase realtime + Inngest event emission | Trigger a Stage 1 verdict in dev, watch row state flip in `/stage-1` without reload |
| Empty chip-strip behavior for swarm with zero `swarm_noise_categories` rows | #10 / specifics | Requires fixture swarm without noise registry rows; cheaper to eyeball | Visit a registered swarm with empty noise registry, confirm "All" chip renders alone (not the whole strip hidden) |

---

## Validation Sign-Off

- [ ] Per-task verification map filled by planner (one row per task that delivers a goal-backward check)
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 verifications complete and recorded
- [ ] No watch-mode flags in any test command
- [ ] Feedback latency < 30s (quick) / 240s (full)
- [ ] `nyquist_compliant: true` set in frontmatter once map is filled
- [ ] All 10 goal-backward checks from `81-CONTEXT.md` `<verification>` covered by either an automated row or a manual row

**Approval:** pending
