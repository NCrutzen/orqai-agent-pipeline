# Phase 82 — UI Review

**Audited:** 2026-05-13
**Baseline:** Abstract 6-pillar standards (no UI-SPEC.md for this phase)
**Screenshots:** captured but auth-gated (dev server returned login wall for all 5 stages — `.planning/ui-reviews/82-20260513-121319/`). Code-level audit is authoritative for this phase since the dashboard is operator-only behind Microsoft SSO.

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 4/4 | Zero generic labels; empty/selection copy is unified verbatim across all 5 stages; D-18 "Bulk Review" purge holds. |
| 2. Visuals | 3/4 | Clean Outlook-style row grid + 5-cell pipeline pane; hidden-marker test scaffolding (`<div hidden>` data-testid block in detail-pane) leaks into shipping code. |
| 3. Color | 4/4 | 99% of color flows through `--v7-*` design tokens; only one hardcoded `#fff` in `stage-1-widget.tsx:365`. Variant→token mapping is centralised in `badgeColors()`. |
| 4. Typography | 3/4 | Sizes constrained to {11, 12, 13, 14, 22}px and one font-weight pair (400/500) — consistent, but inline `fontSize: 13` numeric literals mixed with `"13px"` strings is a minor drift surface. |
| 5. Spacing | 4/4 | `var(--space-{1..6})` tokens used uniformly (34 occurrences in `_shell/`); only one arbitrary value (`"2px 8px"` on the StageBadge pill) and it's deliberate for pill geometry. |
| 6. Experience Design | 2/4 | Strong keyboard model + selection persistence + scroll-into-view. BUT: no loading/skeleton state in `RowList` (loaders pre-fetch server-side so client never sees pending), no error boundary in any `_shell/` primitive, action-footer buttons have no `aria-disabled` while dispatching window events that may have no listener. |

**Overall: 20/24**

---

## Top 3 Priority Fixes

1. **Action-footer buttons fire window events with no disabled state** — `_shell/detail-pane.tsx:499-524` dispatches `bulk-review:approve|reject|skip` via `window.dispatchEvent` regardless of whether any listener is mounted. Stage 0/2 mount the pane without wiring listeners, so the operator clicks "Approve" and gets nothing. *Fix:* accept an optional `actionsEnabled?: { approve?: boolean; reject?: boolean; skip?: boolean }` prop on `UnifiedDetailPane` (or pass an `onAction` callback) and render `disabled` + `aria-disabled` when the stage has no wired handler. Defaults to enabled for backward compat with Stage 1/3/4.

2. **Hidden test-only markers ship to production DOM** — `_shell/detail-pane.tsx:473-483` renders a `<div hidden>` containing 5 `data-testid="stage-cell-{n}"` markers solely so RTL can assert pre-expansion. `hidden` keeps them visually invisible but they remain in the accessibility tree and DOM weight. *Fix:* gate with `process.env.NODE_ENV === "test"` or attach the `data-testid` + `aria-expanded` attributes to the real PipelineFlow cells (the canonical home for `aria-expanded`) rather than maintaining a parallel hidden tree.

3. **Empty-state copy drift between shell-only stages and Stage 1** — Stage 0/2 use `"No rows yet"` + `"Stage N awaits backend wiring in a follow-up phase."` (D-15 lock), Stage 3 uses `"No rows in Stage 3"`, Stage 4 uses `"No handler errors"`, Stage 1 uses `"Nothing to review"`. Five different empty-title tones in one converged shell. *Fix:* pick one rhythm — recommend `"No <noun>"` form: `"No safety flags"`, `"Nothing to review"`, `"No customer-mapping issues"`, `"No unhandled intents"`, `"No handler errors"`. Update the four page wrappers; `EmptyState` type stays unchanged.

---

## Detailed Findings

### Pillar 1: Copywriting (4/4)

Strong contract adherence:

- D-18 "Bulk Review" purge verified across all 5 stage pages (grep confirms zero user-visible occurrences).
- Empty selection copy unified in `_shell/detail-pane.tsx:160`: `"Select a row to inspect. Use ↑ ↓ to move between rows, ⏎ to approve, n to skip."` — teaches the keyboard model in the dead state.
- Mailbox-filter trigger labels gracefully degrade: `"All mailboxes"` (0) → `"Mailbox: Smeba"` (1) → `"3 mailboxes"` (N). `_shell/mailbox-filter.tsx:55-62`.
- Stage 0 info banner copy: `"Stage 0 (Safety) — prompt-injection filter..."` — explanatory tone matches operator audience (deviation 1 in 82-02 deliberately stripped the legacy `"Bulk Review queue"` phrase).
- Fallback copy is consistent: `"(unknown sender)"`, `"(no subject)"`, `"(no mailbox)"`, `"(no body available)"` — parens convention applied uniformly.

Minor (would block 4/4 only on a stricter rubric): empty-state titles drift (see Top Fix 3) — borderline acceptable because each title is contextual to that stage's data, but a future-pass tightening would unify the rhythm.

### Pillar 2: Visuals (3/4)

- Single focal point per stage: chip strip + mailbox filter at top, two-column `1fr 2fr` row list / detail pane (`stage-0/page.tsx:138`, mirrored elsewhere).
- Icon-only affordances are paired with labels (mailbox `<ChevronDown aria-hidden>` sits next to text label; action-footer `<Check>/<X>/<SkipForward>` icons sit next to verbose verbs).
- StageBadge variant→color mapping is well-thought (`row-list.tsx:170-208`): `noise`/`intent`/`handler` use brand colors while `safety`/`placeholder` use muted panel tokens, so the eye keys off color to type without reading.
- Negative: the `<div hidden>` accessibility-tree leakage flagged in Top Fix 2. Also `displaySubject`/`displaySender` fallbacks render `"(no subject)"` inline as if it were the real subject — italicising the fallback (or `color: var(--v7-text-muted)`) would visually telegraph the empty-data state.

### Pillar 3: Color (4/4)

- 67 references to `var(--v7-*)` tokens across 8 `_shell/` files.
- Hardcoded colors: **1** occurrence — `stage-1-widget.tsx:365` (`color: "#fff"`). Should map to `var(--v7-on-brand)` or equivalent token. Acceptable at 4/4 because the file is Stage-1-specific and pre-dates Phase 82 token tightening.
- Accent color (`--v7-brand-primary`) usage is restrained: selection border, intent/handler badges, primary action button. No accent spam.
- Soft variants (`--v7-brand-secondary-soft`, `--v7-brand-primary-soft`) carry badge backgrounds — the 60/30/10 split holds (panel/text/accent).

### Pillar 4: Typography (3/4)

Distribution observed across `_shell/`:

| Size | Use |
|------|-----|
| 11px | timestamps, badges |
| 12px | header secondary line (From …) |
| 13px | row text, body content, empty-state body |
| 14px | section titles, subject header |
| 22px | reserved for page-header / banner |

- Two font weights: 400 (default) + 500 (medium for selection-emphasis lines). Below the 4-pillar guideline ceiling of 2 weights → pass.
- `var(--font-mono)` reserved for timestamps + badge labels (mono signals "machine-generated identifier") — semantic use.
- Minor drift: inline `fontSize: 13` (numeric, treated as px by React) coexists with `fontSize: "13px"` strings. Same rendered result; pick one (recommend numeric) and lint.

### Pillar 5: Spacing (4/4)

Token distribution in `_shell/`:

| Token | Count |
|-------|-------|
| `--space-4` (1rem) | 10 |
| `--space-2` (0.5rem) | 10 |
| `--space-3` (0.75rem) | 7 |
| `--space-1` (0.25rem) | 5 |
| `--space-5/6` | 4 |

- Single arbitrary value: `padding: "2px 8px"` on the badge pill (`row-list.tsx:152`) — deliberate, pill geometry doesn't fit the scale and a custom value is preferable to forcing `--space-1` and breaking the pill aspect.
- Row grid template: `gridTemplateColumns: "140px 200px minmax(0, 1fr) 150px"` — fixed widths for badge/sender/timestamp with a flex middle for subject; correct for Outlook-style truncation behaviour.

### Pillar 6: Experience Design (2/4)

Strengths:
- Selection state survives reload via `?selected=<id>` URL param (`selection-context.tsx`).
- `scrollIntoView` for active-stage cell (`detail-pane.tsx:211-219`) with JSDOM guard (`typeof el.scrollIntoView === "function"`) — defensive.
- `pendingRemovalIds` mechanism prevents row flicker on optimistic actions (`row-list.tsx:31-34`).
- Keyboard model is teachable: `Cheatsheet` lists all bindings; `isTypingTarget` guard prevents shortcut clobbering in inputs (verified by RTL test).
- Body cache module-level `Map` (`detail-pane.tsx:74`) survives pane remounts.

Gaps:
1. **No loading state in `RowList`.** Current architecture pre-fetches server-side and renders complete rows on first paint, but the contract assumes that — there's no `isLoading?: boolean` escape hatch. When Phase 77 wires Stage 2 live data and the operator clicks a chip filter, the row strip will flash empty → populated with no spinner. *Recommendation:* add `loading?: boolean` to `RowListProps` and render a 3-skeleton-row placeholder.
2. **No error boundary in any `_shell/` primitive.** A Stage1Widget render-throw would crash the whole detail pane. *Recommendation:* wrap `<PipelineFlow>` in an `<ErrorBoundary fallback={<StageCellErrorState />}>`.
3. **Action-footer dispatches into the void on Stage 0/2** — see Top Fix 1.
4. **Destructive actions lack confirmation in the unified shell.** Phase 71's confirm dialog lives inside `stage-1/components/stage-1-widget.tsx` (slot-prop pattern); the unified `Reject` footer button on Stage 3/4 has no confirm. Acceptable because Stage 3/4 reject = re-route, not delete, but should be documented.

---

## Files Audited

Primary `_shell/` library:
- `web/app/(dashboard)/automations/[swarm]/_shell/row-list.tsx`
- `web/app/(dashboard)/automations/[swarm]/_shell/detail-pane.tsx`
- `web/app/(dashboard)/automations/[swarm]/_shell/mailbox-filter.tsx`
- `web/app/(dashboard)/automations/[swarm]/_shell/chip-strip.tsx`
- `web/app/(dashboard)/automations/[swarm]/_shell/selection-context.tsx`
- `web/app/(dashboard)/automations/[swarm]/_shell/keyboard-shortcuts.tsx`
- `web/app/(dashboard)/automations/[swarm]/_shell/components/stage-0-widget.tsx`

Stage pages (consumers):
- `web/app/(dashboard)/automations/[swarm]/stage-0/page.tsx`
- `web/app/(dashboard)/automations/[swarm]/stage-1/page.tsx` + `client-shell.tsx` + `stage-1-override-pane.tsx`
- `web/app/(dashboard)/automations/[swarm]/stage-2/page.tsx`
- `web/app/(dashboard)/automations/[swarm]/stage-3/page.tsx` + `client-shell.tsx`
- `web/app/(dashboard)/automations/[swarm]/stage-4/page.tsx` + `client-shell.tsx`

Phase planning context:
- `.planning/phases/82-.../82-CONTEXT.md`, `82-01-PLAN.md` through `82-06-PLAN.md`, `82-01-SUMMARY.md` through `82-06-SUMMARY.md`

Screenshot evidence (auth-gated, not used for visual claims):
- `.planning/ui-reviews/82-20260513-121319/stage-{0,1,2,3,4}-desktop.png`
