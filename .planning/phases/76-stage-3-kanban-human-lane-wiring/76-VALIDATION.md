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
- [ ] Create `web/app/(dashboard)/automations/[swarm]/kanban/actions/__tests__/{close,replay,reclassify-noise}.test.ts` — Server Action unit tests with mocked `inngest.send` + Supabase admin.
- [ ] Create `web/app/(dashboard)/automations/[swarm]/kanban/_lib/__tests__/kanban-loader.test.ts` — SELECT shape + filter logic.
- [ ] Migration: add `supabase/migrations/2026MMDD_swarm_intents_handler_status.sql`.

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
