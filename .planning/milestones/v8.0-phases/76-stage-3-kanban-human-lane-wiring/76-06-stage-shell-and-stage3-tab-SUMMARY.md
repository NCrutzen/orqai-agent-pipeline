---
phase: 76
plan: 06
subsystem: stage-3-kanban-human-lane-wiring
tags: [stage-3, kanban, ui, registry-driven, cross-swarm-reuse]
dependency-graph:
  requires: [76-01, 76-02, 76-03, 76-04, 76-05]
  provides:
    - per-swarm stage-keyed shell at /automations/[swarm]/stage-3
    - registry-driven stage tab strip (Phase 78 lights up sales-email by INSERT)
    - Stage 3 triage UI (filter chips + row list + detail pane + action stack)
    - inline editor (Replay + Reclassify variants) wired to Plan 05 Server Actions
  affects:
    - kanban/ directory retired in favor of _actions/ + _lib/ (D-04 REVISED)
    - Plan 07 (Stage 4 tab) reuses _shell/ + reason-pill + detail-pane + action-stack + inline-editor
tech-stack:
  added: []
  patterns:
    - registry-driven tab derivation (pure function, ignores swarm_type literals)
    - optimistic removal via pendingRemovalIds Set (mirror review/selection-context)
    - parallel server-side fetch (Promise.all) — mirror review/page.tsx
    - inline editor as destructive surface (no confirm modals — sketch 007 lock)
key-files:
  created:
    - web/app/(dashboard)/automations/[swarm]/_shell/page-header.tsx
    - web/app/(dashboard)/automations/[swarm]/_shell/stage-tab-strip.tsx
    - web/app/(dashboard)/automations/[swarm]/_shell/derive-stage-tabs.ts
    - web/app/(dashboard)/automations/[swarm]/_shell/__tests__/derive-stage-tabs.test.ts
    - web/app/(dashboard)/automations/[swarm]/stage-3/page.tsx
    - web/app/(dashboard)/automations/[swarm]/stage-3/selection-context.tsx
    - web/app/(dashboard)/automations/[swarm]/stage-3/row-list.tsx
    - web/app/(dashboard)/automations/[swarm]/stage-3/filter-chips.tsx
    - web/app/(dashboard)/automations/[swarm]/stage-3/reason-pill.tsx
    - web/app/(dashboard)/automations/[swarm]/stage-3/conf-bar.tsx
    - web/app/(dashboard)/automations/[swarm]/stage-3/detail-pane.tsx
    - web/app/(dashboard)/automations/[swarm]/stage-3/action-stack.tsx
    - web/app/(dashboard)/automations/[swarm]/stage-3/inline-editor.tsx
  moved:
    - web/app/(dashboard)/automations/[swarm]/kanban/actions/close.ts → _actions/close.ts
    - web/app/(dashboard)/automations/[swarm]/kanban/actions/replay.ts → _actions/replay.ts
    - web/app/(dashboard)/automations/[swarm]/kanban/actions/reclassify-noise.ts → _actions/reclassify-noise.ts
    - web/app/(dashboard)/automations/[swarm]/kanban/_lib/kanban-loader.ts → _lib/kanban-loader.ts
    - + 4 corresponding __tests__/*.test.ts files (history preserved via git mv)
  removed:
    - web/app/(dashboard)/automations/[swarm]/kanban/ (entire directory)
decisions:
  - Stage 3 client uses fixed OPERATOR_ID_PLACEHOLDER='operator' in v1; Phase 999.2 wires session-based persona (CONTEXT.md D-06)
  - Email body preview is a placeholder in detail-pane.tsx (TODO in code references Plan 08 for fetchReviewEmailBody integration)
  - Action stack always opens the Replay inline-editor on click (never fires same-intent directly without operator confirmation in v1)
  - row-list height uses parent flex-1 + min-height 0 (avoided calc(100vh - 140px) to keep grid-only spacing)
metrics:
  duration: ~25 minutes
  completed_date: 2026-05-07
  tasks_completed: 4
  files_created: 13
  files_moved: 8
  commits: 3
---

# Phase 76 Plan 06: Stage shell + Stage 3 tab Summary

Built per-swarm stage-keyed shell (`_shell/`) and full Stage 3 triage UI (`stage-3/`) wired to Plan 05 Server Actions, with registry-driven tab derivation that lets Phase 78 (sales-email) light up the same shell via a swarms-row INSERT — zero UI code change.

## What was built

**Shell (cross-swarm, registry-driven):**
- `derive-stage-tabs.ts` — pure function `SwarmRow → StageTab[]`. Stage 0/4 universal; Stage 1/2/3 conditional on `swarms.stage{1,2,3}_*` bindings. Zero literal swarm-name branches.
- `page-header.tsx` — display name + ops surface header, locked to UI-SPEC §Spacing + §Typography.
- `stage-tab-strip.tsx` — renders only `present:true` tabs. Active tab gets 2px brand-primary bottom border + tab badge counts via `counts` prop.

**Stage 3 surface:**
- `page.tsx` — RSC, `force-dynamic`. Parallel `Promise.all` fetch of (kanban rows, intents, noise categories). Filters Stage 3 reasons (`no_handler`, `low_confidence`); computes Stage 4 count for tab badge. Replay dropdown is filtered to `handler_status='registered'` upstream (R-4 mitigation). Reclassify dropdown excludes `'unknown'` (CONTEXT.md deferred-ideas).
- `selection-context.tsx` — pendingRemovalIds + history.replaceState (verbatim shape from review/selection-context.tsx).
- `row-list.tsx` — Stage3Client composite. 2-col grid `[1fr 460px]`. Selected row uses 2px brand-primary left-border with `calc(var(--space-4) - 2px)` padding compensation per UI-SPEC §Spacing.
- `filter-chips.tsx` — All / No handler / Low confidence chips with live counts. Active chip: brand-primary-soft bg + border (UI-SPEC accent #2).
- `reason-pill.tsx` — kanban_reason → soft-bg/fg color pair. Reused by Stage 4 tab in Plan 07.
- `conf-bar.tsx` — 40px×4px, color buckets per UI-SPEC. Caller-gated to low_confidence rows only.
- `detail-pane.tsx` — 460px fixed. Subject + meta + ranked output with `✓ picked` annotation + body preview placeholder + sticky ActionStack.
- `action-stack.tsx` — 3 buttons. Verbatim UI-SPEC copy (`✓ Replay through Stage 4` / `↶ Reclassify as noise` / `✕ Close (manual)`). Keyboard `⏎ N Space`. Sibling-dim during inline-edit.
- `inline-editor.tsx` — Replay variant (intents dropdown) + Reclassify variant (noiseCategories dropdown). Both call `markPendingRemoval` before Server Action. Strict pipeline-architecture lock: Replay only consumes swarm_intents (Stage 3); Reclassify only consumes swarm_noise_categories (Stage 1).

**Refactor (D-04 REVISED):**
- 8 files moved via `git mv` from `kanban/` to `_actions/` + `_lib/`. The `kanban/` directory is fully retired so Stage 3 and Stage 4 share one Server Action set.

## Pipeline architecture compliance

Hard separation preserved per RFC `docs/agentic-pipeline/README.md`:
- **Replay path** consumes `swarm_intents` only (Stage 3 ranked-intent classifier source).
- **Reclassify-as-noise path** consumes `swarm_noise_categories` only (Stage 1 noise filter source).
- The two registries are never blurred in any UI file. Server Actions (Plan 05) and Stage 3 dispatch worker (Plan 03) maintain the same separation upstream.

Hard separation rule confirmed: a row exists in EXACTLY one of `swarm_noise_categories` (Stage 1) or `swarm_intents` (Stage 3) — never both.

## Gates passed

| Gate | Result |
|------|--------|
| `cd web && npx tsc --noEmit` | Clean (0 errors) |
| In-scope vitest (`_actions` + `_lib` + `_shell`) | 31/31 passing |
| `derive-stage-tabs.test.ts` cases | 4/4 passing |
| W1: kanban/ directory removed | `find ... -path '*/kanban/*'` returns 0 |
| W3: noise_key fallback removed | grep returns 0 in stage-3/page.tsx + reclassify-noise.ts |
| Cross-swarm: zero literal swarm-name branches | grep returns 0 across stage-3/ + _shell/ + _actions/ + _lib/ |
| UI-SPEC verbatim copy | `✓ Replay through Stage 4` / `↶ Reclassify as noise` / `✕ Close` all present |
| pendingRemovalIds wiring | 4 files (selection-context, row-list, action-stack, inline-editor) |
| Distinct px values used | Only 11/13/14 (locked typography) + 2/4/40/460 (locked components) |
| `cd web && npx next build` | Stage 3 route compiles cleanly; pre-existing env-related build error in /api/automations/box-upload is unrelated (missing SUPABASE_URL at build time) |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Wrong relative import depth in client components**
- **Found during:** Task 3 (tsc check after writing inline-editor + action-stack)
- **Issue:** Plan action body used `../../_actions/{close,replay,reclassify-noise}` but the correct relative path from `[swarm]/stage-3/` to `[swarm]/_actions/` is `../_actions/` (one level up, not two).
- **Fix:** Updated 3 import statements in `action-stack.tsx` and `inline-editor.tsx`.
- **Files modified:** action-stack.tsx, inline-editor.tsx
- **Commit:** 4753a3f

**2. [Rule 1 - Bug] Plan's UI-SPEC px-gate filter omitted locked typography sizes**
- **Found during:** Task 3 acceptance-gate verification
- **Issue:** Plan acceptance gate `grep ... | grep -v "1280px\|460px\|40px\|4px\|2px"` was intended to detect unauthorized non-grid pixel values, but it doesn't filter the 4 typography sizes UI-SPEC §Typography explicitly locks (11/13/14/22). Literal interpretation flagged every `fontSize: "13px"` as unauthorized — contradicts UI-SPEC.
- **Fix:** Verified semantically that every `[0-9]+px` value in the stage-3 directory is authorized by UI-SPEC: 11/13/14 (locked typography sizes), 2/4/40/460 (locked component pixels). Initially also had `calc(100vh - 140px)` — replaced with `flex: 1, minHeight: 0` to remove the only non-grid pixel.
- **Distinct px values now in use:** `11px`, `13px`, `14px`, `2px`, `4px`, `40px`, `460px` — all explicitly authorized by UI-SPEC.
- **Files modified:** row-list.tsx (calc removal)
- **Commit:** 4753a3f
- **Recommendation for Plan 07:** Update the gate filter to: `grep -v "11px\|13px\|14px\|22px\|2px\|4px\|40px\|460px\|1280px"` to align with the UI-SPEC contract.

### Auth gates

None — Stage 3 page uses `loadSwarm` registry validation; no external API calls in the page render path.

### Out-of-Scope Pre-existing Failures

Logged to `.planning/phases/76-stage-3-kanban-human-lane-wiring/deferred-items.md`:
- 7 pre-existing test failures in `web/app/(dashboard)/automations/[swarm]/review/__tests__/` (load-page-data + safety-review-loader). Verified pre-existing on baseline via `git stash`. Likely related to Phase 71-08 view-driven feed evolution. Not in 76-06 scope.

## Auto-mode checkpoint handling

Task 4 (`checkpoint:human-verify`) auto-approved per executor auto-mode protocol — visual/functional verification deferred to operator session. Operator can verify via `cd web && npm run dev` then visit `http://localhost:3000/automations/debtor-email/stage-3`.

## Cross-swarm reuse evidence

```bash
$ grep -E "['\"](debtor-email|sales-email)['\"]" \
  'web/app/(dashboard)/automations/[swarm]/stage-3/'*.tsx \
  'web/app/(dashboard)/automations/[swarm]/_shell/'*.tsx \
  'web/app/(dashboard)/automations/[swarm]/_actions/'*.ts \
  'web/app/(dashboard)/automations/[swarm]/_lib/'*.ts
# (no output — zero matches)
```

Phase 78 onboarding for sales-email becomes: INSERT swarms row + INSERT swarm_intents rows. No UI code change.

## Commits

| Task | Hash    | Message |
|------|---------|---------|
| 1    | 8bf54ea | refactor(76-06): move kanban actions to _actions/_lib + add derive-stage-tabs |
| 2    | a99957b | feat(76-06): _shell components + stage-3 RSC + selection-context |
| 3    | 4753a3f | feat(76-06): Stage 3 client components — full triage UI |

## Self-Check

- [x] All 13 declared files exist at canonical paths
- [x] All 8 moved files exist at post-move locations; original `kanban/` directory is GONE
- [x] derive-stage-tabs.test.ts has 4 `it()` blocks, all green (31/31 in-scope vitest pass)
- [x] tsc --noEmit clean
- [x] All commits visible in `git log --oneline -3`
- [x] STATE.md + ROADMAP.md updates queued for state_updates step
