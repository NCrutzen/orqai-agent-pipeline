# Phase 61: Restore lost bulk-review UX (60-05 regression fix) — Context

**Gathered:** 2026-04-29
**Status:** Ready for planning
**Source:** Inline design brief (user-authored)

<domain>
## Phase Boundary

Restore four UX features that were lost in the Phase 60-05 rewrite of the
debtor-email bulk-review screen, **without** reverting the data-driven tree
architecture introduced in 60-05.

In scope:
- `web/app/(dashboard)/automations/debtor-email-review/*.tsx` (5 components)
- `web/app/(dashboard)/automations/debtor-email-review/actions.ts` (re-add `fetchReviewEmailBody`; extend `recordVerdict` to accept `override_category` + `notes`)
- `web/lib/outlook/index.ts` (`fetchMessageBody` already exists from prior phase — verify and reuse)
- vitest tests under `tests/queue/`

Out of scope:
- Reverting the queue-tree / counts-RPC architecture from 60-05
- Reintroducing the per-group GlassCard "sample of 15" modal
- Schema changes to `automation_runs` (`result.review_note` is just an additional JSONB key — no migration)
- iController flow changes
- Realtime broadcast changes (Phase 59 stays as-is)

</domain>

<decisions>
## Implementation Decisions (LOCKED)

### Layout
- Top-level grid: `grid-cols-[clamp(220px,18vw,280px)_minmax(380px,460px)_1fr] gap-4`
- Container: `max-w-[1600px] mx-auto px-6` (raised from 1280px)
- Every flex/grid child carries `min-w-0` so `truncate` works
- 3 columns: queue tree (col 1), row list (col 2), detail pane (col 3)

### Column 1 — Queue tree
- Keep the 60-05 tree component
- Width: `clamp(220px, 18vw, 280px)` (was 320px)
- Add a "Queue summary" header above the tree with total count + "X promoted today" pill
- Move "Pending promotion" out of the row pane's tab strip and into the tree as a sibling top-level node (sibling of the topic roots, not a sibling tab)

### Column 2 — Row list
- Two-line strip per row: subject (14px semibold, truncate) + sender · rule · time (12px muted)
- 3px brand-primary left bar when selected
- Click → URL `?selected=<row_id>` (server-driven re-render)
- ↑/↓ and J/K navigate; selection synced to URL
- **No Approve/Reject buttons in the row strip** — actions move to detail pane
- Keep cursor pagination (Load older), reduced-motion fade-in, race-cohort banner mount

### Column 3 — Detail pane (NEW)
- Status pill (reuse `statusPillColor` from 60-05)
- Wrapped subject (20px Cabinet semibold)
- Meta grid (2-col): From, Sent, Mailbox, Topic/Entity, Rule fired, Predicted action
- Body section: collapsed by default with "Show full email" button → lazy-fetch via re-introduced `fetchReviewEmailBody`
- Body frame: `bg-black/20 border-[var(--v7-line)] rounded-[var(--v7-radius-sm)] max-h-[40vh] overflow-auto`, `white-space:pre-wrap`, `prose-sm`
- Override category dropdown: 5 options — `payment`, `auto_reply`, `ooo_temporary`, `ooo_permanent`, `unknown` (skip)
- Notes textarea: 3 rows, 13px
- Action bar: `[Approve (⏎)]` brand-primary fill · `[Reject (Space)]` outline-red · `[Skip (n)]` ghost
- Auto-advance to next row within 200ms after Approve/Reject
- Prefetch next row's body on hover/arrow-down

### Keyboard shortcuts (page-scoped)
- `↑` / `↓` or `k` / `j` — navigate row list
- `⏎` — Approve
- `Space` — Reject
- `n` — Skip (no-op, advance)
- `e` — Toggle full email
- `r` — Focus override dropdown
- `/` — Focus notes textarea
- `?` — Show cheatsheet
- All shortcuts no-op when typing inside `<input>` / `<textarea>` / `[contenteditable]`

### Visual tokens (V7-aligned, NO new tokens)
| Element | Token |
|---|---|
| Page bg | `var(--v7-bg)` |
| Panel | `var(--v7-panel)` |
| Selected row stripe | `var(--v7-brand-primary)` |
| Selected row bg | `var(--v7-brand-primary-soft)` |
| Detail pane bg | `var(--v7-panel-2)` |
| Body frame bg | `bg-black/20` |
| Borders | `var(--v7-line)` |
| Headings | `var(--font-cabinet)` |
| Numerics | `tabular-nums` |

No new fonts. No new palette. Reuse existing `statusPillColor` helper.

### Persistence semantics
- Override category and notes ride on the existing `recordVerdict` server action (Phase 60-06). Extend its input schema:
  - `override_category?: 'payment' | 'auto_reply' | 'ooo_temporary' | 'ooo_permanent' | 'unknown'`
  - `notes?: string` (max 2000 chars)
- Server action writes both into `automation_runs.result.review_override` and `result.review_note`, and includes them in the `classifier/verdict.recorded` Inngest event payload
- An override of `unknown` is treated as Skip → `decision='reject'` with `result.review_note` carrying any notes; Outlook side-effects are NOT triggered (matches the prior `labelOnly` semantic from commit `a1033f4`)
- An override matching the predicted category is a no-op override (just the verdict + optional notes are recorded)
- An override differing from the predicted category triggers a `decision='approve'` flow against the override category

### Component split (file-level)
| File | Status | Purpose |
|---|---|---|
| `page.tsx` | EDIT | Server component; load selected row's full result for the detail pane (read by id when `?selected=` present) |
| `queue-tree.tsx` | EDIT | Slim width; add summary header; add Pending-promotion sibling node |
| `row-list.tsx` | RENAME from `predicted-row-list.tsx` | Strip buttons; URL-driven `?selected=`; remove tab strip |
| `row-strip.tsx` | RENAME from `predicted-row-item.tsx` | Click sets selection; no buttons |
| `detail-pane.tsx` | NEW | Meta grid + body expander + override + notes + action bar |
| `keyboard-shortcuts.tsx` | NEW | Page-scoped global handler with input-focus guard |
| `actions.ts` | EDIT | Re-add `fetchReviewEmailBody`; extend `recordVerdict` schema |
| `race-cohort-banner.tsx` | KEEP | Move mount to row-list header (still triggered by promoted-rule + remaining count) |

### Reference commits (lift verbatim where indicated)
- `a1033f4` — `fetchReviewEmailBody` server action + `labelOnly` decision branch (lift logic, adapt to new action signature)
- `e8dfb7a` — Notes field shape + GlassCard pattern (lift JSX)
- `d165a78` — Rule-hint dropdown options (lift category list)
- `67eacae` — Per-item include/override semantics (lift validation)

### Anti-patterns (DO NOT)
1. Do not revive the per-group `GlassCard` "sample of 15" modal — the tree-driven flow is correct
2. Do not put Approve/Reject in both the row strip and the detail pane
3. Do not pre-fetch all 100 bodies on page load — lazy-on-select + prefetch-on-arrow only
4. Do not use emojis as icons — use Lucide (`MailOpen`, `Check`, `X`, `SkipForward`, `Keyboard`) at 16px
5. Do not lock the page width to 1280px

### Claude's Discretion
- Exact Lucide icon choice per button (suggested set above, planner can refine)
- Whether to memoize body cache in module-level `Map<id,string>` or `useState` per detail-pane mount (pick whichever lets prefetch-on-arrow work without re-render flicker)
- Whether the "Show full email" toggle persists per-row in URL (`?body=open`) or is local — recommend local
- Toast wording on action failure (English, terse)
- Whether the cheatsheet (`?` key) renders as a `Sheet` or a centered modal — pick the existing v7 primitive that already lives in `components/ui/`

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Current code (the surface being changed)
- `web/app/(dashboard)/automations/debtor-email-review/page.tsx` — server component shell
- `web/app/(dashboard)/automations/debtor-email-review/queue-tree.tsx` — left-column tree (D-12)
- `web/app/(dashboard)/automations/debtor-email-review/predicted-row-list.tsx` — to be renamed `row-list.tsx`
- `web/app/(dashboard)/automations/debtor-email-review/predicted-row-item.tsx` — to be renamed `row-strip.tsx`
- `web/app/(dashboard)/automations/debtor-email-review/race-cohort-banner.tsx` — D-21 banner
- `web/app/(dashboard)/automations/debtor-email-review/actions.ts` — `recordVerdict` (Phase 60-06)

### Reference commits (read with `git show <sha> -- <path>`)
- `a1033f4` — full-email expander + `fetchReviewEmailBody` action + `labelOnly` semantics
- `e8dfb7a` — payment-precedence + notes + GlassCard
- `d165a78` — rule-hint dropdown
- `67eacae` — per-item include/override + annotation + socket retry

### Phase-60 anchors (architectural — do not regress)
- `.planning/phases/60-debtor-email-close-the-whitelist-gate-loop-data-driven-auto-/60-05-PLAN.md` — queue-driven UI
- `.planning/phases/60-debtor-email-close-the-whitelist-gate-loop-data-driven-auto-/60-06-PLAN.md` — verdict-write/side-effects split
- D-10 (read from `automation_runs`), D-12 (tree), D-13 (counts RPC), D-14 (cursor pagination), D-21 (race-cohort banner)

### Tokens / design system
- `web/app/globals.css` — `--v7-*` token definitions (search `--v7-bg`, `--v7-panel`, `--v7-brand-primary`, `--v7-brand-primary-soft`, `--v7-line`, `--v7-radius-sm`, `--v7-radius-card`, `--v7-radius-pill`, `--v7-muted`, `--v7-amber`, `--v7-amber-soft`, `--v7-red`)
- `web/lib/fonts.ts` — `--font-cabinet` (Cabinet Grotesk)

### Auto-loaded skill
- `.claude/skills/sketch-findings-agent-workforce/SKILL.md` — design decisions, CSS patterns, visual direction for Smeba Draft Review frontend (auto-loaded; reuse where applicable)

</canonical_refs>

<specifics>
## Acceptance Criteria

1. No horizontal overflow at any viewport width 1024-2560 (verify by resizing dev server)
2. Email body readable inline within ≤1 click on any selected row
3. Reviewer can change predicted category from a dropdown of all 5 categories (incl. `unknown` = skip)
4. Reviewer can attach a note that persists to `automation_runs.result.review_note` AND to the `classifier/verdict.recorded` Inngest event payload
5. ↑/↓/⏎/Space/J/K/N/E/R/`/` all work without the mouse; shortcuts no-op while typing inside form fields
6. After Approve/Reject the next row auto-selects within 200ms
7. All existing 60-05 vitest suites still pass (`tests/queue/`); new tests cover:
   - detail-pane keyboard handler (input-focus guard, all 7 shortcuts)
   - `fetchReviewEmailBody` integration (success, error, empty body)
   - `recordVerdict` extended schema (override + notes round-trip)
8. Light mode contrast ≥ 4.5:1 on all text (`--v7-muted` on `--v7-panel-2` already passes — verify post-implementation)
9. `pnpm tsc --noEmit -p .` clean
10. `pnpm vitest run` green

</specifics>

<deferred>
## Deferred Ideas

- `⌘K` global search across the queue (mentioned in mockup header but out of scope for this regression fix)
- Multi-select bulk approve in the row list (the per-group bulk flow is intentionally NOT being revived)
- Realtime selection sync across reviewers (single-reviewer assumption holds)
- Body rendering as HTML rather than plain text (start with `bodyText` only; `bodyHtml` available from `fetchMessageBody` for a follow-up)

</deferred>

---

*Phase: 61-restore-lost-bulk-review-ux-60-05-regression-fix-horizontal-*
*Context gathered: 2026-04-29 from user-authored design brief*
