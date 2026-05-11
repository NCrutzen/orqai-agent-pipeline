---
phase: 82
slug: unified-stage-shell-converge-stage-0-1-2-3-4-onto-one-outloo
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-11
---

# Phase 82 — Validation Strategy

> Cross-stage UI convergence. Validation surface = vitest + RTL on the new `_shell/` components, plus per-stage RTL tests after each migration. No backend/E2E.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (existing — `web/vitest.config.ts`) |
| **Config file** | `web/vitest.config.ts` |
| **Quick run command** | `cd web && npx vitest run app/\(dashboard\)/automations/\[swarm\]/_shell app/\(dashboard\)/automations/\[swarm\]/stage-{0,1,2,3,4}` |
| **Full suite command** | `cd web && npx vitest run` |
| **Estimated runtime** | ~60s scoped / ~4 min full |

---

## Sampling Rate

- **After every task commit:** Run quick command for the touched stage directory.
- **After every plan wave:** Run scoped quick command across all touched stages.
- **Before `/gsd-verify-work`:** Full suite must be green; manual smoke per stage (Manual-Only section) signed off.

---

## Per-Goal Verification Map

| Goal-backward check (CONTEXT §verification) | Plan target | Wave | Test Type | Automated Command | File |
|---------------------------------------------|-------------|------|-----------|-------------------|------|
| #1 `/stage-0` renders unified shell + empty row list + Stage 0 info banner | Stage 0 migration | 2 | RTL | `npx vitest run stage-0/__tests__/page.test.tsx` | new |
| #2 `/stage-1` renders unified shell + noise-category chip strip + mailbox dropdown + 5-axis detail pane (Stage 1 cell pre-focused) | Stage 1 migration | 6 | RTL | `npx vitest run stage-1/__tests__/page-shell.test.tsx` | extends existing |
| #3 `/stage-2` renders unified shell + tagging-failures count banner + empty row list | Stage 2 migration | 3 | RTL | `npx vitest run stage-2/__tests__/page.test.tsx` | extends existing |
| #4 `/stage-3` row shape = `[badge] From · Subject · Timestamp`; no duplicate intent-code label | Stage 3 migration | 5 | RTL | `npx vitest run stage-3/__tests__/page.test.tsx` | new |
| #5 `/stage-4` renders unified shell (handler-output row + Stage 4 cell pre-focused) | Stage 4 migration | 4 | RTL | `npx vitest run stage-4/__tests__/page.test.tsx` | new |
| #6 Mailbox dropdown lists every `swarm.mailboxes`, writes `?mailbox=<id>` URL on select | Wave 0 _shell extraction | 1 | RTL | `npx vitest run _shell/__tests__/mailbox-filter.test.tsx` | new |
| #7 Arrow-key nav identical on all 5 stages | Wave 0 _shell extraction | 1 | RTL | `npx vitest run _shell/__tests__/keyboard-shortcuts.test.tsx` | new |
| #8 Unified detail pane: email body + 5-cell pipeline trace + active-stage pre-expanded | Wave 0 _shell extraction | 1 | RTL | `npx vitest run _shell/__tests__/detail-pane.test.tsx` | new |
| #9 Stage 3 duplicate-intent-code label removed | Stage 3 migration | 5 | grep gate + RTL | `! rg -n "r\.topic.*r\.result\.intent\|intent_code.*intent_code" web/app/\(dashboard\)/automations/\[swarm\]/stage-3/` | n/a |
| #10 No `stage-{1,2,3,4}/row-list.tsx` / `detail-pane.tsx` files remain | Cleanup gate | 6 | grep gate | `! ls web/app/\(dashboard\)/automations/\[swarm\]/stage-{1,2,3,4}/{row-list,detail-pane}.tsx 2>/dev/null` | n/a |

---

## Wave 0 Requirements

Wave 0 = upfront `_shell/` component extraction + tests, per RESEARCH OQ-4 recommendation.

- [ ] **Create** `_shell/row-list.tsx` (canonical Outlook-style row strip; props derived from Stage 3 `row-list.tsx` + stage-specific badge slot)
- [ ] **Create** `_shell/detail-pane.tsx` (5-axis pipeline trace + email body; derived from Stage 1 `detail-pane.tsx` extended to 5 cells)
- [ ] **Create** `_shell/chip-strip.tsx` (pure presentation primitive: `chips, active, onChange`)
- [ ] **Create** `_shell/mailbox-filter.tsx` (compact dropdown/popover; reads `?mailbox=` URL state)
- [ ] **Create** `_shell/selection-context.tsx` (union of Stage 1/3/4 selection contexts: selectedId, pendingRemovalIds, history.replaceState)
- [ ] **Create** `_shell/keyboard-shortcuts.tsx` (arrow-key nav + Enter/Space/n action shortcuts; mount once at shell layout)
- [ ] **Create** `_shell/__tests__/{row-list,detail-pane,chip-strip,mailbox-filter,keyboard-shortcuts}.test.tsx` — covers checks #6, #7, #8
- [ ] **Resolve** `swarm.mailboxes` source per RESEARCH OQ-2: derive `mailboxes` from existing per-stage row data (distinct `mailbox_id` values) with a per-swarm hardcoded display-name lookup helper. No DDL.
- [ ] **Loader extension for Stage 3/4** per RESEARCH OQ-1: JOIN `email_pipeline.emails` so `KanbanRow` carries `subject`, `from_name`, `from_email`, `received_at` before the unified row component is consumed. Loader change only, no DDL.

---

## Manual-Only Verifications

| Behavior | Goal-backward check | Why Manual | Test Instructions |
|----------|---------------------|------------|-------------------|
| Visual parity of unified row strip across all 5 stages | #1–#5 | Pixel-level consistency not assertable in jsdom | Open `/stage-0`, `/stage-1`, `/stage-2`, `/stage-3`, `/stage-4` in dev; row strip height, badge alignment, From/Subject/Timestamp truncation should match |
| Active-stage cell pre-expanded + scrolled into view on detail pane open | #8 | Scroll behavior requires real layout | Click a row on `/stage-3`; Stage 3 cell expanded and centered in pane |
| Mailbox dropdown popover anchoring + a11y (Escape to close, arrow keys to navigate options) | #6 | Real DOM focus management | Tab to mailbox dropdown, press Enter, verify popover renders + keyboard nav works |
| Realtime row updates flow correctly per stage's existing channel after migration | Regression | Requires live Supabase realtime | Trigger Stage 1 verdict → row updates on `/stage-1`; trigger Stage 3 verdict → row updates on `/stage-3` (different channels) |

---

## Validation Sign-Off

- [ ] Per-goal verification map filled by planner (one row per task that delivers a goal-backward check)
- [ ] Wave 0 extraction tests written before stage migration tasks (TDD per `_shell/` component)
- [ ] All 10 goal-backward checks from `82-CONTEXT.md` `<verification>` covered by either an automated row or a manual row
- [ ] No watch-mode flags
- [ ] `nyquist_compliant: true` set in frontmatter once map is filled

**Approval:** pending
