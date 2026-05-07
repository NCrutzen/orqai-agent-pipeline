---
phase: 76
slug: stage-3-kanban-human-lane-wiring
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-07
---

# Phase 76 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source of truth for trigger-by-trigger 8-dimensional coverage: see RESEARCH.md `## Validation Architecture` section.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 1.x |
| **Config file** | `web/vitest.config.ts` |
| **Quick run command** | `cd web && npx vitest run <path/to/file.test.ts>` |
| **Full suite command** | `cd web && npx vitest run` |
| **Estimated runtime** | ~30–60 seconds (full suite) |

---

## Sampling Rate

- **After every task commit:** Run the unit test file(s) modified or created by the task.
- **After every plan wave:** Run `cd web && npx vitest run` (full suite green).
- **Before `/gsd-verify-work`:** Full suite green + manual smoke through all three triggers (`no_handler`, `low_confidence`, `handler_error`) and all three actions (Close, Replay, Reclassify-as-noise).
- **Max feedback latency:** ~60 seconds (per-file run typically <5s).

---

## Per-Task Verification Map

> Filled out by the planner after PLAN.md tasks are created. Populate one row per executor task with the test command that proves the task done.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| _TBD by planner_ | | | | | | | | | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

From RESEARCH.md `## Validation Architecture > Wave 0 Gaps`:

- [ ] Extend `web/lib/inngest/functions/__tests__/debtor-email-coordinator.test.ts` — add `no_handler` and `low_confidence`-now-Kanban suites.
- [ ] Extend `web/lib/inngest/functions/__tests__/classifier-invoice-copy-handler.test.ts` — add `onFailure` Kanban-write suite.
- [ ] Extend or create `web/lib/swarms/__tests__/registry.test.ts` — `handler_status` row-shape coverage; `loadSwarmIntents` includes the new column.
- [ ] Create Server Action unit tests with mocked `inngest.send` + Supabase admin. **Path note:** Plan 05 creates these under `kanban/actions/__tests__/` (`close.test.ts`, `replay.test.ts`, `reclassify-noise.test.ts`); Plan 06 Task 1 then `git mv`s them to `_actions/__tests__/`. The post-Plan-06 canonical location is `web/app/(dashboard)/automations/[swarm]/_actions/__tests__/{close,replay,reclassify-noise}.test.ts`.
- [ ] Create `web/app/(dashboard)/automations/[swarm]/_lib/__tests__/kanban-loader.test.ts` (Plan 05 creates at `kanban/_lib/__tests__/kanban-loader.test.ts`; Plan 06 Task 1 `git mv`s to `_lib/__tests__/`). Post-Plan-06 canonical location shown.
- [ ] Migration: add `supabase/migrations/2026MMDD_swarm_intents_handler_status.sql`.

> Path-rewrite contract (W1 fix): Plan 06 Task 1's `git mv` block (lines 151-159 of 76-06-PLAN.md) IS the authoritative rewrite step. After Plan 06 Task 1 completes, the only valid paths for the four Server Action tests + the kanban-loader test are the `_actions/` / `_lib/` paths above. No grep over `kanban/actions/` or `kanban/_lib/` should match anywhere in the tree.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Per-swarm route loads | UI route at `/automations/[swarm]/stage-3` and `/stage-4` resolves; unknown swarm 404s | Browser RSC behavior | Visit `/automations/debtor-email/stage-3`; visit `/automations/foo/stage-3`; expect 404 on second |
| Optimistic removal | Action click hides row before server roundtrip | UX timing-sensitive | Click Close/Replay/Reclassify on a row; row disappears instantly, no flicker on broadcast return |
| Realtime channel naming | Stage 3/4 broadcasts on `${swarm_type}-kanban`, do NOT cross-invalidate Bulk Review | Live Supabase realtime | Open Stage 1 (Bulk Review) tab in one window + Stage 3 in another; trigger a Kanban action; only the Stage 3 tab refreshes |
| Reclassify-as-noise full path | Axis-1 override emit → categorize_archive runs → Outlook label applied + iController cleanup queued | Hits Outlook + iController | Reclassify a real Kanban row as `auto_reply`; verify Outlook label appears and a new iController automation_run is queued |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

---

## Phase 76 Validation Results — Plan 76-08 (executor pass)

Recorded 2026-05-07 by Plan 76-08 executor on branch `gsd/phase-76-stage-3-kanban`. Tasks 1+2 executed autonomously; Task 3 (live-DB end-to-end verification) is **PAUSED PENDING USER CONFIRMATION** because it requires synthetic test rows to be written to the production Supabase project.

### A. Redirect verification (Task 1)

| Step | Result | Evidence |
|------|--------|----------|
| Pure-helper unit tests for `resolveReviewRedirect` | ✅ PASS (8/8) | `cd web && npx vitest run __tests__/middleware-review-redirect.test.ts` — 8 passed |
| /review (no query) → /stage-1 | ✅ PASS (helper) | covered by test "redirects /automations/<swarm>/review (no query) to /stage-1" |
| /review?tab=safety → /stage-0 | ✅ PASS (helper) | covered by test "redirects ?tab=safety to /stage-0" |
| /review?tab=pending → /stage-1?sub=pending | ✅ PASS (helper) | covered by test "redirects ?tab=pending to /stage-1?sub=pending" |
| Open-redirect threat T-76-08-01 | ✅ PASS (helper) | covered by test "does not honor an attacker-controlled tab value" |
| Live HTTP redirect at runtime (308 status) | ⏸ DEFERRED | requires `npm run dev` smoke; covered by Task 3 step A in plan |

Commit: `afaab2e`.

### B. Stage 0 + Stage 1 wrappers (Task 2)

| Step | Result | Evidence |
|------|--------|----------|
| `web/app/(dashboard)/automations/[swarm]/stage-0/page.tsx` exists | ✅ PASS | `git ls-files` |
| `web/app/(dashboard)/automations/[swarm]/stage-1/page.tsx` exists | ✅ PASS | `git ls-files` |
| `tsc --noEmit` clean | ✅ PASS | `cd web && npx tsc --noEmit` returns no output / exit 0 |
| Stage 1 re-exports review/page.tsx default + dynamic | ✅ PASS | re-export `export { default, dynamic } from "../review/page"` |
| Stage 0 spoofing gate (T-76-08-03) | ✅ PASS | `loadSwarm` → `notFound()` on unknown swarm, mirrors Stage 3 page pattern |
| Browser smoke at /automations/debtor-email/stage-0 + /stage-1 | ⏸ DEFERRED | requires `npm run dev` |

Commit: `8cbdc3f`.

### C. Pipeline runtime verification (3 triggers) — Task 3, PAUSED

**Status:** ⏸ PAUSED PENDING USER CONFIRMATION (live-DB writes required)

What needs to happen, table-by-table, when the user authorizes:

| Trigger | Synthetic write target | Row contents (sketch) | Cleanup |
|---------|------------------------|------------------------|---------|
| `no_handler` | `email_pipeline.emails` (test row) + emit `debtor-email/email.received` via Inngest CLI/admin → Stage 1 LLM picks an intent backed by `swarm_intents.handler_status='placeholder'` (e.g. address_change) | `swarm_type='debtor-email'`, isolated test mailbox, subject `[PHASE-76 TEST] no_handler trigger` | DELETE the inserted email row + matching automation_runs after verification (do not delete production data) |
| `low_confidence` | Same fixture path; Stage 3 coordinator returns confidence below threshold | identical synthetic email with body crafted to trigger low-confidence path | same |
| `handler_error` | Trigger `invoice_copy_request` with a temporarily mis-set env var (e.g. `OUTLOOK_API_BASE`) so the Stage 4 handler raises | synthetic invoice-copy request | restore env var; delete the inserted automation_runs / Kanban row |

**Risk:** all three writes touch the live `email_pipeline.emails` + `automation_runs` + `pipeline_events` tables in production Supabase. Per Auto Mode Rule 5 these need explicit user approval. The plan document already calls this out at line 327 as a `checkpoint:human-verify` gate.

**Resume signal:** "phase-76-verified" once the user has run the three triggers and confirmed Kanban rows + Realtime broadcasts.

### D. Operator action verification — PAUSED

Same blocker as section C: requires live Kanban rows to act on. Will be verified in the same session.

### E. Cross-swarm sanity

| Step | Result | Evidence |
|------|--------|----------|
| `/automations/sales-email/stage-3` → 404 | ⏸ DEFERRED | requires browser; expected behaviour pending |
| Cross-swarm grep: zero literal swarm-name matches in Phase 76 surfaces | ⏳ NOT YET RUN | `grep -rE "['\"](debtor-email\|sales-email)['\"]" web/app/(dashboard)/automations/[swarm]/{stage-3,stage-4,_shell,_actions,_lib}` — to be captured during user-approved verification pass |

### F. Test suite + build

| Step | Result | Evidence |
|------|--------|----------|
| `npx tsc --noEmit` | ✅ PASS | exit 0, no output |
| Plan 76-08 unit tests (`__tests__/middleware-review-redirect.test.ts`) | ✅ PASS (8/8) | see section A |
| Full vitest suite | ⚠️ 22 PRE-EXISTING FAILURES | All in `app/(dashboard)/automations/[swarm]/review/__tests__/safety-review-loader.test.ts` — `TypeError: admin.schema is not a function` from a mock that pre-dates Phase 71-08's email_pipeline schema usage. Logged to `deferred-items.md`. Pass count outside this file: **673 passed / 16 skipped / 95 todo**. Plan 76-08 introduces zero new failures. |
| `npx next build` | ⏸ NOT RUN | Plan acceptance criteria allows `tsc --noEmit` clean as TS-level gate; `next build` deferred to live verification pass |
